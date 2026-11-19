import { describe, expect, test } from "bun:test";
import { buildRawMessage } from "../src/main/mail/mime";
import {
  buildReplyReferences,
  chooseThreadId,
  isGenericSubject,
  normalizeMessageId,
  normalizeRfcHeaders,
  normalizeSubject,
  parseReferences,
} from "../src/main/mail/threading";
import { mergeSentIntoList, unionThreads } from "../src/renderer/threadMerge";
import type { Message, ThreadMessage } from "../src/renderer/data/mock";

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

function message(partial: Partial<Message> & Pick<Message, "id">): Message {
  return {
    accountId: "work",
    from: "Ada",
    initials: "A",
    avatarColor: "#5b8def",
    email: "ada@example.com",
    subject: "Launch plan",
    preview: "The draft is ready",
    time: "1h",
    unread: true,
    important: false,
    folder: "inbox",
    thread: [turn({ id: `${partial.id}:a`, body: ["The draft is ready"] })],
    ...partial,
  };
}

describe("message ids and subjects", () => {
  test("normalizes message ids and reference chains", () => {
    expect(normalizeMessageId(" <Root@Ex.com> ")).toBe("<Root@Ex.com>");
    expect(normalizeMessageId("bare@ex.com")).toBe("<bare@ex.com>");
    expect(normalizeMessageId("two ids <a@x> <b@x>")).toBe("<a@x>");
    expect(parseReferences("<root@x> <parent@x>\n<parent@x>")).toEqual([
      "<root@x>",
      "<parent@x>",
    ]);
  });

  test("strips reply and forward prefixes the way conversation clients do", () => {
    expect(normalizeSubject("Re: Re: Launch plan")).toBe("launch plan");
    expect(normalizeSubject("Fwd: Aw: Launch plan")).toBe("launch plan");
    expect(normalizeSubject("Re[2]: Launch plan")).toBe("launch plan");
    expect(isGenericSubject(normalizeSubject("Re: Hi"))).toBe(true);
    expect(isGenericSubject(normalizeSubject("Re: Launch plan"))).toBe(false);
  });

  test("a reply references the parent chain and then the parent", () => {
    const parent = normalizeRfcHeaders({
      messageId: "<parent@x>",
      references: "<root@x>",
    });
    expect(buildReplyReferences(parent)).toEqual(["<root@x>", "<parent@x>"]);
  });
});

describe("chooseThreadId", () => {
  test("keeps the provider thread id", () => {
    const decision = chooseThreadId({
      providerThreadId: "gm:99",
      headers: normalizeRfcHeaders({ messageId: "<a@x>" }),
      normalizedSubject: "launch plan",
      participants: ["ada@example.com"],
      headerHits: [{ threadId: "<other>", dateMs: 1 }],
      subjectHits: [],
      fallbackId: "uid-1",
    });
    expect(decision).toEqual({ threadId: "gm:99", mergeIds: [] });
  });

  test("joins a reply onto the parent's conversation and merges fragments", () => {
    const decision = chooseThreadId({
      headers: normalizeRfcHeaders({
        messageId: "<child@x>",
        inReplyTo: "<parent@x>",
        references: ["<root@x>", "<parent@x>"],
      }),
      normalizedSubject: "launch plan",
      participants: ["ada@example.com"],
      headerHits: [
        { threadId: "<root@x>", dateMs: 10 },
        { threadId: "uid-fragment", dateMs: 20 },
      ],
      subjectHits: [],
      fallbackId: "uid-9",
    });
    expect(decision.threadId).toBe("<root@x>");
    expect(decision.mergeIds).toEqual(["uid-fragment"]);
  });

  test("does not merge two different gmail threads", () => {
    const decision = chooseThreadId({
      headers: normalizeRfcHeaders({
        messageId: "<child@x>",
        inReplyTo: "<parent@x>",
      }),
      normalizedSubject: "launch plan",
      participants: ["ada@example.com"],
      headerHits: [
        { threadId: "gm:1", dateMs: 10 },
        { threadId: "gm:2", dateMs: 30 },
      ],
      subjectHits: [],
      fallbackId: "uid-9",
    });
    expect(decision.threadId).toBe("gm:2");
    expect(decision.mergeIds).toEqual([]);
  });

  test("uses the reference root when nothing is indexed yet", () => {
    const decision = chooseThreadId({
      headers: normalizeRfcHeaders({
        messageId: "<child@x>",
        references: "<root@x>",
      }),
      normalizedSubject: "hi",
      participants: ["ada@example.com"],
      headerHits: [],
      subjectHits: [{ threadId: "other-subject", dateMs: 50, participants: ["ada@example.com"] }],
      fallbackId: "uid-9",
    });
    expect(decision.threadId).toBe("<root@x>");
  });

  test("groups an unthreaded specific subject with a shared participant", () => {
    const decision = chooseThreadId({
      headers: normalizeRfcHeaders({ messageId: "<new@x>" }),
      normalizedSubject: "launch plan",
      participants: ["ada@example.com"],
      headerHits: [],
      subjectHits: [
        {
          threadId: "existing",
          dateMs: 40,
          participants: ["me@example.com", "ada@example.com"],
        },
      ],
      fallbackId: "<new@x>",
    });
    expect(decision.threadId).toBe("existing");
  });

  test("leaves a generic subject alone when there are no reply headers", () => {
    const decision = chooseThreadId({
      headers: normalizeRfcHeaders({ messageId: "<new@x>" }),
      normalizedSubject: "hi",
      participants: ["ada@example.com"],
      headerHits: [],
      subjectHits: [
        { threadId: "existing", dateMs: 40, participants: ["ada@example.com"] },
      ],
      fallbackId: "<new@x>",
    });
    expect(decision.threadId).toBe("<new@x>");
  });
});

