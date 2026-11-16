import { describe, expect, test } from "bun:test";
import { normalizeFolderPath, presetFor } from "../src/main/providers/imap/presets";
import {
  explainGmailImapError,
  gmailAppPasswordFormatError,
  gmailSyncMailboxes,
  normalizeGmailAppPassword,
  placementForGmail,
  GMAIL_APP_PASSWORD_URL,
} from "../src/shared/gmailImap";

describe("Gmail app password", () => {
  test("strips spaces, non-breaking spaces, and hyphens", () => {
    expect(normalizeGmailAppPassword("abcd efgh ijkl mnop")).toBe(
      "abcdefghijklmnop",
    );
    expect(normalizeGmailAppPassword("ABCD\u00a0EFGH-IJKL MNOP")).toBe(
      "abcdefghijklmnop",
    );
  });

  test("accepts a 16-letter app password and rejects a normal password", () => {
    expect(gmailAppPasswordFormatError("abcd efgh ijkl mnop")).toBeNull();
    const message = gmailAppPasswordFormatError("Summer2024!");
    if (typeof message !== "string") {
      throw new Error("expected a format error");
    }
    expect(message).toContain("normal Google password");
    expect(message).toContain("2-Step Verification");
    expect(message).toContain(GMAIL_APP_PASSWORD_URL);
    expect(message).toContain("Advanced Protection");
    expect(message).toContain("Workspace");
  });
});

describe("Gmail auth errors", () => {
  test("explains a normal password, a bad app password, and disabled IMAP", () => {
    const normal = explainGmailImapError({
      authenticationFailed: true,
      response:
        "Application-specific password required: https://support.google.com/accounts/answer/185833",
    });
    expect(normal).toContain("normal Google password");
    expect(normal).toContain(GMAIL_APP_PASSWORD_URL);

    const bad = explainGmailImapError({
      authenticationFailed: true,
      serverResponseCode: "AUTHENTICATIONFAILED",
      response: "Invalid credentials (Failure)",
    });
    expect(bad).toContain("Authentication failed");
    expect(bad).toContain("enable IMAP");
    expect(bad).toContain("Advanced Protection");

    const disabled = explainGmailImapError({
      message: "IMAP access is disabled for your domain.",
    });
    expect(disabled).toContain("refused IMAP");
    expect(disabled).toContain("Forwarding and POP/IMAP");

    const browser = explainGmailImapError({
      authenticationFailed: true,
      response: "Please log in via your web browser",
    });
    expect(browser).toContain("browser");
    expect(browser).toContain("app password");
  });

  test("leaves network failures alone", () => {
    expect(
      explainGmailImapError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND" }),
    ).toBeNull();
  });
});

describe("Gmail folders", () => {
  const listed = [
    { path: "INBOX", name: "INBOX" },
    { path: "[Gmail]/All Mail", name: "All Mail", specialUse: "\\All" },
    { path: "[Gmail]/Sent Mail", name: "Sent Mail", specialUse: "\\Sent" },
    { path: "[Gmail]/Drafts", name: "Drafts", specialUse: "\\Drafts" },
    { path: "[Gmail]/Spam", name: "Spam", specialUse: "\\Junk" },
    { path: "[Gmail]/Trash", name: "Trash", specialUse: "\\Trash" },
    { path: "[Gmail]/Starred", name: "Starred", specialUse: "\\Flagged" },
    { path: "[Gmail]/Important", name: "Important" },
    { path: "[Gmail]/Work", name: "Work" },
  ];

  test("syncs All Mail once, plus Spam and Trash, and skips label copies", () => {
    expect(gmailSyncMailboxes(listed).map((box) => box.path)).toEqual([
      "[Gmail]/All Mail",
      "[Gmail]/Spam",
      "[Gmail]/Trash",
    ]);
  });

  test("uses localized special-use flags instead of English names", () => {
    const paths = gmailSyncMailboxes([
      { path: "INBOX" },
      { path: "[Gmail]/Alle Nachrichten", specialUse: "\\All" },
      { path: "[Gmail]/Gesendet", specialUse: "\\Sent" },
      { path: "[Gmail]/Spam", specialUse: "\\Junk" },
      { path: "[Gmail]/Papierkorb", specialUse: "\\Trash" },
    ]).map((box) => [box.role, box.path]);
    expect(paths).toEqual([
      ["all", "[Gmail]/Alle Nachrichten"],
      ["junk", "[Gmail]/Spam"],
      ["trash", "[Gmail]/Papierkorb"],
    ]);
  });

  test("maps labels onto one folder so a labeled inbox message is not duplicated", () => {
    expect(
      placementForGmail({
        role: "all",
        flags: ["\\Flagged", "\\Seen"],
        labels: ["\\Inbox", "\\Important", "\\Starred", "Work"],
      }),
    ).toEqual({ folder: "inbox", starred: true, important: true });

    expect(
      placementForGmail({
        role: "all",
        flags: [],
        labels: ["Work"],
      }).folder,
    ).toBe("archive");

    expect(
      placementForGmail({
        role: "all",
        flags: [],
        labels: ["\\Sent"],
      }).folder,
    ).toBe("sent");

    expect(
      placementForGmail({
        role: "all",
        flags: [],
        labels: ["\\Inbox", "\\Sent"],
      }).folder,
    ).toBe("inbox");

    expect(
      placementForGmail({
        role: "junk",
        flags: [],
        labels: ["\\Inbox", "\\Spam"],
      }).folder,
    ).toBe("junk");

    expect(
      placementForGmail({
        role: "all",
        flags: [],
        labels: ["\\Drafts"],
      }).folder,
    ).toBe("drafts");
  });

  test("does not treat All Mail as the inbox when labels are unavailable", () => {
    expect(normalizeFolderPath("[Gmail]/All Mail")).toBe("archive");
    expect(normalizeFolderPath("[Gmail]/Sent Mail")).toBe("sent");
    expect(normalizeFolderPath("[Gmail]/Spam")).toBe("junk");
    expect(normalizeFolderPath("[Gmail]/Trash")).toBe("trash");
    expect(normalizeFolderPath("[Gmail]/Drafts")).toBe("drafts");
    expect(normalizeFolderPath("[Gmail]/Starred")).toBe("archive");
    expect(normalizeFolderPath("INBOX")).toBe("inbox");
  });
});

describe("Gmail preset", () => {
  test("uses IMAP 993 and SMTP 465", () => {
    const preset = presetFor("gmail");
    expect(preset).toMatchObject({
      provider: "gmail",
      imapHost: "imap.gmail.com",
      imapPort: 993,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
    });
  });
});
