import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import { loadCredentials, type ImapCredentials } from "../../crypto/credentials";
import {
  explainGmailImapError,
  explainImapAuthError,
  isGmailImapTarget,
  placementForGmail,
  type ListedMailbox,
  type MailboxRole,
} from "../../../shared/gmailImap";
import { mailSnippet } from "../../../shared/mailSnippet";
import { normalizeFolderPath } from "./presets";
import { imapUidSet } from "./uidSet";

export type ImapEnvelope = {
  uid: number;
  uidValidity: number;
  messageId?: string;
  /** Parent Message-ID from the IMAP ENVELOPE (In-Reply-To). */
  inReplyTo?: string;
  /** Ancestor Message-IDs from ENVELOPE REFERENCES, root first. */
  references?: string[];
  threadId: string;
  flags: string[];
  date: Date | null;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  snippet: string;
  hasAttachment: boolean;
  folder: string;
  mailboxPath: string;
  /** Set for Gmail when X-GM-LABELS decided starred / important. */
  starred?: boolean;
  important?: boolean;
  /** Gmail X-GM-MSGID, stable across labels. */
  gmMsgId?: string;
  /** Gmail X-GM-THRID. */
  gmThrId?: string;
  gmLabels?: string[];
  /**
   * Flag/label refresh only: no BODYSTRUCTURE or source window was fetched, so
   * snippet and attachment state must not be overwritten from this envelope.
   */
  partial?: boolean;
};

export type ImapMailboxSlice = {
  envelopes: ImapEnvelope[];
  uidValidity: number;
  uidNext: number;
  highestUid: number;
  /** True when the cursor was already current, so nothing was fetched. */
  unchanged?: boolean;
};

/** Never fetch an unbounded backlog in one connection. */
const MAX_INCREMENTAL_MESSAGES = 500;
const SENT_MAILBOXES = [
  "Sent",
  "Sent Messages",
  "Sent Items",
  "INBOX.Sent",
  "[Gmail]/Sent Mail",
  "[Google Mail]/Sent Mail",
];

function addrs(
  value: AddressObject | AddressObject[] | undefined,
): { name: string; email: string }[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: { name: string; email: string }[] = [];
  for (const group of list) {
    for (const a of group.value ?? []) {
      if (!a.address) continue;
      out.push({
        name: (a.name || a.address.split("@")[0]).trim(),
        email: a.address.toLowerCase(),
      });
    }
  }
  return out;
}

export function imapConnectionOptions(creds: ImapCredentials) {
  return {
    host: creds.imapHost,
    port: creds.imapPort,
    // Implicit TLS on 993; otherwise require a successful STARTTLS upgrade.
    secure: creds.imapPort === 993,
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
    connectionTimeout: 30_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000,
    logger: false as const,
  };
}

/** Keep sockets warm — reconnecting TLS for every body open was a major stall. */
const IMAP_IDLE_MS = 90_000;

type ImapLaneName = "interactive" | "bulk";

type ImapLane = {
  client: ImapFlow | null;
  creds: ImapCredentials | null;
  /** Serializes commands on this socket (IMAP is not freely concurrent). */
  tail: Promise<void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

const imapLanes = new Map<string, ImapLane>();

function laneKey(accountId: string, lane: ImapLaneName): string {
  return `${accountId}:${lane}`;
}

function getLane(accountId: string, lane: ImapLaneName): ImapLane {
  const key = laneKey(accountId, lane);
  let entry = imapLanes.get(key);
  if (!entry) {
    entry = {
      client: null,
      creds: null,
      tail: Promise.resolve(),
      idleTimer: null,
    };
    imapLanes.set(key, entry);
  }
  return entry;
}

function sameImapCreds(a: ImapCredentials, b: ImapCredentials): boolean {
  return (
    a.imapHost === b.imapHost &&
    a.imapPort === b.imapPort &&
    a.email === b.email &&
    a.username === b.username &&
    a.password === b.password
  );
}

async function disposeLaneClient(entry: ImapLane): Promise<void> {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
  const client = entry.client;
  entry.client = null;
  entry.creds = null;
  if (!client) return;
  try {
    await client.logout();
  } catch {
    try {
      client.close();
    } catch {
      /* already gone */
    }
  }
}

function scheduleLaneIdle(key: string, entry: ImapLane): void {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    entry.tail = entry.tail
      .then(async () => {
        await disposeLaneClient(entry);
        if (!entry.client) imapLanes.delete(key);
      })
      .catch(() => undefined);
  }, IMAP_IDLE_MS);
}

