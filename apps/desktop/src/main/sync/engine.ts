import { BrowserWindow } from "electron";
import {
  deleteMessageByProviderId,
  getAccountRow,
  getSyncState,
  recountUnread,
  upsertMessage,
  upsertSyncState,
} from "../db";
import {
  getMessageMeta,
  getProfile,
  listHistory,
  listMessageIds,
} from "../providers/gmail/client";
import { gmailMessageToRow } from "../providers/gmail/map";
import { accountUsesImap, isGmailImapAccount } from "../crypto/credentials";
import { listImapMailboxes, listRecentEnvelopes } from "../providers/imap/client";
import { imapEnvelopeToRow } from "../providers/imap/map";
import {
  explainGmailImapError,
  gmailSyncMailboxes,
  GMAIL_FALLBACK_SYNC_MAILBOXES,
  type SyncMailbox,
} from "../../shared/gmailImap";

const INITIAL_PAGE_SIZE = 50;
const INITIAL_MAX_MESSAGES = 200;
const IMAP_INBOX_LIMIT = 120;
const EMAIL_CONCURRENCY = 5;

/**
 * Poll cadence. Push (IDLE / Gmail watch) is a later phase; a 30s incremental
 * poll with exponential backoff keeps new mail within a few seconds of the
 * previous sync without burning provider quota on failing accounts.
 */
const BASE_POLL_MS = 30_000;
const MAX_POLL_MS = 15 * 60_000;

type ImapCursor = Record<string, { uidValidity: number; lastUid: number }>;

const inFlight = new Map<string, Promise<void>>();

type Poller = {
  timer: NodeJS.Timeout | null;
  failures: number;
  stopped: boolean;
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
      upsertMessage(gmailMessageToRow(accountId, meta));
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

function surfaceImapError(gmail: boolean, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!gmail) return message;
  return explainGmailImapError(error) ?? explainGmailImapError(message) ?? message;
}

async function imapTargets(accountId: string, gmail: boolean): Promise<SyncMailbox[]> {
  if (!gmail) return IMAP_MAILBOXES;
  try {
    const listed = await listImapMailboxes(accountId);
    const targets = gmailSyncMailboxes(listed);
    if (targets.length) return targets;
  } catch {
    /* LIST failed — try the English Gmail names below. */
  }
  return GMAIL_FALLBACK_SYNC_MAILBOXES;
}

function mailboxIsCritical(box: SyncMailbox, targets: SyncMailbox[]): boolean {
  if (targets.some((target) => target.role === "all")) return box.role === "all";
  return box.role === "inbox" || box.path.toUpperCase() === "INBOX";
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
        refreshRecent: gmail ? (box.role === "all" ? 80 : 20) : 0,
      });
      for (const env of slice.envelopes) {
        upsertMessage(imapEnvelopeToRow(accountId, env));
        total += 1;
      }
      cursor[box.path] = {
        uidValidity: slice.uidValidity,
        lastUid: slice.highestUid,
      };
      setStatus(accountId, {
        status: "syncing",
        progress: `Indexed ${total} messages`,
        imapCursorJson: JSON.stringify(cursor),
      });
    } catch (e) {
      // Keep the previous cursor for this mailbox so the next pass retries the
      // same UID window instead of skipping mail.
      failures += 1;
      lastError = surfaceImapError(gmail, e);
      if (mailboxIsCritical(box, targets)) criticalError = lastError;
    }
  }

  // A failing Sent folder shouldn't mask a healthy inbox, but a failing inbox
  // (or Gmail All Mail) must surface as an account error so the poller backs
  // off and the UI shows that new mail may be missing — never a false "idle".
  if (criticalError) throw new Error(criticalError);
  if (failures === targets.length) {
    throw new Error(lastError ?? "IMAP sync failed");
  }

  setStatus(accountId, {
    status: "syncing",
    progress: `Indexed ${total} messages`,
    historyId: `imap:${Date.now()}`,
    imapCursorJson: JSON.stringify(cursor),
  });
}

export function startAccountPolling(
  accountId: string,
  intervalMs = BASE_POLL_MS,
): void {
  stopAccountPolling(accountId);
  const poller: Poller = { timer: null, failures: 0, stopped: false };
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
      schedule(jitter(intervalMs));
    } catch {
      // Status is already recorded; back off so a broken account stops
      // hammering the provider (and triggering lockouts) every 30 seconds.
      poller.failures += 1;
      const delay = Math.min(
        intervalMs * 2 ** Math.min(poller.failures, 5),
        MAX_POLL_MS,
      );
      schedule(jitter(delay));
    }
  }

  // Sync shortly after start/app launch, staggered across accounts.
  schedule(400 + Math.random() * 1200);
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
