import { randomUUID } from "node:crypto";
import { BrowserWindow, dialog, nativeImage } from "electron";
import {
  applyAccountAvatar,
  clearCustomAccountAvatar,
  lookupAvatarUrl,
  noteSender,
  setCustomAccountAvatar,
} from "../avatars";
import {
  deleteAccount,
  deleteIdentity,
  deleteMessageById,
  attachmentMetaKnown,
  getAccountRow,
  getBody,
  getIdentityByEmail,
  getLabel,
  getMessageRow,
  countMessagesByFolder,
  listAccountRows,
  listContacts,
  listIdentityRows,
  listLabels,
  listThreadHeadPage,
  listThreadMessages,
  oldestMessageMs,
  recountUnread,
  expandPersonQuery,
  searchMessageRows,
  updateFtsBody,
  updateMessageFlags,
  upsertAccount,
  upsertBody,
  upsertContact,
  upsertIdentity,
  upsertLabel,
  upsertMessage,
  upsertRfcHeaders,
  getSyncState,
  upsertSyncState,
  type AccountIdentityRow,
  type AccountRow,
  type MessageRow,
} from "../db";
import {
  indexIncomingMessage,
  readStoredRfc,
  rfcFromGmail,
} from "./threadIndex";
import {
  buildReplyReferences,
  normalizeRfcHeaders,
  type NormalizedRfc,
} from "./threading";
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
  getMessageMeta,
  listMessageIds,
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
  closeImapConnections,
  fetchImapThreadingHeaders,
  fetchMessageSource,
  findSentMessage,
  parsedToBodies,
  pushImapChange,
  searchImapFrom,
  sendSmtp,
  verifyImapLogin,
  type ImapChangeAction,
} from "../providers/imap/client";
import { imapEnvelopeToRow, mailboxMetaFromRow } from "../providers/imap/map";
import {
  attachmentDtos,
  filesFromCompose,
  filesFromGmail,
  filesFromParsed,
  rememberAttachments,
} from "./attachments";
import { presetFor } from "../providers/imap/presets";
import {
  gmailAppPasswordFormatError,
  isGmailImapTarget,
  normalizeGmailAppPassword,
} from "../../shared/gmailImap";
import { draftSnippet, packDraftBody, splitDraftBcc } from "../../shared/draftBody";
import { decodeMailCursor, encodeMailCursor } from "../../shared/mailCursor";
import { parseSearchClauses, stripMatchMarkers } from "../../shared/searchQuery";
import { assertAddressList, buildMessageId, buildRawMessage } from "./mime";
import { sanitizeEmailHtml } from "./sanitize";
import {
  backfillOlderMail,
  startAccountPolling,
  stopAccountPolling,
  syncAccount,
} from "../sync/engine";
import { startMailWatch, stopMailWatch } from "../sync/watch";
import type {
  AccountDto,
  AccountIdentityDto,
  AccountReconnectInfo,
  AddAccountIdentityInput,
  AddImapAccountInput,
  ComposeDraft,
  ContactDto,
  LabelDto,
  MailFolderCounts,
  MailListQuery,
  MailListResult,
  MailOlderResult,
  MailMutateAction,
  MailMutateOptions,
  MessageDto,
  ReconnectAccountInput,
  RecipientDto,
  ThreadMessageDto,
  UpdateAccountInput,
} from "../../shared/types";

/** Parallel body downloads once the opened message is on screen. */
const BODY_FETCH_CONCURRENCY = 4;
/** Don't leave the reader stuck on a hung provider call for minutes. */
const BODY_FETCH_TIMEOUT_MS = 45_000;
/** Warm the first page of the inbox so open is often a cache hit. */
const BODY_PREFETCH_HEADS = 12;
const BODY_PREFETCH_CONCURRENCY = 2;

const bodyFetches = new Map<string, Promise<void>>();
/** Background list warm-up — must not block interactive opens via dedup. */
const bodyPrefetches = new Map<string, Promise<void>>();
const threadBackfills = new Map<string, Promise<void>>();
/** headIds waiting on a shared thread backfill so each gets a final broadcast. */
const threadBackfillHeads = new Map<string, Set<string>>();

function broadcastMailUpdated(message: MessageDto): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("mail:updated", { message });
  }
}

function notifySearchReady(q: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("mail:search-ready", { q });
  }
}

const enrichInflight = new Set<string>();
const enrichDoneAt = new Map<string, number>();

