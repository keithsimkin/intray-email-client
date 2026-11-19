import Database from "better-sqlite3";
import { describe, expect, test } from "bun:test";
import { threadHeadPageSql } from "../src/main/db/threadHeads";
import { decodeMailCursor, encodeMailCursor } from "../src/shared/mailCursor";

describe("mail cursors", () => {
  test("round-trips ids that contain colons", () => {
    const raw = encodeMailCursor(1795091569000, "gmail-9046eeda:gm:123");
    expect(decodeMailCursor(raw)).toEqual({
      dateMs: 1795091569000,
      id: "gmail-9046eeda:gm:123",
    });
  });

  test("a bare timestamp means strictly older", () => {
    expect(decodeMailCursor("1795091569000")).toEqual({
      dateMs: 1795091569000,
      id: "",
    });
    expect(decodeMailCursor("nope")).toBeNull();
    expect(decodeMailCursor(null)).toBeNull();
  });
});

describe("thread head pages", () => {
  function open(): Database {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      date_ms INTEGER NOT NULL,
      folder TEXT NOT NULL,
      important INTEGER NOT NULL DEFAULT 0
    )`);
    const insert = db.prepare(
      `INSERT INTO messages (id, account_id, thread_id, date_ms, folder, important)
       VALUES (?, 'acct', ?, ?, 'inbox', 1)`,
    );
    insert.run("a-new", "thread-a", 300);
    insert.run("a-old", "thread-a", 100);
    insert.run("b", "thread-b", 250);
    insert.run("c", "thread-c", 200);
    insert.run("d", "thread-d", 150);
    insert.run("e", "thread-e", 50);
    insert.run("tie-b", "thread-tie-b", 40);
    insert.run("tie-a", "thread-tie-a", 40);
    return db;
  }

  function page(
    db: Database,
    before: { dateMs: number; id: string } | null,
    limit: number,
  ): { ids: string[]; hasMore: boolean } {
    const { sql, params } = threadHeadPageSql({
      accountId: "acct",
      folder: "inbox",
      filter: "all",
      before,
      limit: limit + 1,
    });
    const rows = db.prepare(sql).all(...params) as { id: string; date_ms: number }[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return { ids: pageRows.map((row) => row.id), hasMore };
  }

  test("pages conversations without repeating a thread", () => {
    const db = open();
    const first = page(db, null, 2);
    expect(first.ids).toEqual(["a-new", "b"]);
    expect(first.hasMore).toBe(true);

    const second = page(db, { dateMs: 250, id: "b" }, 2);
    expect(second.ids).toEqual(["c", "d"]);
    expect(second.ids).not.toContain("a-old");

    const third = page(db, { dateMs: 150, id: "d" }, 2);
    expect(third.ids).toEqual(["e", "tie-b"]);
  });

  test("same timestamp keeps the row with the smaller id", () => {
    const db = open();
    const next = page(db, { dateMs: 40, id: "tie-b" }, 2);
    expect(next.ids).toEqual(["tie-a"]);
    expect(next.hasMore).toBe(false);
  });
});
