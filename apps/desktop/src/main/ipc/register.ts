import { app, BrowserWindow, ipcMain } from "electron";
import type {
  AddAccountIdentityInput,
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
import {
  completeAi,
  detectProviders,
  listProviderModels,
  warmCursorAgent,
} from "../ai/bridge";
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
  addAccountIdentity,
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
  loadOlderMail,
  mutateMail,
  oauthStatus,
  reconnectAccount,
  removeAccount,
  removeAccountIdentity,
  saveLocalDraft,
  sendMail,
  triggerSync,
  chooseAccountAvatar,
  clearAccountAvatar,
  updateAccount,
} from "../mail/service";
import {
  openAttachment,
  previewAttachment,
  saveAttachment,
} from "../mail/attachments";
import {
  cancelQueuedSend,
  enqueueDelayedSend,
} from "../mail/queue";
import {
  setAppBadge,
  showDesktopNotification,
} from "../notifications";
import {
  claimMailto,
  getMailtoHandlerState,
  openDefaultAppsSettings,
  queueMailto,
  setMailtoHandler,
} from "../mailtoProtocol";
import { getLaunchAtLogin, setLaunchAtLogin } from "../startup";
import { openExternalSafely } from "../security";
import {
  getMcpStatus,
  startMcpServer,
  stopMcpServer,
} from "../mcp/server";
import { rotateMcpToken } from "../mcp/auth";
import {
  connectCalendarPlugin,
  connectNotionPlugin,
  createCalendarEvent,
  deleteCalendarEvent,
  disconnectPlugin,
  listCalendarEvents,
  listNotionTargets,
  listPluginStatuses,
  respondToCalendarEvent,
  saveEmailToNotion,
  setNotionTarget,
  setPluginEnabled,
  updateCalendarEvent,
} from "../plugins";
import type {
  CalendarEventInput,
  CalendarEventUpdate,
  CalendarRange,
  CalendarRsvp,
  NotionSaveInput,
  NotionTarget,
  PluginId,
} from "../../shared/plugins";
import { refreshTray } from "../tray";
import {
  checkForAppUpdates,
  downloadAppUpdate,
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

function assertAttachmentId(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) {
    throw new Error("Invalid attachment");
  }
  return value;
}

const PLUGIN_IDS = new Set<PluginId>(["google-calendar", "notion"]);

function assertPluginId(value: unknown): PluginId {
  if (typeof value !== "string" || !PLUGIN_IDS.has(value as PluginId)) {
    throw new Error("Unknown plugin");
  }
  return value as PluginId;
}

function assertText(
  value: unknown,
  field: string,
  max: number,
  required = false,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error(`${field} is required`);
  if (text.length > max) throw new Error(`${field} is too long`);
  return text;
}

function assertCalendarRange(value: unknown): CalendarRange {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid calendar range");
  }
  const range = value as { startIso?: unknown; endIso?: unknown };
  return {
    startIso: assertText(range.startIso, "Start time", 64, true),
    endIso: assertText(range.endIso, "End time", 64, true),
  };
}

function assertCalendarInput(value: CalendarEventInput): CalendarEventInput {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid calendar event");
  }
  return {
    title: assertText(value.title, "Event title", 500, true),
    description: assertText(value.description, "Description", 8000),
    location: assertText(value.location, "Location", 500) || undefined,
    startIso: assertText(value.startIso, "Start time", 64, true),
    endIso: assertText(value.endIso, "End time", 64, true),
    allDay: Boolean(value.allDay) || undefined,
    attendeeEmail: assertText(value.attendeeEmail, "Attendee", 320) || undefined,
    withMeet: Boolean(value.withMeet),
  };
}

function assertCalendarUpdate(value: CalendarEventUpdate): CalendarEventUpdate {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid calendar event");
  }
  return {
    id: assertCanonicalId(value.id),
    ...assertCalendarInput(value),
    notifyGuests: Boolean(value.notifyGuests),
  };
}

function assertCalendarRsvp(value: unknown): CalendarRsvp {
  if (value === "accepted" || value === "declined" || value === "tentative") {
    return value;
  }
  throw new Error("Pick a response.");
}

function assertNotionTarget(value: NotionTarget): NotionTarget {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid Notion destination");
  }
  return {
    id: assertCanonicalId(value.id),
    type: value.type === "database" ? "database" : "page",
    title: assertText(value.title, "Destination name", 300, true),
    url: assertText(value.url, "Destination URL", 2048) || undefined,
  };
}

function assertNotionSaveInput(value: NotionSaveInput): NotionSaveInput {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid Notion save request");
  }
  return {
    messageId: assertCanonicalId(value.messageId),
    subject: assertText(value.subject, "Subject", 1000),
    from: assertText(value.from, "Sender", 300),
    fromEmail: assertText(value.fromEmail, "Sender email", 320),
    snippet: assertText(value.snippet, "Preview", 1000),
    receivedAtMs:
      typeof value.receivedAtMs === "number" &&
      Number.isFinite(value.receivedAtMs)
        ? value.receivedAtMs
        : undefined,
    bodyText: assertText(value.bodyText, "Message text", 20_000),
  };
}

