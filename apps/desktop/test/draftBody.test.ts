import { describe, expect, test } from "bun:test";
import {
  draftSnippet,
  packDraftBody,
  splitDraftBcc,
} from "../src/shared/draftBody";
import {
  composeHasContent,
  composeTabLabel,
  localDraftMessage,
} from "../src/renderer/composeDraft";

describe("draft body packing", () => {
  test("leaves a body alone when there is no bcc", () => {
    expect(packDraftBody("Hello", [])).toBe("Hello");
    expect(splitDraftBcc("Hello")).toEqual({ text: "Hello", bcc: [] });
  });

  test("round-trips bcc addresses and keeps the typed body", () => {
    const packed = packDraftBody("See you then", ["ada@example.com", "nope"]);
    const split = splitDraftBcc(packed);
    expect(split.text).toBe("See you then");
    expect(split.bcc).toEqual(["ada@example.com"]);
  });

  test("ignores a broken trailer", () => {
    const raw = `Hello${"\u0001intray-draft-bcc:"}not-json`;
    expect(splitDraftBcc(raw)).toEqual({ text: raw, bcc: [] });
  });

  test("builds a list preview from recipients and the body", () => {
    expect(
      draftSnippet({
        to: ["Ada"],
        cc: [],
        bcc: ["Bea"],
        body: "  Lunch\ntomorrow  ",
      }),
    ).toBe("To Ada · Bcc Bea — Lunch tomorrow");
  });
});

describe("compose tabs", () => {
  test("an untouched compose is empty", () => {
    expect(
      composeHasContent({
        to: [],
        cc: [],
        bcc: [],
        subject: "   ",
        body: "\n",
        attachmentCount: 0,
      }),
    ).toBe(false);
  });

  test("any field counts as a draft", () => {
    expect(
      composeHasContent({
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        body: "Hi",
        attachmentCount: 0,
      }),
    ).toBe(true);
  });

  test("the tab uses the subject, then the fallback", () => {
    expect(composeTabLabel("  Hello  ", "Forward")).toBe("Hello");
    expect(composeTabLabel("", "Forward")).toBe("Forward");
    expect(composeTabLabel("  ", "  ")).toBe("New message");
  });

  test("a local draft lands in Drafts with the people it was addressed to", () => {
    const message = localDraftMessage(
      {
        accountId: "work",
        fromName: "Pranav",
        fromEmail: "pranav@intray.app",
        fromLabel: "PP",
        fromColor: "#5b8def",
        to: [{ name: "Ada", email: "ada@example.com" }],
        cc: [],
        bcc: [{ name: "Bea", email: "bea@example.com" }],
        subject: "Lunch",
        body: "Tomorrow?",
        files: [],
      },
      "local-draft:test",
    );
    expect(message.folder).toBe("drafts");
    expect(message.subject).toBe("Lunch");
    expect(message.preview).toContain("To Ada");
    expect(message.preview).toContain("Bcc Bea");
    expect(message.thread[0]?.to?.[0]?.email).toBe("ada@example.com");
    expect(message.thread[0]?.bcc?.[0]?.email).toBe("bea@example.com");
    expect(message.thread[0]?.bodyText).toBe("Tomorrow?");
    expect(message.unread).toBe(false);
  });
});
