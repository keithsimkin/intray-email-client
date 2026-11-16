import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import {
  deleteAccount,
  deleteMessageById,
  getAccountRow,
  getBody,
  getLabel,
  getMessageRow,
  listAccountRows,
  listContacts,
  listLabels,
  listMessageRows,
  listThreadMessages,
  recountUnread,
  searchMessageRows,
  updateFtsBody,
  updateMessageFlags,
  upsertAccount,
  upsertBody,
  upsertContact,
  upsertLabel,
  upsertMessage,
  getSyncState,
  upsertSyncState,
  type AccountRow,
  type MessageRow,
} from "../db";
import {
  accountUsesImap,
  isGmailImapAccount,
  loadCredentials,
  peekCredentials,
  saveCredentials,
  type ImapCredentials,
} from "../crypto/credentials";
import {
  deleteMessageForever,
  findMessageIdByRfc822,
  getMessageFull,
  modifyLabels,
  persistGmailTokens,
  sendRawMessage,
  spamMessage,
  trashMessage,
  unspamMessage,
} from "../providers/gmail/client";
import {
  avatarColorFor,
  bodiesFromGmail,
  formatRelativeTime,
  gmailMessageToRow,
  initialsFrom,
} from "../providers/gmail/map";
import {
  gmailOAuthConfigured,
  runGmailOAuth,
} from "../providers/gmail/oauth";
import {
  fetchMessageSource,
  findSentMessage,
  parsedToBodies,
  pushImapChange,
  sendSmtp,
  verifyImapLogin,
  type ImapChangeAction,
} from "../providers/imap/client";
import { mailboxMetaFromRow } from "../providers/imap/map";
import { presetFor } from "../providers/imap/presets";
import {
  gmailAppPasswordFormatError,
  isGmailImapTarget,
  normalizeGmailAppPassword,
} from "../../shared/gmailImap";
import { assertAddressList, buildMessageId, buildRawMessage } from "./mime";
import { sanitizeEmailHtml } from "./sanitize";
import {
  startAccountPolling,
  stopAccountPolling,
  syncAccount,
} from "../sync/engine";
import type {
  AccountDto,
  AccountReconnectInfo,
  AddImapAccountInput,
  ComposeDraft,
  ContactDto,
  LabelDto,
  MailListQuery,
  MailListResult,
  MailMutateAction,
  MailMutateOptions,
  MessageDto,
  ReconnectAccountInput,
  RecipientDto,
  ThreadMessageDto,
} from "../../shared/types";

/** Parallel body downloads once the opened message is on screen. */
const BODY_FETCH_CONCURRENCY = 4;

const bodyFetches = new Map<string, Promise<void>>();
const threadBackfills = new Map<string, Promise<void>>();
/** headIds waiting on a shared thread backfill so each gets a final broadcast. */
const threadBackfillHeads = new Map<string, Set<string>>();

function broadcastMailUpdated(message: MessageDto): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("mail:updated", { message });
  }
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function ensureBodyForRow(
  row: MessageRow,
  account: AccountRow | undefined,
): Promise<void> {
  if (getBody(row.id)) return;
  const existing = bodyFetches.get(row.id);
  if (existing) return existing;

  const task = (async () => {
    if (!account) return;
    try {
      if (!usesImap(account)) {
        const full = await getMessageFull(row.account_id, row.provider_id);
        upsertMessage(gmailMessageToRow(row.account_id, full));
        const bodies = bodiesFromGmail(full);
        upsertBody({
          message_id: row.id,
          text_plain: bodies.text ?? null,
          text_html: bodies.html ?? null,
          fetched_at: new Date().toISOString(),
        });
        if (bodies.text) updateFtsBody(row.id, bodies.text);
      } else {
        const meta = mailboxMetaFromRow(row);
        if (!meta) return;
        const parsed = await fetchMessageSource(
          row.account_id,
          meta.mailbox,
          meta.uid,
        );
        const bodies = parsedToBodies(parsed);
        upsertBody({
          message_id: row.id,
          text_plain: bodies.text,
          text_html: bodies.html,
          fetched_at: new Date().toISOString(),
        });
        if (bodies.text) updateFtsBody(row.id, bodies.text);
      }
    } catch {
      /* leave placeholder */
    }
  })().finally(() => {
    bodyFetches.delete(row.id);
  });

  bodyFetches.set(row.id, task);
  return task;
}

