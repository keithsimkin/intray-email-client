import { BrowserWindow } from "electron";
import { noteSender } from "../avatars";
import { accountUsesImap, isGmailImapAccount } from "../crypto/credentials";
import {
  deleteMessageByProviderId,
  applyServerUnread,
  deleteRedundantMailboxRows,
  getAccountRow,
  getSyncState,
  listMessageMailboxRefs,
  oldestMailboxUid,
  recountUnread,
  upsertSyncState,
  type MessageRow,
} from "../db";
import { indexIncomingMessage, rfcFromGmail } from "../mail/threadIndex";
import {
  getMessageMeta,
  getProfile,
  listHistory,
  listMessageIds,
} from "../providers/gmail/client";
import { gmailMessageToRow } from "../providers/gmail/map";
import {
  listImapMailboxes,
  listOlderEnvelopes,
  listRecentEnvelopes,
  listStoredEnvelopeFlags,
  searchUnseenUids,
} from "../providers/imap/client";
import { imapEnvelopeToRow } from "../providers/imap/map";
import { normalizeFolderPath } from "../providers/imap/presets";
import {
  explainGmailImapError,
  gmailSyncMailboxes,
  GMAIL_FALLBACK_SYNC_MAILBOXES,
  type ListedMailbox,
  type MailboxRole,
  type SyncMailbox,
} from "../../shared/gmailImap";

function rememberSender(row: MessageRow): void {
  if (!row.from_email) return;
  noteSender(row.from_email, row.from_name);
}

const INITIAL_PAGE_SIZE = 50;
const INITIAL_MAX_MESSAGES = 400;
const IMAP_INBOX_LIMIT = 400;
/** One scroll backward. The forward cursor is left where it is. */
const OLDER_FETCH = 120;
const OLDER_UID_SPAN = 800;
const OLDER_EMPTY_PROBES = 8;
const EMAIL_CONCURRENCY = 5;

/**
 * Poll cadence. Push (IDLE / Gmail watch) is a later phase; a 30s incremental
 * poll with exponential backoff keeps new mail within a few seconds of the
 * previous sync without burning provider quota on failing accounts.
 */
const BASE_POLL_MS = 30_000;
const MAX_POLL_MS = 15 * 60_000;
/** Exported for callers that slow polling while IDLE is connected. */
export const DEFAULT_POLL_MS = BASE_POLL_MS;

type ImapCursor = Record<string, { uidValidity: number; lastUid: number }>;

const inFlight = new Map<string, Promise<void>>();

type Poller = {
  timer: NodeJS.Timeout | null;
  failures: number;
  stopped: boolean;
  intervalMs: number;
};
const pollers = new Map<string, Poller>();

