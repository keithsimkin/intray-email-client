import type { MessageRow } from "../../db";
import type { ImapEnvelope } from "./client";

export function imapEnvelopeToRow(
  accountId: string,
  env: ImapEnvelope,
): MessageRow {
  const pid = `${env.uidValidity}:${env.uid}`;
  const dateMs = env.date?.getTime() ?? Date.now();
  const unread = env.flags.some((f) => f.toLowerCase() === "\\seen") ? 0 : 1;
  const starred = env.flags.some((f) => f.toLowerCase() === "\\flagged")
    ? 1
    : 0;

  return {
    id: `${accountId}:${pid}`,
    account_id: accountId,
    thread_id: env.threadId,
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
    important: starred || unread ? 1 : 0,
    starred,
    has_attachment: env.hasAttachment ? 1 : 0,
    label_ids_json: JSON.stringify({
      mailbox: env.mailboxPath,
      uid: env.uid,
      uidValidity: env.uidValidity,
      flags: env.flags,
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
