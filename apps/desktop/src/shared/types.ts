/** Shared mail domain types (main ↔ renderer). */

export type ProviderId =
  | "gmail"
  | "outlook"
  | "imap"
  | "icloud"
  | "fastmail"
  | "yahoo";

export type AccountDto = {
  id: string;
  label: string;
  name: string;
  email: string;
  color: string;
  unread: number;
  provider: ProviderId;
  /** True when credentials are missing or sync/auth has failed. */
  loggedOut?: boolean;
};

export type RecipientDto = {
  name: string;
  email: string;
};

export type ThreadMessageDto = {
  id: string;
  from: string;
  initials: string;
  avatarColor: string;
  email: string;
  time: string;
  to?: RecipientDto[];
  cc?: RecipientDto[];
  noTrackers?: boolean;
  body?: string[];
  bodyHtml?: string;
  attachment?: { name: string; size: string };
};

export type MessageDto = {
  id: string;
  accountId: string;
  from: string;
  initials: string;
  avatarColor: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  important: boolean;
  starred?: boolean;
  folder: string;
  tag?: { label: string; color: string };
  hasAttachment?: boolean;
  thread: ThreadMessageDto[];
};

export type MailListQuery = {
  accountId?: string | "all";
  folder?: string;
  filter?: "important" | "other" | "all";
  cursor?: string | null;
  limit?: number;
  q?: string;
};

export type MailListResult = {
  messages: MessageDto[];
  nextCursor: string | null;
  total: number;
};

export type MailMutateAction =
  | "archive"
  | "trash"
  | "spam"
  | "not-spam"
  | "delete-forever"
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "snooze"
  | "unsnooze"
  | "label"
  | "clear-label"
  | "move";

export type DesktopNotifyPayload = {
  title: string;
  body: string;
  silent?: boolean;
  messageId?: string;
};

export type BadgePayload = {
  count: number;
  mode: "count" | "dot" | "important" | "off";
};

export type MailMutateOptions = {
  /** Label id or snooze until ISO / relative label */
  detail?: string;
  /** Absolute snooze wake time (ms since epoch) */
  untilMs?: number;
};

export type LabelDto = {
  id: string;
  name: string;
  color: string;
};

export type ContactDto = {
  email: string;
  name: string;
  color: string;
};

export type AiProviderId =
  | "openai"
  | "grok"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "claude-code"
  | "codex"
  | "cursor"
  | "opencode"
  | "none";

export type AiCompleteRequest = {
  provider: AiProviderId;
  prompt: string;
  system?: string;
  model?: string;
  bridgePath?: string;
  maxTokens?: number;
};

export type AiCompleteResponse = {
  text: string;
  provider: AiProviderId;
  model?: string;
};

export type AiModelChoice = {
  id: string;
  label: string;
};

/** Live model list for the selected provider. Empty means nothing was returned. */
export type AiModelList = {
  connected: boolean;
  models: AiModelChoice[];
  detail?: string;
};

export type AiProviderStatus = {
  id: AiProviderId;
  available: boolean;
  reason?: string;
  defaultModel?: string;
  /** Resolved CLI binary, when this provider is a local CLI. */
  path?: string;
  /** Models discovered on this PC (Ollama tags). Cursor loads these separately. */
  models?: AiModelChoice[];
};

export type AiSecretId =
  | "openai"
  | "grok"
  | "anthropic"
  | "gemini"
  | "ollama";

export type QueuedSendResult = {
  queueId: string;
  sendAtMs: number;
};

export type ComposeAttachment = {
  filename: string;
  contentType: string;
  /** Raw base64 (no data: URL prefix) */
  contentBase64: string;
  size: number;
};

export type ComposeDraft = {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  replyToMessageId?: string;
  attachments?: ComposeAttachment[];
};

export type SyncStatus = {
  accountId: string;
  state: "idle" | "syncing" | "error" | "offline";
  lastSyncAt: string | null;
  error?: string;
  progress?: string;
};

export type LaunchAtLoginState = {
  openAtLogin: boolean;
  openAsHidden: boolean;
};

export type McpStatus = {
  running: boolean;
  port: number | null;
  url: string | null;
  /** Bearer token required by the localhost MCP endpoint. */
  token?: string;
  /** Ready-to-paste MCP client config. */
  config?: string;
};

/** Add an IMAP / app-password account (iCloud, Yahoo, Fastmail, Outlook, generic). */
export type AddImapAccountInput = {
  provider: ProviderId;
  email: string;
  password: string;
  displayName?: string;
  username?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
};

/** How an existing account should re-authenticate. */
export type AccountReconnectInfo = {
  accountId: string;
  email: string;
  name: string;
  provider: ProviderId;
  authMode: "imap" | "oauth";
};

/** Re-auth an existing mailbox; IMAP only needs a fresh password. */
export type ReconnectAccountInput = {
  accountId: string;
  /** Required for IMAP / app-password accounts. */
  password?: string;
  /** Force Google browser sign-in even when IMAP settings exist. */
  mode?: "imap" | "oauth";
};