function buildMessageDto(messageId: string): MessageDto | null {
  const refreshed = getMessageRow(messageId);
  if (!refreshed) return null;
  const thread = listThreadMessages(refreshed.account_id, refreshed.thread_id);
  const rows = thread.length ? thread : [refreshed];
  const bodies = new Map(
    rows.map((t) => {
      const b = getBody(t.id);
      return [
        t.id,
        b ?? { text_plain: null, text_html: null, fetched_at: "" },
      ] as const;
    }),
  );
  return rowsToMessageDto(refreshed, rows, bodies);
}

function backfillThreadBodies(
  headId: string,
  rows: MessageRow[],
  account: AccountRow | undefined,
): Promise<void> {
  const head = getMessageRow(headId);
  const threadKey = head
    ? `${head.account_id}:${head.thread_id}`
    : headId;
  let heads = threadBackfillHeads.get(threadKey);
  if (!heads) {
    heads = new Set();
    threadBackfillHeads.set(threadKey, heads);
  }
  heads.add(headId);

  const existing = threadBackfills.get(threadKey);
  if (existing) {
    // Ensure this head gets an update even if it joined after the shared
    // task already snapshot the waiting set.
    return existing.then(() => {
      const dto = buildMessageDto(headId);
      if (dto) broadcastMailUpdated(dto);
    });
  }

  const task = (async () => {
    const missing = rows.filter((r) => !getBody(r.id));
    if (missing.length) {
      await mapLimit(missing, BODY_FETCH_CONCURRENCY, async (r) => {
        await ensureBodyForRow(r, account);
      });
    }
    const waiting = [...(threadBackfillHeads.get(threadKey) ?? [])];
    for (const id of waiting) {
      const dto = buildMessageDto(id);
      if (dto) broadcastMailUpdated(dto);
    }
  })().finally(() => {
    threadBackfills.delete(threadKey);
    threadBackfillHeads.delete(threadKey);
  });

  threadBackfills.set(threadKey, task);
  return task;
}

/** Auth / credential failures that mean the account needs to reconnect. */
export function isAuthFailure(error?: string | null): boolean {
  if (!error) return false;
  return /credentials? (missing|not found)|authentication failed|invalid_grant|unauthorized|revoked|login required|logged out|\b401\b|\b403\b|token.*(expired|invalid)|imap.*auth|refused imap|rejected this password|app password/i.test(
    error,
  );
}

function accountToDto(row: AccountRow): AccountDto {
  const creds = loadCredentials(row.id);
  const sync = getSyncState(row.id);
  const loggedOut = !creds || isAuthFailure(sync?.error);
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    email: row.email,
    color: row.color,
    unread: row.unread,
    provider: row.provider as AccountDto["provider"],
    loggedOut,
  };
}

function parseRecipients(json: string): RecipientDto[] {
  try {
    return JSON.parse(json) as RecipientDto[];
  } catch {
    return [];
  }
}

function rowToThreadMessage(
  row: MessageRow,
  body?: { text_plain: string | null; text_html: string | null },
): ThreadMessageDto {
  const text = body?.text_plain?.trim();
  const html = sanitizeEmailHtml(body?.text_html).trim();
  return {
    id: row.id,
    from: row.from_name,
    initials: initialsFrom(row.from_name, row.from_email),
    avatarColor: avatarColorFor(row.from_email),
    email: row.from_email,
    time: formatRelativeTime(row.date_ms),
    to: parseRecipients(row.to_json),
    cc: parseRecipients(row.cc_json),
    noTrackers: true,
    body: html ? undefined : text ? text.split(/\n+/).filter(Boolean) : ["(No body yet)"],
    bodyHtml: html || undefined,
  };
}

