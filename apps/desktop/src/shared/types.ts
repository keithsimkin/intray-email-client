/** Shared mail domain types (main ↔ renderer). */

import type { AttachmentKind } from "./attachmentPreview";

export type ProviderId =
  | "gmail"
  | "outlook"
  | "imap"
  | "icloud"
  | "fastmail"
  | "yahoo";

/** Linked send-as address on a mailbox (e.g. iCloud custom domain). */
export type AccountIdentityDto = {
  id: string;
  email: string;
  name: string;
  primary: boolean;
};

export type AccountDto = {
  id: string;
  label: string;
  name: string;
  email: string;
  color: string;
  /** Profile photo URL when known (Google picture, Gravatar, …). */
  avatarUrl?: string;
  unread: number;
  provider: ProviderId;
  /** True when credentials are missing or sync/auth has failed. */
  loggedOut?: boolean;
  /** Primary + linked addresses you can send as from this mailbox. */
  identities?: AccountIdentityDto[];
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
  avatarUrl?: string;
  email: string;
  time: string;
  to?: RecipientDto[];
  cc?: RecipientDto[];
  noTrackers?: boolean;
  body?: string[];
  /** text/plain part, kept even when the reader shows HTML. */
  bodyText?: string;
  bodyHtml?: string;
  attachment?: { name: string; size: string };
  attachments?: AttachmentDto[];
};

export type AttachmentDto = {
  id: string;
  name: string;
  /** Human size, e.g. "2.4 MB". */
  size: string;
  bytes: number;
  contentType: string;
  kind: AttachmentKind;
};

export type AttachmentPreviewResult = {
  name: string;
  contentType: string;
  kind: AttachmentKind;
  size: number;
  bytes?: Uint8Array;
  error?: "missing" | "too-big" | "unavailable";
};

export type AttachmentActionResult = {
  ok: boolean;
  error?: string;
};

export type MessageDto = {
  id: string;
  accountId: string;
  from: string;
  initials: string;
  avatarColor: string;
  avatarUrl?: string;
  email: string;
  subject: string;
  preview: string;
  /** Matching passage with \u0001 \u0002 around the words that hit. */
  matchPreview?: string;
  time: string;
  unread: boolean;
  important: boolean;
  starred?: boolean;
  folder: string;
  tag?: { label: string; color: string };
  hasAttachment?: boolean;
  /** Links stored with the bodies. List responses omit HTML and send this instead. */
  linkCount?: number;
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
  /** Set when another local page exists. Null means the store has nothing older. */
  nextCursor: string | null;
  /**
   * Cursor of the last row in this page (or the request cursor when the page
   * is empty). Pass it again after a provider backfill.
   */
  endCursor: string | null;
  total: number;
};

/** How many older messages a scroll-triggered provider fetch stored. */
export type MailOlderResult = {
  added: number;
  exhausted: boolean;
};

export type FolderCountEntry = {
  total: number;
  unread: number;
};

/** Sidebar badge data — totals + unread conversations, keyed by folder id or `label:<id>`. */
export type MailFolderCounts = {
  folders: Record<string, FolderCountEntry>;
  labels: Record<string, FolderCountEntry>;
  /** Unread inbox threads across the scoped account(s) — drives Unified / rail badges. */
  inboxUnread: number;
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
  /** Folder to open when the toast is clicked (e.g. sent for read receipts) */
  folderId?: string;
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
  avatarUrl?: string;
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
  /** Send-as address; must be a linked identity (or the account primary). */
  fromEmail?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  replyToMessageId?: string;
  attachments?: ComposeAttachment[];
};

/** Add a linked send-as address under an existing mailbox. */
export type AddAccountIdentityInput = {
  accountId: string;
  email: string;
  /** Optional From display name; defaults to the account name. */
  name?: string;
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

/** Update local account appearance — no re-auth required. */
export type UpdateAccountInput = {
  accountId: string;
  /** Display name shown in the sidebar and compose From. */
  name?: string;
  /** Short initials on the account avatar (1–3 chars). */
  label?: string;
  /** Accent color for the account chip (`#rrggbb`). */
  color?: string;
};

/** GitHub Releases auto-update status (electron-updater). */
export type AppUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "ready"
  | "error"
  | "disabled";

export type AppUpdateStatus = {
  state: AppUpdateState;
  currentVersion: string;
  packaged: boolean;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadPercent?: number;
  error?: string;
  detail?: string;
};
