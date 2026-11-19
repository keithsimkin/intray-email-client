/**
 * Compact UIDs into an IMAP sequence set.
 *
 * `[1,2,3,7,9,10]` → `"1:3,7,9:10"`. Keeping the command short matters when a
 * mailbox holds thousands of stored messages.
 */
export function imapUidSet(uids: Iterable<number>): string {
  const sorted = [...new Set(uids)]
    .filter((uid) => Number.isFinite(uid) && uid > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return "";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const uid = sorted[i];
    if (uid === prev + 1) {
      prev = uid;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}:${prev}`);
    start = uid;
    prev = uid;
  }
  parts.push(start === prev ? String(start) : `${start}:${prev}`);
  return parts.join(",");
}