function armLaneLifecycle(entry: ImapLane, client: ImapFlow): void {
  const drop = () => {
    if (entry.client === client) {
      entry.client = null;
      entry.creds = null;
    }
  };
  client.on("error", drop);
  client.on("close", drop);
}

async function connectLane(
  entry: ImapLane,
  accountId: string,
): Promise<{ client: ImapFlow; creds: ImapCredentials }> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "imap") {
    throw new Error("IMAP credentials missing");
  }
  if (
    entry.client &&
    entry.creds &&
    entry.client.usable &&
    sameImapCreds(entry.creds, creds)
  ) {
    return { client: entry.client, creds };
  }
  await disposeLaneClient(entry);
  const client = new ImapFlow(imapConnectionOptions(creds));
  await client.connect();
  entry.client = client;
  entry.creds = creds;
  armLaneLifecycle(entry, client);
  return { client, creds };
}

function isTransientImapError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /not available|connection|closed|timeout|timed out|socket|ECONN|ETIMEDOUT|EPIPE|ended|reset|unavailable|logout|not connected/i.test(
    msg,
  );
}

async function withImapLane<T>(
  accountId: string,
  lane: ImapLaneName,
  fn: (client: ImapFlow, creds: ImapCredentials) => Promise<T>,
): Promise<T> {
  const key = laneKey(accountId, lane);
  const entry = getLane(accountId, lane);
  let result!: T;
  let failure: unknown;

  const run = entry.tail.then(async () => {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    try {
      let { client, creds } = await connectLane(entry, accountId);
      try {
        result = await fn(client, creds);
      } catch (error) {
        if (!isTransientImapError(error)) throw error;
        await disposeLaneClient(entry);
        ({ client, creds } = await connectLane(entry, accountId));
        result = await fn(client, creds);
      }
    } catch (error) {
      failure = error;
    } finally {
      scheduleLaneIdle(key, entry);
    }
  });

  entry.tail = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
  if (failure) throw failure;
  return result;
}

/** Sync / bulk mailbox walks — kept off the interactive open path. */
export async function withImap<T>(
  accountId: string,
  fn: (client: ImapFlow, creds: ImapCredentials) => Promise<T>,
): Promise<T> {
  return withImapLane(accountId, "bulk", fn);
}

/** Body opens and user-driven reads — dedicated warm connection. */
export async function withImapInteractive<T>(
  accountId: string,
  fn: (client: ImapFlow, creds: ImapCredentials) => Promise<T>,
): Promise<T> {
  return withImapLane(accountId, "interactive", fn);
}

/** Drop pooled sockets (account removed, auth changed, hung fetch). */
export function closeImapConnections(
  accountId?: string,
  lane?: ImapLaneName,
): void {
  for (const [key, entry] of [...imapLanes.entries()]) {
    if (accountId && !key.startsWith(`${accountId}:`)) continue;
    if (lane && !key.endsWith(`:${lane}`)) continue;
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    const client = entry.client;
    entry.client = null;
    entry.creds = null;
    // Reset the queue immediately so a hung fetch cannot block the next open.
    entry.tail = Promise.resolve();
    imapLanes.delete(key);
    if (client) {
      try {
        client.close();
      } catch {
        /* already closed */
      }
    }
  }
}

