import { app } from "electron";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { MailDb } from "@intray/native";
import { parseSearchClauses } from "../../shared/searchQuery";

/**
 * Typed mail-store façade over the Rust SQLite backend (`@intray/native`).
 * Call sites stay TypeScript; persistence / FTS / WAL live in Rust — same
 * incremental pattern Discord used before leaving Electron entirely.
 */

let db: MailDb | null = null;

export async function initDb(): Promise<MailDb> {
  if (db) return db;
  const dbPath = join(app.getPath("userData"), "intray.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  db = MailDb.open(dbPath);
  return db;
}

export function getDb(): MailDb {
  if (!db) {
    throw new Error("Database not initialized — call initDb() first");
  }
  return db;
}

export function closeDb(): void {
  if (!db) return;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  db = null;
}

export function dbBackend(): string {
  return db?.backend() ?? "uninitialized";
}

function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never[]);
}

function get<T>(sql: string, params: unknown[] = []): T | undefined {
  const row = getDb().get(sql, params as never[]);
  return (row as T | null) ?? undefined;
}

function all<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().all(sql, params as never[]) as T[];
}

export type AccountRow = {
  id: string;
  provider: string;
  email: string;
  name: string;
  label: string;
  color: string;
  /** HTTPS profile photo URL, or "" if resolved with none. */
  avatar_url: string | null;
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
  link_count?: number;
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
  attempts: number;
  next_attempt_at_ms: number | null;
  last_error: string | null;
  message_id: string | null;
  locked_until_ms: number | null;
};

export type ContactRow = {
  email: string;
  name: string;
  color: string;
  /** HTTPS profile photo URL, or "" if resolved with none. */
  avatar_url: string | null;
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
  imap_cursor_json: string | null;
};

export function listAccountRows(): AccountRow[] {
  return all<AccountRow>("SELECT * FROM accounts ORDER BY created_at ASC");
}

export function getAccountRow(id: string): AccountRow | undefined {
  return get<AccountRow>("SELECT * FROM accounts WHERE id = ?", [id]);
}

export function upsertAccount(row: AccountRow): void {
  run(
    `INSERT INTO accounts (id, provider, email, name, label, color, avatar_url, unread, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider=excluded.provider,
       email=excluded.email,
       name=excluded.name,
       label=excluded.label,
       color=excluded.color,
       avatar_url=COALESCE(excluded.avatar_url, accounts.avatar_url),
       unread=excluded.unread,
       updated_at=excluded.updated_at`,
    [
      row.id,
      row.provider,
      row.email,
      row.name,
      row.label,
      row.color,
      row.avatar_url,
      row.unread,
      row.created_at,
      row.updated_at,
    ],
  );
}

export function setAccountAvatarUrl(
  accountId: string,
  avatarUrl: string | null,
): void {
  run(
    `UPDATE accounts SET avatar_url = ?, updated_at = ? WHERE id = ?`,
    [avatarUrl, new Date().toISOString(), accountId],
  );
}

export function deleteAccount(id: string): void {
  run("DELETE FROM accounts WHERE id = ?", [id]);
}

export type AccountIdentityRow = {
  id: string;
  account_id: string;
  email: string;
  name: string;
  is_primary: number;
  created_at: string;
};

export function listIdentityRows(accountId?: string): AccountIdentityRow[] {
  if (accountId) {
    return all<AccountIdentityRow>(
      `SELECT * FROM account_identities
       WHERE account_id = ?
       ORDER BY is_primary DESC, created_at ASC`,
      [accountId],
    );
  }
  return all<AccountIdentityRow>(
    `SELECT * FROM account_identities
     ORDER BY account_id ASC, is_primary DESC, created_at ASC`,
  );
}

export function getIdentityByEmail(
  email: string,
): AccountIdentityRow | undefined {
  return get<AccountIdentityRow>(
    `SELECT * FROM account_identities WHERE lower(email) = lower(?)`,
    [email.trim()],
  );
}

export function upsertIdentity(row: AccountIdentityRow): void {
  run(
    `INSERT INTO account_identities (id, account_id, email, name, is_primary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id=excluded.account_id,
       email=excluded.email,
       name=excluded.name,
       is_primary=excluded.is_primary`,
    [
      row.id,
      row.account_id,
      row.email,
      row.name,
      row.is_primary,
      row.created_at,
    ],
  );
}

