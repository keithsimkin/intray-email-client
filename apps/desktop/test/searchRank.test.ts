import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MailDb } from "@intray/native";
import { buildFtsMatch } from "../src/shared/searchQuery";

const BM25 = "bm25(messages_fts, 0.0, 10.0, 2.0, 6.0, 6.0, 1.0, 5.0, 4.0)";

function openDb() {
  const dir = mkdtempSync(join(tmpdir(), "intray-fts-"));
  const db = MailDb.open(join(dir, "mail.sqlite"));
  db.run(
    `INSERT INTO accounts (id, provider, email, name, label, color, created_at, updated_at)
     VALUES ('a', 'imap', 'me@x.com', 'Me', 'Me', '#fff', 't', 't')`,
  );
  return {
    db,
    close() {
      db.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows can keep the sqlite file locked briefly after close.
      }
    },
  };
}

function insertMessage(
  db: MailDb,
  row: {
    id: string;
    subject: string;
    snippet?: string;
    from?: string;
    email?: string;
    to?: string;
    date?: number;
    body?: string;
    attachments?: string;
  },
) {
  db.run(
    `INSERT INTO messages (
       id, account_id, thread_id, provider_id, folder, subject, snippet,
       from_name, from_email, to_json, cc_json, date_ms, unread, important,
       starred, has_attachment, label_ids_json
     ) VALUES (?, 'a', ?, ?, 'inbox', ?, ?, ?, ?, '[]', '[]', ?, 0, 0, 0, 0, '[]')`,
    [
      row.id,
      row.id,
      row.id,
      row.subject,
      row.snippet ?? "",
      row.from ?? "Ada",
      row.email ?? "ada@x.com",
      row.date ?? 1,
    ],
  );
  db.upsertFts(
    row.id,
    row.subject,
    row.snippet ?? "",
    row.from ?? "Ada",
    row.email ?? "ada@x.com",
    row.body ?? "",
    row.to ?? "",
    row.attachments ?? "",
  );
}

function rankedIds(db: MailDb, query: string): string[] {
  const match = buildFtsMatch(query);
  if (!match) return [];
  const rows = db.all(
    `SELECT m.id AS id, ${BM25} AS rank
     FROM messages_fts
     JOIN messages m ON m.id = messages_fts.message_id
     WHERE messages_fts MATCH ?
     ORDER BY rank ASC, m.date_ms DESC`,
    [match],
  ) as Array<{ id: string; rank: number }>;
  return rows.map((row) => row.id);
}

describe("search ranking", () => {
  test("a subject match outranks a newer body mention", () => {
    const store = openDb();
    try {
      insertMessage(store.db, {
        id: "body",
        subject: "Hello",
        body: "please review the invoice tomorrow",
        date: 5_000,
      });
      insertMessage(store.db, {
        id: "subject",
        subject: "Invoice attached",
        body: "see file",
        date: 1,
      });
      expect(rankedIds(store.db, "invoice")).toEqual(["subject", "body"]);
    } finally {
      store.close();
    }
  });

  test("finds recipients and attachment names", () => {
    const store = openDb();
    try {
      insertMessage(store.db, {
        id: "to",
        subject: "Notes",
        to: "Priya Raman priya@studio.test",
      });
      insertMessage(store.db, {
        id: "file",
        subject: "Files",
        attachments: "Q4-deck.pdf",
      });
      expect(rankedIds(store.db, "priya")).toEqual(["to"]);
      expect(rankedIds(store.db, "deck")).toEqual(["file"]);
    } finally {
      store.close();
    }
  });

  test("snippet marks the matching word", () => {
    const store = openDb();
    try {
      insertMessage(store.db, {
        id: "one",
        subject: "Lunch",
        body: "The rooftop reservation is under Alvarez",
      });
      const match = buildFtsMatch("rooftop");
      const row = store.db.get(
        `SELECT snippet(messages_fts, -1, char(1), char(2), '…', 12) AS snippet
         FROM messages_fts
         WHERE messages_fts MATCH ?`,
        [match],
      ) as { snippet: string };
      expect(row.snippet).toContain("\u0001");
      expect(row.snippet.toLowerCase()).toContain("rooftop");
    } finally {
      store.close();
    }
  });
});