function rethrowImapError(creds: ImapCredentials, error: unknown): never {
  if (isGmailImapTarget(creds)) {
    const explained = explainGmailImapError(error);
    if (explained) throw new Error(explained);
  } else {
    const explained = explainImapAuthError(error);
    if (explained) throw new Error(explained);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

/** Verify credentials by connecting and selecting INBOX. */
export async function verifyImapLogin(creds: ImapCredentials): Promise<void> {
  const client = new ImapFlow(imapConnectionOptions(creds));
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } catch (error) {
    try {
      client.close();
    } catch {
      /* already closed */
    }
    rethrowImapError(creds, error);
  }
  try {
    await client.logout();
  } catch {
    client.close();
  }
}

/** LIST mailboxes, including SPECIAL-USE flags when the server sends them. */
export async function listImapMailboxes(
  accountId: string,
): Promise<ListedMailbox[]> {
  return withImap(accountId, async (client) => {
    const boxes = await client.list();
    return boxes.map((box) => ({
      path: box.path,
      name: box.name,
      specialUse: box.specialUse,
    }));
  });
}

function mailboxMeta(client: ImapFlow): {
  exists: number;
  uidValidity: number;
  uidNext: number;
} {
  const box = client.mailbox;
  if (!box || typeof box === "boolean") {
    return { exists: 0, uidValidity: 0, uidNext: 0 };
  }
  return {
    exists: Number(box.exists ?? 0),
    uidValidity: Number(box.uidValidity ?? 0),
    uidNext: Number(box.uidNext ?? 0),
  };
}

function envelopeFromFetch(
  msg: FetchMessageObject,
  mailbox: string,
  uidValidity: number,
  gmail: { enabled: boolean; role: MailboxRole } | undefined,
  partial = false,
): ImapEnvelope {
  const env = msg.envelope;
  const fromAddr = env?.from?.[0];
  const fromEmail = (fromAddr?.address ?? "unknown").toLowerCase();
  const fromName = fromAddr?.name || fromEmail.split("@")[0];
  const subject = env?.subject || "(no subject)";
  const flags = [...(msg.flags ?? [])].map(String);
  const snippetSource = msg.source ? mailSnippet(msg.source.toString("utf8")) : "";
  const messageId = env?.messageId || undefined;
  const inReplyTo =
    (env as { inReplyTo?: string } | undefined)?.inReplyTo || undefined;
  const refs =
    (env as { references?: string | string[] } | undefined)?.references ?? [];
  const refList = (Array.isArray(refs) ? refs : [refs]).filter(
    (id): id is string => Boolean(id),
  );
  // Root of the References chain, then In-Reply-To, then this message.
  // The store may still join a partial chain onto an existing conversation.
  const threadKey =
    refList[0] || inReplyTo || messageId || `uid-${uidValidity}-${msg.uid}`;

  const to =
    env?.to?.map((a) => ({
      name: a.name || a.address?.split("@")[0] || "",
      email: (a.address ?? "").toLowerCase(),
    })) ?? [];
  const cc =
    env?.cc?.map((a) => ({
      name: a.name || a.address?.split("@")[0] || "",
      email: (a.address ?? "").toLowerCase(),
    })) ?? [];

  const hasAttachment = Boolean(
    msg.bodyStructure &&
      JSON.stringify(msg.bodyStructure).includes('"disposition":"attachment"'),
  );

  const date = env?.date
    ? env.date instanceof Date
      ? env.date
      : new Date(env.date)
    : null;

  const labels = msg.labels ? [...msg.labels].map(String) : undefined;
  const placement = gmail?.enabled
    ? placementForGmail({
        // An empty set still means "labels were returned". Undefined means
        // the server did not send X-GM-LABELS.
        labels: msg.labels ? labels : undefined,
        flags,
        role: gmail.role,
      })
    : null;

  return {
    uid: msg.uid,
    uidValidity,
    messageId,
    inReplyTo,
    references: refList,
    threadId: String(threadKey),
    flags,
    date: date && !Number.isNaN(date.getTime()) ? date : null,
    subject,
    fromName,
    fromEmail,
    to: to.filter((t) => t.email),
    cc: cc.filter((t) => t.email),
    snippet: snippetSource || (partial ? "" : subject),
    hasAttachment,
    folder: placement?.folder ?? normalizeFolderPath(mailbox),
    mailboxPath: mailbox,
    starred: placement?.starred,
    important: placement?.important,
    gmMsgId: gmail?.enabled && msg.emailId ? String(msg.emailId) : undefined,
    gmThrId: gmail?.enabled && msg.threadId ? String(msg.threadId) : undefined,
    gmLabels: gmail?.enabled ? labels : undefined,
    ...(partial ? { partial: true } : {}),
  };
}

/**
 * Fetch envelopes from a mailbox.
 *
 * When `sinceUid` is supplied *and* the mailbox's UIDVALIDITY still matches, we
 * fetch only the new UID window instead of re-scanning the last N messages.
 * That is what makes incremental sync cheap enough to run every 30 seconds.
 *
 * Gmail requests X-GM-LABELS and X-GM-THRID (X-GM-MSGID is always requested by
 * imapflow when the server advertises X-GM-EXT-1). `refreshRecent` re-reads a
 * short sequence window on incremental passes so archive/star/read changes on
 * recent All Mail show up without scanning the whole mailbox.
 */
export async function listRecentEnvelopes(
  accountId: string,
  opts?: {
    mailbox?: string;
    limit?: number;
    sinceUid?: number;
    sinceUidValidity?: number;
    gmail?: boolean;
    role?: MailboxRole;
    refreshRecent?: number;
  },
): Promise<ImapMailboxSlice> {
  const mailbox = opts?.mailbox ?? "INBOX";
  const limit = opts?.limit ?? 100;
  const gmail = opts?.gmail
    ? { enabled: true as const, role: opts.role ?? "other" }
    : undefined;

  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const meta = mailboxMeta(client);
      if (!meta.exists) {
        return {
          envelopes: [],
          uidValidity: meta.uidValidity,
          uidNext: meta.uidNext,
          highestUid: opts?.sinceUid ?? 0,
        };
      }

      const incremental =
        opts?.sinceUid != null &&
        opts.sinceUidValidity === meta.uidValidity &&
        meta.uidNext > opts.sinceUid + 1;
      const cursorCurrent =
        opts?.sinceUid != null && opts.sinceUidValidity === meta.uidValidity;
      const refresh = gmail ? (opts?.refreshRecent ?? 0) : 0;

      // The common quiet-mailbox case: nothing new has been assigned a UID
      // since the last pass. Re-fetching the last N envelopes here (with a 4KB
      // source window each) was the main reason an idle Intray kept the CPU
      // busy every 30 seconds.
      if (cursorCurrent && !incremental && refresh === 0) {
        return {
          envelopes: [],
          uidValidity: meta.uidValidity,
          uidNext: meta.uidNext,
          highestUid: opts!.sinceUid!,
          unchanged: true,
        };
      }

      // Full envelopes (source + BODYSTRUCTURE) are only needed for UIDs we
      // have not stored yet: they seed the list snippet and attachment flag.
      const fullQuery = {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 4096 },
        ...(gmail ? { labels: true, threadId: true } : {}),
      };
      // Flag/label-only pass for the recent Gmail window (archive, star, read).
      const lightQuery = {
        uid: true,
        flags: true,
        envelope: true,
        ...(gmail ? { labels: true, threadId: true } : {}),
      };

      const byUid = new Map<number, ImapEnvelope>();
      const collect = async (
        fetchRange: string,
        byUidRange: boolean,
        query: typeof fullQuery | typeof lightQuery,
        partial: boolean,
      ) => {
        for await (const msg of client.fetch(fetchRange, query, {
          uid: byUidRange,
        })) {
          // A flag-only pass must not replace the full envelope already
          // collected for the same UID in this round.
          const existing = byUid.get(msg.uid);
          if (existing && partial && !existing.partial) continue;
          byUid.set(
            msg.uid,
            envelopeFromFetch(
              msg,
              mailbox,
              meta.uidValidity,
              gmail,
              partial,
            ),
          );
        }
      };

      if (!cursorCurrent) {
        // No usable cursor (first sync, or UIDVALIDITY changed): recent window.
        const from = Math.max(1, meta.exists - limit + 1);
        await collect(`${from}:${meta.exists}`, false, fullQuery, false);
      } else if (incremental) {
        const start = Math.max(
          opts!.sinceUid! + 1,
          meta.uidNext - MAX_INCREMENTAL_MESSAGES,
        );
        await collect(`${start}:*`, true, fullQuery, false);
      }

      if (refresh > 0 && cursorCurrent) {
        const from = Math.max(1, meta.exists - refresh + 1);
        await collect(`${from}:${meta.exists}`, false, lightQuery, true);
      }

      const out = [...byUid.values()].sort((a, b) => a.uid - b.uid);
      const fetchedMax = out.reduce((max, env) => Math.max(max, env.uid), 0);
      // Never let a partial (flag/label) pass move the cursor backwards.
      const highestUid = Math.max(fetchedMax, opts?.sinceUid ?? 0);

      return {
        envelopes: out,
        uidValidity: meta.uidValidity,
        uidNext: meta.uidNext,
        highestUid,
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * Messages older than `beforeUid`, newest first, at most `limit`.
 *
 * The forward sync cursor only moves upward. Scrolling the list calls this to
 * walk the mailbox backward without moving that cursor. Empty UID spans (gaps
 * from expunge) are probed a few times so one scroll doesn't stop on a hole.
 */
export async function listOlderEnvelopes(
  accountId: string,
  opts: {
    mailbox: string;
    beforeUid: number;
    uidValidity?: number;
    limit?: number;
    span?: number;
    emptyProbes?: number;
    gmail?: boolean;
    role?: MailboxRole;
  },
): Promise<{
  envelopes: ImapEnvelope[];
  nextBefore: number;
  exhausted: boolean;
  uidValidity: number;
}> {
  const mailbox = opts.mailbox;
  const limit = opts.limit ?? 120;
  const span = opts.span ?? 800;
  const emptyProbes = opts.emptyProbes ?? 8;
  const gmail = opts.gmail
    ? { enabled: true as const, role: opts.role ?? "other" }
    : undefined;
  const fullQuery = {
    uid: true,
    flags: true,
    envelope: true,
    bodyStructure: true,
    source: { start: 0, maxLength: 4096 },
    ...(gmail ? { labels: true, threadId: true } : {}),
  };

  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const meta = mailboxMeta(client);
      if (
        opts.uidValidity &&
        meta.uidValidity &&
        opts.uidValidity !== meta.uidValidity
      ) {
        return {
          envelopes: [],
          nextBefore: 1,
          exhausted: true,
          uidValidity: meta.uidValidity,
        };
      }
      if (!meta.exists || opts.beforeUid <= 1) {
        return {
          envelopes: [],
          nextBefore: 1,
          exhausted: true,
          uidValidity: meta.uidValidity,
        };
      }

      let probe = opts.beforeUid;
      let attempts = 0;
      while (probe > 1 && attempts < emptyProbes) {
        attempts += 1;
        const start = Math.max(1, probe - span);
        const found = await client.search(
          { uid: `${start}:${probe - 1}` },
          { uid: true },
        );
        const uids = (Array.isArray(found) ? found : [])
          .filter((uid) => Number.isFinite(uid) && uid >= start && uid < probe)
          .sort((a, b) => a - b);
        if (!uids.length) {
          if (start === 1) {
            return {
              envelopes: [],
              nextBefore: 1,
              exhausted: true,
              uidValidity: meta.uidValidity,
            };
          }
          probe = start;
          continue;
        }

        const take = uids.slice(-limit);
        const range = imapUidSet(take);
        const envelopes: ImapEnvelope[] = [];
        if (range) {
          for await (const msg of client.fetch(range, fullQuery, { uid: true })) {
            envelopes.push(
              envelopeFromFetch(msg, mailbox, meta.uidValidity, gmail, false),
            );
          }
        }
        const lowest = take[0] ?? start;
        return {
          envelopes,
          nextBefore: lowest,
          exhausted: start === 1 && take.length === uids.length,
          uidValidity: meta.uidValidity,
        };
      }

      return {
        envelopes: [],
        nextBefore: Math.max(1, probe),
        exhausted: probe <= 1,
        uidValidity: meta.uidValidity,
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * Re-read flags/labels for messages already in the local store.
 *
 * Incremental sync only looks at new UIDs, and the recent refresh covers a
 * short window, so read/star changes made in another mail app never reached
 * older messages — they stayed unread in Intray forever. Fetching flags for
 * the UIDs we actually store is bounded (a few hundred per mailbox) and
 * catches every provider-side change.
 */
export async function listStoredEnvelopeFlags(
  accountId: string,
  opts: {
    mailbox: string;
    uids: number[];
    gmail?: boolean;
    role?: MailboxRole;
    chunkSize?: number;
  },
): Promise<ImapEnvelope[]> {
  const uids = [
    ...new Set(opts.uids.filter((uid) => Number.isFinite(uid) && uid > 0)),
  ].sort((a, b) => a - b);
  if (!uids.length) return [];
  const gmail = opts.gmail
    ? { enabled: true as const, role: opts.role ?? "other" }
    : undefined;
  const chunkSize = Math.max(1, opts.chunkSize ?? 250);

  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(opts.mailbox);
    try {
      const meta = mailboxMeta(client);
      const query = {
        uid: true,
        flags: true,
        envelope: true,
        ...(gmail ? { labels: true, threadId: true } : {}),
      };
      const out: ImapEnvelope[] = [];
      for (let i = 0; i < uids.length; i += chunkSize) {
        const set = imapUidSet(uids.slice(i, i + chunkSize));
        if (!set) continue;
        for await (const msg of client.fetch(set, query, { uid: true })) {
          out.push(
            envelopeFromFetch(
              msg,
              opts.mailbox,
              meta.uidValidity,
              gmail,
              true,
            ),
          );
        }
      }
      return out;
    } finally {
      lock.release();
    }
  });
}

/**
 * UIDs the server currently considers unread in `mailbox`.
 *
 * `\Seen` is the read bit other clients set. Gmail's `is:unread` label is not
 * used here, because mail read on the web often keeps a stale `\Unread` label.
 *
 * `gmailInbox` limits the search to Gmail's Inbox label while All Mail is
 * selected, so archived unseen mail is not counted as inbox unread.
 *
 * Returns null when the server rejects the search. An empty array means there
 * is nothing unread — callers must not treat those the same.
 */
export async function searchUnseenUids(
  accountId: string,
  mailbox: string,
  opts?: { gmailInbox?: boolean },
): Promise<number[] | null> {
  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const found = await client.search(
        opts?.gmailInbox
          ? { gmraw: "in:inbox", seen: false }
          : { seen: false },
        { uid: true },
      );
      if (!Array.isArray(found)) return null;
      return found.filter((uid) => Number.isFinite(uid) && uid > 0);
    } finally {
      lock.release();
    }
  });
}

