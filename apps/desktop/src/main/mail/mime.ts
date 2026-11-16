import { randomBytes } from "node:crypto";

/**
 * Minimal, dependency-free RFC 5322 / MIME message builder.
 *
 * Why this exists: hand-concatenating headers is both a header-injection risk
 * (a subject or filename containing CRLF can add/override headers) and a
 * deliverability bug (non-ASCII subjects/body are corrupted without RFC 2047 /
 * quoted-printable encoding). Everything that leaves Intray goes through here.
 */

export type MailAddress = {
  name?: string;
  email: string;
};

export type RawAttachment = {
  filename: string;
  contentType?: string;
  /** Raw base64 (no data: URL prefix). */
  contentBase64: string;
};

export type RawMessageInput = {
  from: MailAddress;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: RawAttachment[];
  /** Reuse this on retries so the same message is not sent twice. */
  messageId?: string;
  date?: Date;
  replyTo?: string;
};

export type RawMessage = {
  raw: string;
  messageId: string;
  subject: string;
  date: Date;
};

const CRLF = "\r\n";
const MAX_LINE = 78;

/** Strip CR/LF/NUL so a value can never break out of a header. */
export function sanitizeHeaderValue(value: string): string {
  return String(value ?? "")
    .replace(/[\r\n\u0000]+/g, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
}

/** Best-effort email validation; rejects header-breaking addresses. */
export function assertAddress(value: string, label = "recipient"): string {
  const email = sanitizeHeaderValue(value);
  if (!email) throw new Error(`Empty ${label} address.`);
  if (email.length > 320) throw new Error(`Invalid ${label} address.`);
  // Deliberately strict: no display names here, just addr-spec.
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(email)) {
    throw new Error(`Invalid ${label} address: ${email}`);
  }
  return email;
}

export function assertAddressList(
  values: string[],
  label = "recipient",
): string[] {
  if (!Array.isArray(values)) throw new Error(`Invalid ${label} list.`);
  if (values.length > 100) {
    throw new Error(`Too many ${label} addresses (max 100).`);
  }
  return values.map((v) => assertAddress(v, label));
}

