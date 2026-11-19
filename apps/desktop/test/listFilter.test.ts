import { describe, expect, test } from "bun:test";
import type { Message } from "../src/renderer/data/mock";
import {
  EMPTY_LIST_FILTER,
  listFilterActive,
  listFilterCount,
  messageMatchesListFilter,
  type ListFilter,
} from "../src/renderer/listFilter";

function msg(
  partial: Partial<Message> & Pick<Message, "id">,
): Parameters<typeof messageMatchesListFilter>[0] {
  return {
    unread: false,
    starred: false,
    thread: [],
    ...partial,
  };
}

describe("messageMatchesListFilter", () => {
  const unread = msg({ id: "1", unread: true });
  const read = msg({ id: "2", unread: false });
  const starred = msg({ id: "3", starred: true, unread: true });
  const attached = msg({
    id: "4",
    hasAttachment: true,
    unread: false,
  });

  test("empty filter keeps every message", () => {
    expect(listFilterActive(EMPTY_LIST_FILTER)).toBe(false);
    expect(messageMatchesListFilter(unread, EMPTY_LIST_FILTER)).toBe(true);
    expect(messageMatchesListFilter(read, EMPTY_LIST_FILTER)).toBe(true);
  });

  test("read status is exclusive", () => {
    const unreadOnly: ListFilter = { ...EMPTY_LIST_FILTER, read: "unread" };
    const readOnly: ListFilter = { ...EMPTY_LIST_FILTER, read: "read" };
    expect(messageMatchesListFilter(unread, unreadOnly)).toBe(true);
    expect(messageMatchesListFilter(read, unreadOnly)).toBe(false);
    expect(messageMatchesListFilter(read, readOnly)).toBe(true);
    expect(messageMatchesListFilter(unread, readOnly)).toBe(false);
  });

  test("starred and attachment combine with read status", () => {
    const filter: ListFilter = {
      read: "unread",
      starred: true,
      attachment: true,
    };
    expect(listFilterCount(filter)).toBe(3);
    expect(messageMatchesListFilter(starred, filter)).toBe(false);
    expect(
      messageMatchesListFilter(
        msg({
          id: "5",
          unread: true,
          starred: true,
          attachmentCount: 2,
        }),
        filter,
      ),
    ).toBe(true);
    expect(messageMatchesListFilter(attached, filter)).toBe(false);
  });

  test("attachment matches thread files when the row flag is missing", () => {
    const filter: ListFilter = { ...EMPTY_LIST_FILTER, attachment: true };
    const threaded = msg({
      id: "6",
      thread: [
        {
          id: "6a",
          from: "Ada",
          email: "ada@x.com",
          initials: "A",
          avatarColor: "#000",
          time: "1:00 PM",
          attachments: [{ name: "notes.pdf", size: "12 KB" }],
        },
      ],
    });
    expect(messageMatchesListFilter(threaded, filter)).toBe(true);
    expect(messageMatchesListFilter(read, filter)).toBe(false);
  });
});