/**
 * Server-side FROM search — pulls older mail the shallow inbox sync never
 * indexed so from: filters aren't limited to the recent local window.
 */
export async function searchImapFrom(
  accountId: string,
  queries: string[],
  opts?: { mailbox?: string; limit?: number; gmail?: boolean; role?: MailboxRole },
): Promise<ImapEnvelope[]> {
  const terms = [
    ...new Set(
      queries
        .map((q) => q.trim())
        .filter((q) => q.length >= 2),
    ),
  ].slice(0, 6);
  if (!terms.length) return [];

  const mailbox = opts?.mailbox ?? "INBOX";
  const limit = Math.min(opts?.limit ?? 80, 150);
  const gmail = opts?.gmail
    ? { enabled: true as const, role: opts.role ?? ("inbox" as MailboxRole) }
    : undefined;

  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const meta = mailboxMeta(client);
      const uidSet = new Set<number>();
      for (const term of terms) {
        try {
          const found = await client.search({ from: term }, { uid: true });
          if (!Array.isArray(found)) continue;
          for (const uid of found) uidSet.add(Number(uid));
        } catch {
          /* server may not support FROM search */
        }
      }
      if (!uidSet.size) return [];

      const uids = [...uidSet]
        .filter((uid) => Number.isFinite(uid) && uid > 0)
        .sort((a, b) => b - a)
        .slice(0, limit);
      if (!uids.length) return [];

      const byUid = new Map<number, ImapEnvelope>();
      const range = uids.join(",");
      for await (const msg of client.fetch(
        range,
        {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          source: { start: 0, maxLength: 2048 },
          ...(gmail ? { labels: true, threadId: true } : {}),
        },
        { uid: true },
      )) {
        byUid.set(
          msg.uid,
          envelopeFromFetch(msg, mailbox, meta.uidValidity, gmail, false),
        );
      }
      return [...byUid.values()].sort(
        (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
      );
    } finally {
      lock.release();
    }
  });
}