function rowsToMessageDto(
  head: MessageRow,
  threadRows: MessageRow[],
  bodies: Map<string, { text_plain: string | null; text_html: string | null }>,
): MessageDto {
  const label = head.ui_label_id ? getLabel(head.ui_label_id) : undefined;
  return {
    id: head.id,
    accountId: head.account_id,
    from: head.from_name,
    initials: initialsFrom(head.from_name, head.from_email),
    avatarColor: avatarColorFor(head.from_email),
    email: head.from_email,
    subject: head.subject,
    preview: head.snippet,
    time:
      head.folder === "snoozed" && head.snooze_until_ms
        ? `Until ${new Date(head.snooze_until_ms).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`
        : formatRelativeTime(head.date_ms),
    unread: head.unread === 1,
    important: head.important === 1 || head.starred === 1,
    starred: head.starred === 1,
    folder: head.folder,
    tag: label ? { label: label.name, color: label.color } : undefined,
    hasAttachment: head.has_attachment === 1,
    thread: threadRows.map((r) => rowToThreadMessage(r, bodies.get(r.id))),
  };
}

function snoozeUntilMs(detail?: string, untilMs?: number): number {
  if (untilMs && untilMs > Date.now()) return untilMs;
  const label = (detail ?? "Tomorrow").toLowerCase();
  const now = new Date();
  if (label.includes("later today") || label === "later") {
    return now.getTime() + 3 * 60 * 60 * 1000;
  }
  if (label.includes("weekend") || label.includes("monday")) {
    const day = now.getDay();
    const daysUntilMon = ((8 - day) % 7) || 7;
    const wake = new Date(now);
    wake.setDate(now.getDate() + daysUntilMon);
    wake.setHours(9, 0, 0, 0);
    return wake.getTime();
  }
  if (label.includes("next week")) {
    return now.getTime() + 7 * 24 * 60 * 60 * 1000;
  }
  // Tomorrow morning
  const wake = new Date(now);
  wake.setDate(now.getDate() + 1);
  wake.setHours(9, 0, 0, 0);
  return wake.getTime();
}

export function listLabelDtos(): LabelDto[] {
  return listLabels().map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
  }));
}

export function createLabelDto(input: {
  name: string;
  color: string;
}): LabelDto {
  const id = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || `label-${Date.now().toString(36)}`;
  const row = {
    id,
    name: input.name.trim(),
    color: input.color,
    created_at: new Date().toISOString(),
  };
  upsertLabel(row);
  return { id: row.id, name: row.name, color: row.color };
}

export function listContactDtos(): ContactDto[] {
  return listContacts().map((c) => ({
    email: c.email,
    name: c.name,
    color: c.color,
  }));
}

function touchContactsFromDraft(draft: ComposeDraft): void {
  const now = Date.now();
  for (const email of [...draft.to, ...(draft.cc ?? []), ...(draft.bcc ?? [])]) {
    upsertContact({
      email,
      name: email.split("@")[0] ?? email,
      color: avatarColorFor(email),
      last_seen_ms: now,
      frequency: 1,
    });
  }
}

export function listAccounts(): AccountDto[] {
  return listAccountRows().map(accountToDto);
}

export function hasRealAccounts(): boolean {
  return listAccountRows().length > 0;
}

export async function addGmailAccount(): Promise<AccountDto> {
  if (!gmailOAuthConfigured()) {
    throw new Error(
      "Google sign-in needs GMAIL_CLIENT_ID (Desktop OAuth client) and is limited to test users until Google verifies the app. Connect Gmail with an app password instead.",
    );
  }
  const { tokens, profile } = await runGmailOAuth();
  const existing = listAccountRows().find(
    (a) => a.email.toLowerCase() === profile.email.toLowerCase(),
  );
  const id = existing?.id ?? `gmail-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const label = initialsFrom(profile.name, profile.email);
  const row: AccountRow = {
    id,
    provider: "gmail",
    email: profile.email,
    name: profile.name,
    label,
    color: "#ea4335",
    unread: existing?.unread ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  upsertAccount(row);
  await persistGmailTokens(id, tokens);
  upsertSyncState({
    account_id: id,
    history_id: null,
    last_sync_at: null,
    status: "idle",
    error: null,
    progress: null,
    imap_cursor_json: null,
  });
  startAccountPolling(id);
  void syncAccount(id).catch(() => undefined);
  return accountToDto(row);
}

function assertHost(value: string, label: string): string {
  const host = value.trim();
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(host) && !/^\[[0-9a-fA-F:]+\]$/.test(host)) {
    throw new Error(`Invalid ${label} hostname.`);
  }
  return host;
}

function assertPort(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid ${label} port.`);
  }
  return value;
}

