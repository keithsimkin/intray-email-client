import { ImapFlow } from "imapflow";
import { imapConnectionOptions } from "../providers/imap/client";
import { loadCredentials } from "../crypto/credentials";
import {
  DEFAULT_POLL_MS,
  setAccountPollInterval,
  syncAccount,
} from "./engine";

/**
 * IMAP IDLE watcher.
 *
 * imapflow puts an idle connection into IDLE on its own; all we have to do is
 * keep one mailbox open and listen for `exists` / `expunge` / `flags`. New mail
 * then shows up within a second or two instead of waiting for the next poll.
 *
 * The watcher owns its own socket, never fetches anything, and only fires a
 * debounced sync. The normal 30s poll stays running as a safety net but slows
 * down to five minutes while IDLE is connected, and snaps back to 30s the
 * moment the watcher drops.
 */

type Watch = {
  client: ImapFlow;
  stopped: boolean;
  retry: NodeJS.Timeout | null;
};

const watches = new Map<string, Watch>();
const starting = new Set<string>();
const RETRY_MIN_MS = 60_000;
const RETRY_MAX_MS = 15 * 60_000;
const EVENT_DEBOUNCE_MS = 1_500;
/** Safety-net poll while IDLE is connected. */
const SAFETY_POLL_MS = 5 * 60_000;
/** Servers drop idle sessions; re-issue IDLE well inside the usual 30 min. */
const MAX_IDLE_MS = 29 * 60_000;

async function connect(
  accountId: string,
  attempt = 0,
): Promise<boolean> {
  const existing = watches.get(accountId);
  if (existing && !existing.stopped) return true;
  if (starting.has(accountId)) return false;
  starting.add(accountId);

  try {
    const creds = loadCredentials(accountId);
    if (!creds || creds.provider !== "imap") return false;

    const client = new ImapFlow({
      ...imapConnectionOptions(creds),
      maxIdleTime: MAX_IDLE_MS,
    });
    const entry: Watch = { client, stopped: false, retry: null };

    try {
      await client.connect();
      // INBOX exists on every IMAP server and is where new mail lands. Label and
      // Sent changes are picked up by the slow safety poll.
      await client.mailboxOpen("INBOX");
    } catch {
      try {
        client.close();
      } catch {
        /* already closed */
      }
      // Try again later; the caller keeps normal polling meanwhile.
      const retry = setTimeout(() => {
        void connect(accountId, attempt + 1);
      }, Math.min(RETRY_MIN_MS * 2 ** attempt, RETRY_MAX_MS));
      retry.unref?.();
      watches.set(accountId, { client, stopped: true, retry });
      return false;
    }

    let debounce: NodeJS.Timeout | null = null;
    const trigger = () => {
      if (entry.stopped) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (!entry.stopped) void syncAccount(accountId).catch(() => undefined);
      }, EVENT_DEBOUNCE_MS);
      debounce.unref?.();
    };

    const drop = () => {
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      if (entry.stopped) return;
      entry.stopped = true;
      watches.delete(accountId);
      try {
        client.close();
      } catch {
        /* already closed */
      }
      // Back to normal polling until IDLE is back.
      setAccountPollInterval(accountId, DEFAULT_POLL_MS);
      attempt += 1;
      const retry = setTimeout(() => {
        void connect(accountId, attempt);
      }, Math.min(RETRY_MIN_MS * 2 ** (attempt - 1), RETRY_MAX_MS));
      retry.unref?.();
      watches.set(accountId, { client, stopped: true, retry });
    };

    client.on("exists", trigger);
    client.on("expunge", trigger);
    client.on("flags", trigger);
    client.on("close", drop);
    client.on("error", drop);

    watches.set(accountId, entry);
    setAccountPollInterval(accountId, SAFETY_POLL_MS);
    return true;
  } finally {
    starting.delete(accountId);
  }
}

/** Start (or reuse) the IDLE watcher for an account. Fire-and-forget safe. */
export function startMailWatch(accountId: string): void {
  const existing = watches.get(accountId);
  if (existing && !existing.stopped) return;
  if (starting.has(accountId)) return;
  if (existing?.retry) clearTimeout(existing.retry);
  if (existing) {
    existing.stopped = true;
    watches.delete(accountId);
  }
  void connect(accountId).catch(() => {
    starting.delete(accountId);
  });
}

export function stopMailWatch(accountId: string): void {
  const entry = watches.get(accountId);
  if (!entry) return;
  entry.stopped = true;
  if (entry.retry) clearTimeout(entry.retry);
  entry.retry = null;
  starting.delete(accountId);
  watches.delete(accountId);
  try {
    entry.client.close();
  } catch {
    /* already closed */
  }
}

export function stopAllWatches(): void {
  for (const accountId of [...watches.keys()]) stopMailWatch(accountId);
}
