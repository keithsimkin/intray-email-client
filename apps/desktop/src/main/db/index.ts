import { app } from "electron";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import initSqlJs, { type Database as SqlDatabase } from "sql.js";
import { MIGRATIONS_SQL, SCHEMA_SQL } from "./schema";

const require = createRequire(import.meta.url);

let db: SqlDatabase | null = null;
let dbPath = "";
let persistTimer: NodeJS.Timeout | null = null;

function schedulePersist(): void {
  if (!db || !dbPath) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const data = db!.export();
      writeFileSync(dbPath, Buffer.from(data));
    } catch (e) {
      console.error("Failed to persist SQLite", e);
    }
  }, 250);
}

export async function initDb(): Promise<SqlDatabase> {
  if (db) return db;
  dbPath = join(app.getPath("userData"), "intray.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });

  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  if (existsSync(dbPath)) {
    db = new SQL.Database(readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  for (const sql of MIGRATIONS_SQL) {
    try {
      db.run(sql);
    } catch {
      /* column already exists */
    }
  }
  seedDefaultLabels();
  schedulePersist();
  return db;
}

function seedDefaultLabels(): void {
  if (!db) return;
  const count =
    get<{ c: number }>("SELECT COUNT(*) AS c FROM labels")?.c ?? 0;
  if (count > 0) return;
  const now = new Date().toISOString();
  const defaults: { id: string; name: string; color: string }[] = [
    { id: "receipts", name: "Receipts", color: "#f5a524" },
    { id: "security", name: "Security", color: "#ff5c5c" },
    { id: "social", name: "Social", color: "#46c5e8" },
    { id: "news", name: "News", color: "#8b7cf6" },
    { id: "updates", name: "Updates", color: "#5b8def" },
    { id: "promo", name: "Promo", color: "#f5d042" },
    { id: "waiting", name: "Waiting for Reply", color: "#ff5c5c" },
  ];
  for (const l of defaults) {
    run(
      `INSERT OR IGNORE INTO labels (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
      [l.id, l.name, l.color, now],
    );
  }
}

export function getDb(): SqlDatabase {
  if (!db) {
    throw new Error("Database not initialized — call initDb() first");
  }
  return db;
}

export function closeDb(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!db) return;
  try {
    const data = db.export();
    if (dbPath) writeFileSync(dbPath, Buffer.from(data));
  } catch {
    /* ignore */
  }
  db.close();
  db = null;
}

function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never[]);
  schedulePersist();
}

function get<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  stmt.bind(params as never[]);
  if (!stmt.step()) {
    stmt.free();
    return undefined;
  }
  const row = stmt.getAsObject() as T;
  stmt.free();
  return row;
}

function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  stmt.bind(params as never[]);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

export type AccountRow = {
  id: string;
  provider: string;
  email: string;
  name: string;
  label: string;
  color: string;
  unread: number;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  account_id: string;
  thread_id: string;
  provider_id: string;
  folder: string;
  subject: string;
  snippet: string;
  from_name: string;
  from_email: string;
  to_json: string;
  cc_json: string;
  date_ms: number;
  unread: number;
  important: number;
  starred: number;
  has_attachment: number;
  label_ids_json: string;
  ui_label_id: string | null;
  snooze_until_ms: number | null;
  internal_date: string | null;
};

export type LabelRow = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type SendQueueRow = {
  id: string;
  account_id: string;
  draft_json: string;
  send_at_ms: number;
  created_at: string;
  status: string;
};

export type ContactRow = {
  email: string;
  name: string;
  color: string;
  last_seen_ms: number;
  frequency: number;
};

export type BodyRow = {
  message_id: string;
  text_plain: string | null;
  text_html: string | null;
  fetched_at: string;
};

export type SyncStateRow = {
  account_id: string;
  history_id: string | null;
  last_sync_at: string | null;
  status: string;
  error: string | null;
  progress: string | null;
};

export function listAccountRows(): AccountRow[] {
  return all<AccountRow>("SELECT * FROM accounts ORDER BY created_at ASC");
}

export function getAccountRow(id: string): AccountRow | undefined {
  return get<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id]);
}

export function upsertAccount(row: AccountRow): void {
  run(
    `INSERT INTO accounts (id, provider, email, name, label, color, unread, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider=excluded.provider,
       email=excluded.email,
       name=excluded.name,
       label=excluded.label,
       color=excluded.color,
       unread=excluded.unread,
       updated_at=excluded.updated_at`,
    [
      row.id,
      row.provider,
      row.email,
      row.name,
      row.label,
      row.color,
      row.unread,
      row.created_at,
      row.updated_at,
    ],
  );
}

export function deleteAccount(id: string): void {
  run("DELETE FROM accounts WHERE id = ?", [id]);
}

export function setCredentialPayload(
  accountId: string,
  payloadB64: string,
): void {
  run(
    `INSERT INTO credentials (account_id, payload_b64, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET payload_b64=excluded.payload_b64, updated_at=excluded.updated_at`,
    [accountId, payloadB64, new Date().toISOString()],
  );
}

export function getCredentialPayload(accountId: string): string | null {
  const row = get<{ payload_b64: string }>(
    "SELECT payload_b64 FROM credentials WHERE account_id = ?",
    [accountId],
  );
  return row?.payload_b64 ?? null;
}

export function getSyncState(accountId: string): SyncStateRow | undefined {
  return get<SyncStateRow>("SELECT * FROM sync_state WHERE account_id = ?", [
    accountId,
  ]);
}

export function upsertSyncState(row: SyncStateRow): void {
  run(
    `INSERT INTO sync_state (account_id, history_id, last_sync_at, status, error, progress)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       history_id=excluded.history_id,
       last_sync_at=excluded.last_sync_at,
       status=excluded.status,
       error=excluded.error,
       progress=excluded.progress`,
    [
      row.account_id,
      row.history_id,
      row.last_sync_at,
      row.status,
      row.error,
      row.progress,
    ],
  );
}

export function upsertMessage(row: MessageRow): void {
  const existing = get<{
    ui_label_id: string | null;
    snooze_until_ms: number | null;
    folder: string;
  }>(
    "SELECT ui_label_id, snooze_until_ms, folder FROM messages WHERE account_id = ? AND provider_id = ?",
    [row.account_id, row.provider_id],
  );
  // Preserve local-only fields across provider syncs.
  const uiLabel =
    row.ui_label_id !== undefined && row.ui_label_id !== null
      ? row.ui_label_id
      : (existing?.ui_label_id ?? null);
  const snooze =
    row.snooze_until_ms != null
      ? row.snooze_until_ms
      : (existing?.snooze_until_ms ?? null);
  const folder =
    existing?.folder === "snoozed" && snooze != null
      ? "snoozed"
      : row.folder;

  run(
    `INSERT INTO messages (
       id, account_id, thread_id, provider_id, folder, subject, snippet,
       from_name, from_email, to_json, cc_json, date_ms, unread, important,
       starred, has_attachment, label_ids_json, ui_label_id, snooze_until_ms, internal_date
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, provider_id) DO UPDATE SET
       id=excluded.id,
       thread_id=excluded.thread_id,
       folder=excluded.folder,
       subject=excluded.subject,
       snippet=excluded.snippet,
       from_name=excluded.from_name,
       from_email=excluded.from_email,
       to_json=excluded.to_json,
       cc_json=excluded.cc_json,
       date_ms=excluded.date_ms,
       unread=excluded.unread,
       important=excluded.important,
       starred=excluded.starred,
       has_attachment=excluded.has_attachment,
       label_ids_json=excluded.label_ids_json,
       ui_label_id=excluded.ui_label_id,
       snooze_until_ms=excluded.snooze_until_ms,
       internal_date=excluded.internal_date`,
    [
      row.id,
      row.account_id,
      row.thread_id,
      row.provider_id,
      folder,
      row.subject,
      row.snippet,
      row.from_name,
      row.from_email,
      row.to_json,
      row.cc_json,
      row.date_ms,
      row.unread,
      row.important,
      row.starred,
      row.has_attachment,
      row.label_ids_json,
      uiLabel,
      snooze,
      row.internal_date,
    ],
  );
}

/** Kept for callers that index body text; sql.js has no FTS5, so this is a no-op. */
export function updateFtsBody(_messageId: string, _bodyText: string): void {
  /* no-op until a native SQLite build with FTS5 is wired in */
}

export function getMessageRow(id: string): MessageRow | undefined {
  return get<MessageRow>("SELECT * FROM messages WHERE id = ?", [id]);
}

export function listMessageRows(opts: {
  accountId?: string;
  folder?: string;
  filter?: "important" | "other" | "all";
  limit: number;
  beforeDateMs?: number;
}): { rows: MessageRow[]; total: number } {
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
  if (opts.beforeDateMs != null) {
    where.push("date_ms < ?");
    params.push(opts.beforeDateMs);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM messages ${whereSql}`,
      params,
    )?.c ?? 0;

  const rows = all<MessageRow>(
    `SELECT * FROM messages ${whereSql} ORDER BY date_ms DESC LIMIT ?`,
    [...params, opts.limit],
  );
  return { rows, total };
}

export function searchMessageRows(
  q: string,
  opts: { accountId?: string; limit: number },
): MessageRow[] {
  const terms = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[%_\\]/g, ""));
  if (!terms.length) return [];

  // sql.js WASM ships without FTS5 — use LIKE across header fields + body.
  const where: string[] = [];
  const params: unknown[] = [];
  for (const term of terms) {
    const like = `%${term}%`;
    where.push(
      `(m.subject LIKE ? OR m.snippet LIKE ? OR m.from_name LIKE ? OR m.from_email LIKE ? OR IFNULL(b.text_plain, '') LIKE ?)`,
    );
    params.push(like, like, like, like, like);
  }
  if (opts.accountId && opts.accountId !== "all") {
    where.push("m.account_id = ?");
    params.push(opts.accountId);
  }
  params.push(opts.limit);

  return all<MessageRow>(
    `SELECT m.* FROM messages m
     LEFT JOIN bodies b ON b.message_id = m.id
     WHERE ${where.join(" AND ")}
     ORDER BY m.date_ms DESC
     LIMIT ?`,
    params,
  );
}

export function listThreadMessages(
  accountId: string,
  threadId: string,
): MessageRow[] {
  return all<MessageRow>(
    `SELECT * FROM messages
     WHERE account_id = ? AND thread_id = ?
     ORDER BY date_ms ASC`,
    [accountId, threadId],
  );
}

export function upsertBody(row: BodyRow): void {
  run(
    `INSERT INTO bodies (message_id, text_plain, text_html, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(message_id) DO UPDATE SET
       text_plain=excluded.text_plain,
       text_html=excluded.text_html,
       fetched_at=excluded.fetched_at`,
    [row.message_id, row.text_plain, row.text_html, row.fetched_at],
  );
}

export function getBody(messageId: string): BodyRow | undefined {
  return get<BodyRow>("SELECT * FROM bodies WHERE message_id = ?", [
    messageId,
  ]);
}

export function updateMessageFlags(
  id: string,
  patch: Partial<
    Pick<
      MessageRow,
      | "folder"
      | "unread"
      | "important"
      | "starred"
      | "label_ids_json"
      | "ui_label_id"
      | "snooze_until_ms"
    >
  >,
): void {
  const current = getMessageRow(id);
  if (!current) return;
  const next = {
    folder: patch.folder ?? current.folder,
    unread: patch.unread ?? current.unread,
    important: patch.important ?? current.important,
    starred: patch.starred ?? current.starred,
    label_ids_json: patch.label_ids_json ?? current.label_ids_json,
    ui_label_id:
      patch.ui_label_id !== undefined ? patch.ui_label_id : current.ui_label_id,
    snooze_until_ms:
      patch.snooze_until_ms !== undefined
        ? patch.snooze_until_ms
        : current.snooze_until_ms,
  };
  run(
    `UPDATE messages SET
       folder = ?, unread = ?, important = ?, starred = ?,
       label_ids_json = ?, ui_label_id = ?, snooze_until_ms = ?
     WHERE id = ?`,
    [
      next.folder,
      next.unread,
      next.important,
      next.starred,
      next.label_ids_json,
      next.ui_label_id,
      next.snooze_until_ms,
      id,
    ],
  );
}

export function listLabels(): LabelRow[] {
  return all<LabelRow>("SELECT * FROM labels ORDER BY name ASC");
}

export function upsertLabel(row: LabelRow): void {
  run(
    `INSERT INTO labels (id, name, color, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color`,
    [row.id, row.name, row.color, row.created_at],
  );
}

export function getLabel(id: string): LabelRow | undefined {
  return get<LabelRow>("SELECT * FROM labels WHERE id = ?", [id]);
}

export function enqueueSend(row: SendQueueRow): void {
  run(
    `INSERT INTO send_queue (id, account_id, draft_json, send_at_ms, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.account_id,
      row.draft_json,
      row.send_at_ms,
      row.created_at,
      row.status,
    ],
  );
}

export function listDueSends(nowMs: number): SendQueueRow[] {
  return all<SendQueueRow>(
    `SELECT * FROM send_queue
     WHERE status = 'pending' AND send_at_ms <= ?
     ORDER BY send_at_ms ASC`,
    [nowMs],
  );
}

export function getSendQueueRow(id: string): SendQueueRow | undefined {
  return get<SendQueueRow>("SELECT * FROM send_queue WHERE id = ?", [id]);
}

export function updateSendQueueStatus(id: string, status: string): void {
  run("UPDATE send_queue SET status = ? WHERE id = ?", [status, id]);
}

export function cancelSendQueue(id: string): boolean {
  const row = getSendQueueRow(id);
  if (!row || row.status !== "pending") return false;
  updateSendQueueStatus(id, "cancelled");
  return true;
}

export function setSecretPayload(key: string, payloadB64: string): void {
  run(
    `INSERT INTO secrets (key, payload_b64, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET payload_b64=excluded.payload_b64, updated_at=excluded.updated_at`,
    [key, payloadB64, new Date().toISOString()],
  );
}

export function getSecretPayload(key: string): string | null {
  const row = get<{ payload_b64: string }>(
    "SELECT payload_b64 FROM secrets WHERE key = ?",
    [key],
  );
  return row?.payload_b64 ?? null;
}

export function deleteSecret(key: string): void {
  run("DELETE FROM secrets WHERE key = ?", [key]);
}

export function listSecretKeys(): string[] {
  return all<{ key: string }>("SELECT key FROM secrets").map((r) => r.key);
}

export function upsertContact(row: ContactRow): void {
  const existing = get<ContactRow>("SELECT * FROM contacts WHERE email = ?", [
    row.email.toLowerCase(),
  ]);
  if (existing) {
    run(
      `UPDATE contacts SET name = ?, color = ?, last_seen_ms = ?, frequency = ? WHERE email = ?`,
      [
        row.name || existing.name,
        row.color || existing.color,
        Math.max(row.last_seen_ms, existing.last_seen_ms),
        existing.frequency + 1,
        row.email.toLowerCase(),
      ],
    );
    return;
  }
  run(
    `INSERT INTO contacts (email, name, color, last_seen_ms, frequency)
     VALUES (?, ?, ?, ?, ?)`,
    [
      row.email.toLowerCase(),
      row.name,
      row.color,
      row.last_seen_ms,
      row.frequency,
    ],
  );
}

export function listContacts(limit = 200): ContactRow[] {
  return all<ContactRow>(
    `SELECT * FROM contacts ORDER BY frequency DESC, last_seen_ms DESC LIMIT ?`,
    [limit],
  );
}

export function listDueSnoozes(nowMs: number): MessageRow[] {
  return all<MessageRow>(
    `SELECT * FROM messages
     WHERE folder = 'snoozed' AND snooze_until_ms IS NOT NULL AND snooze_until_ms <= ?`,
    [nowMs],
  );
}

export function recountUnread(accountId: string): number {
  const count =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM messages
       WHERE account_id = ? AND unread = 1 AND folder = 'inbox'`,
      [accountId],
    )?.c ?? 0;
  run("UPDATE accounts SET unread = ?, updated_at = ? WHERE id = ?", [
    count,
    new Date().toISOString(),
    accountId,
  ]);
  return count;
}

export function deleteMessageByProviderId(
  accountId: string,
  providerId: string,
): void {
  const row = get<{ id: string }>(
    "SELECT id FROM messages WHERE account_id = ? AND provider_id = ?",
    [accountId, providerId],
  );
  if (!row) return;
  run("DELETE FROM messages WHERE id = ?", [row.id]);
}

export function deleteMessageById(id: string): void {
  run("DELETE FROM messages WHERE id = ?", [id]);
}