function resolveImapCreds(input: AddImapAccountInput): ImapCredentials {
  const preset = presetFor(input.provider);
  const rawImapHost = (input.imapHost || preset?.imapHost || "").trim();
  if (!rawImapHost) throw new Error("IMAP host is required.");
  const imapHost = assertHost(rawImapHost, "IMAP");
  const rawSmtpHost = (input.smtpHost || preset?.smtpHost || imapHost).trim();
  if (!rawSmtpHost) throw new Error("SMTP host is required.");
  const smtpHost = assertHost(rawSmtpHost, "SMTP");
  const email = input.email.trim().toLowerCase();
  const gmail = isGmailImapTarget({
    brand: input.provider,
    imapHost,
    smtpHost,
  });
  let password = input.password;
  if (gmail) {
    const formatError = gmailAppPasswordFormatError(password);
    if (formatError) throw new Error(formatError);
    password = normalizeGmailAppPassword(password);
  }
  return {
    provider: "imap",
    brand: input.provider,
    email,
    // Gmail app passwords authenticate as the full address.
    username: gmail ? email : input.username?.trim() || undefined,
    password,
    imapHost,
    imapPort: assertPort(
      input.imapPort ?? preset?.imapPort ?? 993,
      "IMAP",
    ),
    smtpHost,
    smtpPort: assertPort(
      input.smtpPort ?? preset?.smtpPort ?? 587,
      "SMTP",
    ),
  };
}

function usesImap(account: AccountRow): boolean {
  return accountUsesImap(account.id, account.provider);
}

async function pushAccountImapChange(
  account: AccountRow,
  row: MessageRow,
  action: ImapChangeAction,
  folder?: string,
): Promise<void> {
  const meta = mailboxMetaFromRow(row);
  if (!meta) return;
  await pushImapChange(account.id, meta.mailbox, meta.uid, action, {
    gmail: isGmailImapAccount(account.id),
    folder,
  });
}

