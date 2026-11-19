/**
 * Gmail over IMAP/SMTP (app passwords).
 *
 * Pure helpers shared by the main process and the Add account form.
 * No Electron or network imports — safe to unit test.
 */

export const GMAIL_APP_PASSWORD_URL =
  "https://myaccount.google.com/apppasswords";

export const GMAIL_IMAP_HOST = "imap.gmail.com";
export const GMAIL_IMAP_PORT = 993;
export const GMAIL_SMTP_HOST = "smtp.gmail.com";
/** Implicit TLS. 587 STARTTLS is also accepted by Gmail and by the SMTP client. */
export const GMAIL_SMTP_PORT = 465;

export const GMAIL_APP_PASSWORD_FORMAT_MESSAGE =
  "That doesn’t look like a Gmail app password. Google app passwords are 16 letters, shown as four groups (abcd efgh ijkl mnop). Your normal Google password will not work. Turn on 2-Step Verification, then create one at " +
  GMAIL_APP_PASSWORD_URL +
  ". Some Workspace, school, and Advanced Protection accounts block app passwords.";

const GMAIL_NORMAL_PASSWORD_MESSAGE =
  "Authentication failed. Gmail rejected a normal Google password and asked for an app password. Turn on 2-Step Verification, create a 16-character app password at " +
  GMAIL_APP_PASSWORD_URL +
  ", and paste that instead. Workspace, school, and Advanced Protection accounts sometimes cannot create app passwords.";

const GMAIL_IMAP_DISABLED_MESSAGE =
  "Authentication failed. Gmail refused IMAP for this account. In Gmail on the web, open Settings → See all settings → Forwarding and POP/IMAP and choose Enable IMAP. A Workspace admin can also turn IMAP off for the whole domain. Sign in with an app password from " +
  GMAIL_APP_PASSWORD_URL +
  " (2-Step Verification must be on). Advanced Protection accounts cannot use app passwords.";

const GMAIL_WEB_LOGIN_MESSAGE =
  "Authentication failed. Gmail blocked this sign-in and asked for a browser login. Approve the prompt in a browser if Google shows one, enable IMAP under Settings → See all settings → Forwarding and POP/IMAP, and use a 16-character app password from " +
  GMAIL_APP_PASSWORD_URL +
  " rather than your normal password. Workspace, school, and Advanced Protection accounts sometimes block app passwords.";

const GMAIL_AUTH_REJECTED_MESSAGE =
  "Authentication failed. Gmail rejected this password. Use the 16-character app password, not your normal Google password, and confirm 2-Step Verification is on. Create a new one at " +
  GMAIL_APP_PASSWORD_URL +
  ". If it still fails, enable IMAP under Settings → See all settings → Forwarding and POP/IMAP. Some Workspace, school, and Advanced Protection accounts block app passwords.";

export type MailboxRole =
  | "all"
  | "inbox"
  | "sent"
  | "drafts"
  | "junk"
  | "trash"
  | "other";

export type ListedMailbox = {
  path: string;
  name?: string;
  specialUse?: string;
};

export type SyncMailbox = {
  path: string;
  role: MailboxRole;
};

export type GmailPlacement = {
  folder: "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive";
  starred: boolean;
  important: boolean;
};

/** English paths used when LIST fails or the server omits special-use flags. */
export const GMAIL_FALLBACK_SYNC_MAILBOXES: SyncMailbox[] = [
  { path: "[Gmail]/All Mail", role: "all" },
  { path: "[Gmail]/Spam", role: "junk" },
  { path: "[Gmail]/Trash", role: "trash" },
];

export function isGmailImapTarget(input: {
  brand?: string;
  imapHost?: string;
  smtpHost?: string;
}): boolean {
  if ((input.brand ?? "").toLowerCase() === "gmail") return true;
  const host = `${input.imapHost ?? ""} ${input.smtpHost ?? ""}`.toLowerCase();
  return (
    host.includes(GMAIL_IMAP_HOST) || host.includes(GMAIL_SMTP_HOST)
  );
}

/**
 * Google shows app passwords as "abcd efgh ijkl mnop". People also paste
 * non-breaking spaces or hyphens. The password itself is 16 letters.
 */
export function normalizeGmailAppPassword(password: string): string {
  return password.replace(/[\s\u00a0-]+/g, "").toLowerCase();
}

