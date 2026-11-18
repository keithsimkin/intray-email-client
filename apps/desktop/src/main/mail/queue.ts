import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import {
  cancelSendQueue,
  claimSend,
  enqueueSend,
  getAccountRow,
  getSendQueueRow,
  listDueSends,
  listDueSnoozes,
  markSendFailed,
  markSendRetry,
  markSendSent,
  nextSendDueMs,
  nextSnoozeDueMs,
  recoverStaleSends,
  setSendQueueMessageId,
  updateMessageFlags,
} from "../db";
import type { ComposeDraft, QueuedSendResult } from "../../shared/types";
import { buildMessageId } from "./mime";
import { sendMail } from "./service";

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 15 * 60_000;
/** Nothing scheduled → poll this often. Real work sets an exact wakeup instead. */
const IDLE_TICK_MS = 15_000;
const MIN_TICK_MS = 250;
/** A claimed row older than this is assumed to belong to a dead process. */
const SEND_LOCK_MS = 3 * 60_000;
const MAX_SCHEDULE_SECONDS = 365 * 24 * 60 * 60;

let timer: NodeJS.Timeout | null = null;
let flushing = false;
let started = false;

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

export function enqueueDelayedSend(
  draft: ComposeDraft,
  delaySeconds: number,
): QueuedSendResult {
  const seconds = Number.isFinite(delaySeconds)
    ? Math.min(Math.max(0, Math.floor(delaySeconds)), MAX_SCHEDULE_SECONDS)
    : 0;
  const id = `queue-${randomUUID().slice(0, 10)}`;
  const sendAtMs = Date.now() + seconds * 1000;
  const accountEmail = getAccountRow(draft.accountId)?.email;
  enqueueSend({
    id,
    account_id: draft.accountId,
    draft_json: JSON.stringify(draft),
    send_at_ms: sendAtMs,
    created_at: new Date().toISOString(),
    status: "pending",
    message_id: buildMessageId(accountEmail ?? "intray@localhost", id),
  });
  ensureQueueLoop();
  return { queueId: id, sendAtMs };
}

export function cancelQueuedSend(queueId: string): boolean {
  const ok = cancelSendQueue(queueId);
  if (ok) broadcast("mail:sendCancelled", { queueId });
  return ok;
}

/** 4xx / network problems are worth retrying; bad auth or bad recipients are not. */
export function isPermanentSendFailure(error: unknown): boolean {
  const err = error as Error & { responseCode?: number; code?: string };
  if (typeof err?.responseCode === "number") {
    return err.responseCode >= 500;
  }
  const code = (err?.code ?? "").toUpperCase();
  if (["EAUTH", "EENVELOPE", "EMESSAGE", "EACCES", "EPERM"].includes(code)) {
    return true;
  }
  const message = (err?.message ?? String(error)).toLowerCase();
  if (/gmail api .*→ (400|401|403)/.test(message)) return true;
  if (
    /(credentials?|account) (missing|not found)|authentication failed|invalid (recipient|address)|mailbox unavailable|no recipients?/.test(
      message,
    )
  ) {
    return true;
  }
  return false;
}

function backoffMs(attempts: number): number {
  const base = Math.min(
    BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1),
    MAX_BACKOFF_MS,
  );
  // Jitter avoids a retry stampede after the machine wakes from sleep.
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

async function flushDue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  const now = Date.now();

  try {
    for (const row of listDueSnoozes(now)) {
      updateMessageFlags(row.id, {
        folder: "inbox",
        snooze_until_ms: null,
        unread: 1,
      });
      broadcast("mail:unsnoozed", { messageId: row.id });
    }

    // Rows stuck in `sending` mean the previous process died mid-send.
    const recovered = recoverStaleSends(now);
    if (recovered > 0) {
      console.warn(`Recovered ${recovered} interrupted outbox send(s)`);
    }

    for (const due of listDueSends(now)) {
      if (!claimSend(due.id, Date.now(), SEND_LOCK_MS)) continue;
      const row = getSendQueueRow(due.id);
      if (!row) continue;

      const messageId =
        row.message_id ?? buildMessageId("intray@localhost", row.id);
      if (!row.message_id) setSendQueueMessageId(row.id, messageId);
      // A retry (or a send interrupted mid-flight) may already have been
      // accepted upstream; ask sendMail to check before transmitting again.
      const isRetry = row.attempts > 1 || row.last_error != null;

      try {
        const draft = JSON.parse(row.draft_json) as ComposeDraft;
        const message = await sendMail(draft, { messageId, retry: isRetry });
        markSendSent(row.id);
        broadcast("mail:sendFlushed", { queueId: row.id, message });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (isPermanentSendFailure(error) || row.attempts >= MAX_ATTEMPTS) {
          markSendFailed(row.id, error.message);
          broadcast("mail:sendError", {
            queueId: row.id,
            error: error.message,
            attempts: row.attempts,
            final: true,
          });
        } else {
          const nextAt = Date.now() + backoffMs(row.attempts);
          markSendRetry(row.id, error.message, nextAt);
          broadcast("mail:sendError", {
            queueId: row.id,
            error: error.message,
            attempts: row.attempts,
            retryAtMs: nextAt,
            final: false,
          });
        }
      }
    }
  } finally {
    flushing = false;
  }
}

/** Earliest queued send / snooze wakeup, or null when the queue is empty. */
function nextDueAtMs(): number | null {
  const times: number[] = [];
  const snooze = nextSnoozeDueMs();
  if (snooze != null) times.push(snooze);
  const send = nextSendDueMs();
  if (send != null) times.push(send);
  return times.length ? Math.min(...times) : null;
}

function schedule(delayMs: number): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  // Scheduled rows wake us at their own time; otherwise stay on the idle tick.
  const delay = Math.max(MIN_TICK_MS, Math.min(delayMs, IDLE_TICK_MS));
  timer = setTimeout(runTick, delay);
}

function scheduleFromQueue(): void {
  const due = nextDueAtMs();
  schedule(due == null ? IDLE_TICK_MS : due - Date.now());
}

function runTick(): void {
  timer = null;
  if (!started) return;
  void flushDue()
    .catch((e) => console.error("Outbox flush failed", e))
    .finally(() => scheduleFromQueue());
}

export function ensureQueueLoop(): void {
  if (started) {
    // A send queued while the loop sleeps should not wait for the idle tick.
    if (!flushing) schedule(0);
    return;
  }
  started = true;
  // Single-instance app: any row still marked `sending` at this point was
  // interrupted by a crash/quit. Recover it immediately instead of waiting for
  // the 3-minute send lock to expire.
  const interrupted = recoverStaleSends(Date.now(), true);
  if (interrupted > 0) {
    console.warn(`Recovered ${interrupted} interrupted outbox send(s)`);
  }
  runTick();
}

export function stopQueueLoop(): void {
  started = false;
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
}

export function peekQueuedSend(queueId: string) {
  return getSendQueueRow(queueId);
}