/** Message-ID / In-Reply-To / References for a reply, without downloading the body. */
export async function fetchImapThreadingHeaders(
  accountId: string,
  mailbox: string,
  uid: number,
): Promise<{ messageId?: string; inReplyTo?: string; references: string[] }> {
  return withImapInteractive(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(
        String(uid),
        { envelope: true, uid: true },
        { uid: true },
      );
      if (!msg || typeof msg === "boolean") {
        throw new Error("Message headers missing");
      }
      const env = msg.envelope;
      const refs =
        (env as { references?: string | string[] } | undefined)?.references ??
        [];
      const refList = (Array.isArray(refs) ? refs : [refs]).filter(
        (id): id is string => Boolean(id),
      );
      return {
        messageId: env?.messageId || undefined,
        inReplyTo:
          (env as { inReplyTo?: string } | undefined)?.inReplyTo || undefined,
        references: refList,
      };
    } finally {
      lock.release();
    }
  });
}

export async function fetchMessageSource(
  accountId: string,
  mailbox: string,
  uid: number,
  opts?: { lane?: ImapLaneName },
): Promise<ParsedMail> {
  // Interactive = reader opens; bulk = background prefetch (must not block opens).
  const run =
    opts?.lane === "bulk" ? withImap : withImapInteractive;
  return run(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(
        String(uid),
        { source: true, uid: true },
        { uid: true },
      );
      if (!msg || typeof msg === "boolean" || !msg.source) {
        throw new Error("Message source missing");
      }
      return simpleParser(msg.source);
    } finally {
      lock.release();
    }
  });
}

