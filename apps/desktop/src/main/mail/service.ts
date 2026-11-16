import { randomUUID } from "node:crypto";
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
  upsertSyncState,
  type AccountRow,
  type MessageRow,
} from "../db";
import { saveCredentials, type ImapCredentials } from "../crypto/credentials";
import {
  deleteMessageForever,
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
  deleteImapMessageForever,
  fetchMessageSource,
  moveImapMessage,
  parsedToBodies,
  sendSmtp,
  setImapFlags,
  verifyImapLogin,
} from "../providers/imap/client";
import { mailboxMetaFromRow } from "../providers/imap/map";
import { presetFor } from "../providers/imap/presets";
import {
  startAccountPolling,
  stopAccountPolling,
  syncAccount,
} from "../sync/engine";
import type {
  AccountDto,
  AddImapAccountInput,
  ComposeDraft,
  ContactDto,
  LabelDto,
  MailListQuery,
  MailListResult,
  MailMutateAction,
  MailMutateOptions,
  MessageDto,
  RecipientDto,
  ThreadMessageDto,
} from "../../shared/types";

function accountToDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    email: row.email,
    color: row.color,
    unread: row.unread,
    provider: row.provider as AccountDto["provider"],
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
  const html = body?.text_html?.trim();
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
      "Set GMAIL_CLIENT_ID (Desktop OAuth client) to connect Gmail.",
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
  });
  startAccountPolling(id);
  void syncAccount(id).catch(() => undefined);
  return accountToDto(row);
}

function resolveImapCreds(input: AddImapAccountInput): ImapCredentials {
  const preset = presetFor(input.provider);
  const imapHost = (input.imapHost || preset?.imapHost || "").trim();
  const smtpHost = (input.smtpHost || preset?.smtpHost || imapHost).trim();
  if (!imapHost) throw new Error("IMAP host is required.");
  if (!smtpHost) throw new Error("SMTP host is required.");
  return {
    provider: "imap",
    brand: input.provider,
    email: input.email.trim().toLowerCase(),
    username: input.username?.trim() || undefined,
    password: input.password,
    imapHost,
    imapPort: input.imapPort ?? preset?.imapPort ?? 993,
    smtpHost,
    smtpPort: input.smtpPort ?? preset?.smtpPort ?? 587,
  };
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
  });
  startAccountPolling(id);
  void syncAccount(id).catch(() => undefined);
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

