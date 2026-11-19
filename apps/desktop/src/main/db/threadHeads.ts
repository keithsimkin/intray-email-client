/**
 * One row per conversation, newest message first, then a date/id cursor.
 *
 * The cursor is applied *after* the thread head is chosen. Filtering first
 * would promote an older message in a thread we already showed and the same
 * conversation would appear again on the next page.
 */
export function threadHeadPageSql(opts: {
  accountId?: string;
  folder?: string;
  filter?: "important" | "other" | "all";
  before?: { dateMs: number; id: string } | null;
  limit: number;
}): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.accountId && opts.accountId !== "all") {
    where.push("account_id = ?");
    params.push(opts.accountId);
  }
  if (opts.folder) {
    where.push("folder = ?");
    params.push(opts.folder);
  }
  if (opts.filter === "important") where.push("important = 1");
  else if (opts.filter === "other") where.push("important = 0");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const cursorSql = opts.before
    ? "AND (m.date_ms < ? OR (m.date_ms = ? AND m.id < ?))"
    : "";
  const cursorParams = opts.before
    ? [opts.before.dateMs, opts.before.dateMs, opts.before.id]
    : [];

  const sql = `WITH heads AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY account_id, thread_id
             ORDER BY date_ms DESC, id DESC
           ) AS rn
    FROM messages
    ${whereSql}
  )
  SELECT m.*
  FROM messages m
  JOIN heads h ON h.id = m.id AND h.rn = 1
  WHERE 1 = 1
  ${cursorSql}
  ORDER BY m.date_ms DESC, m.id DESC
  LIMIT ?`;

  return { sql, params: [...params, ...cursorParams, opts.limit] };
}
