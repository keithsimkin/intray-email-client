//! Mail cache schema — kept in Rust so the native store owns migrations.

pub const SCHEMA_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  avatar_url TEXT,
  unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payload_b64 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Send-as / linked addresses for one mailbox (iCloud custom domains, aliases).
CREATE TABLE IF NOT EXISTS account_identities (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_account_identities_account
  ON account_identities(account_id);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  history_id TEXT,
  last_sync_at TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  error TEXT,
  progress TEXT,
  imap_cursor_json TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'inbox',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  date_ms INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 0,
  important INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  has_attachment INTEGER NOT NULL DEFAULT 0,
  label_ids_json TEXT NOT NULL DEFAULT '[]',
  ui_label_id TEXT,
  snooze_until_ms INTEGER,
  internal_date TEXT,
  link_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(account_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_account_folder_date
  ON messages(account_id, folder, date_ms DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(account_id, thread_id, date_ms ASC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(account_id, unread);

CREATE TABLE IF NOT EXISTS bodies (
  message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  text_plain TEXT,
  text_html TEXT,
  fetched_at TEXT NOT NULL,
  attachments_json TEXT
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS send_queue (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  draft_json TEXT NOT NULL,
  send_at_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER,
  last_error TEXT,
  message_id TEXT,
  locked_until_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_send_queue_send_at
  ON send_queue(status, send_at_ms);

CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY NOT NULL,
  payload_b64 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  email TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#8a8f98',
  avatar_url TEXT,
  last_seen_ms INTEGER NOT NULL DEFAULT 0,
  frequency INTEGER NOT NULL DEFAULT 1
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_id UNINDEXED,
  subject,
  snippet,
  from_name,
  from_email,
  body,
  recipients,
  attachments,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS messages_ad_fts AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE message_id = old.id;
END;
"#;

/// Recreate `messages_fts` when an older database is missing the later columns.
/// FTS5 virtual tables cannot gain columns in place.
pub const FTS_REBUILD_SQL: &str = r#"
DROP TRIGGER IF EXISTS messages_ad_fts;
DROP TABLE IF EXISTS messages_fts;

CREATE VIRTUAL TABLE messages_fts USING fts5(
  message_id UNINDEXED,
  subject,
  snippet,
  from_name,
  from_email,
  body,
  recipients,
  attachments,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS messages_ad_fts AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE message_id = old.id;
END;
"#;

pub const MIGRATIONS_SQL: &[&str] = &[
  "ALTER TABLE messages ADD COLUMN snooze_until_ms INTEGER",
  "ALTER TABLE messages ADD COLUMN ui_label_id TEXT",
  "ALTER TABLE sync_state ADD COLUMN imap_cursor_json TEXT",
  "ALTER TABLE send_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE send_queue ADD COLUMN next_attempt_at_ms INTEGER",
  "ALTER TABLE send_queue ADD COLUMN last_error TEXT",
  "ALTER TABLE send_queue ADD COLUMN message_id TEXT",
  "ALTER TABLE send_queue ADD COLUMN locked_until_ms INTEGER",
  "ALTER TABLE accounts ADD COLUMN avatar_url TEXT",
  "ALTER TABLE contacts ADD COLUMN avatar_url TEXT",
  "ALTER TABLE messages ADD COLUMN link_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE bodies ADD COLUMN attachments_json TEXT",
];

pub const POST_MIGRATION_INDEXES_SQL: &[&str] = &[
  "CREATE INDEX IF NOT EXISTS idx_messages_snooze ON messages(snooze_until_ms)",
  "CREATE INDEX IF NOT EXISTS idx_send_queue_retry ON send_queue(status, next_attempt_at_ms)",
];
