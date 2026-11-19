import { describe, expect, test } from "bun:test";
import { buildDayBrief, isPastDay, meetingStatus } from "../src/renderer/agentBrief";
import type { Message } from "../src/renderer/data/mock";

const now = new Date(2026, 10, 19, 15, 0, 0);

function mail(partial: Partial<Message> & Pick<Message, "id" | "subject">): Message {
  return {
    accountId: "work",
    from: "Ada",
    initials: "A",
    avatarColor: "#111",
    email: "ada@example.com",
    preview: "",
    time: "2h",
    unread: false,
    important: false,
    folder: "inbox",
    thread: [],
    ...partial,
  };
}

describe("meetingStatus", () => {
  test("a today time that already passed is missed", () => {
    expect(meetingStatus("Today · 9:00 AM", now)).toBe("missed");
  });

  test("a later today time is still upcoming", () => {
    expect(meetingStatus("Today · 6:00 PM", now)).toBe("upcoming");
  });

  test("next week stays upcoming", () => {
    expect(meetingStatus("Next Mon · 11:00 AM", now)).toBe("upcoming");
  });
});

describe("isPastDay", () => {
  test("relative and yesterday stamps count", () => {
    expect(isPastDay("3h")).toBe(true);
    expect(isPastDay("Yesterday")).toBe(true);
    expect(isPastDay("8:14 AM")).toBe(true);
    expect(isPastDay("2d")).toBe(false);
    expect(isPastDay("Mon")).toBe(false);
  });
});

describe("buildDayBrief", () => {
  test("splits meetings, misses, follow-ups, and the past day", () => {
    const brief = buildDayBrief(
      [
        mail({
          id: "soon",
          subject: "Design review",
          from: "Ava",
          meeting: { title: "Design review", when: "Today · 6:00 PM" },
        }),
        mail({
          id: "gone",
          subject: "Standup",
          from: "Noah",
          meeting: { title: "Standup", when: "Today · 9:00 AM" },
        }),
        mail({
          id: "ask",
          subject: "Can you review the deck?",
          from: "Maya",
          unread: true,
          preview: "Need your thoughts before tomorrow.",
        }),
        mail({
          id: "note",
          subject: "Invoice paid",
          from: "Ledger",
          time: "Yesterday",
          important: true,
        }),
        mail({
          id: "old",
          subject: "Ancient thread",
          time: "Mon",
          unread: false,
        }),
        mail({
          id: "trash",
          subject: "Can you review this too?",
          folder: "trash",
          unread: true,
        }),
      ],
      now,
    );

    expect(brief.meetings.map((item) => item.messageId)).toEqual(["soon"]);
    expect(brief.missed.map((item) => item.messageId)).toEqual(["gone"]);
    expect(brief.followups.map((item) => item.messageId)).toEqual(["ask"]);
    expect(brief.today.map((item) => item.messageId)).toEqual(["note"]);
    expect(brief.headline).toContain("meeting coming up");
    expect(brief.headline).toContain("you may have missed");
    expect(brief.headline).toContain("to follow up");
  });

  test("a quiet inbox still has a headline", () => {
    const brief = buildDayBrief([], now);
    expect(brief.headline).toBe("Nothing in the inbox needs you right now.");
    expect(brief.meetings).toEqual([]);
    expect(brief.followups).toEqual([]);
  });
});
