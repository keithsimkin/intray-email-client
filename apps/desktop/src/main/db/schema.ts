/**
 * Schema reference for contributors reading the TypeScript side.
 *
 * The live schema + migrations are owned by the Rust mail store:
 * `crates/intray-native/src/schema.rs`
 *
 * Keep this file in sync when changing tables so docs/reviews stay accurate.
 *
 * Tables: meta, accounts, credentials, account_identities, sync_state,
 * messages, bodies (including attachments_json), labels, send_queue, secrets,
 * contacts, messages_fts (subject, snippet, from, body, recipients, attachments), plugins.
 */

export const SCHEMA_OWNER = "crates/intray-native/src/schema.rs";