function base64Word(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** RFC 2047 encode a header value when it is non-ASCII. Folds long words. */
export function encodeHeaderValue(value: string): string {
  const clean = sanitizeHeaderValue(value);
  if (!/[^\x20-\x7E]/.test(clean)) return clean;

  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of clean) {
    const size = Buffer.byteLength(ch, "utf8");
    // 45 bytes → 60 base64 chars, keeping each encoded-word under 75 chars.
    if (bytes + size > 45 && current) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  if (current) chunks.push(current);
  return chunks.map(base64Word).join(`${CRLF} `);
}

function quoteDisplayName(name: string): string {
  const clean = sanitizeHeaderValue(name);
  if (!clean) return "";
  const encoded = encodeHeaderValue(clean);
  if (encoded.includes("=?")) return encoded;
  if (/[()<>@,;:\\".[\]]/.test(clean)) {
    return `"${clean.replace(/(["\\])/g, "\\$1")}"`;
  }
  return clean;
}

export function formatAddress(address: MailAddress): string {
  const email = assertAddress(address.email, "sender");
  const name = address.name ? quoteDisplayName(address.name) : "";
  return name ? `${name} <${email}>` : email;
}

export function formatAddressList(values: string[]): string {
  return values.map((v) => assertAddress(v)).join(", ");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** RFC 5322 date-time, always UTC to avoid locale/timezone skew. */
export function formatDateHeader(date: Date): string {
  return (
    `${DAYS[date.getUTCDay()]}, ${pad(date.getUTCDate())} ` +
    `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} +0000`
  );
}

/** Stable, globally unique Message-ID. Domain is the sender's, per RFC. */
export function buildMessageId(fromEmail: string, token?: string): string {
  const domain = fromEmail.split("@")[1] || "intray.local";
  const id = (token ?? randomBytes(12).toString("hex")).replace(
    /[^a-zA-Z0-9._-]/g,
    "",
  );
  return `<${id}.${Date.now().toString(36)}@${domain}>`;
}

function foldHeader(name: string, value: string): string {
  if (value.length + name.length + 2 <= MAX_LINE) {
    return `${name}: ${value}`;
  }
  // Fold on existing encoded-word / comma boundaries only; never inside a
  // token that the parser needs intact.
  const parts = value.split(/,\s*/);
  const lines: string[] = [];
  let current = `${name}:`;
  for (let i = 0; i < parts.length; i += 1) {
    const piece = parts[i] + (i < parts.length - 1 ? "," : "");
    if (current.length + 1 + piece.length > MAX_LINE && current.trim()) {
      lines.push(current);
      current = ` ${piece}`;
    } else {
      current += ` ${piece}`;
    }
  }
  if (current.trim()) lines.push(current);
  return lines.join(CRLF);
}

function encodeQuotedPrintable(input: string): string {
  const normalized = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const sourceLines = normalized.split("\n");
  const out: string[] = [];

  for (const line of sourceLines) {
    const bytes = Buffer.from(line, "utf8");
    const tokens: string[] = [];
    for (let i = 0; i < bytes.length; i += 1) {
      const b = bytes[i];
      const last = i === bytes.length - 1;
      if (b === 61) {
        tokens.push("=3D");
      } else if (b === 9 || (b >= 32 && b <= 126)) {
        // Trailing tab/space must be encoded or transport strips it.
        if ((b === 32 || b === 9) && last) {
          tokens.push(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
        } else {
          tokens.push(String.fromCharCode(b));
        }
      } else {
        tokens.push(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
      }
    }

    let current = "";
    for (const token of tokens) {
      // 75 leaves room for the trailing soft-break "=".
      if (current.length + token.length > 75) {
        out.push(`${current}=`);
        current = "";
      }
      current += token;
    }
    out.push(current);
  }
  return out.join(CRLF);
}

function base64Lines(base64: string): string {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += 76) {
    chunks.push(clean.slice(i, i + 76));
  }
  return chunks.join(CRLF);
}

function asciiFallback(value: string): string {
  return sanitizeHeaderValue(value)
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180);
}

function rfc2231(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function safeContentType(value: string | undefined): string {
  const type = sanitizeHeaderValue(value || "application/octet-stream");
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type)
    ? type
    : "application/octet-stream";
}

function boundaryFor(kind: string): string {
  return `=_intray_${kind}_${randomBytes(9).toString("hex")}`;
}

type BodyPart = {
  headers: string[];
  body: string;
};

function textPart(text: string): BodyPart {
  return {
    headers: [
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
    ],
    body: encodeQuotedPrintable(text),
  };
}

function htmlPart(html: string): BodyPart {
  return {
    headers: [
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
    ],
    body: encodeQuotedPrintable(html),
  };
}

function attachmentPart(att: RawAttachment): BodyPart {
  const filename = sanitizeHeaderValue(att.filename || "attachment");
  return {
    headers: [
      `Content-Type: ${safeContentType(att.contentType)}; name="${asciiFallback(filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${rfc2231(filename)}`,
    ],
    body: base64Lines(att.contentBase64),
  };
}

function serializePart(part: BodyPart): string {
  return `${part.headers.join(CRLF)}${CRLF}${CRLF}${part.body}`;
}

function multipart(
  kind: string,
  parts: BodyPart[],
  extraHeaders: string[] = [],
): BodyPart {
  const boundary = boundaryFor(kind);
  const body = parts
    .map((p) => `--${boundary}${CRLF}${serializePart(p)}`)
    .join(CRLF);
  return {
    headers: [
      `Content-Type: multipart/${kind}; boundary="${boundary}"`,
      ...extraHeaders,
    ],
    body: `${body}${CRLF}--${boundary}--`,
  };
}

/** Build a complete RFC 5322 message ready for SMTP or Gmail's raw API. */
export function buildRawMessage(input: RawMessageInput): RawMessage {
  const to = assertAddressList(input.to, "To");
  if (!to.length) throw new Error("At least one recipient is required.");
  const cc = assertAddressList(input.cc ?? [], "Cc");
  const bcc = assertAddressList(input.bcc ?? [], "Bcc");
  const subject = sanitizeHeaderValue(input.subject || "(no subject)");
  const date = input.date ?? new Date();
  const messageId =
    input.messageId && /^<[^<>\s]+>$/.test(input.messageId)
      ? input.messageId
      : buildMessageId(input.from.email);

  const bodyPart = input.html?.trim()
    ? multipart("alternative", [textPart(input.text), htmlPart(input.html)])
    : textPart(input.text);

  const attachments = (input.attachments ?? []).map(attachmentPart);
  const root =
    attachments.length > 0
      ? multipart("mixed", [bodyPart, ...attachments])
      : bodyPart;

  const headers: string[] = [
    `From: ${formatAddress(input.from)}`,
    foldHeader("To", formatAddressList(to)),
  ];
  if (cc.length) headers.push(foldHeader("Cc", formatAddressList(cc)));
  if (bcc.length) headers.push(foldHeader("Bcc", formatAddressList(bcc)));
  if (input.replyTo) {
    headers.push(`Reply-To: ${assertAddress(input.replyTo, "Reply-To")}`);
  }
  headers.push(`Subject: ${encodeHeaderValue(subject)}`);
  headers.push(`Date: ${formatDateHeader(date)}`);
  headers.push(`Message-ID: ${messageId}`);
  headers.push("MIME-Version: 1.0");
  headers.push(...root.headers);

  return {
    raw: `${headers.join(CRLF)}${CRLF}${CRLF}${root.body}`,
    messageId,
    subject,
    date,
  };
}