function scheduleSearchEnrich(query: MailListQuery): void {
  const q = query.q?.trim();
  if (!q || !parseSearchClauses(q).some((clause) => clause.field === "from")) {
    return;
  }
  const key = `${query.accountId ?? "all"}:${q}`;
  const doneAt = enrichDoneAt.get(key) ?? 0;
  if (Date.now() - doneAt < 60_000) return;
  if (enrichInflight.has(key)) return;
  enrichInflight.add(key);
  void enrichFromSearch(query)
    .then((changed) => {
      enrichDoneAt.set(key, Date.now());
      if (changed) notifySearchReady(q);
    })
    .catch(() => {
      enrichDoneAt.set(key, Date.now());
    })
    .finally(() => {
      enrichInflight.delete(key);
    });
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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

async function downloadBodyForRow(
  row: MessageRow,
  account: AccountRow,
  opts?: { background?: boolean },
): Promise<void> {
  // Local drafts are stored with their body. Never ask the provider for them.
  if (row.provider_id.startsWith("local-draft:")) return;
  if (!usesImap(account)) {
    const full = await getMessageFull(row.account_id, row.provider_id);
    if (!getBody(row.id)) {
      // Body only — never re-upsert flags here. Opening a message races
      // mark-as-read; a stale UNREAD snapshot would undo the local write.
      const bodies = bodiesFromGmail(full);
      upsertBody({
        message_id: row.id,
        text_plain: bodies.text ?? null,
        text_html: bodies.html ?? null,
        fetched_at: new Date().toISOString(),
      });
      if (bodies.text) updateFtsBody(row.id, bodies.text);
    }
    const files = filesFromGmail(full);
    if (files) {
      try {
        rememberAttachments(row.id, files);
      } catch (error) {
        console.warn("attachment index failed", error);
      }
    }
    return;
  }

  const meta = mailboxMetaFromRow(row);
  if (!meta) return;
  const parsed = await fetchMessageSource(
    row.account_id,
    meta.mailbox,
    meta.uid,
    { lane: opts?.background ? "bulk" : "interactive" },
  );
  if (!getBody(row.id)) {
    const bodies = parsedToBodies(parsed);
    upsertBody({
      message_id: row.id,
      text_plain: bodies.text,
      text_html: bodies.html,
      fetched_at: new Date().toISOString(),
    });
    if (bodies.text) updateFtsBody(row.id, bodies.text);
  }
  try {
    rememberAttachments(row.id, filesFromParsed(parsed));
  } catch (error) {
    console.warn("attachment index failed", error);
  }
}

async function ensureBodyForRow(
  row: MessageRow,
  account: AccountRow | undefined,
  opts?: { background?: boolean },
): Promise<void> {
  if (getBody(row.id)) return;
  const background = Boolean(opts?.background);
  const bucket = background ? bodyPrefetches : bodyFetches;
  // Background may reuse an in-flight interactive fetch; interactive never waits
  // on prefetch (prefetch shares the bulk lane with sync and can stall opens).
  if (background) {
    const existing = bodyPrefetches.get(row.id) ?? bodyFetches.get(row.id);
    if (existing) return existing;
  } else {
    const existing = bodyFetches.get(row.id);
    if (existing) return existing;
  }

  const task = (async () => {
    if (!account) return;
    try {
      await withTimeout(
        downloadBodyForRow(row, account, opts),
        BODY_FETCH_TIMEOUT_MS,
        "Body fetch",
      );
    } catch {
      // Unstick a wedged IMAP socket so the next open can retry.
      if (usesImap(account)) {
        closeImapConnections(
          row.account_id,
          background ? "bulk" : "interactive",
        );
      }
      /* leave placeholder — UI can re-select to retry */
    }
  })().finally(() => {
    if (bucket.get(row.id) === task) bucket.delete(row.id);
  });

  bucket.set(row.id, task);
  return task;
}

const attachmentFetches = new Map<string, Promise<void>>();

/** Older cached bodies predate file indexing. Fetch the source once and store it. */
async function ensureAttachmentsForRow(
  row: MessageRow,
  account: AccountRow | undefined,
  opts?: { background?: boolean },
): Promise<void> {
  if (!account || row.has_attachment !== 1) return;
  if (attachmentMetaKnown(row.id)) return;
  const pending = bodyFetches.get(row.id) ?? bodyPrefetches.get(row.id);
  if (pending) {
    await pending;
    if (attachmentMetaKnown(row.id)) return;
  }
  if (!getBody(row.id)) {
    await ensureBodyForRow(row, account, opts);
    if (attachmentMetaKnown(row.id)) return;
  }
  const existing = attachmentFetches.get(row.id);
  if (existing) return existing;
  const task = (async () => {
    try {
      await withTimeout(
        downloadBodyForRow(row, account, opts),
        90_000,
        "Attachment fetch",
      );
    } catch {
      if (usesImap(account)) {
        closeImapConnections(
          row.account_id,
          opts?.background ? "bulk" : "interactive",
        );
      }
    }
  })().finally(() => {
    if (attachmentFetches.get(row.id) === task) attachmentFetches.delete(row.id);
  });
  attachmentFetches.set(row.id, task);
  return task;
}

/** Background-warm newest bodies for list heads (fire-and-forget). */
export function prefetchMailBodies(messageIds: string[]): void {
  const ids = [...new Set(messageIds)].slice(0, BODY_PREFETCH_HEADS);
  if (!ids.length) return;
  void mapLimit(ids, BODY_PREFETCH_CONCURRENCY, async (id) => {
    const head = getMessageRow(id);
    if (!head) return;
    const thread = listThreadMessages(head.account_id, head.thread_id);
    const primary = thread[thread.length - 1] ?? head;
    if (getBody(primary.id)) return;
    const account = getAccountRow(primary.account_id);
    await ensureBodyForRow(primary, account, { background: true });
    const dto = buildMessageDto(head.id);
    if (dto) broadcastMailUpdated(dto);
  }).catch(() => undefined);
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
    const needFiles = rows.filter(
      (r) => r.has_attachment === 1 && !attachmentMetaKnown(r.id),
    );
    if (needFiles.length) {
      await mapLimit(needFiles, BODY_FETCH_CONCURRENCY, async (r) => {
        await ensureAttachmentsForRow(r, account);
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

function identityToDto(row: AccountIdentityRow): AccountIdentityDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    primary: row.is_primary === 1,
  };
}

/** Ensure the account's login email exists as the primary send-as identity. */
function ensurePrimaryIdentity(row: AccountRow): AccountIdentityRow {
  const email = row.email.trim().toLowerCase();
  const existing = listIdentityRows(row.id);
  const primary = existing.find((i) => i.is_primary === 1);
  if (primary) {
    if (primary.email.toLowerCase() !== email || primary.name !== row.name) {
      const next: AccountIdentityRow = {
        ...primary,
        email,
        name: row.name,
      };
      upsertIdentity(next);
      return next;
    }
    return primary;
  }
  const byEmail = existing.find((i) => i.email.toLowerCase() === email);
  if (byEmail) {
    const next: AccountIdentityRow = {
      ...byEmail,
      name: row.name,
      is_primary: 1,
    };
    upsertIdentity(next);
    return next;
  }
  const created: AccountIdentityRow = {
    id: `id-${randomUUID().slice(0, 12)}`,
    account_id: row.id,
    email,
    name: row.name,
    is_primary: 1,
    created_at: new Date().toISOString(),
  };
  upsertIdentity(created);
  return created;
}

function identitiesForAccount(row: AccountRow): AccountIdentityDto[] {
  ensurePrimaryIdentity(row);
  return listIdentityRows(row.id).map(identityToDto);
}

function accountToDto(row: AccountRow): AccountDto {
  const creds = loadCredentials(row.id);
  const sync = getSyncState(row.id);
  const loggedOut = !creds || isAuthFailure(sync?.error);
  const avatarUrl =
    row.avatar_url && row.avatar_url.trim() ? row.avatar_url.trim() : undefined;
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    email: row.email,
    color: row.color,
    avatarUrl,
    unread: row.unread,
    provider: row.provider as AccountDto["provider"],
    loggedOut,
    identities: identitiesForAccount(row),
  };
}

/** Resolve From for send: draft override must be a linked identity on the account. */
function resolveSendFrom(
  account: AccountRow,
  draft: ComposeDraft,
): { fromName: string; fromEmail: string } {
  const identities = identitiesForAccount(account);
  const requested = draft.fromEmail?.trim().toLowerCase();
  if (!requested || requested === account.email.toLowerCase()) {
    return { fromName: account.name, fromEmail: account.email };
  }
  const hit = identities.find((i) => i.email.toLowerCase() === requested);
  if (!hit) {
    throw new Error(
      `"${draft.fromEmail}" is not a linked address on ${account.email}. Add it in Settings → Accounts.`,
    );
  }
  return {
    fromName: hit.name?.trim() || account.name,
    fromEmail: hit.email,
  };
}

export function addAccountIdentity(
  input: AddAccountIdentityInput,
): AccountDto {
  const account = getAccountRow(input.accountId);
  if (!account) throw new Error("Account not found.");
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || email.includes(" ")) {
    throw new Error("Enter a valid email address.");
  }
  ensurePrimaryIdentity(account);
  if (email === account.email.toLowerCase()) {
    throw new Error("That is already this account’s primary address.");
  }
  const taken = getIdentityByEmail(email);
  if (taken) {
    if (taken.account_id === account.id) {
      throw new Error("That address is already linked to this account.");
    }
    throw new Error("That address is already linked to another account.");
  }
  const otherAccount = listAccountRows().find(
    (a) => a.email.toLowerCase() === email,
  );
  if (otherAccount) {
    throw new Error("That address is already added as its own account.");
  }
  const name = input.name?.trim() || account.name;
  upsertIdentity({
    id: `id-${randomUUID().slice(0, 12)}`,
    account_id: account.id,
    email,
    name,
    is_primary: 0,
    created_at: new Date().toISOString(),
  });
  return accountToDto(account);
}

export function removeAccountIdentity(
  accountId: string,
  identityId: string,
): AccountDto {
  const account = getAccountRow(accountId);
  if (!account) throw new Error("Account not found.");
  const rows = listIdentityRows(accountId);
  const row = rows.find((r) => r.id === identityId);
  if (!row) throw new Error("Linked address not found.");
  if (row.is_primary === 1) {
    throw new Error("The primary address can’t be removed.");
  }
  deleteIdentity(identityId);
  return accountToDto(account);
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
  body?: {
    text_plain: string | null;
    text_html: string | null;
    attachments_json?: string | null;
  },
): ThreadMessageDto {
  const packed = splitDraftBcc(body?.text_plain);
  const text = packed.text.replace(/\r\n/g, "\n").trim();
  const html = sanitizeEmailHtml(body?.text_html).trim();
  const attachments = attachmentDtos(body?.attachments_json);
  const bcc = packed.bcc.map((email) => ({
    name: email.split("@")[0] || email,
    email,
  }));
  return {
    id: row.id,
    from: row.from_name,
    initials: initialsFrom(row.from_name, row.from_email),
    avatarColor: avatarColorFor(row.from_email),
    avatarUrl: lookupAvatarUrl(row.from_email),
    email: row.from_email,
    time: formatRelativeTime(row.date_ms),
    to: parseRecipients(row.to_json),
    cc: parseRecipients(row.cc_json),
    ...(bcc.length ? { bcc } : {}),
    noTrackers: true,
    // HTML mail used to drop text/plain. Quick reply then saw only the
    // stylesheet at the top of the HTML part and reported no body.
    body: html ? undefined : text ? text.split(/\n+/).filter(Boolean) : ["(No body yet)"],
    bodyText: text ? text.slice(0, 12_000) : undefined,
    bodyHtml: html || undefined,
    ...(attachments?.length ? { attachments } : {}),
  };
}

function threadLinkCount(rows: MessageRow[]): number {
  let n = 0;
  for (const row of rows) n += row.link_count ?? 0;
  return n;
}

function rowsToMessageDto(
  head: MessageRow,
  threadRows: MessageRow[],
  bodies?: Map<string, { text_plain: string | null; text_html: string | null }>,
): MessageDto {
  const label = head.ui_label_id ? getLabel(head.ui_label_id) : undefined;
  const links = threadLinkCount(threadRows);
  const latest = threadRows[threadRows.length - 1] ?? head;
  // A reply lives in Sent, so the inbox row is still the other person.
  // The snippet and time follow the reply, the way a conversation client does.
  const youReplied =
    head.folder !== "sent" &&
    head.folder !== "snoozed" &&
    latest.id !== head.id &&
    latest.folder === "sent" &&
    latest.date_ms >= head.date_ms;
  const preview = youReplied
    ? `You: ${latest.snippet || head.snippet}`
    : head.snippet;
  return {
    id: head.id,
    accountId: head.account_id,
    from: head.from_name,
    initials: initialsFrom(head.from_name, head.from_email),
    avatarColor: avatarColorFor(head.from_email),
    avatarUrl: lookupAvatarUrl(head.from_email),
    email: head.from_email,
    subject: head.subject,
    preview,
    time:
      head.folder === "snoozed" && head.snooze_until_ms
        ? `Until ${new Date(head.snooze_until_ms).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`
        : formatRelativeTime(youReplied ? latest.date_ms : head.date_ms),
    // Thread is unread if any message in it is — matches sidebar badges
    // (conversation counts) and avoids "all rows look read, badge still high".
    unread: threadRows.some((r) => r.unread === 1) || head.unread === 1,
    important: head.important === 1 || head.starred === 1,
    starred: head.starred === 1,
    folder: head.folder,
    tag: label ? { label: label.name, color: label.color } : undefined,
    hasAttachment: head.has_attachment === 1,
    linkCount: links > 0 ? links : undefined,
    thread: threadRows.map((r) => rowToThreadMessage(r, bodies?.get(r.id))),
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
    avatarUrl:
      c.avatar_url && c.avatar_url.trim() ? c.avatar_url.trim() : undefined,
  }));
}

