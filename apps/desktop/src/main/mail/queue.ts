import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import {
  cancelSendQueue,
  enqueueSend,
  getSendQueueRow,
  listDueSends,
  listDueSnoozes,
  updateMessageFlags,
  updateSendQueueStatus,
} from "../db";
import type { ComposeDraft, QueuedSendResult } from "../../shared/types";
import { sendMail } from "./service";

let timer: NodeJS.Timeout | null = null;

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

export function enqueueDelayedSend(
  draft: ComposeDraft,
  delaySeconds: number,
): QueuedSendResult {
  const id = `queue-${randomUUID().slice(0, 10)}`;
  const sendAtMs = Date.now() + Math.max(0, delaySeconds) * 1000;
  enqueueSend({
    id,
    account_id: draft.accountId,
    draft_json: JSON.stringify(draft),
    send_at_ms: sendAtMs,
    created_at: new Date().toISOString(),
    status: "pending",
  });
  ensureQueueLoop();
  return { queueId: id, sendAtMs };
}

export function cancelQueuedSend(queueId: string): boolean {
  const ok = cancelSendQueue(queueId);
  if (ok) broadcast("mail:sendCancelled", { queueId });
  return ok;
}

async function flushDue(): Promise<void> {
  const now = Date.now();

  for (const row of listDueSnoozes(now)) {
    updateMessageFlags(row.id, {
      folder: "inbox",
      snooze_until_ms: null,
      unread: 1,
    });
    broadcast("mail:unsnoozed", { messageId: row.id });
  }

  for (const row of listDueSends(now)) {
    try {
      updateSendQueueStatus(row.id, "sending");
      const draft = JSON.parse(row.draft_json) as ComposeDraft;
      const message = await sendMail(draft);
      updateSendQueueStatus(row.id, "sent");
      broadcast("mail:sendFlushed", { queueId: row.id, message });
    } catch (e) {
      updateSendQueueStatus(row.id, "error");
      broadcast("mail:sendError", {
        queueId: row.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export function ensureQueueLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flushDue();
  }, 2000);
  void flushDue();
}

export function stopQueueLoop(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export function peekQueuedSend(queueId: string) {
  return getSendQueueRow(queueId);
}
