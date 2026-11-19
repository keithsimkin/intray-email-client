/** A mailbox pulled out of a mailto: URL. */
export type MailtoAddress = {
  name: string;
  email: string;
};

/** Fields a mailto: URL can prefill on a new message. */
export type MailtoDraft = {
  to: MailtoAddress[];
  cc: MailtoAddress[];
  bcc: MailtoAddress[];
  subject: string;
  body: string;
};

export type MailtoHandlerState = {
  /** User wants other apps to open mailto links in Intray. */
  enabled: boolean;
  /** This install is the OS handler for mailto. */
  isDefault: boolean;
  /** Packaged builds can register. Dev Electron must not take the protocol. */
  canRegister: boolean;
  platform: string;
};

/** Long enough for a prefilled body, short of an IPC-sized paste. */
export const MAILTO_URL_MAX = 200_000;

const MAX_BODY = 100_000;
const MAX_SUBJECT = 998;
const MAX_NAME = 200;
const MAX_RECIPIENTS = 50;

/**
 * Return the mailto URL when `raw` is one, otherwise null.
 * Wrapping quotes are stripped because Windows often passes `"mailto:..."`.
 */
export function extractMailto(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!/^mailto:/i.test(trimmed)) return null;
  if (trimmed.length > MAILTO_URL_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

/** First mailto URL in a process argv list, if any. */
export function findMailtoArg(args: readonly string[]): string | null {
  for (const arg of args) {
    const found = extractMailto(arg);
    if (found) return found;
  }
  return null;
}

/**
 * Parse an RFC 6068 mailto URL into compose fields.
 * Returns null when the string is not a mailto URL.
 * A bare `mailto:` is a blank new message.
 */
export function parseMailto(raw: string): MailtoDraft | null {
  const extracted = extractMailto(raw);
  if (!extracted) return null;
  let url: URL;
  try {
    url = new URL(extracted);
  } catch {
    return null;
  }
  if (url.protocol !== "mailto:") return null;

  const path = safeDecode(url.pathname).replace(/^\/+/, "");
  const to = takeAddresses([path, ...headerValues(url, "to")]);
  const cc = takeAddresses(headerValues(url, "cc"), to);
  const bcc = takeAddresses(headerValues(url, "bcc"), [...to, ...cc]);
  const subject = cleanSubject(headerValues(url, "subject")[0] ?? "");
  const body = cleanBody(headerValues(url, "body")[0] ?? "");
  return { to, cc, bcc, subject, body };
}

function headerValues(url: URL, name: string): string[] {
  const want = name.toLowerCase();
  const values: string[] = [];
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === want) values.push(value);
  }
  return values;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanSubject(value: string): string {
  return value
    .replace(/\0/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, MAX_SUBJECT);
}

function cleanBody(value: string): string {
  return value
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, MAX_BODY);
}

function takeAddresses(
  chunks: string[],
  already: readonly MailtoAddress[] = [],
): MailtoAddress[] {
  const seen = new Set(already.map((item) => item.email));
  const out: MailtoAddress[] = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    for (const part of splitAddresses(chunk)) {
      const address = parseAddress(part);
      if (!address || seen.has(address.email)) continue;
      seen.add(address.email);
      out.push(address);
      if (out.length >= MAX_RECIPIENTS) return out;
    }
  }
  return out;
}

/** Comma-separated mailboxes. Commas inside quotes or <> stay put. */
function splitAddresses(value: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote = false;
  let angle = 0;
  for (const ch of value) {
    if (ch === '"') {
      quote = !quote;
      current += ch;
      continue;
    }
    if (!quote && ch === "<") {
      angle += 1;
      current += ch;
      continue;
    }
    if (!quote && ch === ">" && angle > 0) {
      angle -= 1;
      current += ch;
      continue;
    }
    if (!quote && angle === 0 && ch === ",") {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function parseAddress(raw: string): MailtoAddress | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const angle = trimmed.match(/^(.*)<([^<>]+)>\s*$/);
  if (angle) {
    const email = normalizeEmail(angle[2] ?? "");
    if (!email) return null;
    const name = cleanName(angle[1] ?? "") || email;
    return { name, email };
  }
  const email = normalizeEmail(trimmed);
  if (!email) return null;
  return { name: email, email };
}

function cleanName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\"/g, '"').trim();
  }
  return name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_NAME);
}

function normalizeEmail(raw: string): string | null {
  let email = raw.trim().replace(/^mailto:/i, "");
  email = safeDecode(email).trim().toLowerCase();
  if (!isEmail(email)) return null;
  return email;
}

function isEmail(email: string): boolean {
  if (email.length < 3 || email.length > 320) return false;
  if (/[\s<>"'(),:;\\]/.test(email)) return false;
  if (/[\u0000-\u001f\u007f]/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  if (domain.includes("@")) return false;
  return true;
}