export function deleteIdentity(id: string): void {
  run("DELETE FROM account_identities WHERE id = ?", [id]);
}

export function deleteIdentitiesForAccount(accountId: string): void {
  run("DELETE FROM account_identities WHERE account_id = ?", [accountId]);
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
    `INSERT INTO sync_state (account_id, history_id, last_sync_at, status, error, progress, imap_cursor_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       history_id=excluded.history_id,
       last_sync_at=excluded.last_sync_at,
       status=excluded.status,
       error=excluded.error,
       progress=excluded.progress,
       imap_cursor_json=excluded.imap_cursor_json`,
    [
      row.account_id,
      row.history_id,
      row.last_sync_at,
      row.status,
      row.error,
      row.progress,
      row.imap_cursor_json ?? null,
    ],
  );
}

/**
 * Brief shield after a user toggles read/star/folder locally. Sync can otherwise
 * re-apply a stale provider snapshot (especially right after mark-as-read) and
 * make the message look unread again on the next poll or app launch race.
 */
type LocalFlagGuard = {
  at: number;
  unread?: number;
  starred?: number;
  important?: number;
  folder?: string;
};
const LOCAL_FLAG_GUARD_MS = 3 * 60_000;
const localFlagGuards = new Map<string, LocalFlagGuard>();

export function noteLocalFlagWrite(
  id: string,
  patch: Partial<
    Pick<MessageRow, "unread" | "starred" | "important" | "folder">
  >,
): void {
  const prev = localFlagGuards.get(id);
  localFlagGuards.set(id, {
    at: Date.now(),
    unread: patch.unread ?? prev?.unread,
    starred: patch.starred ?? prev?.starred,
    important: patch.important ?? prev?.important,
    folder: patch.folder ?? prev?.folder,
  });
}

function applyLocalFlagGuard(
  id: string,
  incoming: {
    unread: number;
    starred: number;
    important: number;
    folder: string;
  },
): { unread: number; starred: number; important: number; folder: string } {
  const guard = localFlagGuards.get(id);
  if (!guard) return incoming;
  if (Date.now() - guard.at > LOCAL_FLAG_GUARD_MS) {
    localFlagGuards.delete(id);
    return incoming;
  }
  const next = {
    unread: guard.unread ?? incoming.unread,
    starred: guard.starred ?? incoming.starred,
    important: guard.important ?? incoming.important,
    folder: guard.folder ?? incoming.folder,
  };
  // Provider caught up — drop the shield so later remote changes apply.
  if (
    (guard.unread == null || guard.unread === incoming.unread) &&
    (guard.starred == null || guard.starred === incoming.starred) &&
    (guard.important == null || guard.important === incoming.important) &&
    (guard.folder == null || guard.folder === incoming.folder)
  ) {
    localFlagGuards.delete(id);
  }
  return next;
}