export function registerIpc(): void {
  ipcMain.handle("app:info", () => ({
    name: "Intray",
    version: app.getVersion(),
    stack: "electron",
  }));

  ipcMain.handle("app:getLaunchAtLogin", () => getLaunchAtLogin());
  ipcMain.handle("app:openExternal", (_e, url: unknown) => {
    if (typeof url !== "string") return false;
    if (queueMailto(url)) return true;
    if (url.length > 4096) return false;
    return openExternalSafely(url);
  });
  ipcMain.handle("app:mailtoState", () => getMailtoHandlerState());
  ipcMain.handle("app:setMailtoHandler", (_e, enabled: unknown) =>
    setMailtoHandler(enabled === true),
  );
  ipcMain.handle("app:claimMailto", () => claimMailto());
  ipcMain.handle("app:openDefaultApps", () => openDefaultAppsSettings());
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
  ipcMain.handle("app:downloadUpdate", () => downloadAppUpdate());
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
  ipcMain.handle(
    "accounts:addIdentity",
    (_e, input: AddAccountIdentityInput) =>
      addAccountIdentity({
        ...input,
        accountId: assertCanonicalId(input.accountId),
      }),
  );
  ipcMain.handle(
    "accounts:removeIdentity",
    (_e, accountId: string, identityId: string) =>
      removeAccountIdentity(
        assertCanonicalId(accountId),
        assertCanonicalId(identityId),
      ),
  );
  ipcMain.handle("accounts:oauthStatus", () => oauthStatus());

  ipcMain.handle("mail:list", (_e, query: MailListQuery) => listMail(query));
  ipcMain.handle(
    "mail:loadOlder",
    (
      _e,
      query: { accountId?: string | "all"; folder?: string } | undefined,
    ) =>
      loadOlderMail({
        accountId:
          query?.accountId === "all" || typeof query?.accountId === "string"
            ? query.accountId
            : undefined,
        folder: typeof query?.folder === "string" ? query.folder : "inbox",
      }),
  );
  ipcMain.handle(
    "mail:folderCounts",
    (_e, accountId?: string | "all") => getFolderCounts(accountId),
  );
  ipcMain.handle("mail:get", (_e, id: string) => getMail(assertCanonicalId(id)));
  ipcMain.handle(
    "mail:previewAttachment",
    (_e, messageId: unknown, attachmentId: unknown) =>
      previewAttachment(
        assertCanonicalId(messageId),
        assertAttachmentId(attachmentId),
      ),
  );
  ipcMain.handle(
    "mail:saveAttachment",
    (e, messageId: unknown, attachmentId: unknown) =>
      saveAttachment(
        assertCanonicalId(messageId),
        assertAttachmentId(attachmentId),
        BrowserWindow.fromWebContents(e.sender) ?? undefined,
      ),
  );
  ipcMain.handle(
    "mail:openAttachment",
    (_e, messageId: unknown, attachmentId: unknown) =>
      openAttachment(
        assertCanonicalId(messageId),
        assertAttachmentId(attachmentId),
      ),
  );
  ipcMain.handle(
    "mail:mutate",
    (_e, id: string, action: MailMutateAction, options?: MailMutateOptions) => {
      if (!MAIL_ACTIONS.has(action)) throw new Error("Unknown mail action");
      return mutateMail(assertCanonicalId(id), action, options ?? {});
    },
  );
  ipcMain.handle("mail:send", (_e, draft: ComposeDraft) => sendMail(draft));
  ipcMain.handle("mail:saveDraft", (_e, draft: ComposeDraft) =>
    saveLocalDraft(draft),
  );
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

  ipcMain.handle("plugins:list", () => listPluginStatuses());
  ipcMain.handle("plugins:connectCalendar", () => connectCalendarPlugin());
  ipcMain.handle("plugins:connectNotion", (_e, token: unknown) =>
    connectNotionPlugin(assertText(token, "Notion token", 512, true)),
  );
  ipcMain.handle("plugins:disconnect", (_e, id: unknown) =>
    disconnectPlugin(assertPluginId(id)),
  );
  ipcMain.handle("plugins:setEnabled", (_e, id: unknown, enabled: unknown) => {
    if (typeof enabled !== "boolean") throw new Error("Invalid plugin switch");
    return setPluginEnabled(assertPluginId(id), enabled);
  });
  ipcMain.handle("plugins:calendarEvents", (_e, range: unknown) =>
    listCalendarEvents(assertCalendarRange(range)),
  );
  ipcMain.handle("plugins:calendarCreate", (_e, input: CalendarEventInput) =>
    createCalendarEvent(assertCalendarInput(input)),
  );
  ipcMain.handle("plugins:calendarUpdate", (_e, input: CalendarEventUpdate) =>
    updateCalendarEvent(assertCalendarUpdate(input)),
  );
  ipcMain.handle(
    "plugins:calendarDelete",
    (_e, id: unknown, notifyGuests: unknown) =>
      deleteCalendarEvent(assertCanonicalId(id), notifyGuests === true),
  );
  ipcMain.handle(
    "plugins:calendarRespond",
    (_e, id: unknown, response: unknown) =>
      respondToCalendarEvent(assertCanonicalId(id), assertCalendarRsvp(response)),
  );
  ipcMain.handle("plugins:notionTargets", () => listNotionTargets());
  ipcMain.handle("plugins:notionSetTarget", (_e, target: NotionTarget) =>
    setNotionTarget(assertNotionTarget(target)),
  );
  ipcMain.handle("plugins:notionSave", (_e, input: NotionSaveInput) =>
    saveEmailToNotion(assertNotionSaveInput(input)),
  );

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
  ipcMain.handle(
    "ai:warm",
    async (_e, bridgePath?: string, model?: string) => {
      try {
        await warmCursorAgent(bridgePath, model);
      } catch (error) {
        console.warn(
          "Cursor agent warm start skipped",
          error instanceof Error ? error.message : error,
        );
      }
      return true;
    },
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
