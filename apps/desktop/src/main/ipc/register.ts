import { app, BrowserWindow, ipcMain } from "electron";
import type {
  AddImapAccountInput,
  AiCompleteRequest,
  AiProviderId,
  AiSecretId,
  BadgePayload,
  ComposeDraft,
  DesktopNotifyPayload,
  MailListQuery,
  MailMutateAction,
  MailMutateOptions,
  ReconnectAccountInput,
  UpdateAccountInput,
} from "../../shared/types";
import { completeAi, detectProviders, listProviderModels } from "../ai/bridge";
import {
  aiSecretStatus,
  saveAiSecret,
  type AiSecretId as SecretId,
} from "../ai/secrets";
import {
  applyChromeTheme,
  type ChromeTheme,
} from "../chrome-theme";
import { getSyncState, listAccountRows } from "../db";
import {
  addGmailAccount,
  addImapAccount,
  createLabelDto,
  getAccountReconnectInfo,
  getFolderCounts,
  getMail,
  hasRealAccounts,
  listAccounts,
  listContactDtos,
  listLabelDtos,
  listMail,
  mutateMail,
  oauthStatus,
  reconnectAccount,
  removeAccount,
  sendMail,
  triggerSync,
  chooseAccountAvatar,
  clearAccountAvatar,
  updateAccount,
} from "../mail/service";
import {
  cancelQueuedSend,
  enqueueDelayedSend,
} from "../mail/queue";
import {
  setAppBadge,
  showDesktopNotification,
} from "../notifications";
import { getLaunchAtLogin, setLaunchAtLogin } from "../startup";
import { openExternalSafely } from "../security";
import {
  getMcpStatus,
  startMcpServer,
  stopMcpServer,
} from "../mcp/server";
import { rotateMcpToken } from "../mcp/auth";
import { refreshTray } from "../tray";
import {
  checkForAppUpdates,
  getUpdateStatus,
  openReleasesPage,
  quitAndInstallUpdate,
} from "../updater";

function isChromeTheme(value: unknown): value is ChromeTheme {
  return value === "dark" || value === "light";
}

const MAIL_ACTIONS = new Set<MailMutateAction>([
  "archive",
  "trash",
  "spam",
  "not-spam",
  "delete-forever",
  "read",
  "unread",
  "star",
  "unstar",
  "snooze",
  "unsnooze",
  "label",
  "clear-label",
  "move",
]);

function assertCanonicalId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new Error("Invalid identifier");
  }
  return value;
}

