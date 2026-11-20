import type { MailtoHandlerState } from "../shared/mailto";
import type {
  AccountDto,
  AccountReconnectInfo,
  AddAccountIdentityInput,
  AddImapAccountInput,
  AiCompleteRequest,
  AiCompleteResponse,
  AiModelList,
  AiProviderId,
  AiProviderStatus,
  AiSecretId,
  AppUpdateStatus,
  BadgePayload,
  ComposeDraft,
  ContactDto,
  DesktopNotifyPayload,
  LabelDto,
  LaunchAtLoginState,
  MailFolderCounts,
  MailListQuery,
  MailListResult,
  MailOlderResult,
  MailMutateAction,
  MailMutateOptions,
  MessageDto,
  QueuedSendResult,
  ReconnectAccountInput,
  SyncStatus,
  UpdateAccountInput,
} from "../shared/types";
import { usageLimitMessage } from "../shared/aiError";
import { readablePreview } from "../shared/mailSnippet";
import { pluginErrorNotice } from "../shared/pluginError";
import {
  PLUGIN_CATALOG,
  type CalendarEventDto,
  type CalendarEventInput,
  type CalendarEventUpdate,
  type CalendarRsvp,
  type CalendarRange,
  type NotionSaveInput,
  type NotionSaveResult,
  type NotionTarget,
  type PluginId,
  type PluginStatus,
} from "../shared/plugins";
import type { Account, Message } from "./data/mock";

const DISABLED_UPDATE: AppUpdateStatus = {
  state: "disabled",
  currentVersion: "0.0.0",
  packaged: false,
  detail: "Updates apply to installed builds only (not the web preview).",
};

export function hasIntrayBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.intray);
}

/**
 * When the desktop preload is missing (the Vite preview), talk to the local
 * AI host on the dev server. Electron keeps using IPC.
 */
