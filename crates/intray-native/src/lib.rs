#![deny(clippy::all)]

mod schema;

use std::sync::Mutex;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rusqlite::{params_from_iter, types::ValueRef, Connection, OptionalExtension};
use serde_json::{Map, Number, Value as JsonValue};

type JsonParams = Vec<JsonValue>;

/// Native mail cache — Discord-style hot path: SQLite lives in Rust, UI stays Electron.
#[napi]
pub struct MailDb {
  conn: Mutex<Connection>,
}

#[napi]
impl MailDb {
  /// Open (or create) the on-disk SQLite database at `path`.
  #[napi(factory)]
  pub fn open(path: String) -> Result<Self> {
    let conn = Connection::open(&path).map_err(sql_err)?;
    conn
      .execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;",
      )
      .map_err(sql_err)?;

    let db = Self {
      conn: Mutex::new(conn),
    };
    db.migrate()?;
    db.seed_default_labels()?;
    Ok(db)
  }

  /// Backend identifier for diagnostics / About UI.
  #[napi]
  pub fn backend(&self) -> String {
    "rust-sqlite".to_string()
  }

  #[napi]
  pub fn exec(&self, sql: String) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn.execute_batch(&sql).map_err(sql_err)?;
    Ok(())
  }

  #[napi]
  pub fn run(&self, sql: String, params: Option<JsonParams>) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    let params = params.unwrap_or_default();
    let mut stmt = conn.prepare_cached(&sql).map_err(sql_err)?;
    stmt
      .execute(params_from_iter(json_params_to_sql(&params)?))
      .map_err(sql_err)?;
    Ok(())
  }

  #[napi]
  pub fn get(&self, sql: String, params: Option<JsonParams>) -> Result<Option<JsonValue>> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    let params = params.unwrap_or_default();
    let mut stmt = conn.prepare_cached(&sql).map_err(sql_err)?;
    let row = stmt
      .query_row(params_from_iter(json_params_to_sql(&params)?), |row| {
        row_to_json(row)
      })
      .optional()
      .map_err(sql_err)?;
    Ok(row)
  }

  #[napi]
  pub fn all(&self, sql: String, params: Option<JsonParams>) -> Result<Vec<JsonValue>> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    let params = params.unwrap_or_default();
    let mut stmt = conn.prepare_cached(&sql).map_err(sql_err)?;
    let rows = stmt
      .query_map(params_from_iter(json_params_to_sql(&params)?), |row| {
        row_to_json(row)
      })
      .map_err(sql_err)?;

    let mut out = Vec::new();
    for row in rows {
      out.push(row.map_err(sql_err)?);
    }
    Ok(out)
  }

  /// Upsert FTS index for a message (headers + optional body text).
  #[napi]
  pub fn upsert_fts(
    &self,
    message_id: String,
    subject: String,
    snippet: String,
    from_name: String,
    from_email: String,
    body: Option<String>,
    recipients: Option<String>,
    attachments: Option<String>,
  ) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn
      .prepare_cached("DELETE FROM messages_fts WHERE message_id = ?1")
      .map_err(sql_err)?
      .execute([&message_id])
      .map_err(sql_err)?;
    conn
      .prepare_cached(
        "INSERT INTO messages_fts (
           message_id, subject, snippet, from_name, from_email, body, recipients, attachments
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      )
      .map_err(sql_err)?
      .execute((
        message_id,
        subject,
        snippet,
        from_name,
        from_email,
        body.unwrap_or_default(),
        recipients.unwrap_or_default(),
        attachments.unwrap_or_default(),
      ))
      .map_err(sql_err)?;
    Ok(())
  }

  #[napi]
  pub fn delete_fts(&self, message_id: String) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn
      .execute(
        "DELETE FROM messages_fts WHERE message_id = ?1",
        [&message_id],
      )
      .map_err(sql_err)?;
    Ok(())
  }

  /// Cheap periodic upkeep: refresh SQLite's planner statistics. Safe to run on
  /// every launch; it is a no-op when nothing has changed.
  #[napi]
  pub fn optimize(&self) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn.execute_batch("PRAGMA optimize;").map_err(sql_err)?;
    Ok(())
  }

  /// Free pages still reserved by the file after prunes.
  #[napi]
  pub fn freelist_count(&self) -> Result<i64> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    let pages: i64 = conn
      .query_row("PRAGMA freelist_count", [], |r| r.get(0))
      .map_err(sql_err)?;
    Ok(pages)
  }

  /// Rebuild the file so pruned rows actually give disk space back. Only worth
  /// running after a large prune; the caller checks `freelist_count` first.
  #[napi]
  pub fn vacuum(&self) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn.execute_batch("VACUUM;").map_err(sql_err)?;
    Ok(())
  }

  #[napi]
  pub fn close(&self) -> Result<()> {
    // Dropping the connection flushes WAL. Callers should drop the JS handle after this.
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn
      .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
      .map_err(sql_err)?;
    Ok(())
  }

  fn migrate(&self) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    conn.execute_batch(schema::SCHEMA_SQL).map_err(sql_err)?;
    for sql in schema::MIGRATIONS_SQL {
      let _ = conn.execute_batch(sql);
    }
    for sql in schema::POST_MIGRATION_INDEXES_SQL {
      conn.execute_batch(sql).map_err(sql_err)?;
    }
    let recipients: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('messages_fts') WHERE name = 'recipients'",
        [],
        |row| row.get(0),
      )
      .unwrap_or(0);
    if recipients == 0 {
      conn
        .execute_batch(schema::FTS_REBUILD_SQL)
        .map_err(sql_err)?;
    }
    Ok(())
  }

  fn seed_default_labels(&self) -> Result<()> {
    let conn = self.conn.lock().map_err(|_| Error::from_reason("db lock poisoned"))?;
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM labels", [], |r| r.get(0))
      .map_err(sql_err)?;
    if count > 0 {
      return Ok(());
    }
    let now = chrono_like_now();
    let defaults: [(&str, &str, &str); 7] = [
      ("receipts", "Receipts", "#f5a524"),
      ("security", "Security", "#ff5c5c"),
      ("social", "Social", "#46c5e8"),
      ("news", "News", "#8b7cf6"),
      ("updates", "Updates", "#5b8def"),
      ("promo", "Promo", "#f5d042"),
      ("waiting", "Waiting for Reply", "#ff5c5c"),
    ];
    for (id, name, color) in defaults {
      conn
        .execute(
          "INSERT OR IGNORE INTO labels (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
          (id, name, color, now.as_str()),
        )
        .map_err(sql_err)?;
    }
    Ok(())
  }
}