export async function addImapAccount(
  input: AddImapAccountInput,
): Promise<AccountDto> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email address.");
  if (!input.password.trim()) {
    throw new Error("Enter your app password.");
  }

  const creds = resolveImapCreds(input);
  await verifyImapLogin(creds);

  const preset = presetFor(input.provider);
  const existing = listAccountRows().find(
    (a) => a.email.toLowerCase() === email,
  );
  const id =
    existing?.id ?? `${input.provider}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const name =
    input.displayName?.trim() ||
    email.split("@")[0].replace(/[._]/g, " ");
  const pretty = name.replace(/\b\w/g, (c) => c.toUpperCase());
  const row: AccountRow = {
    id,
    provider: input.provider,
    email,
    name: pretty,
    label: initialsFrom(pretty, email),
    color: preset?.color ?? "#8a8f98",
    unread: existing?.unread ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  upsertAccount(row);
  saveCredentials(id, creds);
  upsertSyncState({
    account_id: id,
    history_id: null,
    last_sync_at: null,
    status: "idle",
    error: null,
    progress: null,
    imap_cursor_json: null,
  });
  startAccountPolling(id);
  void syncAccount(id).catch(() => undefined);
  return accountToDto(row);
}

function clearAuthErrorAndResume(accountId: string): void {
  const sync = getSyncState(accountId);
  upsertSyncState({
    account_id: accountId,
    history_id: sync?.history_id ?? null,
    last_sync_at: sync?.last_sync_at ?? null,
    status: "idle",
    error: null,
    progress: null,
    imap_cursor_json: sync?.imap_cursor_json ?? null,
  });
  startAccountPolling(accountId);
  void syncAccount(accountId).catch(() => undefined);
}

export function getAccountReconnectInfo(
  accountId: string,
): AccountReconnectInfo {
  const row = getAccountRow(accountId);
  if (!row) throw new Error("Account not found.");
  const peeked = peekCredentials(accountId);
  let authMode: "imap" | "oauth";
  if (peeked?.provider === "gmail") authMode = "oauth";
  else if (peeked?.provider === "imap") authMode = "imap";
  else {
    // No usable secret left — prefer app-password reconnect (primary path).
    authMode = "imap";
  }
  return {
    accountId: row.id,
    email: row.email,
    name: row.name,
    provider: row.provider as AccountReconnectInfo["provider"],
    authMode,
  };
}

export async function reconnectAccount(
  input: ReconnectAccountInput,
): Promise<AccountDto> {
  const row = getAccountRow(input.accountId);
  if (!row) throw new Error("Account not found.");

  const info = getAccountReconnectInfo(row.id);
  const mode = input.mode ?? info.authMode;

  if (mode === "oauth") {
    if (row.provider !== "gmail") {
      throw new Error("Google sign-in is only available for Gmail accounts.");
    }
    if (!gmailOAuthConfigured()) {
      throw new Error(
        "Google sign-in needs GMAIL_CLIENT_ID. Use an app password instead.",
      );
    }
    const { tokens, profile } = await runGmailOAuth();
    if (profile.email.toLowerCase() !== row.email.toLowerCase()) {
      throw new Error(
        `Signed in as ${profile.email}, but this mailbox is ${row.email}.`,
      );
    }
    await persistGmailTokens(row.id, tokens);
    const now = new Date().toISOString();
    upsertAccount({ ...row, name: profile.name || row.name, updated_at: now });
    clearAuthErrorAndResume(row.id);
    return accountToDto(getAccountRow(row.id) ?? row);
  }

  const password = input.password?.trim() ?? "";
  if (!password) throw new Error("Enter your app password.");

  const peeked = peekCredentials(row.id);
  const preset = presetFor(row.provider);
  const brand =
    (peeked?.provider === "imap" && peeked.brand) || row.provider;

  const creds = resolveImapCreds({
    provider: brand as AddImapAccountInput["provider"],
    email: row.email,
    password,
    username:
      peeked?.provider === "imap" ? peeked.username : undefined,
    imapHost:
      peeked?.provider === "imap"
        ? peeked.imapHost
        : preset?.imapHost || undefined,
    imapPort:
      peeked?.provider === "imap"
        ? peeked.imapPort
        : preset?.imapPort,
    smtpHost:
      peeked?.provider === "imap"
        ? peeked.smtpHost
        : preset?.smtpHost || undefined,
    smtpPort:
      peeked?.provider === "imap"
        ? peeked.smtpPort
        : preset?.smtpPort,
  });

  await verifyImapLogin(creds);
  saveCredentials(row.id, creds);
  upsertAccount({ ...row, updated_at: new Date().toISOString() });
  clearAuthErrorAndResume(row.id);
  return accountToDto(row);
}

export function removeAccount(accountId: string): void {
  stopAccountPolling(accountId);
  deleteAccount(accountId);
}

export function listMail(query: MailListQuery): MailListResult {
  const limit = Math.min(query.limit ?? 50, 100);
  const beforeDateMs = query.cursor ? Number(query.cursor) : undefined;
  if (query.q?.trim()) {
    const rows = searchMessageRows(query.q, {
      accountId: query.accountId,
      limit,
    });
    // Collapse to newest per thread
    const seen = new Set<string>();
    const heads: MessageRow[] = [];
    for (const r of rows) {
      const key = `${r.account_id}:${r.thread_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      heads.push(r);
    }
    const messages = heads.map((h) => {
      const thread = listThreadMessages(h.account_id, h.thread_id);
      const bodies = new Map(
        thread.map((t) => [t.id, getBody(t.id) ?? { text_plain: null, text_html: null, fetched_at: "" }]),
      );
      return rowsToMessageDto(h, thread.length ? thread : [h], bodies);
    });
    return { messages, nextCursor: null, total: messages.length };
  }

  const { rows, total } = listMessageRows({
    accountId: query.accountId,
    folder: query.folder ?? "inbox",
    filter: query.filter ?? "all",
    limit: limit * 3, // over-fetch then collapse threads
    beforeDateMs: Number.isFinite(beforeDateMs) ? beforeDateMs : undefined,
  });

  const seen = new Set<string>();
  const heads: MessageRow[] = [];
  for (const r of rows) {
    const key = `${r.account_id}:${r.thread_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    heads.push(r);
    if (heads.length >= limit) break;
  }

  const messages = heads.map((h) => {
    const thread = listThreadMessages(h.account_id, h.thread_id);
    const bodies = new Map(
      thread.map((t) => {
        const b = getBody(t.id);
        return [t.id, b ?? { text_plain: null, text_html: null, fetched_at: "" }] as const;
      }),
    );
    return rowsToMessageDto(h, thread.length ? thread : [h], bodies);
  });

  const nextCursor =
    heads.length > 0 ? String(heads[heads.length - 1].date_ms) : null;

  return { messages, nextCursor, total };
}

/**
 * Load a message for the reader. Bodies are synced lazily: the newest (visible)
 * message is fetched first so the pane can paint, then the rest of the thread
 * is backfilled in parallel and pushed via `mail:updated`.
 *
 * Pass `waitForThread: true` when the caller needs every body before return
 * (MCP, tests).
 */
export async function getMail(
  messageId: string,
  opts?: { waitForThread?: boolean },
): Promise<MessageDto | null> {
  const head = getMessageRow(messageId);
  if (!head) return null;
  const account = getAccountRow(head.account_id);

  const thread = listThreadMessages(head.account_id, head.thread_id);
  const rows = thread.length ? thread : [head];

  // Reader expands the latest message by default (thread is date ASC).
  const primary = rows[rows.length - 1] ?? head;
  await ensureBodyForRow(primary, account);

  const dto = buildMessageDto(messageId);
  if (!dto) return null;

  const missing = rows.filter((r) => r.id !== primary.id && !getBody(r.id));
  if (missing.length) {
    const backfill = backfillThreadBodies(messageId, rows, account);
    if (opts?.waitForThread) {
      await backfill;
      return buildMessageDto(messageId) ?? dto;
    }
  }

  return dto;
}

export async function mutateMail(
  messageId: string,
  action: MailMutateAction,
  options: MailMutateOptions = {},
): Promise<MessageDto | null> {
  const row = getMessageRow(messageId);
  if (!row) return null;
  const account = getAccountRow(row.account_id);
  if (!account) return null;

  // Local-only actions (no provider round-trip required)
  if (action === "snooze") {
    const until = snoozeUntilMs(options.detail, options.untilMs);
    updateMessageFlags(row.id, {
      folder: "snoozed",
      unread: 0,
      snooze_until_ms: until,
    });
    recountUnread(row.account_id);
    return getMail(messageId);
  }
  if (action === "unsnooze") {
    updateMessageFlags(row.id, {
      folder: "inbox",
      snooze_until_ms: null,
      unread: 1,
    });
    recountUnread(row.account_id);
    return getMail(messageId);
  }
  if (action === "label") {
    if (options.detail) {
      updateMessageFlags(row.id, { ui_label_id: options.detail });
    }
    return getMail(messageId);
  }
  if (action === "clear-label") {
    updateMessageFlags(row.id, { ui_label_id: null });
    return getMail(messageId);
  }
  if (action === "move") {
    const folder = options.detail || "archive";
    if (!usesImap(account)) {
      if (folder === "trash") {
        await trashMessage(row.account_id, row.provider_id);
      } else if (folder === "junk") {
        await spamMessage(row.account_id, row.provider_id);
      } else if (folder === "archive") {
        await modifyLabels(row.account_id, row.provider_id, [], ["INBOX"]);
      } else if (folder === "inbox") {
        await modifyLabels(row.account_id, row.provider_id, ["INBOX"], ["SPAM"]);
      }
    } else {
      try {
        await pushAccountImapChange(account, row, "move", folder);
      } catch {
        /* keep local move */
      }
    }
    updateMessageFlags(row.id, {
      folder,
      unread: folder === "inbox" ? row.unread : 0,
      snooze_until_ms: folder === "snoozed" ? row.snooze_until_ms : null,
    });
    recountUnread(row.account_id);
    return getMail(messageId);
  }

  if (action === "spam") {
    if (!usesImap(account)) {
      try {
        await spamMessage(row.account_id, row.provider_id);
      } catch {
        /* local move still applies */
      }
    } else {
      try {
        await pushAccountImapChange(account, row, "spam");
      } catch {
        /* local */
      }
    }
    updateMessageFlags(row.id, { folder: "junk", unread: 0 });
    recountUnread(row.account_id);
    return getMail(messageId);
  }

  if (action === "not-spam") {
    if (!usesImap(account)) {
      try {
        await unspamMessage(row.account_id, row.provider_id);
      } catch {
        /* local */
      }
    } else {
      try {
        await pushAccountImapChange(account, row, "not-spam");
      } catch {
        /* local */
      }
    }
    updateMessageFlags(row.id, { folder: "inbox", unread: 1 });
    recountUnread(row.account_id);
    return getMail(messageId);
  }

  if (action === "delete-forever") {
    if (!usesImap(account)) {
      try {
        await deleteMessageForever(row.account_id, row.provider_id);
      } catch {
        /* still remove locally */
      }
    } else {
      try {
        await pushAccountImapChange(account, row, "delete-forever");
      } catch {
        /* local */
      }
    }
    deleteMessageById(row.id);
    recountUnread(row.account_id);
    return null;
  }

  if (!usesImap(account)) {
    switch (action) {
      case "archive":
        await modifyLabels(row.account_id, row.provider_id, [], ["INBOX"]);
        updateMessageFlags(row.id, { folder: "archive", unread: 0 });
        break;
      case "trash":
        await trashMessage(row.account_id, row.provider_id);
        updateMessageFlags(row.id, { folder: "trash", unread: 0 });
        break;
      case "read":
        await modifyLabels(row.account_id, row.provider_id, [], ["UNREAD"]);
        updateMessageFlags(row.id, { unread: 0 });
        break;
      case "unread":
        await modifyLabels(row.account_id, row.provider_id, ["UNREAD"], []);
        updateMessageFlags(row.id, { unread: 1 });
        break;
      case "star":
        await modifyLabels(row.account_id, row.provider_id, ["STARRED"], []);
        updateMessageFlags(row.id, { starred: 1, important: 1 });
        break;
      case "unstar":
        await modifyLabels(row.account_id, row.provider_id, [], ["STARRED"]);
        updateMessageFlags(row.id, { starred: 0 });
        break;
    }
  } else {
    if (
      action === "archive" ||
      action === "trash" ||
      action === "read" ||
      action === "unread" ||
      action === "star" ||
      action === "unstar"
    ) {
      try {
        await pushAccountImapChange(account, row, action);
      } catch {
        /* local flag update still applies */
      }
    }
    switch (action) {
      case "archive":
        updateMessageFlags(row.id, { folder: "archive", unread: 0 });
        break;
      case "trash":
        updateMessageFlags(row.id, { folder: "trash", unread: 0 });
        break;
      case "read":
        updateMessageFlags(row.id, { unread: 0 });
        break;
      case "unread":
        updateMessageFlags(row.id, { unread: 1 });
        break;
      case "star":
        updateMessageFlags(row.id, { starred: 1, important: 1 });
        break;
      case "unstar":
        updateMessageFlags(row.id, { starred: 0 });
        break;
    }
  }

  recountUnread(row.account_id);
  return getMail(messageId);
}

type SendOptions = { messageId?: string; retry?: boolean };

/** Local sent copy used until the provider sync indexes the real message. */
function persistSentDraft(
  account: AccountRow,
  draft: ComposeDraft,
  providerId: string,
): MessageRow {
  const now = Date.now();
  const row: MessageRow = {
    id: `${account.id}:${providerId}`,
    account_id: account.id,
    thread_id: providerId,
    provider_id: providerId,
    folder: "sent",
    subject: draft.subject || "(no subject)",
    snippet: draft.bodyText.slice(0, 180),
    from_name: account.name,
    from_email: account.email,
    to_json: JSON.stringify(
      draft.to.map((email) => ({ name: email.split("@")[0], email })),
    ),
    cc_json: JSON.stringify(
      (draft.cc ?? []).map((email) => ({
        name: email.split("@")[0],
        email,
      })),
    ),
    date_ms: now,
    unread: 0,
    important: 0,
    starred: 0,
    has_attachment: (draft.attachments?.length ?? 0) > 0 ? 1 : 0,
    label_ids_json: "[]",
    ui_label_id: null,
    snooze_until_ms: null,
    internal_date: new Date(now).toISOString(),
  };
  upsertMessage(row);
  upsertBody({
    message_id: row.id,
    text_plain: draft.bodyText,
    text_html: draft.bodyHtml ?? null,
    fetched_at: new Date().toISOString(),
  });
  return row;
}

async function storeGmailSent(
  account: AccountRow,
  draft: ComposeDraft,
  gmailId: string,
): Promise<MessageDto> {
  // Once Gmail accepted the message, indexing failure must never surface as a
  // send failure — the outbox would retry and duplicate the mail.
  try {
    const full = await getMessageFull(account.id, gmailId);
    const row = gmailMessageToRow(account.id, full);
    upsertMessage(row);
    const bodies = bodiesFromGmail(full);
    upsertBody({
      message_id: row.id,
      text_plain: bodies.text ?? draft.bodyText,
      text_html: bodies.html ?? null,
      fetched_at: new Date().toISOString(),
    });
    const dto = await getMail(row.id);
    if (dto) return dto;
  } catch {
    /* fall back to the local sent copy */
  }
  const row = persistSentDraft(account, draft, gmailId);
  const dto = await getMail(row.id);
  if (!dto) throw new Error("Sent message missing from store");
  return dto;
}

export async function sendMail(
  draft: ComposeDraft,
  opts: SendOptions = {},
): Promise<MessageDto> {
  const account = getAccountRow(draft.accountId);
  if (!account) throw new Error("Account not found");

  // Validate before touching the network: an invalid address is a permanent
  // failure and must not sit in the retry queue forever.
  const to = assertAddressList(draft.to ?? [], "To");
  if (to.length === 0) throw new Error("Add at least one recipient.");
  const cc = assertAddressList(draft.cc ?? [], "Cc");
  const bcc = assertAddressList(draft.bcc ?? [], "Bcc");

  // A compromised renderer should not be able to exhaust memory or attempt an
  // oversized upload through the send IPC.
  const attachments = draft.attachments ?? [];
  if (attachments.length > 20) {
    throw new Error("Too many attachments (max 20).");
  }
  let attachmentBytes = 0;
  for (const a of attachments) {
    attachmentBytes += Math.ceil((a.contentBase64?.length ?? 0) * 0.75);
  }
  if (attachmentBytes > 25 * 1024 * 1024) {
    throw new Error("Attachments exceed the 25 MB limit.");
  }

  const safeDraft: ComposeDraft = { ...draft, to, cc, bcc };
  touchContactsFromDraft(safeDraft);

  const messageId = opts.messageId ?? buildMessageId(account.email);

  if (!usesImap(account)) {
    // Idempotency: on a retry, check whether Gmail already has this Message-ID
    // (e.g. the app crashed after the API accepted the send).
    if (opts.retry) {
      const existing = await findMessageIdByRfc822(account.id, messageId).catch(
        () => null,
      );
      if (existing) return storeGmailSent(account, safeDraft, existing);
    }

    const built = buildRawMessage({
      from: { name: account.name, email: account.email },
      to,
      cc,
      bcc,
      subject: draft.subject,
      text: draft.bodyText,
      html: draft.bodyHtml,
      messageId,
      attachments: draft.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: a.contentBase64,
      })),
    });
    const sent = await sendRawMessage(account.id, built.raw);
    return storeGmailSent(account, safeDraft, sent.id);
  }

  // Same idempotency idea for SMTP, using the Sent folder when the provider
  // supports header search.
  if (opts.retry && (await findSentMessage(account.id, messageId))) {
    const providerId = `local-sent:${messageId.replace(/[<>\s]/g, "")}`;
    const row = persistSentDraft(account, safeDraft, providerId);
    const dto = await getMail(row.id);
    if (!dto) throw new Error("Sent message missing from store");
    return dto;
  }

  await sendSmtp(account.id, {
    fromName: account.name,
    fromEmail: account.email,
    to,
    cc,
    bcc,
    subject: draft.subject,
    bodyText: draft.bodyText,
    messageId,
    attachments: draft.attachments,
  });

  const providerId = `local-sent:${messageId.replace(/[<>\s]/g, "")}`;
  const row = persistSentDraft(account, safeDraft, providerId);
  void syncAccount(account.id).catch(() => undefined);
  const dto = await getMail(row.id);
  if (!dto) throw new Error("Sent message missing from store");
  return dto;
}

export async function triggerSync(accountId?: string): Promise<void> {
  const ids = accountId
    ? [accountId]
    : listAccountRows().map((a) => a.id);
  for (const id of ids) {
    await syncAccount(id);
  }
}

export function oauthStatus(): { gmailConfigured: boolean } {
  return { gmailConfigured: gmailOAuthConfigured() };
}
