import { describe, expect, test } from "bun:test";
import {
  desiredReadState,
  labelJsonHasSeen,
} from "../src/shared/serverUnread";

describe("stored Seen flag", () => {
  test("treats \\Seen in the stored flags as read on the server", () => {
    expect(
      labelJsonHasSeen(
        JSON.stringify({ flags: ["\\Seen"], gmLabels: ["\\Inbox", "\\Unread"] }),
      ),
    ).toBe(true);
    expect(labelJsonHasSeen(JSON.stringify({ flags: ["\\Flagged"] }))).toBe(
      false,
    );
    expect(labelJsonHasSeen(JSON.stringify({ flags: [] }))).toBe(false);
    expect(labelJsonHasSeen("not-json")).toBe(false);
  });
});

describe("server unseen set", () => {
  const unseen = new Set([10, 12]);

  test("clears inbox mail that another client already marked Seen", () => {
    expect(desiredReadState("inbox", 4, unseen, "gmail-inbox")).toEqual({
      unread: 0,
      folder: "inbox",
    });
    expect(desiredReadState("inbox", 4, unseen, "mailbox")).toEqual({
      unread: 0,
      folder: "inbox",
    });
  });

  test("keeps mail the server still reports as unseen", () => {
    expect(desiredReadState("inbox", 10, unseen, "gmail-inbox")).toEqual({
      unread: 1,
      folder: "inbox",
    });
    expect(desiredReadState("archive", 12, unseen, "gmail-inbox")).toEqual({
      unread: 1,
      folder: "inbox",
    });
  });

  test("does not mark archived or snoozed mail read just because it is outside the inbox unseen set", () => {
    expect(desiredReadState("archive", 4, unseen, "gmail-inbox")).toBeNull();
    expect(desiredReadState("snoozed", 4, unseen, "gmail-inbox")).toBeNull();
    expect(desiredReadState("snoozed", 10, unseen, "mailbox")).toBeNull();
  });

  test("does not pull sent or trash back into the inbox", () => {
    expect(desiredReadState("sent", 10, unseen, "gmail-inbox")).toEqual({
      unread: 1,
      folder: "sent",
    });
    expect(desiredReadState("trash", 10, unseen, "gmail-inbox")).toEqual({
      unread: 1,
      folder: "trash",
    });
  });
});
