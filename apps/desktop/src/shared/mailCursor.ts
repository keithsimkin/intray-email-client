/** List pages are ordered by date, then id, newest first. */
export type MailCursor = {
  dateMs: number;
  id: string;
};

/**
 * `date|id`. Message ids contain colons (`account:provider`), so the split is
 * the first pipe, not a colon.
 */
export function encodeMailCursor(dateMs: number, id: string): string {
  return `${dateMs}|${id}`;
}

export function decodeMailCursor(
  raw: string | null | undefined,
): MailCursor | null {
  if (!raw) return null;
  const bar = raw.indexOf("|");
  if (bar <= 0) {
    const dateMs = Number(raw);
    if (!Number.isFinite(dateMs)) return null;
    // Legacy cursors were a bare timestamp and meant "strictly older".
    return { dateMs, id: "" };
  }
  const dateMs = Number(raw.slice(0, bar));
  if (!Number.isFinite(dateMs)) return null;
  return { dateMs, id: raw.slice(bar + 1) };
}