function touchContactsFromDraft(draft: ComposeDraft): void {
  const now = Date.now();
  for (const email of [...draft.to, ...(draft.cc ?? []), ...(draft.bcc ?? [])]) {
    upsertContact({
      email,
      name: email.split("@")[0] ?? email,
      color: avatarColorFor(email),
      avatar_url: null,
      last_seen_ms: now,
      frequency: 1,
    });
    noteSender(email);
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
    avatar_url: existing?.avatar_url ?? null,
    unread: existing?.unread ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  upsertAccount(row);
  await persistGmailTokens(id, tokens);
  const avatarUrl = await applyAccountAvatar(id, profile.picture).catch(
    () => undefined,
  );
  if (avatarUrl) row.avatar_url = avatarUrl;
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
  startMailWatch(id);
  void syncAccount(id).catch(() => undefined);
  return accountToDto({ ...row, avatar_url: avatarUrl ?? row.avatar_url });
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
  if (!meta) {
    throw new Error("Missing IMAP mailbox/uid for this message");
  }
  await pushImapChange(account.id, meta.mailbox, meta.uid, action, {
    gmail: isGmailImapAccount(account.id),
    folder,
  });
}

/** Keep Gmail label_ids_json in sync when we clear/set UNREAD locally. */
function patchGmailLabelIdsJson(
  labelIdsJson: string,
  add: string[],
  remove: string[],
): string {
  try {
    const parsed = JSON.parse(labelIdsJson) as unknown;
    if (!Array.isArray(parsed)) return labelIdsJson;
    const set = new Set(parsed.map(String));
    for (const id of remove) set.delete(id);
    for (const id of add) set.add(id);
    return JSON.stringify([...set]);
  } catch {
    return labelIdsJson;
  }
}

function threadRowsFor(row: MessageRow): MessageRow[] {
  const thread = listThreadMessages(row.account_id, row.thread_id);
  return thread.length ? thread : [row];
}

/** Apply unread locally to every message in the thread (list head + badges). */
function setThreadUnreadLocal(
  account: AccountRow,
  row: MessageRow,
  unread: 0 | 1,
): void {
  const oauthLabels = !usesImap(account);
  for (const m of threadRowsFor(row)) {
    const labelPatch =
      oauthLabels && safeJsonArray(m.label_ids_json)
        ? {
            label_ids_json: patchGmailLabelIdsJson(
              m.label_ids_json,
              unread ? ["UNREAD"] : [],
              unread ? [] : ["UNREAD"],
            ),
          }
        : {};
    updateMessageFlags(m.id, { unread, ...labelPatch });
  }
}

function safeJsonArray(raw: string): unknown[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    avatar_url: existing?.avatar_url ?? null,
    unread: existing?.unread ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  upsertAccount(row);
  saveCredentials(id, creds);
  const avatarUrl = await applyAccountAvatar(id).catch(() => undefined);
  if (avatarUrl) row.avatar_url = avatarUrl;
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
  startMailWatch(id);
  void syncAccount(id).catch(() => undefined);
  return accountToDto({ ...row, avatar_url: avatarUrl ?? row.avatar_url });
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
  startMailWatch(accountId);
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
    await applyAccountAvatar(row.id, profile.picture).catch(() => undefined);
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
  closeImapConnections(row.id);
  saveCredentials(row.id, creds);
  upsertAccount({ ...row, updated_at: new Date().toISOString() });
  clearAuthErrorAndResume(row.id);
  return accountToDto(row);
}

export function removeAccount(accountId: string): void {
  stopAccountPolling(accountId);
  stopMailWatch(accountId);
  closeImapConnections(accountId);
  deleteAccount(accountId);
}

const ACCOUNT_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Patch display name / label / color without touching credentials. */
export function updateAccount(input: UpdateAccountInput): AccountDto {
  const row = getAccountRow(input.accountId);
  if (!row) throw new Error("Account not found.");

  const name =
    input.name !== undefined ? input.name.trim() : row.name;
  if (!name) throw new Error("Display name can’t be empty.");

  let color = row.color;
  if (input.color !== undefined) {
    const next = input.color.trim();
    if (!ACCOUNT_COLOR_RE.test(next)) {
      throw new Error("Pick a hex color like #ea4335.");
    }
    color = next.toLowerCase();
  }

  let label = row.label;
  if (input.label !== undefined) {
    const raw = input.label.trim().replace(/\s+/g, "");
    label = (raw || initialsFrom(name, row.email)).slice(0, 3).toUpperCase();
  } else if (input.name !== undefined) {
    label = initialsFrom(name, row.email);
  }

  const next: AccountRow = {
    ...row,
    name,
    label,
    color,
    updated_at: new Date().toISOString(),
  };
  upsertAccount(next);
  return accountToDto(next);
}

function encodeAccountAvatarDataUrl(filePath: string): string {
  const img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) {
    throw new Error("That file doesn’t look like a usable image.");
  }
  const { width, height } = img.getSize();
  if (width < 1 || height < 1) {
    throw new Error("That file doesn’t look like a usable image.");
  }
  const max = 256;
  const scale = Math.min(max / width, max / height, 1);
  const resized =
    scale < 1
      ? img.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: "best",
        })
      : img;
  // JPEG keeps SQLite rows smaller than PNG for photos.
  const buf = resized.toJPEG(84);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/** Open a file picker and set a custom profile photo for this account. */
