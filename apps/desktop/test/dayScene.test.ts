import { describe, expect, test } from "bun:test";
import { buildDayBrief } from "../src/renderer/agentBrief";
import { parseDayScene, presentDay } from "../src/renderer/dayScene";
import type { Message } from "../src/renderer/data/mock";

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

describe("parseDayScene", () => {
  const ids = new Set(["m1", "f1"]);

  test("reads a fenced scene and drops unknown ids", () => {
    const scene = parseDayScene(
      '```json\n{"lede":"Everything here is already read.","meetings":[{"id":"m1","when":"Mon 11:00","who":"Arianna","what":"Data room","note":""},{"id":"nope","when":"","who":"X","what":"Y","note":""}],"followups":[],"quiet":["Quora Digest","This is a full sentence."]}\n```',
      ids,
    );
    expect(scene?.lede).toBe("Everything here is already read.");
    expect(scene?.meetings).toEqual([
      { id: "m1", when: "Mon 11:00", who: "Arianna", what: "Data room", note: "" },
    ]);
    expect(scene?.quiet).toEqual(["Quora Digest"]);
  });

  test("a bullet essay is not a scene", () => {
    expect(
      parseDayScene("- All 12 messages are already read, so nothing in this set is unread.", ids),
    ).toBeNull();
  });
});

describe("presentDay", () => {
  test("without a scene, meetings split the person from the time", () => {
    const brief = buildDayBrief(
      [
        mail({
          id: "m1",
          from: "Arianna Kleynburg",
          subject: "Investor-Ready Data Room",
          time: "yesterday",
          meeting: { title: "Investor-Ready Data Room", when: "Mon 11:00 AM" },
        }),
      ],
      new Date(2026, 10, 19, 15, 0, 0),
    );
    const day = presentDay(brief, null, [
      {
        id: "m1",
        from: "Arianna Kleynburg",
        time: "yesterday",
        subject: "Investor-Ready Data Room",
        preview: "Invite",
        meeting: { when: "Mon 11:00 AM" },
      },
    ]);
    const meeting = day.groups.find((group) => group.kind === "meeting")?.items[0];
    expect(meeting?.who).toBe("Arianna Kleynburg");
    expect(meeting?.what).toBe("Investor-Ready Data Room");
    expect(meeting?.when).toContain("Mon");
  });

  test("a scene replaces the brief instead of repeating it", () => {
    const brief = buildDayBrief(
      [
        mail({
          id: "f1",
          from: "Cloudflare",
          subject: "Your site is on the Free plan",
          unread: true,
        }),
      ],
      new Date(2026, 10, 19, 15, 0, 0),
    );
    const scene = parseDayScene(
      JSON.stringify({
        lede: "Nothing here needs a reply.",
        meetings: [],
        followups: [],
        other: [
          {
            id: "f1",
            when: "",
            who: "Cloudflare",
            what: "Free plan",
            note: "No reply needed",
          },
        ],
        quiet: ["Neil Patel"],
      }),
      new Set(["f1"]),
    );
    const day = presentDay(brief, scene, [
      {
        id: "f1",
        from: "Cloudflare",
        time: "1h",
        subject: "Your site is on the Free plan",
        preview: "Free plan",
      },
    ]);
    expect(day.groups.find((group) => group.kind === "followup")?.items).toEqual([]);
    expect(day.groups.find((group) => group.kind === "today")?.items[0]?.what).toBe("Free plan");
    expect(day.quiet).toEqual(["Neil Patel"]);
  });
});
