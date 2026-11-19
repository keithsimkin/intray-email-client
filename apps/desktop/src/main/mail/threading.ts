/**
 * Conversation identity, in the order Superhuman-class clients use it:
 * 1. The provider's thread id (Gmail threadId / X-GM-THRID) when we have one.
 * 2. RFC 5322 threading (Message-ID, In-Reply-To, References) — JWZ, flattened
 *    into one chronological conversation rather than a tree.
 * 3. Normalized subject plus a shared participant, only when headers do not
 *    already decide. Generic subjects ("Hi", "Meeting") never merge on their own.
 */

export type NormalizedRfc = {
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
};

export type ThreadHit = {
  threadId: string;
  dateMs: number;
};

export type SubjectHit = ThreadHit & {
  participants: string[];
};

const SUBJECT_PREFIX =
  /^(?:(?:re|fw|fwd|aw|wg|sv|vs|antw|rif|tr|ynt|odp|doorst|enc|rv|res)(?:\[\d+\])?\s*:\s*)+/i;

const GENERIC_SUBJECTS = new Set([
  "",
  "(no subject)",
  "no subject",
  "hi",
  "hello",
  "hey",
  "meeting",
  "update",
  "updates",
  "notification",
  "notifications",
  "reminder",
  "question",
  "fyi",
  "thanks",
  "thank you",
  "test",
]);

/** `<id@host>` form, or null when the value is not a single message id. */
export function normalizeMessageId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/[\u0000\r\n\t]+/g, " ")
    .trim();
  if (!cleaned) return null;
  const bracketed = cleaned.match(/<([^<>\s]+)>/);
  const id = (bracketed?.[1] ?? cleaned.replace(/^<|>$/g, "")).trim();
  if (!id || /[\s<>]/.test(id) || id.length > 998) return null;
  return `<${id}>`;
}

export function parseReferences(
  raw: string | string[] | null | undefined,
): string[] {
  if (!raw) return [];
  const source = Array.isArray(raw) ? raw.join(" ") : String(raw);
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null) => {
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(value);
  };

  const re = /<([^<>\s]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) push(normalizeMessageId(match[0]));
  if (!found.length) {
    for (const part of source.split(/\s+/)) push(normalizeMessageId(part));
  }
  return found;
}

export function normalizeRfcHeaders(raw: {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | string[] | null;
} | null | undefined): NormalizedRfc {
  const references = parseReferences(raw?.references);
  const rfcMessageId = normalizeMessageId(raw?.messageId);
  const inReplyTo = normalizeMessageId(raw?.inReplyTo);
  return {
    rfcMessageId,
    inReplyTo,
    references: references.filter(
      (id) => !rfcMessageId || id.toLowerCase() !== rfcMessageId.toLowerCase(),
    ),
  };
}

/** References for a reply: the parent's chain, then the parent's Message-ID. */
export function buildReplyReferences(
  parent: NormalizedRfc | null | undefined,
): string[] {
  if (!parent) return [];
  const parentId = parent.rfcMessageId;
  const refs = parent.references.filter(
    (id) => !parentId || id.toLowerCase() !== parentId.toLowerCase(),
  );
  if (parentId) refs.push(parentId);
  if (refs.length <= 25) return refs;
  return [refs[0]!, ...refs.slice(-24)];
}

export function normalizeSubject(subject: string): string {
  let value = subject.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i += 1) {
    const next = value.replace(SUBJECT_PREFIX, "").trim();
    if (next === value) break;
    value = next;
  }
  return value.toLowerCase();
}

export function isGenericSubject(normalized: string): boolean {
  return GENERIC_SUBJECTS.has(normalized.trim().toLowerCase());
}

export function emailsFromJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { email?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (item?.email ?? "").trim().toLowerCase())
      .filter((email) => email.includes("@"));
  } catch {
    return [];
  }
}

export function participantEmails(row: {
  from_email?: string | null;
  to_json?: string | null;
  cc_json?: string | null;
}): string[] {
  const out = new Set<string>();
  const from = row.from_email?.trim().toLowerCase();
  if (from?.includes("@")) out.add(from);
  for (const email of emailsFromJson(row.to_json)) out.add(email);
  for (const email of emailsFromJson(row.cc_json)) out.add(email);
  return [...out];
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function isProviderThreadId(threadId: string): boolean {
  return threadId.startsWith("gm:");
}

/**
 * Pick the conversation id for one incoming message.
 * `mergeIds` are fragment ids that should be rewritten onto the winner.
 */
export function chooseThreadId(input: {
  providerThreadId?: string | null;
  headers: NormalizedRfc;
  normalizedSubject: string;
  participants: string[];
  headerHits: ThreadHit[];
  subjectHits: SubjectHit[];
  fallbackId: string;
}): { threadId: string; mergeIds: string[] } {
  if (input.providerThreadId) {
    return { threadId: input.providerThreadId, mergeIds: [] };
  }

  const headerIds = uniqueIds(input.headerHits.map((hit) => hit.threadId));
  if (headerIds.length) {
    const providerIds = headerIds.filter(isProviderThreadId);
    if (providerIds.length === 1) {
      const winner = providerIds[0]!;
      return {
        threadId: winner,
        mergeIds: headerIds.filter(
          (id) => id !== winner && !isProviderThreadId(id),
        ),
      };
    }
    if (providerIds.length > 1) {
      const newest = [...input.headerHits].sort((a, b) => b.dateMs - a.dateMs);
      const winner =
        newest.find((hit) => isProviderThreadId(hit.threadId))?.threadId ??
        providerIds[0]!;
      return { threadId: winner, mergeIds: [] };
    }
    const oldest = [...input.headerHits].sort((a, b) => a.dateMs - b.dateMs)[0];
    const winner = oldest?.threadId ?? headerIds[0]!;
    return {
      threadId: winner,
      mergeIds: headerIds.filter((id) => id !== winner),
    };
  }

  const linked =
    Boolean(input.headers.inReplyTo) || input.headers.references.length > 0;
  const mine = new Set(input.participants.map((email) => email.toLowerCase()));
  const subjectMatches = input.subjectHits
    .filter((hit) =>
      hit.participants.some((email) => mine.has(email.toLowerCase())),
    )
    .sort((a, b) => b.dateMs - a.dateMs);

  // Subject is only a fallback for clients that omit reply headers.
  // A message that names its parent keeps that chain, even when the subject
  // matches some other conversation.
  if (
    !linked &&
    input.normalizedSubject &&
    !isGenericSubject(input.normalizedSubject) &&
    input.normalizedSubject.length >= 8 &&
    subjectMatches.length
  ) {
    return { threadId: subjectMatches[0]!.threadId, mergeIds: [] };
  }

  const fallback =
    input.headers.references[0] ||
    input.headers.inReplyTo ||
    input.headers.rfcMessageId ||
    input.fallbackId;
  return { threadId: fallback, mergeIds: [] };
}