export async function getMail(messageId: string): Promise<MessageDto | null> {
  const head = getMessageRow(messageId);
  if (!head) return null;
  const account = getAccountRow(head.account_id);

  const thread = listThreadMessages(head.account_id, head.thread_id);
  const rows = thread.length ? thread : [head];

  for (const r of rows) {
    if (getBody(r.id)) continue;
    try {
      if (account?.provider === "gmail") {
        const full = await getMessageFull(r.account_id, r.provider_id);
        upsertMessage(gmailMessageToRow(r.account_id, full));
        const bodies = bodiesFromGmail(full);
        upsertBody({
          message_id: r.id,
          text_plain: bodies.text ?? null,
          text_html: bodies.html ?? null,
          fetched_at: new Date().toISOString(),
        });
        if (bodies.text) updateFtsBody(r.id, bodies.text);
      } else {
        const meta = mailboxMetaFromRow(r);
        if (!meta) continue;
        const parsed = await fetchMessageSource(
          r.account_id,
          meta.mailbox,
          meta.uid,
        );
        const bodies = parsedToBodies(parsed);
        upsertBody({
          message_id: r.id,
          text_plain: bodies.text,
          text_html: bodies.html,
          fetched_at: new Date().toISOString(),
        });
        if (bodies.text) updateFtsBody(r.id, bodies.text);
      }
    } catch {
      /* leave placeholder */
    }
  }

  const refreshed = getMessageRow(messageId) ?? head;
  const thread2 = listThreadMessages(refreshed.account_id, refreshed.thread_id);
  const bodies = new Map(
    (thread2.length ? thread2 : [refreshed]).map((t) => {
      const b = getBody(t.id);
      return [t.id, b ?? { text_plain: null, text_html: null, fetched_at: "" }] as const;
    }),
  );
  return rowsToMessageDto(
    refreshed,
    thread2.length ? thread2 : [refreshed],
    bodies,
  );
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
    if (account.provider === "gmail") {
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
      const meta = mailboxMetaFromRow(row);
      if (meta) {
        try {
          const target =
            folder === "trash"
              ? "Trash"
              : folder === "junk"
                ? "Junk"
                : folder === "archive"
                  ? "Archive"
                  : folder === "inbox"
                    ? "INBOX"
                    : folder;
          await moveImapMessage(
            row.account_id,
            meta.mailbox,
            meta.uid,
            target,
          );
        } catch {
          /* keep local move */
        }
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
    if (account.provider === "gmail") {
      try {
        await spamMessage(row.account_id, row.provider_id);
      } catch {
        /* local move still applies */
      }
    } else {
      const meta = mailboxMetaFromRow(row);
      if (meta) {
        try {
          await moveImapMessage(row.account_id, meta.mailbox, meta.uid, "Junk");
        } catch {
          /* local */
        }
      }
    }
    updateMessageFlags(row.id, { folder: "junk", unread: 0 });
    recountUnread(row.account_id);
    return getMail(messageId);
  }

  if (action === "not-spam") {
    if (account.provider === "gmail") {
      try {
        await unspamMessage(row.account_id, row.provider_id);
      } catch {
        /* local */
      }
    } else {
      const meta = mailboxMetaFromRow(row);
      if (meta) {
        try {
          await moveImapMessage(row.account_id, meta.mailbox, meta.uid, "INBOX");
        } catch {
          /* local */
        }
      }
    }
    updateMessageFlags(row.id, { folder: "inbox", unread: 1 });
    recountUnread(row.account_id);
    return getMail(messageId);
  }

  if (action === "delete-forever") {
    if (account.provider === "gmail") {
      try {
        await deleteMessageForever(row.account_id, row.provider_id);
      } catch {
        /* still remove locally */
      }
    } else {
      const meta = mailboxMetaFromRow(row);
      if (meta) {
        try {
          await deleteImapMessageForever(
            row.account_id,
            meta.mailbox,
            meta.uid,
          );
        } catch {
          /* local */
        }
      }
    }
    deleteMessageById(row.id);
    recountUnread(row.account_id);
    return null;
  }

  if (account.provider === "gmail") {
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
    const meta = mailboxMetaFromRow(row);
    if (meta) {
      try {
        switch (action) {
          case "archive":
            await moveImapMessage(
              row.account_id,
              meta.mailbox,
              meta.uid,
              "Archive",
            );
            break;
          case "trash":
            await moveImapMessage(
              row.account_id,
              meta.mailbox,
              meta.uid,
              "Trash",
            );
            break;
          case "read":
            await setImapFlags(row.account_id, meta.mailbox, meta.uid, {
              add: ["\\Seen"],
            });
            break;
          case "unread":
            await setImapFlags(row.account_id, meta.mailbox, meta.uid, {
              remove: ["\\Seen"],
            });
            break;
          case "star":
            await setImapFlags(row.account_id, meta.mailbox, meta.uid, {
              add: ["\\Flagged"],
            });
            break;
          case "unstar":
            await setImapFlags(row.account_id, meta.mailbox, meta.uid, {
              remove: ["\\Flagged"],
            });
            break;
        }
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

export async function sendMail(draft: ComposeDraft): Promise<MessageDto> {
  const account = getAccountRow(draft.accountId);
  if (!account) throw new Error("Account not found");
  touchContactsFromDraft(draft);

  if (account.provider === "gmail") {
    const attachments = draft.attachments ?? [];
    let raw: string;
    if (attachments.length === 0) {
      const headers = [
        `From: ${account.name} <${account.email}>`,
        `To: ${draft.to.join(", ")}`,
        draft.cc?.length ? `Cc: ${draft.cc.join(", ")}` : null,
        draft.bcc?.length ? `Bcc: ${draft.bcc.join(", ")}` : null,
        `Subject: ${draft.subject || "(no subject)"}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
      ]
        .filter(Boolean)
        .join("\r\n");
      raw = `${headers}\r\n\r\n${draft.bodyText}`;
    } else {
      const boundary = `intray_${Date.now().toString(36)}`;
      const parts = [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 7bit",
        "",
        draft.bodyText,
      ];
      for (const a of attachments) {
        const safeName = a.filename.replace(/"/g, "");
        const type = a.contentType || "application/octet-stream";
        parts.push(
          `--${boundary}`,
          `Content-Type: ${type}; name="${safeName}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${safeName}"`,
          "",
          a.contentBase64.replace(/(.{76})/g, "$1\r\n").trim(),
        );
      }
      parts.push(`--${boundary}--`, "");
      const headers = [
        `From: ${account.name} <${account.email}>`,
        `To: ${draft.to.join(", ")}`,
        draft.cc?.length ? `Cc: ${draft.cc.join(", ")}` : null,
        draft.bcc?.length ? `Bcc: ${draft.bcc.join(", ")}` : null,
        `Subject: ${draft.subject || "(no subject)"}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ]
        .filter(Boolean)
        .join("\r\n");
      raw = `${headers}\r\n\r\n${parts.join("\r\n")}`;
    }
    const sent = await sendRawMessage(draft.accountId, raw);
    const full = await getMessageFull(draft.accountId, sent.id);
    const row = gmailMessageToRow(draft.accountId, full);
    upsertMessage(row);
    const bodies = bodiesFromGmail(full);
    upsertBody({
      message_id: row.id,
      text_plain: bodies.text ?? draft.bodyText,
      text_html: bodies.html ?? null,
      fetched_at: new Date().toISOString(),
    });
    const dto = await getMail(row.id);
    if (!dto) throw new Error("Sent message missing from store");
    return dto;
  }

  await sendSmtp(draft.accountId, {
    fromName: account.name,
    fromEmail: account.email,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyText: draft.bodyText,
    attachments: draft.attachments,
  });

  // Optimistic sent row until next IMAP sync picks it up
  const now = Date.now();
  const pid = `local-sent:${now}`;
  const hasAttachments = (draft.attachments?.length ?? 0) > 0;
  const row: MessageRow = {
    id: `${draft.accountId}:${pid}`,
    account_id: draft.accountId,
    thread_id: pid,
    provider_id: pid,
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
    has_attachment: hasAttachments ? 1 : 0,
    label_ids_json: "[]",
    ui_label_id: null,
    snooze_until_ms: null,
    internal_date: new Date(now).toISOString(),
  };
  upsertMessage(row);
  upsertBody({
    message_id: row.id,
    text_plain: draft.bodyText,
    text_html: null,
    fetched_at: new Date().toISOString(),
  });
  void syncAccount(draft.accountId).catch(() => undefined);
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
