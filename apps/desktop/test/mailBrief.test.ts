import { describe, expect, test } from "bun:test";
import type { Message, ThreadMessage } from "../src/renderer/data/mock";
import { quickMailBrief } from "../src/renderer/mailBrief";

function turn(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id">): ThreadMessage {
  return {
    from: "Ankur Genani",
    initials: "AG",
    avatarColor: "#5b8def",
    email: "ankurgen@payoneer.com",
    time: "1d",
    ...partial,
  };
}

function message(partial: Partial<Message> & Pick<Message, "thread">): Message {
  return {
    id: "m1",
    accountId: "work",
    from: "Ankur Genani",
    initials: "AG",
    avatarColor: "#5b8def",
    email: "ankurgen@payoneer.com",
    subject: "Should I Keep This Open?",
    preview: "I hope you're doing well.",
    time: "1d",
    unread: true,
    important: true,
    folder: "inbox",
    ...partial,
  };
}

describe("quickMailBrief", () => {
  test("keeps the ask and drops the greeting and signature", () => {
    const brief = quickMailBrief(
      message({
        thread: [
          turn({
            id: "t1",
            bodyText: [
              "Hi Keith,",
              "I hope you're doing well. I wanted to reach out one final time regarding our conversation.",
              "Before I close the loop, I'd appreciate knowing whether this opportunity is still moving forward.",
              "Best regards,",
              "Ankur Genani",
              "Sales Development — EMEA",
              "ankurgen@payoneer.com",
            ].join("\n"),
          }),
        ],
      }),
    );
    expect(brief.summary).toContain("close the loop");
    expect(brief.summary).not.toMatch(/Hi Keith/i);
    expect(brief.summary).not.toMatch(/Best regards/i);
    expect(brief.summary).not.toMatch(/Payoneer/i);
    expect(brief.summary).not.toMatch(/Sales Development/i);
  });

  test("drops a header dump instead of showing it", () => {
    const brief = quickMailBrief(
      message({
        preview: "Return-path: bounce@icloud.com Original-recipient: me",
        thread: [
          turn({
            id: "t1",
            bodyText:
              "Return-path: bounce@icloud.com\nReceived: from p00-icloudmta.example",
          }),
        ],
      }),
    );
    expect(brief.summary).toBe("");
  });

  test("lists the meeting link first, then other links, and skips scripts", () => {
    const brief = quickMailBrief(
      message({
        meeting: {
          title: "Investor room",
          when: "Today · 9:00 AM",
          url: "https://meet.example.com/room",
        },
        thread: [
          turn({
            id: "t1",
            bodyText: "The deck is ready. Join when you can.",
            bodyHtml:
              '<p>The deck is ready.</p><a href="https://meet.example.com/room">Join</a><a href="javascript:alert(1)">nope</a><a href="https://linkedin.com/in/ankur"><img src="x"></a>',
          }),
        ],
      }),
    );
    expect(brief.links.map((link) => link.href)).toEqual([
      "https://meet.example.com/room",
      "https://linkedin.com/in/ankur",
    ]);
    expect(brief.links[0]?.label).toBe("Investor room");
    expect(brief.links[0]?.host).toBe("meet.example.com");
    expect(brief.links[1]?.label).toBe("LinkedIn");
    expect(brief.links[1]?.host).toBe("linkedin.com");
  });

  test("names button links and hides raw tracking urls from the same site", () => {
    const brief = quickMailBrief(
      message({
        thread: [
          turn({
            id: "t1",
            bodyText:
              "https://e22d5796.click.convertkit-mail4.com/92uoo85nabc https://e22d5796.click.convertkit-mail4.com/92uoo85nxyz",
            bodyHtml: [
              '<a href="https://e22d5796.click.convertkit-mail4.com/aaa">https://e22d5796.click.convertkit-mail4.com/aaa</a>',
              '<a href="https://e22d5796.click.convertkit-mail4.com/guide">Check out the guide</a>',
              '<a href="https://e22d5796.click.convertkit-mail4.com/stats">Check out the stats</a>',
            ].join(""),
          }),
        ],
      }),
    );
    expect(brief.links.map((link) => link.label)).toEqual([
      "Check out the guide",
      "Check out the stats",
    ]);
    expect(brief.links.every((link) => link.host === "convertkit.com")).toBe(true);
    expect(brief.links.some((link) => link.label.includes("convertkit-mail"))).toBe(false);
  });

  test("labels a bare tracking url by the site, not the hash", () => {
    const brief = quickMailBrief(
      message({
        thread: [
          turn({
            id: "t1",
            bodyText: "https://e22d5796.click.convertkit-mail4.com/92uoo85nxyz",
          }),
        ],
      }),
    );
    expect(brief.links).toEqual([
      {
        href: "https://e22d5796.click.convertkit-mail4.com/92uoo85nxyz",
        label: "ConvertKit",
        host: "convertkit.com",
      },
    ]);
  });

  test("drops empty parentheses left in front of the summary", () => {
    const brief = quickMailBrief(
      message({
        preview: "Have you noticed",
        thread: [
          turn({
            id: "t1",
            bodyText:
              "() () Have you noticed that most executives look at a marketing spend as a black box?",
          }),
        ],
      }),
    );
    expect(brief.summary.startsWith("Have you noticed")).toBe(true);
    expect(brief.summary).not.toContain("()");
  });
});
