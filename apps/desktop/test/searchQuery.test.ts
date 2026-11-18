import { describe, expect, test } from "bun:test";
import {
  parseSearchClauses,
  parseSlashDraft,
  serializeSearchClauses,
  slashFieldChoices,
} from "../src/shared/searchQuery";
import {
  makeToken,
  messageMatchesSearch,
  parseSearchInput,
  serializeSearch,
} from "../src/renderer/searchQuery";
import type { Message } from "../src/renderer/data/mock";

function msg(partial: Partial<Message> & Pick<Message, "id" | "email">): Message {
  return {
    accountId: "work",
    from: partial.from ?? partial.email.split("@")[0] ?? "x",
    initials: "X",
    avatarColor: "#000",
    subject: "Hello",
    preview: "",
    time: "1:00 PM",
    unread: false,
    important: false,
    folder: "inbox",
    thread: [
      {
        id: `${partial.id}-a`,
        from: partial.from ?? partial.email.split("@")[0] ?? "x",
        email: partial.email,
        initials: "X",
        avatarColor: "#000",
        time: "1:00 PM",
        body: ["hi"],
        to: [{ name: "You", email: "you@intray.app" }],
      },
    ],
    ...partial,
  };
}

describe("parseSearchClauses", () => {
  test("parses from/subject operators and free text", () => {
    expect(
      parseSearchClauses('from:ada@x.com subject:"q4 plan" roadmap'),
    ).toEqual([
      { field: "from", value: "ada@x.com" },
      { field: "subject", value: "q4 plan" },
      { field: "text", value: "roadmap" },
    ]);
  });

  test("round-trips through serialize", () => {
    const clauses = parseSearchClauses("from:ada is:unread");
    expect(serializeSearchClauses(clauses)).toBe("from:ada is:unread");
  });
});

describe("slash drafts", () => {
  test("chooses filters from /prefix", () => {
    expect(parseSlashDraft("/").choosing).toBe(true);
    expect(parseSlashDraft("/fr").prefix).toBe("fr");
    expect(slashFieldChoices("fr").map((r) => r.field)).toEqual(["from"]);
    expect(parseSlashDraft("/from ada")).toEqual({
      field: "from",
      choosing: false,
      rest: "ada",
      prefix: "from",
    });
  });
});

describe("messageMatchesSearch", () => {
  test("from matches email across corpus", () => {
    const a = msg({ id: "1", email: "ada@x.com", from: "Ada", folder: "inbox" });
    const b = msg({
      id: "2",
      email: "ada@x.com",
      from: "Ada",
      folder: "archive",
      subject: "Old",
    });
    const c = msg({ id: "3", email: "bob@x.com", from: "Bob" });
    const tokens = [makeToken("from", "ada@x.com")];
    expect(messageMatchesSearch(a, tokens)).toBe(true);
    expect(messageMatchesSearch(b, tokens)).toBe(true);
    expect(messageMatchesSearch(c, tokens)).toBe(false);
  });

  test("from full name also matches shorter display names", () => {
    const invite = msg({
      id: "1",
      email: "ada@x.com",
      from: "Ada Lovelace",
    });
    const direct = msg({
      id: "2",
      email: "ada@x.com",
      from: "Ada",
      subject: "Quick note",
    });
    const other = msg({ id: "3", email: "bob@x.com", from: "Bob" });
    const tokens = [makeToken("from", "Ada Lovelace")];
    expect(messageMatchesSearch(invite, tokens)).toBe(true);
    expect(messageMatchesSearch(direct, tokens)).toBe(true);
    expect(messageMatchesSearch(other, tokens)).toBe(false);
  });

  test("parseSearchInput builds tokens for renderer chips", () => {
    const { tokens, rest } = parseSearchInput("from:ada@x.com hello");
    expect(tokens.map((t) => `${t.field}:${t.value}`)).toEqual([
      "from:ada@x.com",
    ]);
    expect(rest).toBe("hello");
    expect(serializeSearch([...tokens, makeToken("text", rest)])).toBe(
      "from:ada@x.com hello",
    );
  });
});
