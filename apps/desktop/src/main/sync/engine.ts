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
import { listRecentEnvelopes } from "../providers/imap/client";
import { imapEnvelopeToRow } from "../providers/imap/map";

const INITIAL_PAGE_SIZE = 50;
const INITIAL_MAX_MESSAGES = 200;
const IMAP_INBOX_LIMIT = 120;
const pollTimers = new Map<string, NodeJS.Timeout>();

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

async function ingestGmailIds(
  accountId: string,
  ids: { id: string }[],
  onProgress?: (n: number, total: number) => void,
): Promise<void> {
  let i = 0;
  for (const { id } of ids) {
    const meta = await getMessageMeta(accountId, id);
    upsertMessage(gmailMessageToRow(accountId, meta));
    i += 1;
    onProgress?.(i, ids.length);
  }
}

export async function syncAccount(accountId: string): Promise<void> {
  const account = getAccountRow(accountId);
  if (!account) throw new Error("Account not found");

  setStatus(accountId, {
    status: "syncing",
    error: null,
    progress: "Starting…",
  });
  try {
    if (account.provider === "gmail") {
      await syncGmail(accountId);
    } else {
      await syncImap(accountId);
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

async function syncImap(accountId: string): Promise<void> {
  setStatus(accountId, {
    status: "syncing",
    progress: "Connecting via IMAP…",
  });

  const mailboxes = ["INBOX", "Sent", "Sent Messages", "Sent Items"];
  let total = 0;

  for (const box of mailboxes) {
    try {
      setStatus(accountId, {
        status: "syncing",
        progress: `Syncing ${box}…`,
      });
      const envs = await listRecentEnvelopes(accountId, {
        mailbox: box,
        limit: box.toUpperCase() === "INBOX" ? IMAP_INBOX_LIMIT : 40,
      });
      for (const env of envs) {
        upsertMessage(imapEnvelopeToRow(accountId, env));
        total += 1;
      }
    } catch {
      // Mailbox may not exist on this provider — skip
    }
  }

  setStatus(accountId, {
    status: "syncing",
    progress: `Indexed ${total} messages`,
    historyId: `imap:${Date.now()}`,
  });
}

export function startAccountPolling(
  accountId: string,
  intervalMs = 60_000,
): void {
  stopAccountPolling(accountId);
  const tick = () => {
    void syncAccount(accountId).catch(() => {
      /* status already recorded */
    });
  };
  pollTimers.set(accountId, setInterval(tick, intervalMs));
}

export function stopAccountPolling(accountId: string): void {
  const t = pollTimers.get(accountId);
  if (t) clearInterval(t);
  pollTimers.delete(accountId);
}

export function startPollingAll(accountIds: string[]): void {
  for (const id of accountIds) startAccountPolling(id);
}

export function stopAllPolling(): void {
  for (const id of [...pollTimers.keys()]) stopAccountPolling(id);
}