function jitter(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

function emitSync(payload: {
  accountId: string;
  state: string;
  lastSyncAt: string | null;
  error?: string;
  progress?: string;
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("sync:progress", payload);
  }
}

function setStatus(
  accountId: string,
  patch: {
    status: string;
    error?: string | null;
    progress?: string | null;
    historyId?: string | null;
    lastSyncAt?: string | null;
    imapCursorJson?: string | null;
  },
): void {
  const prev = getSyncState(accountId);
  const row = {
    account_id: accountId,
    history_id: patch.historyId ?? prev?.history_id ?? null,
    last_sync_at: patch.lastSyncAt ?? prev?.last_sync_at ?? null,
    status: patch.status,
    error: patch.error === undefined ? (prev?.error ?? null) : patch.error,
    progress:
      patch.progress === undefined ? (prev?.progress ?? null) : patch.progress,
    imap_cursor_json:
      patch.imapCursorJson === undefined
        ? (prev?.imap_cursor_json ?? null)
        : patch.imapCursorJson,
  };
  upsertSyncState(row);
  emitSync({
    accountId,
    state: row.status,
    lastSyncAt: row.last_sync_at,
    error: row.error ?? undefined,
    progress: row.progress ?? undefined,
  });
}

function parseImapCursor(raw: string | null | undefined): ImapCursor {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ImapCursor;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
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

async function ingestGmailIds(
  accountId: string,
  ids: { id: string }[],
  onProgress?: (n: number, total: number) => void,
): Promise<void> {
  let done = 0;
  await mapLimit(ids, EMAIL_CONCURRENCY, async ({ id }) => {
    try {
      const meta = await getMessageMeta(accountId, id);
      const row = gmailMessageToRow(accountId, meta);
      const headers = rfcFromGmail(meta);
      indexIncomingMessage(
        row,
        {
          messageId: headers.rfcMessageId,
          inReplyTo: headers.inReplyTo,
          references: headers.references,
        },
        { providerThread: true },
      );
      rememberSender(row);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Messages deleted between list and fetch are expected; auth/quota
      // failures must abort so the account shows an error instead of "idle".
      if (/→ (401|403|429|500|502|503|504)/.test(message)) throw e;
    } finally {
      done += 1;
      onProgress?.(done, ids.length);
    }
  });
}

async function runSync(accountId: string): Promise<void> {
  const account = getAccountRow(accountId);
  if (!account) throw new Error("Account not found");

  setStatus(accountId, {
    status: "syncing",
    error: null,
    progress: "Starting…",
  });
  try {
    if (accountUsesImap(accountId, account.provider)) {
      await syncImap(accountId);
    } else {
      await syncGmail(accountId);
    }
    recountUnread(accountId);
    setStatus(accountId, {
      status: "idle",
      error: null,
      progress: null,
      lastSyncAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(accountId, { status: "error", error: msg, progress: null });
    throw e;
  }
}

/** Coalesce concurrent syncs for the same account into one network pass. */
export function syncAccount(accountId: string): Promise<void> {
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const task = runSync(accountId).finally(() => {
    inFlight.delete(accountId);
  });
  inFlight.set(accountId, task);
  return task;
}

async function syncGmail(accountId: string): Promise<void> {
  const state = getSyncState(accountId);
  if (state?.history_id) {
    await incrementalGmail(accountId, state.history_id);
  } else {
    await initialGmail(accountId);
  }
  const profile = await getProfile(accountId);
  setStatus(accountId, { status: "syncing", historyId: profile.historyId });
}

async function initialGmail(accountId: string): Promise<void> {
  setStatus(accountId, { status: "syncing", progress: "Listing inbox…" });
  const collected: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  while (collected.length < INITIAL_MAX_MESSAGES) {
    const page = await listMessageIds(accountId, {
      labelIds: ["INBOX"],
      maxResults: INITIAL_PAGE_SIZE,
      pageToken,
    });
    for (const m of page.messages ?? []) collected.push(m);
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  const sent = await listMessageIds(accountId, {
    labelIds: ["SENT"],
    maxResults: 30,
  });
  const seen = new Set(collected.map((m) => m.id));
  for (const m of sent.messages ?? []) {
    if (!seen.has(m.id)) collected.push(m);
  }

  setStatus(accountId, {
    status: "syncing",
    progress: `Fetching ${collected.length} messages…`,
  });
  await ingestGmailIds(accountId, collected, (n, total) => {
    if (n % 10 === 0 || n === total) {
      setStatus(accountId, {
        status: "syncing",
        progress: `Fetched ${n}/${total}`,
      });
    }
  });
}

async function incrementalGmail(
  accountId: string,
  startHistoryId: string,
): Promise<void> {
  setStatus(accountId, { status: "syncing", progress: "Checking history…" });
  let pageToken: string | undefined;
  const toFetch = new Set<string>();
  const toDelete = new Set<string>();

  try {
    do {
      const page = await listHistory(accountId, startHistoryId, pageToken);
      for (const h of page.history ?? []) {
        for (const a of h.messagesAdded ?? []) toFetch.add(a.message.id);
        for (const d of h.messagesDeleted ?? []) toDelete.add(d.message.id);
        for (const a of h.labelsAdded ?? []) toFetch.add(a.message.id);
        for (const r of h.labelsRemoved ?? []) toFetch.add(r.message.id);
      }
      pageToken = page.nextPageToken;
      if (page.historyId) {
        setStatus(accountId, {
          status: "syncing",
          historyId: page.historyId,
          progress: `Updating ${toFetch.size} messages…`,
        });
      }
    } while (pageToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.includes("historyId")) {
      setStatus(accountId, {
        status: "syncing",
        historyId: null,
        progress: "History expired — full sync…",
      });
      await initialGmail(accountId);
      return;
    }
    throw e;
  }

  for (const id of toDelete) {
    deleteMessageByProviderId(accountId, id);
    toFetch.delete(id);
  }
  await ingestGmailIds(
    accountId,
    [...toFetch].map((id) => ({ id })),
  );
}

const IMAP_MAILBOXES: SyncMailbox[] = [
  { path: "INBOX", role: "inbox" },
  { path: "Sent", role: "sent" },
  { path: "Sent Messages", role: "sent" },
  { path: "Sent Items", role: "sent" },
];

/**
 * Gmail label/star/archive changes produce no new UID, so a short sequence
 * window has to be re-read to notice them. Doing that on every 30s poll was
 * expensive (80 envelopes per pass); five minutes is plenty for label churn.
 */
const RECENT_REFRESH_MIN_MS = 5 * 60_000;
const recentRefreshAt = new Map<string, number>();

/** Recent-window size for this pass, or 0 when the refresh is not due yet. */
function recentRefreshBudget(
  accountId: string,
  box: SyncMailbox,
  gmail: boolean,
  hasCursor: boolean,
): number {
  if (!gmail || !hasCursor) return 0;
  const key = `${accountId}:${box.path}`;
  const now = Date.now();
  const last = recentRefreshAt.get(key) ?? 0;
  if (now - last < RECENT_REFRESH_MIN_MS) return 0;
  recentRefreshAt.set(key, now);
  return box.role === "all" ? 80 : 20;
}

/**
 * Full flag reconciliation cadence. Reading mail in Gmail's web UI (or any
 * other client) changes no UIDs, so without re-reading the flags of messages
 * we already stored, an old message stays unread in Intray forever.
 */
const RECONCILE_MIN_MS = 5 * 60_000;
const reconcileAt = new Map<string, number>();

function reconcileDue(accountId: string): boolean {
  const now = Date.now();
  const last = reconcileAt.get(accountId) ?? 0;
  if (now - last < RECONCILE_MIN_MS) return false;
  reconcileAt.set(accountId, now);
  return true;
}

/** Mailbox role for a stored row, including mailboxes we no longer sync. */
function storedMailboxRole(path: string, targets: SyncMailbox[]): MailboxRole {
  const target = targets.find((box) => box.path === path);
  if (target) return target.role;
  switch (normalizeFolderPath(path)) {
    case "sent":
      return "sent";
    case "drafts":
      return "drafts";
    case "junk":
      return "junk";
    case "trash":
      return "trash";
    case "inbox":
      return "inbox";
    default:
      return "other";
  }
}

/**
 * Re-read flags/labels for every stored IMAP message, grouped by mailbox.
 * Bounded by how much mail the local store actually keeps.
 */
async function reconcileImapFlags(
  accountId: string,
  gmail: boolean,
  targets: SyncMailbox[],
): Promise<void> {
  const byMailbox = new Map<string, number[]>();
  for (const ref of listMessageMailboxRefs(accountId)) {
    const uids = byMailbox.get(ref.mailbox) ?? [];
    uids.push(ref.uid);
    byMailbox.set(ref.mailbox, uids);
  }

  for (const [mailbox, uids] of byMailbox) {
    try {
      const envelopes = await listStoredEnvelopeFlags(accountId, {
        mailbox,
        uids,
        gmail,
        role: storedMailboxRole(mailbox, targets),
      });
      for (const env of envelopes) {
        const row = imapEnvelopeToRow(accountId, env);
        indexIncomingMessage(
          row,
          {
            messageId: env.messageId,
            inReplyTo: env.inReplyTo,
            references: env.references,
          },
          { providerThread: Boolean(env.gmThrId), flagsOnly: true },
        );
      }
    } catch {
      // Mailbox removed or renamed since it was indexed: leave those rows
      // alone rather than failing the whole sync pass.
    }
  }
}

/** Resolved mailbox targets are stable; LIST on every poll is wasted I/O. */
const imapTargetsCache = new Map<string, { at: number; targets: SyncMailbox[] }>();
const IMAP_TARGETS_TTL_MS = 10 * 60_000;

function specialUse(listed: ListedMailbox[], use: string): ListedMailbox | undefined {
  return listed.find(
    (box) => (box.specialUse ?? "").replace(/^\\+/, "").toLowerCase() === use,
  );
}

/**
 * Non-Gmail servers: trust SPECIAL-USE from LIST, fall back to common names so
 * we stop probing four hardcoded Sent spellings (two of which do not exist on
 * most accounts) on every single poll.
 */
function genericImapMailboxes(listed: ListedMailbox[]): SyncMailbox[] {
  const inbox =
    listed.find((box) => box.path.toUpperCase() === "INBOX") ??
    specialUse(listed, "inbox");
  const out: SyncMailbox[] = [{ path: inbox?.path ?? "INBOX", role: "inbox" }];
  const wanted: { role: MailboxRole; names: RegExp }[] = [
    { role: "sent", names: /(^|[./])(sent|sent items|sent messages|gesendet|envoy)/i },
    { role: "drafts", names: /(^|[./])(drafts?|entw(ü|u)rfe|brouillons)/i },
    { role: "junk", names: /(^|[./])(junk|spam)/i },
    { role: "trash", names: /(^|[./])(trash|deleted|bin|papierkorb|corbeille)/i },
  ];
  for (const { role, names } of wanted) {
    const box = specialUse(listed, role) ?? listed.find((b) => names.test(b.path));
    if (box && box.path.toUpperCase() !== "INBOX") {
      out.push({ path: box.path, role });
    }
  }
  return out;
}

async function imapTargets(accountId: string, gmail: boolean): Promise<SyncMailbox[]> {
  const cached = imapTargetsCache.get(accountId);
  if (cached && Date.now() - cached.at < IMAP_TARGETS_TTL_MS) {
    return cached.targets;
  }
  let targets: SyncMailbox[] | null = null;
  try {
    const listed = await listImapMailboxes(accountId);
    if (listed.length) {
      const gmailBoxes = gmail ? gmailSyncMailboxes(listed) : [];
      targets = gmail
        ? (gmailBoxes.length ? gmailBoxes : null)
        : genericImapMailboxes(listed);
    }
  } catch {
    /* LIST failed — fall back to the English names below. */
  }
  if (!targets || !targets.length) {
    targets = gmail ? GMAIL_FALLBACK_SYNC_MAILBOXES : IMAP_MAILBOXES;
  }
  imapTargetsCache.set(accountId, { at: Date.now(), targets });
  return targets;
}

function surfaceImapError(gmail: boolean, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!gmail) return message;
  return explainGmailImapError(error) ?? explainGmailImapError(message) ?? message;
}

function mailboxIsCritical(box: SyncMailbox, targets: SyncMailbox[]): boolean {
  if (targets.some((target) => target.role === "all")) return box.role === "all";
  return box.role === "inbox" || box.path.toUpperCase() === "INBOX";
}

/**
 * Make local unread match the server. Gmail is asked for unseen mail that is
 * still in the inbox (All Mail UIDs). Every other inbox, including leftover
 * Gmail INBOX copies, is an ordinary UNSEEN search. A rejected search leaves
 * local state alone.
 */
async function syncServerReadState(
  accountId: string,
  gmail: boolean,
  targets: SyncMailbox[],
): Promise<void> {
  const boxes = new Map<string, { gmailInbox: boolean }>();
  for (const box of targets) {
    if (gmail && box.role === "all") boxes.set(box.path, { gmailInbox: true });
    else if (box.role === "inbox" || box.path.toUpperCase() === "INBOX") {
      boxes.set(box.path, { gmailInbox: false });
    }
  }
  if (gmail) {
    for (const ref of listMessageMailboxRefs(accountId)) {
      if (ref.mailbox.toUpperCase() === "INBOX" && !boxes.has(ref.mailbox)) {
        boxes.set(ref.mailbox, { gmailInbox: false });
      }
    }
  }

  for (const [mailbox, opts] of boxes) {
    try {
      const uids = await searchUnseenUids(accountId, mailbox, opts);
      if (!uids) continue;
      applyServerUnread(
        accountId,
        mailbox,
        new Set(uids),
        opts.gmailInbox ? "gmail-inbox" : "mailbox",
      );
    } catch {
      // Connection or search failed. Keep the previous read bits.
    }
  }
}

async function syncImap(accountId: string): Promise<void> {
  setStatus(accountId, {
    status: "syncing",
    progress: "Connecting via IMAP…",
  });

  const gmail = isGmailImapAccount(accountId);
  const targets = await imapTargets(accountId, gmail);
  const state = getSyncState(accountId);
  const cursor = parseImapCursor(state?.imap_cursor_json);
  // Only keep cursors for mailboxes we still sync; failed passes carry theirs
  // over so mail is never skipped.
  const nextCursor: ImapCursor = { ...cursor };
  let total = 0;
  let failures = 0;
  let lastError: string | null = null;
  let criticalError: string | null = null;

  for (const box of targets) {
    const prior = cursor[box.path];
    try {
      setStatus(accountId, {
        status: "syncing",
        progress: `Syncing ${box.path}…`,
      });
      const slice = await listRecentEnvelopes(accountId, {
        mailbox: box.path,
        role: box.role,
        gmail,
        limit:
          box.role === "inbox" || box.role === "all" ? IMAP_INBOX_LIMIT : 40,
        sinceUid: prior?.lastUid,
        sinceUidValidity: prior?.uidValidity,
        // Recent All Mail changes labels (archive, star) without a new UID.
        refreshRecent: recentRefreshBudget(
          accountId,
          box,
          gmail,
          prior?.lastUid != null,
        ),
      });
      for (const env of slice.envelopes) {
        const row = imapEnvelopeToRow(accountId, env);
        const wrote = indexIncomingMessage(
          row,
          {
            messageId: env.messageId,
            inReplyTo: env.inReplyTo,
            references: env.references,
          },
          {
            providerThread: Boolean(env.gmThrId),
            flagsOnly: env.partial === true,
          },
        );
        if (!wrote) continue;
        if (!env.partial) rememberSender(row);
        total += 1;
      }
      nextCursor[box.path] = {
        uidValidity: slice.uidValidity,
        lastUid: slice.highestUid,
      };
      setStatus(accountId, {
        status: "syncing",
        progress: `Indexed ${total} messages`,
        imapCursorJson: JSON.stringify(nextCursor),
      });
    } catch (e) {
      // Keep the previous cursor for this mailbox so the next pass retries the
      // same UID window instead of skipping mail.
      if (prior) nextCursor[box.path] = prior;
      else delete nextCursor[box.path];
      failures += 1;
      lastError = surfaceImapError(gmail, e);
      if (mailboxIsCritical(box, targets)) criticalError = lastError;
    }
  }

  // Drop cursors for mailboxes that are no longer part of the target list
  // (renamed or removed folders used to linger forever).
  for (const path of Object.keys(nextCursor)) {
    if (!targets.some((box) => box.path === path)) delete nextCursor[path];
  }

  // Read/star changes made elsewhere produce no new UID, so re-read the flags
  // of what we already store. Gmail also drops duplicate copies left behind by
  // an older sync that indexed a different mailbox for the same message.
  try {
    if (gmail && targets.some((box) => box.role === "all")) {
      deleteRedundantMailboxRows(
        accountId,
        targets.map((box) => box.path),
      );
    }
    if (reconcileDue(accountId)) {
      await reconcileImapFlags(accountId, gmail, targets);
    }
  } catch {
    // Flag refresh is best-effort. The unseen search below is what the badge uses.
  }
  // Authoritative read bit: the server's UNSEEN set, not "never opened here".
  await syncServerReadState(accountId, gmail, targets);

  // A failing Sent folder shouldn't mask a healthy inbox, but a failing inbox
  // (or Gmail All Mail) must surface as an account error so the poller backs
  // off and the UI shows that new mail may be missing — never a false "idle".
  if (criticalError) {
    setStatus(accountId, {
      status: "syncing",
      imapCursorJson: JSON.stringify(nextCursor),
    });
    throw new Error(criticalError);
  }
  if (failures === targets.length) {
    throw new Error(lastError ?? "IMAP sync failed");
  }

  setStatus(accountId, {
    status: "syncing",
    progress: `Indexed ${total} messages`,
    historyId: `imap:${Date.now()}`,
    imapCursorJson: JSON.stringify(nextCursor),
  });
}

/**
 * Lowest UID already considered for a mailbox. Empty spans don't store a row,
 * so the stored minimum alone would probe the same hole forever.
 */
const olderFloor = new Map<string, { uid: number; uidValidity: number }>();

function mailboxForBackfill(
  targets: SyncMailbox[],
  folder: string,
): SyncMailbox | null {
  if (folder === "inbox") {
    return (
      targets.find((box) => box.role === "all") ??
      targets.find((box) => box.role === "inbox") ??
      null
    );
  }
  const direct = targets.find((box) => box.role === folder);
  if (direct) return direct;
  // Gmail keeps Sent and Drafts inside All Mail.
  if (folder === "sent" || folder === "drafts") {
    return targets.find((box) => box.role === "all") ?? null;
  }
  return null;
}

/**
 * Index the next older window of one mailbox. Does not move the forward
 * IMAP cursor, so the regular poll keeps fetching only new mail.
 */
export async function backfillOlderMail(
  accountId: string,
  folder: string,
): Promise<{ added: number; exhausted: boolean }> {
  if (folder === "snoozed" || folder.startsWith("label:")) {
    return { added: 0, exhausted: true };
  }
  const gmail = isGmailImapAccount(accountId);
  const targets = await imapTargets(accountId, gmail);
  const box = mailboxForBackfill(targets, folder);
  if (!box) return { added: 0, exhausted: true };

  const stored = oldestMailboxUid(accountId, box.path);
  if (!stored) return { added: 0, exhausted: true };

  const key = `${accountId}\0${box.path}`;
  const probed = olderFloor.get(key);
  const probeUid =
    probed && probed.uidValidity === stored.uidValidity ? probed.uid : null;
  const before = Math.min(stored.uid, probeUid ?? stored.uid);
  if (before <= 1) return { added: 0, exhausted: true };

  const slice = await listOlderEnvelopes(accountId, {
    mailbox: box.path,
    beforeUid: before,
    uidValidity: stored.uidValidity,
    limit: OLDER_FETCH,
    span: OLDER_UID_SPAN,
    emptyProbes: OLDER_EMPTY_PROBES,
    gmail,
    role: box.role,
  });
  olderFloor.set(key, {
    uid: slice.nextBefore,
    uidValidity: slice.uidValidity || stored.uidValidity,
  });

  let added = 0;
  for (const env of slice.envelopes) {
    const row = imapEnvelopeToRow(accountId, env);
    const wrote = indexIncomingMessage(
      row,
      {
        messageId: env.messageId,
        inReplyTo: env.inReplyTo,
        references: env.references,
      },
      { providerThread: Boolean(env.gmThrId) },
    );
    if (!wrote || env.partial) continue;
    rememberSender(row);
    added += 1;
  }
  if (added) recountUnread(accountId);
  return { added, exhausted: slice.exhausted };
}

export function startAccountPolling(
  accountId: string,
  intervalMs = BASE_POLL_MS,
): void {
  stopAccountPolling(accountId);
  const poller: Poller = {
    timer: null,
    failures: 0,
    stopped: false,
    intervalMs,
  };
  pollers.set(accountId, poller);

  function schedule(delayMs: number): void {
    if (poller.stopped) return;
    poller.timer = setTimeout(() => {
      void tick();
    }, Math.max(0, delayMs));
  }

  async function tick(): Promise<void> {
    if (poller.stopped) return;
    try {
      await syncAccount(accountId);
      poller.failures = 0;
      schedule(jitter(poller.intervalMs));
    } catch {
      // Status is already recorded; back off so a broken account stops
      // hammering the provider (and triggering lockouts) every 30 seconds.
      poller.failures += 1;
      const delay = Math.min(
        poller.intervalMs * 2 ** Math.min(poller.failures, 5),
        MAX_POLL_MS,
      );
      schedule(jitter(delay));
    }
  }

  // Sync shortly after start/app launch, staggered across accounts.
  schedule(400 + Math.random() * 1200);
}

/**
 * Change cadence without restarting the poller. With IMAP IDLE connected the
 * poll is only a safety net, so it can run minutes apart instead of 30s. The
 * new interval applies from the next scheduled pass.
 */
export function setAccountPollInterval(
  accountId: string,
  intervalMs: number,
): void {
  const poller = pollers.get(accountId);
  if (!poller) {
    startAccountPolling(accountId, intervalMs);
    return;
  }
  poller.intervalMs = intervalMs;
}

export function stopAccountPolling(accountId: string): void {
  const poller = pollers.get(accountId);
  if (poller) {
    poller.stopped = true;
    if (poller.timer) clearTimeout(poller.timer);
  }
  pollers.delete(accountId);
}

export function startPollingAll(accountIds: string[]): void {
  for (const id of accountIds) startAccountPolling(id);
}

export function stopAllPolling(): void {
  for (const id of [...pollers.keys()]) stopAccountPolling(id);
}