export function gmailAppPasswordFormatError(password: string): string | null {
  const normalized = normalizeGmailAppPassword(password);
  if (/^[a-z]{16}$/.test(normalized)) return null;
  return GMAIL_APP_PASSWORD_FORMAT_MESSAGE;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return String(error ?? "");
  const err = error as {
    message?: unknown;
    response?: unknown;
    responseText?: unknown;
    serverResponseCode?: unknown;
    code?: unknown;
  };
  return [err.message, err.response, err.responseText, err.serverResponseCode, err.code]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
}

/**
 * Map a Gmail IMAP/SMTP auth failure onto a message that says what to fix.
 * Returns null for errors that are not Gmail sign-in failures (DNS, timeouts).
 */
export function explainGmailImapError(error: unknown): string | null {
  const text = errorText(error);
  const lower = text.toLowerCase();
  const authenticationFailed =
    typeof error === "object" &&
    error !== null &&
    (error as { authenticationFailed?: boolean }).authenticationFailed === true;

  const imapDisabled = /imap[^.\n]{0,60}disabled/.test(lower);
  if (imapDisabled) return GMAIL_IMAP_DISABLED_MESSAGE;

  const auth =
    authenticationFailed ||
    /authenticationfailed|authentication failed|invalid credentials|application-specific password required|username and password not accepted|\b535\b|\beauth\b/.test(
      lower,
    );
  if (!auth) return null;

  if (/application-specific password required/.test(lower)) {
    return GMAIL_NORMAL_PASSWORD_MESSAGE;
  }
  if (/log in via your web browser|please log in via your web browser|displayunlockcaptcha/.test(lower)) {
    return GMAIL_WEB_LOGIN_MESSAGE;
  }
  return GMAIL_AUTH_REJECTED_MESSAGE;
}

/**
 * Non-Gmail IMAP/SMTP auth failures → actionable copy. Returns null for
 * unrelated errors (DNS, timeouts, TLS).
 */
export function explainImapAuthError(error: unknown): string | null {
  const text = errorText(error);
  const lower = text.toLowerCase();
  if (
    /too many simultaneous connections|maximum number of connections|connection limit|too many login/.test(
      lower,
    )
  ) {
    return "This mailbox already has too many open sessions. Close it in other mail apps, wait a moment, then try again.";
  }
  if (
    /authenticationfailed|authentication failed|invalid credentials|username and password not accepted|\b535\b|\beauth\b|login failed|invalid user name or password|invalid username or password/.test(
      lower,
    )
  ) {
    return "That app password was rejected. Check for typos, generate a fresh app password for this account, and try again.";
  }
  if (/log in via your web browser|please log in via your web browser/.test(lower)) {
    return "The provider asked for a browser login first. Sign in on the web, approve any security prompt, then try again here.";
  }
  return null;
}

function normToken(value: string): string {
  return value.trim().toLowerCase().replace(/^\\+/, "");
}

function hasFlag(flags: Iterable<string>, name: string): boolean {
  const want = name.toLowerCase();
  for (const flag of flags) {
    if (flag.toLowerCase() === want) return true;
  }
  return false;
}

/**
 * IMAP unread bit for the local store.
 *
 * `\Seen` is the only reliable read signal. Gmail also lists `\Unread` among
 * X-GM-LABELS, but that label is only cleared by clients that remove it
 * explicitly: a message read in Gmail on the web, or any other mail app, keeps
 * a stale `\Unread` label while `\Seen` is set. Trusting the label made read
 * mail look unread again on every sync (and after every app launch).
 *
 * `_gmLabels` is kept for callers that already have X-GM-LABELS handy; labels
 * still decide placement and starred/important state, never the read bit.
 */
export function unreadFromImapSignals(
  flags: Iterable<string>,
  _gmLabels?: Iterable<string> | null,
): 0 | 1 {
  return hasFlag(flags, "\\seen") ? 0 : 1;
}

function folderFromRole(role: MailboxRole): GmailPlacement["folder"] {
  switch (role) {
    case "inbox":
    case "all":
      return "inbox";
    case "sent":
      return "sent";
    case "drafts":
      return "drafts";
    case "junk":
      return "junk";
    case "trash":
      return "trash";
    default:
      return "inbox";
  }
}

/**
 * One Gmail message is stored once. Labels decide the folder; special-use
 * mailboxes win for Spam and Trash, which are not part of All Mail.
 *
 * When `labels` is omitted the server did not return X-GM-LABELS, so the
 * mailbox role is the only signal and All Mail is treated as the inbox.
 */