export function upsertMessage(
  row: MessageRow,
  opts?: { flagsOnly?: boolean },
): boolean {
  const existing = get<MessageRow>(
    "SELECT * FROM messages WHERE account_id = ? AND provider_id = ?",
    [row.account_id, row.provider_id],
  );

  const guarded = existing
    ? applyLocalFlagGuard(existing.id, {
        unread: row.unread,
        starred: row.starred,
        important: row.important,
        folder: row.folder,
      })
    : row;
  const unread = existing ? guarded.unread : row.unread;
  const starred = existing ? guarded.starred : row.starred;
  const important = existing ? guarded.important : row.important;
  const incomingFolder = existing ? guarded.folder : row.folder;

  // Gmail recent-window passes only carry flags/labels: never overwrite the
  // snippet or attachment state they did not fetch.
  if (opts?.flagsOnly) {
    if (!existing) return false;
    if (
      existing.folder === incomingFolder &&
      existing.unread === unread &&
      existing.important === important &&
      existing.starred === starred &&
      existing.label_ids_json === row.label_ids_json
    ) {
      return false;
    }
    run(
      `UPDATE messages
       SET folder = ?, unread = ?, important = ?, starred = ?, label_ids_json = ?
       WHERE id = ?`,
      [
        incomingFolder,
        unread,
        important,
        starred,
        row.label_ids_json,
        existing.id,
      ],
    );
    return true;
  }

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
      : incomingFolder;

  // A 30s poll re-reads envelopes that have not changed. Writing and
  // re-indexing them every time was pure disk work: bail out when the stored
  // row already matches.
  if (
    existing &&
    existing.id === row.id &&
    existing.thread_id === row.thread_id &&
    existing.folder === folder &&
    existing.subject === row.subject &&
    existing.snippet === row.snippet &&
    existing.from_name === row.from_name &&
    existing.from_email === row.from_email &&
    existing.to_json === row.to_json &&
    existing.cc_json === row.cc_json &&
    existing.date_ms === row.date_ms &&
    existing.unread === unread &&
    existing.important === important &&
    existing.starred === starred &&
    existing.has_attachment === row.has_attachment &&
    existing.label_ids_json === row.label_ids_json &&
    existing.ui_label_id === uiLabel &&
    existing.snooze_until_ms === snooze &&
    existing.internal_date === row.internal_date
  ) {
    return false;
  }

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
      unread,
      important,
      starred,
      row.has_attachment,
      row.label_ids_json,
      uiLabel,
      snooze,
      row.internal_date,
    ],
  );

  // FTS only needs refreshing when the searchable header text changed; the
  // body is indexed by upsertBody/updateFtsBody.
  const headerChanged =
    !existing ||
    existing.subject !== row.subject ||
    existing.snippet !== row.snippet ||
    existing.from_name !== row.from_name ||
    existing.from_email !== row.from_email;
  if (headerChanged) {
    const body = getBody(existing?.id ?? row.id)?.text_plain ?? "";
    getDb().upsertFts(
      row.id,
      row.subject,
      row.snippet,
      row.from_name,
      row.from_email,
      body,
    );
  }
  return true;
}