export async function setImapFlags(
  accountId: string,
  mailbox: string,
  uid: number,
  opts: { add?: string[]; remove?: string[] },
): Promise<void> {
  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      if (opts.add?.length) {
        const ok = await client.messageFlagsAdd(String(uid), opts.add, {
          uid: true,
        });
        if (!ok) {
          throw new Error(`IMAP did not add flags: ${opts.add.join(", ")}`);
        }
      }
      if (opts.remove?.length) {
        const ok = await client.messageFlagsRemove(String(uid), opts.remove, {
          uid: true,
        });
        if (!ok) {
          throw new Error(
            `IMAP did not remove flags: ${opts.remove.join(", ")}`,
          );
        }
      }
    } finally {
      lock.release();
    }
  });
}

export async function moveImapMessage(
  accountId: string,
  mailbox: string,
  uid: number,
  dest: string,
): Promise<void> {
  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageMove(String(uid), dest, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export type ImapChangeAction =
  | "archive"
  | "trash"
  | "spam"
  | "not-spam"
  | "inbox"
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "delete-forever"
  | "move";

async function storeLabels(
  client: ImapFlow,
  uid: string,
  labels: string[],
  mode: "add" | "remove",
): Promise<void> {
  for (const label of labels) {
    const ok =
      mode === "add"
        ? await client.messageFlagsAdd(uid, [label], {
            uid: true,
            useLabels: true,
          })
        : await client.messageFlagsRemove(uid, [label], {
            uid: true,
            useLabels: true,
          });
    if (!ok && mode === "add") {
      throw new Error(`Gmail did not add label ${label}`);
    }
  }
}

/**
 * Apply a mailbox change. Gmail labels are not folders: archive removes
 * `\Inbox` on the All Mail copy instead of moving into a fake Archive box.
 */
export async function pushImapChange(
  accountId: string,
  mailbox: string,
  uid: number,
  action: ImapChangeAction,
  opts?: { gmail?: boolean; folder?: string },
): Promise<void> {
  if (!opts?.gmail) {
    const target =
      action === "move"
        ? opts?.folder === "trash"
          ? "Trash"
          : opts?.folder === "junk"
            ? "Junk"
            : opts?.folder === "archive"
              ? "Archive"
              : opts?.folder === "inbox"
                ? "INBOX"
                : opts?.folder || "Archive"
        : action === "trash"
          ? "Trash"
          : action === "spam"
            ? "Junk"
            : action === "not-spam" || action === "inbox"
              ? "INBOX"
              : action === "archive"
                ? "Archive"
                : null;
    if (action === "delete-forever") {
      await deleteImapMessageForever(accountId, mailbox, uid);
      return;
    }
    if (target) {
      await moveImapMessage(accountId, mailbox, uid, target);
      return;
    }
    if (action === "read") {
      await setImapFlags(accountId, mailbox, uid, { add: ["\\Seen"] });
    } else if (action === "unread") {
      await setImapFlags(accountId, mailbox, uid, { remove: ["\\Seen"] });
    } else if (action === "star") {
      await setImapFlags(accountId, mailbox, uid, { add: ["\\Flagged"] });
    } else if (action === "unstar") {
      await setImapFlags(accountId, mailbox, uid, { remove: ["\\Flagged"] });
    }
    return;
  }

  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uidStr = String(uid);
      const resolved =
        action === "move"
          ? opts.folder === "trash"
            ? "trash"
            : opts.folder === "junk"
              ? "spam"
              : opts.folder === "inbox"
                ? "inbox"
                : "archive"
          : action;
      const addLabels: string[] = [];
      const removeLabels: string[] = [];
      const addFlags: string[] = [];
      const removeFlags: string[] = [];
      switch (resolved) {
        case "archive":
          removeLabels.push("\\Inbox", "\\Trash", "\\Spam");
          break;
        case "trash":
          addLabels.push("\\Trash");
          break;
        case "spam":
          addLabels.push("\\Spam");
          break;
        case "not-spam":
        case "inbox":
          addLabels.push("\\Inbox");
          removeLabels.push("\\Spam", "\\Trash");
          break;
        case "read":
          addFlags.push("\\Seen");
          // Gmail tracks unread via \\Unread as well as \\Seen.
          removeLabels.push("\\Unread");
          break;
        case "unread":
          removeFlags.push("\\Seen");
          addLabels.push("\\Unread");
          break;
        case "star":
          addFlags.push("\\Flagged");
          addLabels.push("\\Starred");
          break;
        case "unstar":
          removeFlags.push("\\Flagged");
          removeLabels.push("\\Starred");
          break;
        case "delete-forever":
          await client.messageFlagsAdd(uidStr, ["\\Deleted"], { uid: true });
          await client.messageDelete(uidStr, { uid: true });
          return;
        default:
          return;
      }
      await storeLabels(client, uidStr, addLabels, "add");
      await storeLabels(client, uidStr, removeLabels, "remove");
      if (addFlags.length) {
        const ok = await client.messageFlagsAdd(uidStr, addFlags, {
          uid: true,
        });
        if (!ok) {
          throw new Error(`Gmail IMAP did not add flags: ${addFlags.join(", ")}`);
        }
      }
      if (removeFlags.length) {
        const ok = await client.messageFlagsRemove(uidStr, removeFlags, {
          uid: true,
        });
        if (!ok) {
          throw new Error(
            `Gmail IMAP did not remove flags: ${removeFlags.join(", ")}`,
          );
        }
      }
    } finally {
      lock.release();
    }
  });
}