export function placementForGmail(input: {
  labels?: Iterable<string>;
  flags: Iterable<string>;
  role: MailboxRole;
}): GmailPlacement {
  const flagged = hasFlag(input.flags, "\\flagged");
  const seen = hasFlag(input.flags, "\\seen");

  if (input.labels == null) {
    return {
      folder: folderFromRole(input.role),
      starred: flagged,
      important: flagged || !seen,
    };
  }

  const labels = new Set<string>();
  for (const label of input.labels) labels.add(normToken(label));

  const starred =
    flagged || labels.has("starred") || labels.has("flagged");
  const important = labels.has("important");

  let folder: GmailPlacement["folder"];
  if (
    input.role === "trash" ||
    labels.has("trash") ||
    labels.has("bin")
  ) {
    folder = "trash";
  } else if (
    input.role === "junk" ||
    labels.has("spam") ||
    labels.has("junk")
  ) {
    folder = "junk";
  } else if (
    labels.has("draft") ||
    labels.has("drafts") ||
    input.role === "drafts"
  ) {
    folder = "drafts";
  } else if (labels.has("inbox") || input.role === "inbox") {
    folder = "inbox";
  } else if (labels.has("sent") || input.role === "sent") {
    folder = "sent";
  } else {
    folder = "archive";
  }

  return { folder, starred, important };
}

function normUse(specialUse?: string): string {
  return (specialUse ?? "").replace(/^\\+/, "").toLowerCase();
}

function findByUse(
  listed: ListedMailbox[],
  use: string,
): ListedMailbox | undefined {
  return listed.find((box) => normUse(box.specialUse) === use);
}

function findGmailPath(
  listed: ListedMailbox[],
  patterns: RegExp[],
): ListedMailbox | undefined {
  return listed.find((box) => {
    const haystack = `${box.name ?? ""} ${box.path}`;
    if (!/\[g(oogle)?mail\]/i.test(box.path) && !/\[g(oogle)?mail\]/i.test(box.name ?? "")) {
      return false;
    }
    return patterns.some((pattern) => pattern.test(haystack));
  });
}

/**
 * Mailboxes to sync for Gmail.
 *
 * All Mail holds a single copy of every message except Spam and Trash.
 * Syncing INBOX, Sent, Starred, and Important as well would insert the same
 * message once per label. X-GM-MSGID still collapses anything that does
 * appear twice (a message moving from All Mail into Trash).
 */
export function gmailSyncMailboxes(listed: ListedMailbox[]): SyncMailbox[] {
  if (listed.length === 0) return GMAIL_FALLBACK_SYNC_MAILBOXES;

  const all =
    findByUse(listed, "all") ??
    findGmailPath(listed, [/all mail/i, /alle nachrichten/i, /tous les messages/i]);
  const junk =
    findByUse(listed, "junk") ??
    findGmailPath(listed, [/spam/i, /junk/i]);
  const trash =
    findByUse(listed, "trash") ??
    findGmailPath(listed, [/trash/i, /\bbin\b/i, /papierkorb/i, /corbeille/i]);

  if (all) {
    const targets: SyncMailbox[] = [{ path: all.path, role: "all" }];
    if (junk && junk.path !== all.path) {
      targets.push({ path: junk.path, role: "junk" });
    }
    if (trash && trash.path !== all.path && trash.path !== junk?.path) {
      targets.push({ path: trash.path, role: "trash" });
    }
    return targets;
  }

  const targets: SyncMailbox[] = [];
  const seen = new Set<string>();
  const push = (box: ListedMailbox | undefined, role: MailboxRole, fallback?: string) => {
    const path = box?.path ?? fallback;
    if (!path || seen.has(path)) return;
    seen.add(path);
    targets.push({ path, role });
  };

  const inbox =
    listed.find((box) => box.path.toUpperCase() === "INBOX") ??
    findByUse(listed, "inbox");
  push(inbox, "inbox", "INBOX");
  push(findByUse(listed, "sent") ?? findGmailPath(listed, [/sent/i, /gesendet/i]), "sent");
  push(findByUse(listed, "drafts") ?? findGmailPath(listed, [/draft/i, /entwurf/i]), "drafts");
  push(junk, "junk");
  push(trash, "trash");

  if (targets.length === 0) return GMAIL_FALLBACK_SYNC_MAILBOXES;
  return targets;
}
