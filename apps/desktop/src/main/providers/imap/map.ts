import type { MessageRow } from "../../db";
import type { ImapEnvelope } from "./client";

export function imapEnvelopeToRow(
  accountId: string,
  env: ImapEnvelope,
): MessageRow {
  // X-GM-MSGID is stable across Gmail labels, so All Mail and Trash collapse
  // to one row. Other IMAP servers keep the UIDVALIDITY:UID key.
  const pid = env.gmMsgId
    ? `gm:${env.gmMsgId}`
    : `${env.uidValidity}:${env.uid}`;
  const threadId = env.gmThrId ? `gm:${env.gmThrId}` : env.threadId;
  const dateMs = env.date?.getTime() ?? Date.now();
  // Prefer Gmail's \\Unread label when X-GM-LABELS is present; \\Seen alone
  // can lag or disagree after a flag write.
  const unreadFromLabel = env.gmLabels
    ? env.gmLabels.some(
        (l) => l.replace(/^\\+/, "").toLowerCase() === "unread",
      )
    : null;
  const unread =
    unreadFromLabel != null
      ? unreadFromLabel
        ? 1
        : 0
      : env.flags.some((f) => f.toLowerCase() === "\\seen")
        ? 0
        : 1;
  const starred =
    env.starred != null
      ? env.starred
        ? 1
        : 0
      : env.flags.some((f) => f.toLowerCase() === "\\flagged")
        ? 1
        : 0;
  const important =
    env.important != null ? (env.important ? 1 : 0) : starred || unread ? 1 : 0;

  return {
    id: `${accountId}:${pid}`,
    account_id: accountId,
    thread_id: threadId,
    provider_id: pid,
    folder: env.folder,
    subject: env.subject,
    snippet: env.snippet.slice(0, 240),
    from_name: env.fromName,
    from_email: env.fromEmail,
    to_json: JSON.stringify(env.to),
    cc_json: JSON.stringify(env.cc),
    date_ms: dateMs,
    unread,
    important,
    starred,
    has_attachment: env.hasAttachment ? 1 : 0,
    label_ids_json: JSON.stringify({
      mailbox: env.mailboxPath,
      uid: env.uid,
      uidValidity: env.uidValidity,
      flags: env.flags,
      ...(env.gmMsgId ? { gmMsgId: env.gmMsgId } : {}),
      ...(env.gmThrId ? { gmThrId: env.gmThrId } : {}),
      ...(env.gmLabels ? { gmLabels: env.gmLabels } : {}),
    }),
    ui_label_id: null,
    snooze_until_ms: null,
    internal_date: env.date?.toISOString() ?? null,
  };
}

export function mailboxMetaFromRow(row: MessageRow): {
  mailbox: string;
  uid: number;
} | null {
  try {
    const meta = JSON.parse(row.label_ids_json) as {
      mailbox?: string;
      uid?: number;
    };
    if (!meta.mailbox || meta.uid == null) return null;
    return { mailbox: meta.mailbox, uid: meta.uid };
  } catch {
    return null;
  }
}