async function aiHost<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/__intray/ai/${path}`, {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error(
      "The AI host isn’t running. Start the Intray dev server, then check the connection.",
    );
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `AI host returned ${res.status}`);
  }
  return json;
}

export async function bridgeAccounts(): Promise<AccountDto[]> {
  if (!hasIntrayBridge()) return [];
  return window.intray.accounts.list();
}

export async function bridgeHasRealAccounts(): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.accounts.hasReal();
}

export async function bridgeAddGmail(): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.addGmail();
}

export async function bridgeAddImap(
  input: AddImapAccountInput,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.addImap(input);
}

export async function bridgeReconnectInfo(
  accountId: string,
): Promise<AccountReconnectInfo> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.reconnectInfo(accountId);
}

export async function bridgeReconnectAccount(
  input: ReconnectAccountInput,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.reconnect(input);
}

export async function bridgeOAuthStatus(): Promise<{ gmailConfigured: boolean }> {
  if (!hasIntrayBridge()) return { gmailConfigured: false };
  return window.intray.accounts.oauthStatus();
}

export async function bridgeRemoveAccount(accountId: string): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.accounts.remove(accountId);
}

export async function bridgeUpdateAccount(
  input: UpdateAccountInput,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.update(input);
}

export async function bridgeChooseAccountAvatar(
  accountId: string,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.chooseAvatar(accountId);
}

export async function bridgeClearAccountAvatar(
  accountId: string,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.clearAvatar(accountId);
}

export async function bridgeAddAccountIdentity(
  input: AddAccountIdentityInput,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.addIdentity(input);
}

export async function bridgeRemoveAccountIdentity(
  accountId: string,
  identityId: string,
): Promise<AccountDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Intray bridge unavailable (run inside Electron).");
  }
  return window.intray.accounts.removeIdentity(accountId, identityId);
}

export async function bridgeListMail(
  query: MailListQuery,
): Promise<MailListResult> {
  if (!hasIntrayBridge()) {
    return { messages: [], nextCursor: null, endCursor: null, total: 0 };
  }
  return window.intray.mail.list(query);
}

export async function bridgeLoadOlder(query: {
  accountId?: string | "all";
  folder?: string;
}): Promise<MailOlderResult> {
  if (!hasIntrayBridge()) return { added: 0, exhausted: true };
  return window.intray.mail.loadOlder(query);
}

export async function bridgeFolderCounts(
  accountId?: string | "all",
): Promise<MailFolderCounts> {
  if (!hasIntrayBridge()) {
    return { folders: {}, labels: {}, inboxUnread: 0 };
  }
  return window.intray.mail.folderCounts(accountId);
}

export async function bridgeGetMail(id: string): Promise<MessageDto | null> {
  if (!hasIntrayBridge()) return null;
  return window.intray.mail.get(id);
}

export async function bridgeMutateMail(
  id: string,
  action: MailMutateAction,
  options?: MailMutateOptions,
): Promise<MessageDto | null> {
  if (!hasIntrayBridge()) return null;
  return window.intray.mail.mutate(id, action, options);
}

export async function bridgeSendMail(draft: ComposeDraft): Promise<MessageDto> {
  if (!hasIntrayBridge()) throw new Error("Intray bridge unavailable");
  return window.intray.mail.send(draft);
}

export async function bridgeSaveDraft(draft: ComposeDraft): Promise<MessageDto> {
  if (!hasIntrayBridge()) throw new Error("Intray bridge unavailable");
  return window.intray.mail.saveDraft(draft);
}

export async function bridgeSendLater(
  draft: ComposeDraft,
  delaySeconds: number,
): Promise<QueuedSendResult> {
  if (!hasIntrayBridge()) throw new Error("Intray bridge unavailable");
  return window.intray.mail.sendLater(draft, delaySeconds);
}

export async function bridgeCancelSend(queueId: string): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.mail.cancelSend(queueId);
}

export async function bridgeSync(accountId?: string): Promise<void> {
  if (!hasIntrayBridge()) return;
  return window.intray.mail.sync(accountId);
}

export async function bridgeListLabels(): Promise<LabelDto[]> {
  if (!hasIntrayBridge()) return [];
  return window.intray.labels.list();
}

export async function bridgeCreateLabel(input: {
  name: string;
  color: string;
}): Promise<LabelDto> {
  if (!hasIntrayBridge()) throw new Error("Intray bridge unavailable");
  return window.intray.labels.create(input);
}

export async function bridgeListContacts(): Promise<ContactDto[]> {
  if (!hasIntrayBridge()) return [];
  return window.intray.contacts.list();
}

export async function bridgeAiDetect(
  bridgePath?: string,
): Promise<AiProviderStatus[]> {
  if (!hasIntrayBridge()) {
    return aiHost<AiProviderStatus[]>("detect", {
      method: "POST",
      body: { bridgePath },
    });
  }
  return window.intray.ai.detect(bridgePath);
}

export async function bridgeAiModels(
  provider: AiProviderId,
  bridgePath?: string,
): Promise<AiModelList> {
  if (!hasIntrayBridge()) {
    try {
      return await aiHost<AiModelList>("models", {
        method: "POST",
        body: { provider, bridgePath },
      });
    } catch (error) {
      return {
        connected: false,
        models: [],
        detail:
          error instanceof Error
            ? error.message
            : "Couldn’t reach the AI host. Check the connection.",
      };
    }
  }
  return window.intray.ai.models(provider, bridgePath);
}

/** Ask the host to keep the signed-in Cursor process running. */
export function warmCursorAgent(prefs: {
  aiBridge: string;
  aiBridgePath?: string;
  aiModelHint?: string;
}): void {
  if (prefs.aiBridge !== "cursor" || !hasIntrayBridge()) return;
  void window.intray.ai
    .warm({
      bridgePath: prefs.aiBridgePath || undefined,
      model: prefs.aiModelHint || undefined,
    })
    .catch(() => undefined);
}

export async function bridgeAiComplete(
  req: AiCompleteRequest,
): Promise<AiCompleteResponse> {
  try {
    if (!hasIntrayBridge()) {
      return await aiHost<AiCompleteResponse>("complete", {
        method: "POST",
        body: req,
      });
    }
    return await window.intray.ai.complete(req);
  } catch (error) {
    // Electron wraps IPC failures as "Error invoking remote method 'ai:complete': …".
    // A usage limit should read as that fact, not the provider dump.
    const raw = error instanceof Error ? error.message : String(error);
    const limit = usageLimitMessage(raw);
    if (limit) throw new Error(limit);
    throw error;
  }
}

export async function bridgeAiSecretsStatus(): Promise<
  Record<AiSecretId, boolean>
> {
  if (!hasIntrayBridge()) {
    try {
      return await aiHost<Record<AiSecretId, boolean>>("secrets");
    } catch {
      return {
        openai: false,
        grok: false,
        anthropic: false,
        gemini: false,
        ollama: false,
      };
    }
  }
  return window.intray.ai.secretsStatus();
}

export async function bridgeAiSetSecret(
  id: AiSecretId,
  value: string,
): Promise<void> {
  if (!hasIntrayBridge()) {
    await aiHost("secrets", { method: "POST", body: { id, value } });
    return;
  }
  await window.intray.ai.setSecret(id, value);
}

export async function bridgeMcpStatus() {
  if (!hasIntrayBridge()) return { running: false, port: null, url: null };
  return window.intray.mcp.status();
}

export async function bridgeMcpStart() {
  if (!hasIntrayBridge()) return { running: false, port: null, url: null };
  return window.intray.mcp.start();
}

export async function bridgeMcpStop() {
  if (!hasIntrayBridge()) return { running: false, port: null, url: null };
  return window.intray.mcp.stop();
}

export async function bridgeMcpRotateToken() {
  if (!hasIntrayBridge()) return { running: false, port: null, url: null };
  return window.intray.mcp.rotateToken();
}

export async function bridgeLaunchAtLogin(): Promise<LaunchAtLoginState> {
  if (!hasIntrayBridge()) return { openAtLogin: false, openAsHidden: true };
  return window.intray.getLaunchAtLogin();
}

export async function bridgeSetLaunchAtLogin(
  openAtLogin: boolean,
  openAsHidden = true,
): Promise<LaunchAtLoginState> {
  if (!hasIntrayBridge()) return { openAtLogin, openAsHidden };
  return window.intray.setLaunchAtLogin(openAtLogin, openAsHidden);
}

export async function bridgeSetChromeTheme(
  theme: "dark" | "light",
): Promise<void> {
  if (!hasIntrayBridge()) return;
  await window.intray.setChromeTheme(theme);
}

export async function bridgeGetMailtoHandler(): Promise<MailtoHandlerState | null> {
  if (!hasIntrayBridge()) return null;
  return window.intray.getMailtoHandler();
}

export async function bridgeSetMailtoHandler(
  enabled: boolean,
): Promise<MailtoHandlerState | null> {
  if (!hasIntrayBridge()) return null;
  return window.intray.setMailtoHandler(enabled);
}

export async function bridgeClaimMailto(): Promise<string | null> {
  if (!hasIntrayBridge()) return null;
  return window.intray.claimMailto();
}

export function bridgeOnMailtoOpen(cb: (url: string) => void): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.onMailtoOpen(cb);
}

export async function bridgeOpenDefaultApps(): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.openDefaultApps();
}

export async function bridgeAppInfo(): Promise<{
  name: string;
  version: string;
  stack: string;
}> {
  if (!hasIntrayBridge()) {
    return { name: "Intray", version: "0.0.0", stack: "preview" };
  }
  return window.intray.getAppInfo();
}

export async function bridgeUpdateStatus(): Promise<AppUpdateStatus> {
  if (!hasIntrayBridge()) return DISABLED_UPDATE;
  return window.intray.updates.status();
}

export async function bridgeCheckForUpdates(): Promise<AppUpdateStatus> {
  if (!hasIntrayBridge()) return DISABLED_UPDATE;
  return window.intray.updates.check();
}

export async function bridgeDownloadUpdate(): Promise<AppUpdateStatus> {
  if (!hasIntrayBridge()) return DISABLED_UPDATE;
  return window.intray.updates.download();
}

export async function bridgeInstallUpdate(): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.updates.install();
}

export async function bridgeOpenReleases(): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.updates.openReleases();
}

export function bridgeOnUpdateStatus(
  cb: (status: AppUpdateStatus) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.updates.onStatus(cb);
}

/** Desktop toast click: ask in the app before downloading. */
export function bridgeOnUpdateAsk(cb: () => void): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.updates.onAsk(() => cb());
}

export async function bridgeNotifyShow(
  payload: DesktopNotifyPayload,
): Promise<boolean> {
  if (!hasIntrayBridge()) return false;
  return window.intray.notify.show(payload);
}

export async function bridgeSetBadge(
  payload: BadgePayload,
): Promise<void> {
  if (!hasIntrayBridge()) return;
  await window.intray.notify.setBadge(payload);
}

export function bridgeOnNotifyOpen(
  cb: (payload: { messageId: string; folderId?: string }) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.notify.onOpen(cb);
}

export function bridgeOnSyncProgress(
  cb: (status: SyncStatus) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.sync.onProgress(cb);
}

export function bridgeOnSendFlushed(
  cb: (payload: { queueId: string; message: MessageDto }) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.mail.onSendFlushed(cb);
}

export function bridgeOnUnsnoozed(
  cb: (payload: { messageId: string }) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.mail.onUnsnoozed(cb);
}

export function bridgeOnMailUpdated(
  cb: (payload: { message: MessageDto }) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.mail.onUpdated(cb);
}

export function bridgeOnSearchReady(
  cb: (payload: { q: string }) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.mail.onSearchReady(cb);
}

export function bridgeOnAvatarUpdated(
  cb: (payload: { email: string; avatarUrl: string }) => void,
): () => void {
  if (!hasIntrayBridge()) return () => undefined;
  return window.intray.avatars.onUpdated(cb);
}

function previewPluginStatuses(): PluginStatus[] {
  return PLUGIN_CATALOG.map((entry) => ({
    id: entry.id,
    installed: false,
    connected: false,
    enabled: false,
    config: {},
    setup: {
      ready: false,
      hint: "Plugins connect inside the Intray desktop app.",
    },
  }));
}

function rethrowPlugin(error: unknown): never {
  const raw = error instanceof Error ? error.message : String(error);
  const notice = pluginErrorNotice(raw);
  const wrapped = new Error(notice.text) as Error & { href?: string };
  if (notice.href) wrapped.href = notice.href;
  throw wrapped;
}

async function pluginCall<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    rethrowPlugin(error);
  }
}

export async function bridgePluginStatuses(): Promise<PluginStatus[]> {
  if (!hasIntrayBridge()) return previewPluginStatuses();
  return window.intray.plugins.list();
}

export async function bridgeConnectCalendar(): Promise<PluginStatus[]> {
  if (!hasIntrayBridge()) {
    throw new Error("Plugins connect inside the Intray desktop app.");
  }
  return pluginCall(() => window.intray.plugins.connectCalendar());
}

export async function bridgeConnectNotion(
  token: string,
): Promise<PluginStatus[]> {
  if (!hasIntrayBridge()) {
    throw new Error("Plugins connect inside the Intray desktop app.");
  }
  return pluginCall(() => window.intray.plugins.connectNotion(token));
}

export async function bridgeDisconnectPlugin(
  id: PluginId,
): Promise<PluginStatus[]> {
  if (!hasIntrayBridge()) return previewPluginStatuses();
  return pluginCall(() => window.intray.plugins.disconnect(id));
}

export async function bridgeSetPluginEnabled(
  id: PluginId,
  enabled: boolean,
): Promise<PluginStatus[]> {
  if (!hasIntrayBridge()) {
    throw new Error("Plugins connect inside the Intray desktop app.");
  }
  return pluginCall(() => window.intray.plugins.setEnabled(id, enabled));
}

export const CALENDAR_CHANGED = "intray-calendar-changed";

const calendarCache = new Map<string, { at: number; events: CalendarEventDto[] }>();
const CALENDAR_CACHE_MS = 60_000;

export function notifyCalendarChanged(): void {
  calendarCache.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CALENDAR_CHANGED));
  }
}

export async function bridgeCalendarEvents(
  range: CalendarRange,
): Promise<CalendarEventDto[]> {
  if (!hasIntrayBridge()) return [];
  const key = `${range.startIso}|${range.endIso}`;
  const hit = calendarCache.get(key);
  if (hit && Date.now() - hit.at < CALENDAR_CACHE_MS) return hit.events;
  const events = await pluginCall(() => window.intray.plugins.calendarEvents(range));
  calendarCache.set(key, { at: Date.now(), events });
  return events;
}

export async function bridgeCalendarCreate(
  input: CalendarEventInput,
): Promise<CalendarEventDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Google Calendar connects inside the Intray desktop app.");
  }
  const event = await pluginCall(() => window.intray.plugins.calendarCreate(input));
  notifyCalendarChanged();
  return event;
}

export async function bridgeCalendarUpdate(
  input: CalendarEventUpdate,
): Promise<CalendarEventDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Google Calendar connects inside the Intray desktop app.");
  }
  const event = await pluginCall(() => window.intray.plugins.calendarUpdate(input));
  notifyCalendarChanged();
  return event;
}

export async function bridgeCalendarDelete(
  id: string,
  notifyGuests: boolean,
): Promise<void> {
  if (!hasIntrayBridge()) {
    throw new Error("Google Calendar connects inside the Intray desktop app.");
  }
  await pluginCall(() => window.intray.plugins.calendarDelete(id, notifyGuests));
  notifyCalendarChanged();
}

export async function bridgeCalendarRespond(
  id: string,
  response: CalendarRsvp,
): Promise<CalendarEventDto> {
  if (!hasIntrayBridge()) {
    throw new Error("Google Calendar connects inside the Intray desktop app.");
  }
  const event = await pluginCall(() =>
    window.intray.plugins.calendarRespond(id, response),
  );
  notifyCalendarChanged();
  return event;
}

export async function bridgeNotionTargets(): Promise<NotionTarget[]> {
  if (!hasIntrayBridge()) return [];
  return pluginCall(() => window.intray.plugins.notionTargets());
}

export async function bridgeNotionSetTarget(
  target: NotionTarget,
): Promise<PluginStatus[]> {
  if (!hasIntrayBridge()) {
    throw new Error("Notion connects inside the Intray desktop app.");
  }
  return pluginCall(() => window.intray.plugins.notionSetTarget(target));
}

export async function bridgeNotionSave(
  input: NotionSaveInput,
): Promise<NotionSaveResult> {
  if (!hasIntrayBridge()) {
    throw new Error("Notion connects inside the Intray desktop app.");
  }
  return pluginCall(() => window.intray.plugins.notionSave(input));
}

export function accountDtoToUi(a: AccountDto): Account {
  return {
    id: a.id,
    label: a.label,
    name: a.name,
    email: a.email,
    color: a.color,
    avatarUrl: a.avatarUrl,
    unread: a.unread,
    provider: a.provider,
    loggedOut: a.loggedOut,
    identities: a.identities?.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      primary: i.primary,
    })),
  };
}

/** Match main-process auth failure detection for live sync progress. */
export function isAuthFailureMessage(error?: string | null): boolean {
  if (!error) return false;
  return /credentials? (missing|not found)|authentication failed|invalid_grant|unauthorized|revoked|login required|logged out|\b401\b|\b403\b|token.*(expired|invalid)|imap.*auth/i.test(
    error,
  );
}

function countAttachmentsInThread(thread: MessageDto["thread"]): number {
  let n = 0;
  for (const turn of thread) {
    if (turn.attachments?.length) n += turn.attachments.length;
    else if (turn.attachment) n += 1;
  }
  return n;
}

function countLinksInThread(thread: MessageDto["thread"]): number {
  let n = 0;
  for (const t of thread) {
    const html = t.bodyHtml ?? "";
    const matches = html.match(/href\s*=/gi);
    if (matches) n += matches.length;
  }
  return n;
}

export function messageDtoToUi(m: MessageDto): Message {
  const attachmentCount = countAttachmentsInThread(m.thread);
  // List payloads omit HTML. Scan only when a body is actually present.
  const hasBodyHtml = m.thread.some((t) => t.bodyHtml);
  const linkCount = hasBodyHtml ? countLinksInThread(m.thread) : (m.linkCount ?? 0);
  return {
    id: m.id,
    accountId: m.accountId,
    from: m.from,
    initials: m.initials,
    avatarColor: m.avatarColor,
    avatarUrl: m.avatarUrl,
    email: m.email,
    subject: m.subject,
    preview: readablePreview(m.preview),
    matchPreview: m.matchPreview,
    time: m.time,
    unread: m.unread,
    important: m.important,
    folder: m.folder,
    tag: m.tag,
    hasAttachment: m.hasAttachment || attachmentCount > 0,
    starred: Boolean(m.starred),
    linkCount: linkCount || undefined,
    attachmentCount: attachmentCount || undefined,
    thread: m.thread.map((t) => ({
      ...t,
      avatarUrl: t.avatarUrl,
    })),
  };
}