/** Flag + expunge so the message is removed permanently from the mailbox. */
export async function deleteImapMessageForever(
  accountId: string,
  mailbox: string,
  uid: number,
): Promise<void> {
  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
      await client.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  });
}

/**
 * Idempotency check for SMTP retries: was a message with this Message-ID
 * already copied to a Sent folder? Best-effort — providers disagree on mailbox
 * names, so failures are treated as "not found".
 */
export async function findSentMessage(
  accountId: string,
  messageId: string,
): Promise<boolean> {
  try {
    return await withImap(accountId, async (client) => {
      for (const box of SENT_MAILBOXES) {
        let lock;
        try {
          lock = await client.getMailboxLock(box);
        } catch {
          continue;
        }
        try {
          const found = await client.search(
            { header: { "message-id": messageId } },
            { uid: true },
          );
          if (found && found.length > 0) return true;
        } catch {
          /* unsupported search — try the next mailbox */
        } finally {
          lock.release();
        }
      }
      return false;
    });
  } catch {
    return false;
  }
}

export async function sendSmtp(
  accountId: string,
  draft: {
    fromName: string;
    fromEmail: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    messageId?: string;
    /** Parent Message-ID, so the recipient threads this reply. */
    inReplyTo?: string;
    /** Ancestor Message-IDs, root first, including the parent. */
    references?: string[];
    attachments?: {
      filename: string;
      contentType: string;
      contentBase64: string;
    }[];
  },
): Promise<void> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "imap") {
    throw new Error("IMAP/SMTP credentials missing");
  }
  const implicitTls = creds.smtpPort === 465;
  const transport = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: implicitTls,
    // On 587/25 a failed STARTTLS must abort rather than silently send in the
    // clear with the account password attached.
    requireTLS: !implicitTls,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
    connectionTimeout: 30_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000,
    // Attachments are inlined buffers; never let a path/URL be resolved.
    disableFileAccess: true,
    disableUrlAccess: true,
    pool: false,
  });
  try {
    await transport.sendMail({
      from: `"${draft.fromName.replace(/["\\\r\n]/g, "")}" <${draft.fromEmail}>`,
      to: draft.to.join(", "),
      cc: draft.cc?.join(", "),
      bcc: draft.bcc?.join(", "),
      subject: draft.subject || "(no subject)",
      text: draft.bodyText,
      html: draft.bodyHtml?.trim() ? draft.bodyHtml : undefined,
      messageId: draft.messageId?.replace(/^<|>$/g, ""),
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      attachments: draft.attachments?.map((a) => ({
        filename: a.filename.replace(/[\r\n"]/g, ""),
        contentType: a.contentType || "application/octet-stream",
        content: Buffer.from(a.contentBase64, "base64"),
      })),
    });
  } catch (error) {
    rethrowImapError(creds, error);
  } finally {
    transport.close();
  }
}

export function parsedToBodies(parsed: ParsedMail): {
  text: string | null;
  html: string | null;
} {
  const text = parsed.text?.trim() || null;
  const html =
    typeof parsed.html === "string" && parsed.html.trim()
      ? parsed.html
      : null;
  return { text, html };
}

export function parsedRecipients(parsed: ParsedMail): {
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  fromName: string;
  fromEmail: string;
} {
  const from = addrs(parsed.from)[0] ?? { name: "Unknown", email: "unknown" };
  return {
    fromName: from.name,
    fromEmail: from.email,
    to: addrs(parsed.to),
    cc: addrs(parsed.cc),
  };
}