fn chrono_like_now() -> String {
  chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn sql_err(err: impl ToString) -> Error {
  Error::from_reason(err.to_string())
}

fn json_params_to_sql(
  params: &[JsonValue],
) -> Result<Vec<rusqlite::types::Value>> {
  params
    .iter()
    .map(|v| match v {
      JsonValue::Null => Ok(rusqlite::types::Value::Null),
      JsonValue::Bool(b) => Ok(rusqlite::types::Value::Integer(if *b { 1 } else { 0 })),
      JsonValue::Number(n) => {
        if let Some(i) = n.as_i64() {
          Ok(rusqlite::types::Value::Integer(i))
        } else if let Some(u) = n.as_u64() {
          if u <= i64::MAX as u64 {
            Ok(rusqlite::types::Value::Integer(u as i64))
          } else {
            Ok(rusqlite::types::Value::Real(u as f64))
          }
        } else if let Some(f) = n.as_f64() {
          Ok(rusqlite::types::Value::Real(f))
        } else {
          Err(Error::from_reason("unsupported JSON number"))
        }
      }
      JsonValue::String(s) => Ok(rusqlite::types::Value::Text(s.clone())),
      other => Err(Error::from_reason(format!(
        "unsupported SQL param type: {other}"
      ))),
    })
    .collect()
}

fn row_to_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<JsonValue> {
  let stmt = row.as_ref();
  let mut map = Map::new();
  for i in 0..stmt.column_count() {
    let name = stmt.column_name(i)?.to_string();
    let value = match row.get_ref(i)? {
      ValueRef::Null => JsonValue::Null,
      ValueRef::Integer(i) => JsonValue::Number(i.into()),
      ValueRef::Real(f) => Number::from_f64(f)
        .map(JsonValue::Number)
        .unwrap_or(JsonValue::Null),
      ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).into_owned()),
      ValueRef::Blob(b) => JsonValue::String(
        b.iter().map(|byte| format!("{byte:02x}")).collect::<String>(),
      ),
    };
    map.insert(name, value);
  }
  Ok(JsonValue::Object(map))
}