describe("outgoing MIME", () => {
  test("includes In-Reply-To and References", () => {
    const built = buildRawMessage({
      from: { name: "Ada", email: "ada@example.com" },
      to: ["beau@example.com"],
      subject: "Re: Launch plan",
      text: "Sounds good.",
      messageId: "<reply@example.com>",
      inReplyTo: "<parent@example.com>",
      references: ["<root@example.com>", "<parent@example.com>"],
    });
    expect(built.raw).toContain("In-Reply-To: <parent@example.com>");
    expect(built.raw).toContain(
      "References: <root@example.com> <parent@example.com>",
    );
    expect(built.raw).toContain("Message-ID: <reply@example.com>");
  });
});

describe("sent reply in the open conversation", () => {
  test("appends the reply onto the conversation and moves it to the top", () => {
    const open = message({
      id: "inbox-1",
      thread: [turn({ id: "inbox-1", body: ["The draft is ready"] })],
    });
    const other = message({ id: "inbox-2", subject: "Other" });
    const sent = message({
      id: "inbox-1",
      preview: "You: Sounds good.",
      time: "Just now",
      folder: "inbox",
      unread: false,
      thread: [
        turn({ id: "inbox-1", body: ["The draft is ready"] }),
        turn({
          id: "sent-1",
          from: "Me",
          email: "me@example.com",
          time: "Just now",
          body: ["Sounds good."],
        }),
      ],
    });

    const next = mergeSentIntoList([other, open], sent);
    expect(next.map((item) => item.id)).toEqual(["inbox-1", "inbox-2"]);
    expect(next[0]?.thread.map((item) => item.id)).toEqual(["inbox-1", "sent-1"]);
    expect(next[0]?.preview).toBe("You: Sounds good.");
    expect(next[0]?.folder).toBe("inbox");
    expect(next[0]?.from).toBe("Ada");
    expect(next[0]?.unread).toBe(false);
    expect(next[0]?.thread[0]?.body).toEqual(["The draft is ready"]);
  });

  test("keeps a hydrated body when a later list payload has none", () => {
    const thread = unionThreads(
      [turn({ id: "a", body: ["Hello"], bodyText: "Hello", bodyHtml: "<p>Hello</p>" })],
      [turn({ id: "a", body: ["(No body yet)"] }), turn({ id: "b", body: ["You reply"] })],
    );
    expect(thread.map((item) => item.id)).toEqual(["a", "b"]);
    expect(thread[0]?.bodyHtml).toBe("<p>Hello</p>");
    expect(thread[0]?.bodyText).toBe("Hello");
    expect(thread[1]?.body).toEqual(["You reply"]);
  });
});
