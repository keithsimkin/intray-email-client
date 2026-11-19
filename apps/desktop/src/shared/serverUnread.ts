/**
 * Read state as another mail client would see it.
 *
 * Unread means the server message does not have `\Seen`. Opening a message
 * in Intray is not the definition, and Gmail's `\Unread` label is not either:
 * Gmail on the web sets `\Seen` and often leaves that label in place.
 */

export type ServerUnreadMode = "gmail-inbox" | "mailbox";

const PROTECTED = new Set(["trash", "junk", "sent", "drafts"]);

export function labelJsonHasSeen(labelIdsJson: string): boolean {
  try {
    const parsed = JSON.parse(labelIdsJson) as { flags?: unknown };
    const flags = Array.isArray(parsed?.flags) ? parsed.flags : [];
    return flags.some((flag) => String(flag).toLowerCase() === "\\seen");
  } catch {
    return false;
  }
}

/**
 * Desired local read bit for one stored message, given the server's unseen
 * UID set for the mailbox it was indexed from.
 *
 * `gmail-inbox` is an All Mail search of `in:inbox` plus not `\Seen`. Only
 * inbox rows are cleared, so archived mail that is still unseen stays unseen.
 * A hit moves an archived copy back to the inbox, except trash, junk, sent,
 * and drafts.
 *
 * `mailbox` is a direct UNSEEN search of that folder (a normal INBOX).
 * Snoozed rows are left alone in both modes.
 *
 * Returns null when this message's read state is not covered by the set.
 */
export function desiredReadState(
  folder: string,
  uid: number,
  unseen: ReadonlySet<number>,
  mode: ServerUnreadMode,
): { unread: 0 | 1; folder: string } | null {
  if (folder === "snoozed") return null;
  const onServer = unseen.has(uid);
  if (mode === "mailbox") {
    return { unread: onServer ? 1 : 0, folder };
  }
  if (onServer) {
    if (PROTECTED.has(folder)) return { unread: 1, folder };
    return { unread: 1, folder: "inbox" };
  }
  if (folder === "inbox") return { unread: 0, folder: "inbox" };
  return null;
}
