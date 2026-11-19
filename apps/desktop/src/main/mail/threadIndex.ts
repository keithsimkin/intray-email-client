import {
  deleteMessageById,
  findMessageByRfcId,
  findThreadHitsByRfcIds,
  getBody,
  getMessageByProviderId,
  getMessageRow,
  getRfcHeaders,
  hasThread,
  listRecentMessages,
  listThreadMessages,
  reassignThread,
  upsertBody,
  upsertMessage,
  upsertRfcHeaders,
  type MessageRow,
} from "../db";
import { headerValue, type GmailMessage } from "../providers/gmail/client";
import {
  chooseThreadId,
  normalizeRfcHeaders,
  normalizeSubject,
  participantEmails,
  type NormalizedRfc,
  type SubjectHit,
} from "./threading";

const SUBJECT_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

export type RawRfc = {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | string[] | null;
};

function rememberRfc(row: MessageRow, headers: NormalizedRfc): void {
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

export function readStoredRfc(messageId: string): NormalizedRfc | null {
  const row = getRfcHeaders(messageId);
  if (!row) return null;
  let references: string[] = [];
  try {
    const parsed = JSON.parse(row.references_json) as unknown;
    if (Array.isArray(parsed)) {
      references = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    references = [];
  }
  return normalizeRfcHeaders({
    messageId: row.rfc_message_id,
    inReplyTo: row.in_reply_to,
    references,
  });
}

export function rfcFromGmail(msg: GmailMessage): NormalizedRfc {
  const headers = msg.payload?.headers;
  return normalizeRfcHeaders({
    messageId: headerValue(headers, "Message-ID"),
    inReplyTo: headerValue(headers, "In-Reply-To"),
    references: headerValue(headers, "References"),
  });
}

function subjectCandidates(
  accountId: string,
  normalizedSubject: string,
): SubjectHit[] {
  if (!normalizedSubject) return [];
  const rows = listRecentMessages(
    accountId,
    Date.now() - SUBJECT_WINDOW_MS,
    150,
  );
  const byThread = new Map<
    string,
    { dateMs: number; participants: Set<string> }
  >();
  for (const row of rows) {
    if (normalizeSubject(row.subject) !== normalizedSubject) continue;
    const bucket = byThread.get(row.thread_id) ?? {
      dateMs: 0,
      participants: new Set<string>(),
    };
    bucket.dateMs = Math.max(bucket.dateMs, row.date_ms);
    for (const email of participantEmails(row)) bucket.participants.add(email);
    byThread.set(row.thread_id, bucket);
  }
  return [...byThread.entries()].map(([threadId, bucket]) => ({
    threadId,
    dateMs: bucket.dateMs,
    participants: [...bucket.participants],
  }));
}

function snippetClose(a: string, b: string): boolean {
  const left = a.trim().slice(0, 80);
  const right = b.trim().slice(0, 80);
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

/** Drop the optimistic sent row once the provider's copy of the same reply arrives. */
function dropLooseLocalSent(row: MessageRow): void {
  const thread = listThreadMessages(row.account_id, row.thread_id);
  for (const other of thread) {
    if (other.id === row.id) continue;
    if (!other.provider_id.startsWith("local-sent:")) continue;
    if (other.from_email.toLowerCase() !== row.from_email.toLowerCase()) continue;
    if (Math.abs(other.date_ms - row.date_ms) > 15 * 60_000) continue;
    if (normalizeSubject(other.subject) !== normalizeSubject(row.subject)) continue;
    if (!snippetClose(other.snippet, row.snippet)) continue;
    deleteMessageById(other.id);
  }
}

function keepJoinedThread(row: MessageRow): MessageRow {
  const existing = getMessageByProviderId(row.account_id, row.provider_id);
  if (!existing) return row;
  const stable = existing.id === row.id ? row : { ...row, id: existing.id };
  if (existing.thread_id === stable.thread_id) return stable;
  const localCount = listThreadMessages(existing.account_id, existing.thread_id).length;
  const incomingCount = listThreadMessages(stable.account_id, stable.thread_id).length;
  if (localCount > 1 && incomingCount <= 1) {
    return { ...stable, thread_id: existing.thread_id };
  }
  return stable;
}

/**
 * Index one provider message.
 * Gmail's thread id is kept. Everyone else is joined by RFC headers, then by
 * subject when a client omitted them. A local sent copy with the same
 * Message-ID is replaced by the server row so the reply is not shown twice.
 */
export function indexIncomingMessage(
  row: MessageRow,
  raw: RawRfc | undefined,
  opts: { providerThread: boolean; flagsOnly?: boolean },
): boolean {
  const headers = normalizeRfcHeaders(raw);

  if (opts.flagsOnly) {
    const wrote = upsertMessage(row, { flagsOnly: true });
    const existing = getMessageRow(row.id);
    if (
      existing &&
      (headers.rfcMessageId || headers.inReplyTo || headers.references.length)
    ) {
      rememberRfc(existing, headers);
    }
    return wrote;
  }

  let next = row;

  if (headers.rfcMessageId) {
    const prior = findMessageByRfcId(next.account_id, headers.rfcMessageId);
    if (prior && prior.provider_id !== next.provider_id) {
      if (prior.provider_id.startsWith("local-sent:")) {
        const body = getBody(prior.id);
        // Keep the id the open thread already rendered so the server copy
        // replaces the sent bubble instead of appearing beside it.
        next = { ...next, id: prior.id, thread_id: prior.thread_id };
        deleteMessageById(prior.id);
        next = keepJoinedThread(next);
        const wrote = upsertMessage(next);
        if (body && !getBody(next.id)) {
          upsertBody({
            message_id: next.id,
            text_plain: body.text_plain,
            text_html: body.text_html,
            fetched_at: body.fetched_at,
          });
        }
        rememberRfc(next, headers);
        dropLooseLocalSent(next);
        return wrote;
      }
      if (!readStoredRfc(prior.id)?.rfcMessageId) rememberRfc(prior, headers);
      return false;
    }
  }

  if (!opts.providerThread) {
    const normalizedSubject = normalizeSubject(next.subject);
    let headerHits = findThreadHitsByRfcIds(next.account_id, [
      headers.rfcMessageId ?? "",
      headers.inReplyTo ?? "",
      ...headers.references,
    ]);
    const root = headers.references[0] || headers.inReplyTo;
    if (!headerHits.length && root && hasThread(next.account_id, root)) {
      headerHits = [{ threadId: root, dateMs: 0 }];
    }
    const decision = chooseThreadId({
      headers,
      normalizedSubject,
      participants: participantEmails(next),
      headerHits,
      subjectHits: headerHits.length
        ? []
        : subjectCandidates(next.account_id, normalizedSubject),
      fallbackId: next.thread_id,
    });
    for (const fragment of decision.mergeIds) {
      reassignThread(next.account_id, fragment, decision.threadId);
    }
    next = { ...next, thread_id: decision.threadId };
  }

  next = keepJoinedThread(next);
  const wrote = upsertMessage(next);
  rememberRfc(next, headers);
  dropLooseLocalSent(next);
  return wrote;
}
