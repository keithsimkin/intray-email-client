import type {
  AccountDto,
  AccountReconnectInfo,
  AddImapAccountInput,
  AiCompleteRequest,
  AiCompleteResponse,
  AiModelList,
  AiProviderId,
  AiProviderStatus,
  AiSecretId,
  BadgePayload,
  ComposeDraft,
  ContactDto,
  DesktopNotifyPayload,
  LabelDto,
  LaunchAtLoginState,
  MailListQuery,
  MailListResult,
  MailMutateAction,
  MailMutateOptions,
  MessageDto,
  QueuedSendResult,
  ReconnectAccountInput,
  SyncStatus,
} from "../shared/types";
import type { Account, Message } from "./data/mock";

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

export async function bridgeListMail(
  query: MailListQuery,
): Promise<MailListResult> {
  if (!hasIntrayBridge()) return { messages: [], nextCursor: null, total: 0 };
  return window.intray.mail.list(query);
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

export async function bridgeAiComplete(
  req: AiCompleteRequest,
): Promise<AiCompleteResponse> {
  if (!hasIntrayBridge()) {
    return aiHost<AiCompleteResponse>("complete", { method: "POST", body: req });
  }
  return window.intray.ai.complete(req);
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
  cb: (payload: { messageId: string }) => void,
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

export function accountDtoToUi(a: AccountDto): Account {
  return {
    id: a.id,
    label: a.label,
    name: a.name,
    email: a.email,
    color: a.color,
    unread: a.unread,
    provider: a.provider,
    loggedOut: a.loggedOut,
  };
}

/** Match main-process auth failure detection for live sync progress. */
export function isAuthFailureMessage(error?: string | null): boolean {
  if (!error) return false;
  return /credentials? (missing|not found)|authentication failed|invalid_grant|unauthorized|revoked|login required|logged out|\b401\b|\b403\b|token.*(expired|invalid)|imap.*auth/i.test(
    error,
  );
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
  const attachmentCount = m.thread.filter((t) => t.attachment).length;
  const linkCount = countLinksInThread(m.thread);
  return {
    id: m.id,
    accountId: m.accountId,
    from: m.from,
    initials: m.initials,
    avatarColor: m.avatarColor,
    email: m.email,
    subject: m.subject,
    preview: m.preview,
    time: m.time,
    unread: m.unread,
    important: m.important,
    folder: m.folder,
    tag: m.tag,
    hasAttachment: m.hasAttachment || attachmentCount > 0,
    starred: Boolean(m.starred),
    linkCount: linkCount || undefined,
    attachmentCount: attachmentCount || undefined,
    thread: m.thread,
  };
}