export function registerIpc(): void {
  ipcMain.handle("app:info", () => ({
    name: "Intray",
    version: app.getVersion(),
    stack: "electron",
  }));

  ipcMain.handle("app:getLaunchAtLogin", () => getLaunchAtLogin());
  ipcMain.handle("app:openExternal", (_e, url: unknown) => {
    if (typeof url !== "string" || url.length > 4096) return false;
    return openExternalSafely(url);
  });
  ipcMain.handle(
    "app:setLaunchAtLogin",
    (_e, openAtLogin: boolean, openAsHidden?: boolean) =>
      setLaunchAtLogin(openAtLogin, openAsHidden ?? true),
  );

  ipcMain.handle("app:setChromeTheme", (e, theme: unknown) => {
    if (!isChromeTheme(theme)) return false;
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    applyChromeTheme(win, theme);
    return true;
  });

  ipcMain.handle("app:updateStatus", () => getUpdateStatus());
  ipcMain.handle("app:checkForUpdates", () => checkForAppUpdates());
  ipcMain.handle("app:installUpdate", () => quitAndInstallUpdate());
  ipcMain.handle("app:openReleases", () => openReleasesPage());

  const mainFromEvent = (e: Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle(
    "notify:show",
    (e, payload: DesktopNotifyPayload) =>
      showDesktopNotification(() => mainFromEvent(e), payload),
  );
  ipcMain.handle("notify:setBadge", (e, payload: BadgePayload) => {
    setAppBadge(() => mainFromEvent(e), payload);
    refreshTray();
    return true;
  });

  ipcMain.handle("accounts:list", () => listAccounts());
  ipcMain.handle("accounts:hasReal", () => hasRealAccounts());
  ipcMain.handle("accounts:addGmail", () => addGmailAccount());
  ipcMain.handle("accounts:addImap", (_e, input: AddImapAccountInput) =>
    addImapAccount(input),
  );
  ipcMain.handle("accounts:reconnectInfo", (_e, accountId: string) =>
    getAccountReconnectInfo(assertCanonicalId(accountId)),
  );
  ipcMain.handle(
    "accounts:reconnect",
    (_e, input: ReconnectAccountInput) =>
      reconnectAccount({
        ...input,
        accountId: assertCanonicalId(input.accountId),
      }),
  );
  ipcMain.handle("accounts:remove", (_e, accountId: string) => {
    removeAccount(assertCanonicalId(accountId));
    return true;
  });
  ipcMain.handle("accounts:update", (_e, input: UpdateAccountInput) =>
    updateAccount({
      ...input,
      accountId: assertCanonicalId(input.accountId),
    }),
  );
  ipcMain.handle("accounts:chooseAvatar", (_e, accountId: string) =>
    chooseAccountAvatar(assertCanonicalId(accountId)),
  );
  ipcMain.handle("accounts:clearAvatar", (_e, accountId: string) =>
    clearAccountAvatar(assertCanonicalId(accountId)),
  );
  ipcMain.handle("accounts:oauthStatus", () => oauthStatus());

  ipcMain.handle("mail:list", (_e, query: MailListQuery) => listMail(query));
  ipcMain.handle(
    "mail:folderCounts",
    (_e, accountId?: string | "all") => getFolderCounts(accountId),
  );
  ipcMain.handle("mail:get", (_e, id: string) => getMail(assertCanonicalId(id)));
  ipcMain.handle(
    "mail:mutate",
    (_e, id: string, action: MailMutateAction, options?: MailMutateOptions) => {
      if (!MAIL_ACTIONS.has(action)) throw new Error("Unknown mail action");
      return mutateMail(assertCanonicalId(id), action, options ?? {});
    },
  );
  ipcMain.handle("mail:send", (_e, draft: ComposeDraft) => sendMail(draft));
  ipcMain.handle(
    "mail:sendLater",
    (_e, draft: ComposeDraft, delaySeconds: number) => {
      const delay = Number(delaySeconds);
      if (!Number.isFinite(delay) || delay < 0) {
        throw new Error("Invalid send delay");
      }
      return enqueueDelayedSend(draft, delay);
    },
  );
  ipcMain.handle("mail:cancelSend", (_e, queueId: string) =>
    cancelQueuedSend(assertCanonicalId(queueId)),
  );
  ipcMain.handle("mail:sync", (_e, accountId?: string) => triggerSync(accountId));

  ipcMain.handle("labels:list", () => listLabelDtos());
  ipcMain.handle(
    "labels:create",
    (_e, input: { name: string; color: string }) => createLabelDto(input),
  );
  ipcMain.handle("contacts:list", () => listContactDtos());

  ipcMain.handle("ai:detect", (_e, bridgePath?: string) =>
    detectProviders(bridgePath),
  );
  ipcMain.handle(
    "ai:models",
    (_e, provider: AiProviderId, bridgePath?: string) =>
      listProviderModels(provider, bridgePath),
  );
  ipcMain.handle("ai:complete", (_e, req: AiCompleteRequest) =>
    completeAi({
      provider: req.provider as AiProviderId,
      prompt: req.prompt,
      system: req.system,
      model: req.model,
      bridgePath: req.bridgePath,
      maxTokens: req.maxTokens,
    }),
  );
  ipcMain.handle("ai:secretsStatus", () => aiSecretStatus());
  ipcMain.handle(
    "ai:setSecret",
    (_e, id: AiSecretId, value: string) => {
      saveAiSecret(id as SecretId, value);
      return true;
    },
  );

  ipcMain.handle("mcp:status", () => getMcpStatus());
  ipcMain.handle("mcp:start", () => startMcpServer());
  ipcMain.handle("mcp:stop", () => {
    stopMcpServer();
    return getMcpStatus();
  });
  ipcMain.handle("mcp:rotateToken", () => {
    rotateMcpToken();
    return getMcpStatus();
  });

  ipcMain.handle("sync:listStatus", () =>
    listAccountRows().map((a) => {
      const s = getSyncState(a.id);
      return {
        accountId: a.id,
        state: (s?.status as "idle" | "syncing" | "error" | "offline") ?? "idle",
        lastSyncAt: s?.last_sync_at ?? null,
        error: s?.error ?? undefined,
        progress: s?.progress ?? undefined,
      };
    }),
  );
}