export async function chooseAccountAvatar(
  accountId: string,
): Promise<AccountDto> {
  const row = getAccountRow(accountId);
  if (!row) throw new Error("Account not found.");

  const result = await dialog.showOpenDialog({
    title: "Choose profile photo",
    buttonLabel: "Use photo",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
      },
    ],
  });
  if (result.canceled || !result.filePaths[0]) {
    return accountToDto(row);
  }

  const dataUrl = encodeAccountAvatarDataUrl(result.filePaths[0]);
  setCustomAccountAvatar(accountId, dataUrl);
  return accountToDto(getAccountRow(accountId) ?? row);
}

/** Remove a custom photo (falls back to Google / Gravatar / initials). */
export async function clearAccountAvatar(
  accountId: string,
): Promise<AccountDto> {
  const row = getAccountRow(accountId);
  if (!row) throw new Error("Account not found.");
  await clearCustomAccountAvatar(accountId);
  return accountToDto(getAccountRow(accountId) ?? { ...row, avatar_url: null });
}

/** One warm-up per folder view. Later refreshes must not re-download bodies. */
const warmedListKeys = new Set<string>();

/** Newest activity in the conversation, including a reply that lives in Sent. */
function sortHeadsByActivity(heads: MessageRow[]): MessageRow[] {
  const scored = heads.map((head) => {
    const thread = listThreadMessages(head.account_id, head.thread_id);
    const latest = thread.reduce(
      (max, row) => Math.max(max, row.date_ms),
      head.date_ms,
    );
    return { head, latest };
  });
  scored.sort((a, b) => b.latest - a.latest);
  return scored.map((item) => item.head);
}