/** Index body text into the Rust FTS5 table for search. */
export function updateFtsBody(messageId: string, bodyText: string): void {
  const msg = getMessageRow(messageId);
  if (!msg) return;
  getDb().upsertFts(
    messageId,
    msg.subject,
    msg.snippet,
    msg.from_name,
    msg.from_email,
    bodyText,
  );
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

function sanitizeLikeTerm(raw: string): string {
  return raw.replace(/[%_]/g, "").trim();
}

function ftsTerms(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["*]/g, "").replace(/'/g, ""))
    .filter(Boolean);
}

/** Resolve a person query to emails + name tokens via the contacts table. */
export function expandPersonQuery(value: string): {
  raw: string;
  emails: string[];
  nameTokens: string[];
} {
  const raw = value.trim();
  const emails = new Set<string>();
  const nameTokens = raw.includes("@")
    ? []
    : raw
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);

  if (raw.includes("@")) emails.add(raw.toLowerCase());

  const needle = raw.toLowerCase();
  for (const c of listContacts(200)) {
    const name = (c.name ?? "").toLowerCase();
    const email = (c.email ?? "").toLowerCase();
    if (!email) continue;
    if (
      email === needle ||
      email.includes(needle) ||
      name.includes(needle) ||
      (nameTokens.length > 0 &&
        nameTokens.every((t) => name.includes(t.toLowerCase())))
    ) {
      emails.add(email);
    }
  }

  return { raw, emails: [...emails], nameTokens };
}

/** Build a SQL predicate for from_name / from_email matching a person query. */
function personFromPredicate(
  value: string,
  params: unknown[],
): string {
  const { raw, emails, nameTokens } = expandPersonQuery(value);
  const parts: string[] = [];
  const like = `%${sanitizeLikeTerm(raw)}%`;
  parts.push("(m.from_name LIKE ? OR m.from_email LIKE ?)");
  params.push(like, like);

  for (const email of emails) {
    parts.push("LOWER(m.from_email) = ?");
    params.push(email.toLowerCase());
    parts.push("m.from_email LIKE ?");
    params.push(`%${sanitizeLikeTerm(email)}%`);
  }

  if (nameTokens.length >= 1) {
    const tokenParts = nameTokens.map(() => "m.from_name LIKE ?");
    for (const t of nameTokens) {
      params.push(`%${sanitizeLikeTerm(t)}%`);
    }
    // All tokens in the display name (Arianna + Kleynburg), or the first
    // token alone so "Arianna" still hits shorter from_name values.
    parts.push(`(${tokenParts.join(" AND ")})`);
    if (nameTokens.length > 1) {
      parts.push("m.from_name LIKE ?");
      params.push(`%${sanitizeLikeTerm(nameTokens[0]!)}%`);
      parts.push("m.from_email LIKE ?");
      params.push(`%${sanitizeLikeTerm(nameTokens[0]!)}%`);
    }
  }

  return `(${parts.join(" OR ")})`;
}

function personToPredicate(value: string, params: unknown[]): string {
  const { raw, emails, nameTokens } = expandPersonQuery(value);
  const parts: string[] = [];
  const like = `%${sanitizeLikeTerm(raw)}%`;
  parts.push("(m.to_json LIKE ? OR m.cc_json LIKE ?)");
  params.push(like, like);
  for (const email of emails) {
    parts.push("(m.to_json LIKE ? OR m.cc_json LIKE ?)");
    const e = `%${sanitizeLikeTerm(email)}%`;
    params.push(e, e);
  }
  for (const t of nameTokens) {
    parts.push("(m.to_json LIKE ? OR m.cc_json LIKE ?)");
    const e = `%${sanitizeLikeTerm(t)}%`;
    params.push(e, e);
  }
  return `(${parts.join(" OR ")})`;
}

/**
 * Fielded search across the local store (not limited to the open folder).
 * Supports from:/to:/subject:/tag:/has:/is: plus free-text FTS.
 */
export function searchMessageRows(
  q: string,
  opts: { accountId?: string; limit: number },
): MessageRow[] {
  const clauses = parseSearchClauses(q);
  if (!clauses.length) return [];

  const where: string[] = [];
  const params: unknown[] = [];
  let joinLabels = false;
  let joinBodies = false;
  const textParts: string[] = [];

  if (opts.accountId && opts.accountId !== "all") {
    where.push("m.account_id = ?");
    params.push(opts.accountId);
  }

  for (const clause of clauses) {
    const value = clause.value.trim();
    if (!value) continue;
    const like = `%${sanitizeLikeTerm(value)}%`;

    switch (clause.field) {
      case "from":
        where.push(personFromPredicate(value, params));
        break;
      case "to":
        where.push(personToPredicate(value, params));
        break;
      case "subject":
        where.push("m.subject LIKE ?");
        params.push(like);
        break;
      case "tag":
        joinLabels = true;
        where.push("l.name LIKE ?");
        params.push(like);
        break;
      case "has": {
        const v = value.toLowerCase();
        if (v.startsWith("attach")) {
          where.push("m.has_attachment = 1");
        } else if (v.startsWith("link")) {
          where.push(
            `(m.link_count > 0 OR m.snippet LIKE '%http%' OR m.snippet LIKE '%www.%')`,
          );
        } else if (v.startsWith("meet") || v === "calendar") {
          joinBodies = true;
          where.push(
            `(IFNULL(b.text_plain, '') LIKE '%meet.%' OR IFNULL(b.text_plain, '') LIKE '%teams.microsoft%' OR m.snippet LIKE '%meet.%')`,
          );
        } else {
          return [];
        }
        break;
      }
      case "is": {
        const v = value.toLowerCase();
        if (v === "unread") where.push("m.unread = 1");
        else if (v === "read") where.push("m.unread = 0");
        else if (v.startsWith("star")) where.push("m.starred = 1");
        else if (v.startsWith("import")) where.push("m.important = 1");
        else return [];
        break;
      }
      case "text":
      default:
        textParts.push(value);
        break;
    }
  }

  const textQuery = textParts.join(" ").trim();
  const terms = textQuery ? ftsTerms(textQuery) : [];
  const ftsMatch = terms.length
    ? terms.map((t) => `"${t}"*`).join(" AND ")
    : null;

  if (!where.length && !ftsMatch) return [];

  const labelJoin = joinLabels
    ? "LEFT JOIN labels l ON l.id = m.ui_label_id"
    : "";
  const bodyJoin = joinBodies
    ? "LEFT JOIN bodies b ON b.message_id = m.id"
    : "";

  if (ftsMatch) {
    try {
      return all<MessageRow>(
        `SELECT m.* FROM messages m
         INNER JOIN messages_fts f ON f.message_id = m.id
         ${labelJoin}
         ${bodyJoin}
         WHERE f MATCH ?
         ${where.length ? `AND ${where.join(" AND ")}` : ""}
         ORDER BY m.date_ms DESC
         LIMIT ?`,
        [ftsMatch, ...params, opts.limit],
      );
    } catch {
      joinBodies = true;
      for (const term of terms) {
        const like = `%${sanitizeLikeTerm(term)}%`;
        where.push(
          `(m.subject LIKE ? OR m.snippet LIKE ? OR m.from_name LIKE ? OR m.from_email LIKE ? OR IFNULL(b.text_plain, '') LIKE ?)`,
        );
        params.push(like, like, like, like, like);
      }
    }
  }

  if (!where.length) return [];

  return all<MessageRow>(
    `SELECT m.* FROM messages m
     ${joinLabels ? "LEFT JOIN labels l ON l.id = m.ui_label_id" : ""}
     ${joinBodies ? "LEFT JOIN bodies b ON b.message_id = m.id" : ""}
     WHERE ${where.join(" AND ")}
     ORDER BY m.date_ms DESC
     LIMIT ?`,
    [...params, opts.limit],
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
  setMessageLinkCount(row.message_id, countLinks(row.text_html));
  updateFtsBody(row.message_id, row.text_plain ?? "");
}

/** Same shape as the renderer used to scan for, so list and AI agree. */
export function countLinks(html: string | null | undefined): number {
  if (!html) return 0;
  const matches = html.match(/href\s*=/gi);
  return matches ? matches.length : 0;
}

export function setMessageLinkCount(messageId: string, count: number): void {
  run(
    "UPDATE messages SET link_count = ? WHERE id = ? AND link_count <> ?",
    [count, messageId, count],
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
  if (
    patch.folder !== undefined ||
    patch.unread !== undefined ||
    patch.important !== undefined ||
    patch.starred !== undefined
  ) {
    noteLocalFlagWrite(id, {
      folder: patch.folder,
      unread: patch.unread,
      important: patch.important,
      starred: patch.starred,
    });
  }
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

export function enqueueSend(row: {
  id: string;
  account_id: string;
  draft_json: string;
  send_at_ms: number;
  created_at: string;
  status: string;
  message_id?: string | null;
}): void {
  run(
    `INSERT INTO send_queue (
       id, account_id, draft_json, send_at_ms, created_at, status,
       attempts, next_attempt_at_ms, last_error, message_id, locked_until_ms
     ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, NULL)`,
    [
      row.id,
      row.account_id,
      row.draft_json,
      row.send_at_ms,
      row.created_at,
      row.status,
      row.send_at_ms,
      row.message_id ?? null,
    ],
  );
}

export function listDueSends(nowMs: number): SendQueueRow[] {
  return all<SendQueueRow>(
    `SELECT * FROM send_queue
     WHERE status = 'pending'
       AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
       AND send_at_ms <= ?
     ORDER BY send_at_ms ASC
     LIMIT 25`,
    [nowMs, nowMs],
  );
}

/**
 * Earliest moment the outbox loop has work, or null when nothing is waiting.
 * Lets the loop sleep instead of re-querying an empty queue twice a second.
 */
export function nextSendDueMs(): number | null {
  const row = get<{ t: number | null }>(
    `SELECT MIN(MAX(send_at_ms, COALESCE(next_attempt_at_ms, 0))) AS t
     FROM send_queue
     WHERE status = 'pending'`,
  );
  return typeof row?.t === "number" ? row.t : null;
}

/** Reset rows left in `sending` by a crash/quit so they are retried. */
export function recoverStaleSends(nowMs: number, ignoreLock = false): number {
  const stale = all<{ id: string }>(
    `SELECT id FROM send_queue
     WHERE status = 'sending'
       ${ignoreLock ? "" : "AND (locked_until_ms IS NULL OR locked_until_ms <= ?)"}`,
    ignoreLock ? [] : [nowMs],
  );
  for (const row of stale) {
    run(
      `UPDATE send_queue
       SET status = 'pending',
           locked_until_ms = NULL,
           next_attempt_at_ms = ?,
           last_error = 'Recovered after an interrupted send'
       WHERE id = ?`,
      [nowMs, row.id],
    );
  }
  return stale.length;
}

/**
 * Atomically claim a due row. Returns false when another loop already took it,
 * which is what keeps a slow send from being dispatched twice.
 */
export function claimSend(id: string, nowMs: number, lockMs: number): boolean {
  const row = getSendQueueRow(id);
  if (!row || row.status !== "pending") return false;
  run(
    `UPDATE send_queue
     SET status = 'sending', attempts = attempts + 1, locked_until_ms = ?
     WHERE id = ? AND status = 'pending'`,
    [nowMs + lockMs, id],
  );
  return getSendQueueRow(id)?.status === "sending";
}

export function markSendSent(id: string): void {
  run(
    `UPDATE send_queue
     SET status = 'sent', last_error = NULL, locked_until_ms = NULL
     WHERE id = ?`,
    [id],
  );
}

export function markSendRetry(
  id: string,
  error: string,
  nextAttemptMs: number,
): void {
  run(
    `UPDATE send_queue
     SET status = 'pending',
         last_error = ?,
         next_attempt_at_ms = ?,
         locked_until_ms = NULL
     WHERE id = ?`,
    [error.slice(0, 500), nextAttemptMs, id],
  );
}

export function markSendFailed(id: string, error: string): void {
  run(
    `UPDATE send_queue
     SET status = 'error', last_error = ?, locked_until_ms = NULL
     WHERE id = ?`,
    [error.slice(0, 500), id],
  );
}

export function setSendQueueMessageId(id: string, messageId: string): void {
  run(`UPDATE send_queue SET message_id = ? WHERE id = ? AND message_id IS NULL`, [
    messageId,
    id,
  ]);
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

export function getContact(email: string): ContactRow | undefined {
  return get<ContactRow>("SELECT * FROM contacts WHERE email = ?", [
    email.toLowerCase(),
  ]);
}

export function upsertContact(row: ContactRow): void {
  const email = row.email.toLowerCase();
  const existing = get<ContactRow>("SELECT * FROM contacts WHERE email = ?", [
    email,
  ]);
  if (existing) {
    const avatar =
      row.avatar_url !== undefined && row.avatar_url !== null
        ? row.avatar_url
        : existing.avatar_url;
    run(
      `UPDATE contacts SET name = ?, color = ?, avatar_url = ?, last_seen_ms = ?, frequency = ? WHERE email = ?`,
      [
        row.name || existing.name,
        row.color || existing.color,
        avatar,
        Math.max(row.last_seen_ms, existing.last_seen_ms),
        existing.frequency + 1,
        email,
      ],
    );
    return;
  }
  run(
    `INSERT INTO contacts (email, name, color, avatar_url, last_seen_ms, frequency)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      email,
      row.name,
      row.color,
      row.avatar_url,
      row.last_seen_ms,
      row.frequency,
    ],
  );
}

export function setContactAvatarUrl(
  email: string,
  avatarUrl: string | null,
): void {
  run(`UPDATE contacts SET avatar_url = ? WHERE email = ?`, [
    avatarUrl,
    email.toLowerCase(),
  ]);
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

/** Earliest snooze that still has to wake the outbox loop, or null. */
export function nextSnoozeDueMs(): number | null {
  const row = get<{ t: number | null }>(
    `SELECT MIN(snooze_until_ms) AS t FROM messages
     WHERE folder = 'snoozed' AND snooze_until_ms IS NOT NULL`,
  );
  return typeof row?.t === "number" ? row.t : null;
}

export function recountUnread(accountId: string): number {
  // Conversation count — matches the thread-collapsed list, not raw rows.
  const count =
    get<{ c: number }>(
      `SELECT COUNT(DISTINCT thread_id) AS c FROM messages
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

/** Aggregate total + unread conversation counts per folder (and per UI label). */
export function countMessagesByFolder(accountId?: string | "all"): {
  folders: Array<{ folder: string; total: number; unread: number }>;
  labels: Array<{ labelId: string; total: number; unread: number }>;
} {
  const params: unknown[] = [];
  let accountClause = "";
  if (accountId && accountId !== "all") {
    accountClause = "WHERE account_id = ?";
    params.push(accountId);
  }

  // Unread = distinct threads (account-scoped key so unified "all" doesn't
  // collapse same thread_id across accounts). Totals stay raw message rows.
  const unreadExpr =
    "COUNT(DISTINCT CASE WHEN unread = 1 THEN account_id || ':' || thread_id END)";

  const folders = all<{ folder: string; total: number; unread: number }>(
    `SELECT folder,
            COUNT(*) AS total,
            ${unreadExpr} AS unread
     FROM messages
     ${accountClause}
     GROUP BY folder`,
    params,
  ).map((r) => ({
    folder: r.folder,
    total: Number(r.total) || 0,
    unread: Number(r.unread) || 0,
  }));

  const labelWhere = accountClause
    ? `${accountClause} AND ui_label_id IS NOT NULL`
    : "WHERE ui_label_id IS NOT NULL";
  const labels = all<{ labelId: string; total: number; unread: number }>(
    `SELECT ui_label_id AS labelId,
            COUNT(*) AS total,
            ${unreadExpr} AS unread
     FROM messages
     ${labelWhere}
     GROUP BY ui_label_id`,
    params,
  ).map((r) => ({
    labelId: r.labelId,
    total: Number(r.total) || 0,
    unread: Number(r.unread) || 0,
  }));

  return { folders, labels };
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
  deleteMessageById(row.id);
}

export function deleteMessageById(id: string): void {
  try {
    getDb().deleteFts(id);
  } catch {
    /* fts row may not exist */
  }
  run("DELETE FROM messages WHERE id = ?", [id]);
}

function getMeta(key: string): string | undefined {
  return get<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key])
    ?.value;
}

function setMeta(key: string, value: string): void {
  run(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, value],
  );
}

/**
 * One-time backfill for link counts on rows whose bodies predate the column.
 * Without it, `has:links` and the link chip would stay empty for old mail.
 */
export function backfillLinkCounts(): void {
  if (getMeta("link_count_backfill") === "1") return;
  const rows = all<{ message_id: string; text_html: string | null }>(
    `SELECT b.message_id, b.text_html
     FROM bodies b
     INNER JOIN messages m ON m.id = b.message_id
     WHERE IFNULL(m.link_count, 0) = 0 AND b.text_html IS NOT NULL`,
  );
  for (const row of rows) {
    const links = countLinks(row.text_html);
    if (links > 0) setMessageLinkCount(row.message_id, links);
  }
  setMeta("link_count_backfill", "1");
}

/**
 * Body text is a cache: the provider can always hand it back. Drop old bodies
 * outside the newest page per account so the file stops growing forever.
 */
export function pruneBodyCache(opts?: {
  olderThanMs?: number;
  keepNewestPerAccount?: number;
}): number {
  const olderThanMs = opts?.olderThanMs ?? 180 * 24 * 60 * 60 * 1000;
  const keep = opts?.keepNewestPerAccount ?? 400;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const before =
    get<{ c: number }>("SELECT COUNT(*) AS c FROM bodies")?.c ?? 0;
  run(
    `DELETE FROM bodies
     WHERE fetched_at < ?
       AND message_id NOT IN (
         SELECT id FROM (
           SELECT m.id,
                  ROW_NUMBER() OVER (
                    PARTITION BY m.account_id ORDER BY m.date_ms DESC
                  ) AS rank
           FROM messages m
         ) WHERE rank <= ?
       )`,
    [cutoff, keep],
  );
  const after = get<{ c: number }>("SELECT COUNT(*) AS c FROM bodies")?.c ?? 0;
  return Math.max(0, before - after);
}

/**
 * Cheap startup upkeep: planner stats, bounded cache prune, and a vacuum only
 * when enough free pages have accumulated to be worth the rewrite.
 */
export function runDbMaintenance(): void {
  try {
    const pruned = pruneBodyCache();
    getDb().optimize();
    if (pruned > 0 || (getDb().freelistCount() ?? 0) > 200) {
      getDb().vacuum();
    }
  } catch (error) {
    console.warn("db maintenance skipped", error);
  }
}
