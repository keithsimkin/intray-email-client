import { describe, expect, test } from "bun:test";
import { emailHtmlToText } from "../src/shared/htmlText";
import type { Message, ThreadMessage } from "../src/renderer/data/mock";
import {
  formatMailSummary,
  latestReplyBodyKey,
  threadTextForPrompt,
  turnPlainText,
} from "../src/renderer/mailText";

function turn(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id">): ThreadMessage {
  return {
    from: "Ada",
    initials: "A",
    avatarColor: "#5b8def",
    email: "ada@example.com",
    time: "1h",
    ...partial,
  };
}

function message(thread: ThreadMessage[]): Message {
  return {
    id: "m1",
    accountId: "work",
    from: "Ada",
    initials: "A",
    avatarColor: "#5b8def",
    email: "ada@example.com",
    subject: "Friday offer",
    preview: "Your second chance",
    time: "1h",
    unread: true,
    important: false,
    folder: "inbox",
    thread,
  };
}

const styledHtml = `<html><head><style>
html,body{width:100%!important;height:100%!important;margin:0}
.mj-outlook-group-fix { width:100% !important; }
</style></head><body>
<div>Your second chance is here.</div>
<p>The offer ends Friday. Reply if you want the seat.</p>
</body></html>`;

describe("mail summary formatting", () => {
  test("drops asterisks and shows a sentence plus bullets", () => {
    const summary = formatMailSummary(`**New reasons prevent pages in a sitemap from being indexed on site buynsell.ug**

- Google Search Console says some pages on **buynsell.ug** are not being indexed.
- New reason: **Duplicate, Google chose different canonical than user**.
`);
    expect(summary.lead).toBe(
      "New reasons prevent pages in a sitemap from being indexed on site buynsell.ug",
    );
    expect(summary.bullets[0]).toBe(
      "Google Search Console says some pages on buynsell.ug are not being indexed.",
    );
    expect(summary.bullets[1]).toBe(
      "New reason: Duplicate, Google chose different canonical than user.",
    );
    expect(JSON.stringify(summary)).not.toContain("*");
  });
});

describe("email html for AI", () => {
  test("drops stylesheets and keeps the message", () => {
    const text = emailHtmlToText(styledHtml);
    expect(text).toContain("Your second chance is here.");
    expect(text).toContain("The offer ends Friday.");
    expect(text).not.toContain("!important");
    expect(text).not.toContain("mj-outlook");
  });

  test("prefers the text/plain part of an HTML email", () => {
    const text = turnPlainText(
      turn({
        id: "a",
        bodyText: "Please confirm the Friday meeting so I can book the room.",
        bodyHtml: styledHtml,
      }),
    );
    expect(text).toBe("Please confirm the Friday meeting so I can book the room.");
    expect(text).not.toContain("!important");
  });

  test("uses HTML text when the plain part is only a short stub", () => {
    const text = turnPlainText(
      turn({
        id: "a",
        bodyText: "View in browser",
        bodyHtml: styledHtml,
      }),
    );
    expect(text).toContain("The offer ends Friday.");
    expect(text).not.toContain("!important");
  });

  test("ignores the unloaded-body placeholder", () => {
    const unloaded = message([turn({ id: "a", body: ["(No body yet)"] })]);
    expect(latestReplyBodyKey(unloaded)).toBe("");
    expect(threadTextForPrompt(unloaded)).not.toContain("(No body yet)");
  });

  test("prompt includes the HTML message instead of its stylesheet", () => {
    const prompt = threadTextForPrompt(
      message([turn({ id: "a", bodyHtml: styledHtml })]),
      3000,
    );
    expect(prompt).toContain("Subject: Friday offer");
    expect(prompt).toContain("The offer ends Friday.");
    expect(prompt).not.toContain("!important");
  });

  test("keeps the newest message when earlier turns fill the budget", () => {
    const prompt = threadTextForPrompt(
      message([
        turn({ id: "old", bodyText: "A".repeat(2500) }),
        turn({ id: "new", from: "Bea", bodyText: "Please reply today about the contract." }),
      ]),
      400,
    );
    expect(prompt).toContain("Please reply today about the contract.");
    expect(prompt).toContain("Subject: Friday offer");
  });
});