function listHeadDtos(
  heads: MessageRow[],
  warmMissing: boolean,
): MessageDto[] {
  const missing: string[] = [];
  const messages = heads.map((head) => {
    const thread = listThreadMessages(head.account_id, head.thread_id);
    const rows = thread.length ? thread : [head];
    if (warmMissing) {
      const primary = rows[rows.length - 1] ?? head;
      if (!getBody(primary.id)) missing.push(primary.id);
    }
    // Metadata only. Bodies ride getMail / mail:updated for the open thread.
    return rowsToMessageDto(head, rows);
  });
  if (missing.length) prefetchMailBodies(missing);
  return messages;
}

/**
 * from: filters often miss older mail because IMAP only keeps a recent local
 * window. Expand names via contacts, then ask the provider for matching FROM
 * envelopes and index them before the local query runs.
 */
async function enrichFromSearch(query: MailListQuery): Promise<boolean> {
  const q = query.q?.trim();
  if (!q) return false;
  const fromValues = parseSearchClauses(q)
    .filter((c) => c.field === "from")
    .map((c) => c.value.trim())
    .filter(Boolean);
  if (!fromValues.length) return false;

  const searchTerms = new Set<string>();
  for (const value of fromValues) {
    searchTerms.add(value);
    const expanded = expandPersonQuery(value);
    for (const email of expanded.emails) searchTerms.add(email);
    for (const token of expanded.nameTokens) searchTerms.add(token);
  }
  const terms = [...searchTerms].slice(0, 8);
  if (!terms.length) return false;
  let changed = false;

  const accounts = listAccountRows().filter((a) => {
    if (query.accountId && query.accountId !== "all") {
      return a.id === query.accountId;
    }
    return true;
  });

  await Promise.all(
    accounts.map(async (account) => {
      try {
        if (accountUsesImap(account.id, account.provider)) {
          const gmail = isGmailImapAccount(account.id);
          const envelopes = await searchImapFrom(account.id, terms, {
            mailbox: "INBOX",
            limit: 100,
            gmail,
            role: "inbox",
          });
          for (const env of envelopes) {
            const row = imapEnvelopeToRow(account.id, env);
            const wrote = indexIncomingMessage(
              row,
              {
                messageId: env.messageId,
                inReplyTo: env.inReplyTo,
                references: env.references,
              },
              { providerThread: Boolean(env.gmThrId) },
            );
            if (wrote) {
              changed = true;
              noteSender(row.from_email, row.from_name);
            }
          }
          return;
        }
        if (account.provider === "gmail") {
          for (const term of terms.slice(0, 3)) {
            const page = await listMessageIds(account.id, {
              q: `from:${term}`,
              maxResults: 40,
            });
            const ids = page.messages ?? [];
            for (const m of ids) {
              try {
                const meta = await getMessageMeta(account.id, m.id);
                const row = gmailMessageToRow(account.id, meta);
                const headers = rfcFromGmail(meta);
                const wrote = indexIncomingMessage(
                  row,
                  {
                    messageId: headers.rfcMessageId,
                    inReplyTo: headers.inReplyTo,
                    references: headers.references,
                  },
                  { providerThread: true },
                );
                if (wrote) {
                  changed = true;
                  noteSender(row.from_email, row.from_name);
                }
              } catch {
                /* skip one bad id */
              }
            }
          }
        }
      } catch {
        /* keep local results if provider search fails */
      }
    }),
  );
  return changed;
}

export async function listMail(query: MailListQuery): Promise<MailListResult> {
  if (query.q?.trim()) {
    const q = query.q.trim();
    scheduleSearchEnrich(query);
    // Fielded search is cross-folder; allow a larger page so from:/subject:
    // filters aren't capped to the normal inbox window. Local results return
    // immediately. Provider from: hits arrive on mail:search-ready.
    const searchLimit = Math.min(query.limit ?? 250, 500);
    const matches = searchMessageRows(q, {
      accountId: query.accountId,
      limit: searchLimit * 3,
    });
    // Keep the best-ranked message in each thread. Date is already the tie-break.
    const seen = new Set<string>();
    const heads: MessageRow[] = [];
    const snippets = new Map<string, string>();
    for (const match of matches) {
      const key = `${match.row.account_id}:${match.row.thread_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      heads.push(match.row);
      if (match.snippet) snippets.set(match.row.id, match.snippet);
      if (heads.length >= searchLimit) break;
    }
    const messages = listHeadDtos(heads, false).map((message) => {
      const marked = snippets.get(message.id);
      if (!marked) return message;
      return {
        ...message,
        preview: stripMatchMarkers(marked),
        matchPreview: marked,
      };
    });
    return {
      messages,
      nextCursor: null,
      endCursor: null,
      total: heads.length,
    };
  }
  const limit = Math.min(query.limit ?? 50, 100);
  const before = decodeMailCursor(query.cursor);

  const { rows, total, hasMore } = listThreadHeadPage({
    accountId: query.accountId,
    folder: query.folder ?? "inbox",
    filter: query.filter ?? "all",
    limit,
    before,
  });

  const warmKey = `${query.accountId ?? "all"}:${query.folder ?? "inbox"}:${query.filter ?? "all"}`;
  let warm = false;
  if (rows.length && !before && !warmedListKeys.has(warmKey)) {
    warmedListKeys.add(warmKey);
    warm = true;
  }
  const last = rows[rows.length - 1];
  const endCursor = last
    ? encodeMailCursor(last.date_ms, last.id)
    : (query.cursor ?? null);
  const nextCursor = hasMore && last ? endCursor : null;
  const messages = listHeadDtos(sortHeadsByActivity(rows), warm);

  return { messages, nextCursor, endCursor, total };
}

const gmailOlderTokens = new Map<
  string,
  { q: string; pageToken?: string; done: boolean }
>();

function gmailLabelForFolder(folder: string): string[] | null {
  switch (folder) {
    case "inbox":
      return ["INBOX"];
    case "sent":
      return ["SENT"];
    case "drafts":
      return ["DRAFT"];
    case "junk":
      return ["SPAM"];
    case "trash":
      return ["TRASH"];
    default:
      return null;
  }
}

function utcDay(ms: number): string {
  const day = new Date(ms);
  const month = String(day.getUTCMonth() + 1).padStart(2, "0");
  const date = String(day.getUTCDate()).padStart(2, "0");
  return `${day.getUTCFullYear()}/${month}/${date}`;
}

/** Gmail API accounts have no IMAP UID cursor. Page backward with `before:`. */
async function backfillGmailApi(
  accountId: string,
  folder: string,
): Promise<MailOlderResult> {
  const labelIds = gmailLabelForFolder(folder);
  if (!labelIds) return { added: 0, exhausted: true };
  const key = `${accountId}:${folder}`;
  const existing = gmailOlderTokens.get(key);
  let state = existing;
  if (!state) {
    const oldest = oldestMessageMs({ accountId, folder });
    if (oldest == null) return { added: 0, exhausted: true };
    state = { q: `before:${utcDay(oldest)}`, done: false };
    gmailOlderTokens.set(key, state);
  }
  if (state.done) return { added: 0, exhausted: true };

  const page = await listMessageIds(accountId, {
    labelIds,
    q: state.q,
    pageToken: state.pageToken,
    maxResults: 40,
  });
  let added = 0;
  for (const message of page.messages ?? []) {
    try {
      const meta = await getMessageMeta(accountId, message.id);
      const row = gmailMessageToRow(accountId, meta);
      const headers = rfcFromGmail(meta);
      const wrote = indexIncomingMessage(
        row,
        {
          messageId: headers.rfcMessageId,
          inReplyTo: headers.inReplyTo,
          references: headers.references,
        },
        { providerThread: true },
      );
      if (!wrote) continue;
      added += 1;
      noteSender(row.from_email, row.from_name);
    } catch {
      /* skip one bad id */
    }
  }
  state.pageToken = page.nextPageToken;
  state.done = !page.nextPageToken;
  if (added) recountUnread(accountId);
  return { added, exhausted: state.done };
}

/**
 * Store the next older batch for the accounts in view. The list then pages
 * through those rows. Forward sync is unchanged.
 */
export async function loadOlderMail(query: {
  accountId?: string | "all";
  folder?: string;
}): Promise<MailOlderResult> {
  const folder = query.folder ?? "inbox";
  if (folder === "snoozed") return { added: 0, exhausted: true };
  const accounts = listAccountRows().filter((account) => {
    if (query.accountId && query.accountId !== "all") {
      return account.id === query.accountId;
    }
    return true;
  });
  if (!accounts.length) return { added: 0, exhausted: true };

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        if (accountUsesImap(account.id, account.provider)) {
          return await backfillOlderMail(account.id, folder);
        }
        return await backfillGmailApi(account.id, folder);
      } catch {
        return { added: 0, exhausted: false };
      }
    }),
  );
  return {
    added: results.reduce((sum, result) => sum + result.added, 0),
    exhausted: results.every((result) => result.exhausted),
  };
}

/** Sidebar counters — not derived from the paged list (which is capped). */
export function getFolderCounts(
  accountId?: string | "all",
): MailFolderCounts {
  const { folders, labels } = countMessagesByFolder(accountId);
  const folderMap: MailFolderCounts["folders"] = {};
  for (const row of folders) {
    folderMap[row.folder] = { total: row.total, unread: row.unread };
  }
  const labelMap: MailFolderCounts["labels"] = {};
  for (const row of labels) {
    labelMap[row.labelId] = { total: row.total, unread: row.unread };
  }
  return {
    folders: folderMap,
    labels: labelMap,
    inboxUnread: folderMap.inbox?.unread ?? 0,
  };
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
  // A body downloaded just now already indexed its files. Cached bodies from
  // before previews existed need a second fetch — don't hold the reader for it.
  const needFiles = rows.filter(
    (r) => r.has_attachment === 1 && !attachmentMetaKnown(r.id),
  );
  if (needFiles.length) {
    void mapLimit(needFiles, BODY_FETCH_CONCURRENCY, async (r) => {
      await ensureAttachmentsForRow(r, account);
    })
      .then(() => {
        const next = buildMessageDto(messageId);
        if (next) broadcastMailUpdated(next);
      })
      .catch(() => undefined);
  }

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

  // Write local flags first so UI/DB stay correct even if the provider call
  // fails or a concurrent sync returns a stale unread snapshot.
  if (action === "read") {
    setThreadUnreadLocal(account, row, 0);
  } else if (action === "unread") {
    setThreadUnreadLocal(account, row, 1);
  } else if (action === "archive") {
    updateMessageFlags(row.id, { folder: "archive", unread: 0 });
  } else if (action === "trash") {
    updateMessageFlags(row.id, { folder: "trash", unread: 0 });
  } else if (action === "star") {
    updateMessageFlags(row.id, { starred: 1, important: 1 });
  } else if (action === "unstar") {
    updateMessageFlags(row.id, { starred: 0 });
  }

  if (!usesImap(account)) {
    try {
      switch (action) {
        case "archive":
          await modifyLabels(row.account_id, row.provider_id, [], ["INBOX"]);
          break;
        case "trash":
          await trashMessage(row.account_id, row.provider_id);
          break;
        case "read":
          for (const m of threadRowsFor(row)) {
            await modifyLabels(m.account_id, m.provider_id, [], ["UNREAD"]);
          }
          break;
        case "unread":
          for (const m of threadRowsFor(row)) {
            await modifyLabels(m.account_id, m.provider_id, ["UNREAD"], []);
          }
          break;
        case "star":
          await modifyLabels(row.account_id, row.provider_id, ["STARRED"], []);
          break;
        case "unstar":
          await modifyLabels(row.account_id, row.provider_id, [], ["STARRED"]);
          break;
      }
    } catch {
      /* local flags already applied */
    }
  } else if (
    action === "archive" ||
    action === "trash" ||
    action === "read" ||
    action === "unread" ||
    action === "star" ||
    action === "unstar"
  ) {
    const targets =
      action === "read" || action === "unread" ? threadRowsFor(row) : [row];
    for (const m of targets) {
      try {
        await pushAccountImapChange(account, m, action);
      } catch {
        /* local flag update still applies */
      }
    }
  }

  recountUnread(row.account_id);
  return getMail(messageId);
}

type SendOptions = { messageId?: string; retry?: boolean };

type ReplyContext = {
  parentId: string;
  threadId: string;
  /** Parent Message-ID, written as In-Reply-To on the reply. */
  inReplyTo: string | null;
  /** Ancestor ids, root first, including the parent. */
  references: string[];
  /** Gmail API thread id. Omitted unless In-Reply-To names a message in it. */
  gmailThreadId?: string;
};

function recordOutgoingRfc(
  row: MessageRow,
  rfcMessageId: string | undefined,
  context: ReplyContext | null,
): void {
  const headers = normalizeRfcHeaders({
    messageId: rfcMessageId,
    inReplyTo: context?.inReplyTo,
    references: context?.references,
  });
  if (!headers.rfcMessageId && !headers.inReplyTo && !headers.references.length) {
    return;
  }
  upsertRfcHeaders({
    messageId: row.id,
    accountId: row.account_id,
    rfcMessageId: headers.rfcMessageId,
    inReplyTo: headers.inReplyTo,
    references: headers.references,
  });
}

async function fetchParentRfc(
  account: AccountRow,
  parent: MessageRow,
): Promise<NormalizedRfc | null> {
  if (parent.provider_id.startsWith("local-sent:")) {
    return readStoredRfc(parent.id);
  }
  if (!usesImap(account)) {
    const meta = await getMessageMeta(account.id, parent.provider_id);
    return rfcFromGmail(meta);
  }
  const mailbox = mailboxMetaFromRow(parent);
  if (!mailbox) return null;
  const raw = await fetchImapThreadingHeaders(
    account.id,
    mailbox.mailbox,
    mailbox.uid,
  );
  return normalizeRfcHeaders(raw);
}

/** Join a reply to the conversation the user is reading, and build its headers. */
async function loadReplyContext(
  account: AccountRow,
  draft: ComposeDraft,
): Promise<ReplyContext | null> {
  const parentId = draft.replyToMessageId;
  if (!parentId) return null;
  const parent = getMessageRow(parentId);
  if (!parent || parent.account_id !== account.id) return null;

  let stored = readStoredRfc(parent.id);
  if (!stored?.rfcMessageId) {
    const fetched = await withTimeout(
      fetchParentRfc(account, parent),
      12_000,
      "Reply headers",
    ).catch(() => null);
    if (
      fetched &&
      (fetched.rfcMessageId || fetched.inReplyTo || fetched.references.length)
    ) {
      upsertRfcHeaders({
        messageId: parent.id,
        accountId: parent.account_id,
        rfcMessageId: fetched.rfcMessageId,
        inReplyTo: fetched.inReplyTo,
        references: fetched.references,
      });
      stored = fetched;
    }
  }

  const references = buildReplyReferences(stored);
  const inReplyTo = stored?.rfcMessageId ?? null;
  const gmailThreadId =
    !usesImap(account) && inReplyTo && /^[A-Za-z0-9]+$/.test(parent.thread_id)
      ? parent.thread_id
      : undefined;
  return {
    parentId: parent.id,
    threadId: parent.thread_id,
    inReplyTo,
    references,
    gmailThreadId,
  };
}

/** The open conversation, with the reply already in it. */
async function dtoForReply(
  context: ReplyContext | null,
  sentId: string,
): Promise<MessageDto> {
  const anchor = context?.parentId ?? sentId;
  const dto = (await getMail(anchor)) ?? (await getMail(sentId));
  if (!dto) throw new Error("Sent message missing from store");
  broadcastMailUpdated(dto);
  return dto;
}

/** Local sent copy used until the provider sync indexes the real message. */
function persistSentDraft(
  account: AccountRow,
  draft: ComposeDraft,
  providerId: string,
  from?: { fromName: string; fromEmail: string },
  context?: ReplyContext | null,
  rfcMessageId?: string,
): MessageRow {
  const now = Date.now();
  const resolved = from ?? resolveSendFrom(account, draft);
  const fromName = resolved.fromName;
  const fromEmail = resolved.fromEmail;
  const row: MessageRow = {
    id: `${account.id}:${providerId}`,
    account_id: account.id,
    thread_id: context?.threadId || providerId,
    provider_id: providerId,
    folder: "sent",
    subject: draft.subject || "(no subject)",
    snippet: draft.bodyText.slice(0, 180),
    from_name: fromName,
    from_email: fromEmail,
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
  try {
    rememberAttachments(row.id, filesFromCompose(draft.attachments));
  } catch (error) {
    console.warn("attachment index failed", error);
  }
  recordOutgoingRfc(row, rfcMessageId, context ?? null);
  return row;
}

function draftAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Keep a compose in the local Drafts folder. Nothing is sent, and the provider
 * is not asked to store it — closing the compose tab should still leave a copy
 * the user can find after a refresh.
 */
export async function saveLocalDraft(draft: ComposeDraft): Promise<MessageDto> {
  if (!draft || typeof draft.accountId !== "string" || !draft.accountId.trim()) {
    throw new Error("Account not found");
  }
  const account = getAccountRow(draft.accountId);
  if (!account) throw new Error("Account not found");

  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];
  if (attachments.length > 20) {
    throw new Error("Too many attachments (max 20).");
  }
  let attachmentBytes = 0;
  for (const file of attachments) {
    attachmentBytes += Math.ceil((file.contentBase64?.length ?? 0) * 0.75);
  }
  if (attachmentBytes > 25 * 1024 * 1024) {
    throw new Error("Attachments exceed the 25 MB limit.");
  }

  const from = resolveSendFrom(account, draft);
  const to = draftAddressList(draft.to);
  const cc = draftAddressList(draft.cc);
  const bcc = draftAddressList(draft.bcc);
  const bodyText = typeof draft.bodyText === "string" ? draft.bodyText : "";
  const subject =
    typeof draft.subject === "string" && draft.subject.trim()
      ? draft.subject.trim()
      : "(no subject)";
  const providerId = `local-draft:${randomUUID()}`;
  const now = Date.now();
  const row: MessageRow = {
    id: `${account.id}:${providerId}`,
    account_id: account.id,
    thread_id: providerId,
    provider_id: providerId,
    folder: "drafts",
    subject,
    snippet: draftSnippet({ to, cc, bcc, body: bodyText }),
    from_name: from.fromName,
    from_email: from.fromEmail,
    to_json: JSON.stringify(
      to.map((email) => ({ name: email.split("@")[0] || email, email })),
    ),
    cc_json: JSON.stringify(
      cc.map((email) => ({ name: email.split("@")[0] || email, email })),
    ),
    date_ms: now,
    unread: 0,
    important: 0,
    starred: 0,
    has_attachment: attachments.length > 0 ? 1 : 0,
    label_ids_json: "[]",
    ui_label_id: null,
    snooze_until_ms: null,
    internal_date: new Date(now).toISOString(),
  };
  upsertMessage(row);
  upsertBody({
    message_id: row.id,
    text_plain: packDraftBody(bodyText, bcc),
    text_html: null,
    fetched_at: new Date().toISOString(),
  });
  updateFtsBody(row.id, bodyText);
  try {
    if (attachments.length) {
      rememberAttachments(row.id, filesFromCompose(attachments));
    }
  } catch (error) {
    console.warn("draft attachment index failed", error);
  }
  const dto = buildMessageDto(row.id);
  if (!dto) throw new Error("Could not save draft");
  broadcastMailUpdated(dto);
  return dto;
}

async function storeGmailSent(
  account: AccountRow,
  draft: ComposeDraft,
  gmailId: string,
  context: ReplyContext | null,
  rfcMessageId?: string,
): Promise<MessageDto> {
  // Once Gmail accepted the message, indexing failure must never surface as a
  // send failure — the outbox would retry and duplicate the mail.
  try {
    const full = await getMessageFull(account.id, gmailId);
    const row = gmailMessageToRow(account.id, full);
    if (context?.threadId) row.thread_id = context.threadId;
    upsertMessage(row);
    const fromServer = rfcFromGmail(full);
    const headers = normalizeRfcHeaders({
      messageId: fromServer.rfcMessageId ?? rfcMessageId,
      inReplyTo: fromServer.inReplyTo ?? context?.inReplyTo,
      references: fromServer.references.length
        ? fromServer.references
        : context?.references,
    });
    recordOutgoingRfc(row, headers.rfcMessageId ?? undefined, {
      parentId: context?.parentId ?? row.id,
      threadId: row.thread_id,
      inReplyTo: headers.inReplyTo,
      references: headers.references,
    });
    const bodies = bodiesFromGmail(full);
    upsertBody({
      message_id: row.id,
      text_plain: bodies.text ?? draft.bodyText,
      text_html: bodies.html ?? null,
      fetched_at: new Date().toISOString(),
    });
    try {
      const fromDraft = filesFromCompose(draft.attachments);
      if (fromDraft.length) {
        rememberAttachments(row.id, fromDraft);
      } else {
        const files = filesFromGmail(full);
        if (files) rememberAttachments(row.id, files);
      }
    } catch (error) {
      console.warn("attachment index failed", error);
    }
    return dtoForReply(context, row.id);
  } catch {
    /* fall back to the local sent copy */
  }
  const row = persistSentDraft(
    account,
    draft,
    gmailId,
    undefined,
    context,
    rfcMessageId,
  );
  return dtoForReply(context, row.id);
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

  const from = resolveSendFrom(account, safeDraft);
  const messageId = opts.messageId ?? buildMessageId(from.fromEmail);
  const context = await loadReplyContext(account, safeDraft);

  if (!usesImap(account)) {
    // Idempotency: on a retry, check whether Gmail already has this Message-ID
    // (e.g. the app crashed after the API accepted the send).
    if (opts.retry) {
      const existing = await findMessageIdByRfc822(account.id, messageId).catch(
        () => null,
      );
      if (existing) {
        return storeGmailSent(account, safeDraft, existing, context, messageId);
      }
    }

    const built = buildRawMessage({
      from: { name: from.fromName, email: from.fromEmail },
      to,
      cc,
      bcc,
      subject: draft.subject,
      text: draft.bodyText,
      html: draft.bodyHtml,
      messageId,
      inReplyTo: context?.inReplyTo ?? undefined,
      references: context?.references,
      attachments: draft.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: a.contentBase64,
      })),
    });
    let sent: { id: string };
    try {
      sent = await sendRawMessage(
        account.id,
        built.raw,
        context?.gmailThreadId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A stale thread id must not fail the send. Headers still thread it.
      if (context?.gmailThreadId && /→ 400/.test(message)) {
        sent = await sendRawMessage(account.id, built.raw);
      } else {
        throw error;
      }
    }
    return storeGmailSent(account, safeDraft, sent.id, context, messageId);
  }

  // Same idempotency idea for SMTP, using the Sent folder when the provider
  // supports header search.
  if (opts.retry && (await findSentMessage(account.id, messageId))) {
    const providerId = `local-sent:${messageId.replace(/[<>\s]/g, "")}`;
    const row = persistSentDraft(
      account,
      safeDraft,
      providerId,
      from,
      context,
      messageId,
    );
    return dtoForReply(context, row.id);
  }

  await sendSmtp(account.id, {
    fromName: from.fromName,
    fromEmail: from.fromEmail,
    to,
    cc,
    bcc,
    subject: draft.subject,
    bodyText: draft.bodyText,
    bodyHtml: draft.bodyHtml,
    messageId,
    inReplyTo: context?.inReplyTo ?? undefined,
    references: context?.references,
    attachments: draft.attachments,
  });

  const providerId = `local-sent:${messageId.replace(/[<>\s]/g, "")}`;
  const row = persistSentDraft(
    account,
    safeDraft,
    providerId,
    from,
    context,
    messageId,
  );
  void syncAccount(account.id).catch(() => undefined);
  return dtoForReply(context, row.id);
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
