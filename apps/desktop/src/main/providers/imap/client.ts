import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import { loadCredentials, type ImapCredentials } from "../../crypto/credentials";
import { normalizeFolderPath } from "./presets";

export type ImapEnvelope = {
  uid: number;
  uidValidity: number;
  messageId?: string;
  threadId: string;
  flags: string[];
  date: Date | null;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  snippet: string;
  hasAttachment: boolean;
  folder: string;
  mailboxPath: string;
};

export type ImapMailboxSlice = {
  envelopes: ImapEnvelope[];
  uidValidity: number;
  uidNext: number;
  highestUid: number;
};

/** Never fetch an unbounded backlog in one connection. */
const MAX_INCREMENTAL_MESSAGES = 500;
const SENT_MAILBOXES = [
  "Sent",
  "Sent Messages",
  "Sent Items",
  "INBOX.Sent",
  "[Gmail]/Sent Mail",
];

function addrs(
  value: AddressObject | AddressObject[] | undefined,
): { name: string; email: string }[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: { name: string; email: string }[] = [];
  for (const group of list) {
    for (const a of group.value ?? []) {
      if (!a.address) continue;
      out.push({
        name: (a.name || a.address.split("@")[0]).trim(),
        email: a.address.toLowerCase(),
      });
    }
  }
  return out;
}

function connectionOptions(creds: ImapCredentials) {
  return {
    host: creds.imapHost,
    port: creds.imapPort,
    // Implicit TLS on 993; otherwise require a successful STARTTLS upgrade.
    secure: creds.imapPort === 993,
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
    connectionTimeout: 30_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000,
    logger: false as const,
  };
}

export async function withImap<T>(
  accountId: string,
  fn: (client: ImapFlow, creds: ImapCredentials) => Promise<T>,
): Promise<T> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "imap") {
    throw new Error("IMAP credentials missing");
  }
  const client = new ImapFlow(connectionOptions(creds));
  await client.connect();
  try {
    return await fn(client, creds);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

/** Verify credentials by connecting and selecting INBOX. */
export async function verifyImapLogin(creds: ImapCredentials): Promise<void> {
  const client = new ImapFlow(connectionOptions(creds));
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

function mailboxMeta(client: ImapFlow): {
  exists: number;
  uidValidity: number;
  uidNext: number;
} {
  const box = client.mailbox;
  if (!box || typeof box === "boolean") {
    return { exists: 0, uidValidity: 0, uidNext: 0 };
  }
  return {
    exists: Number(box.exists ?? 0),
    uidValidity: Number(box.uidValidity ?? 0),
    uidNext: Number(box.uidNext ?? 0),
  };
}

/**
 * Fetch envelopes from a mailbox.
 *
 * When `sinceUid` is supplied *and* the mailbox's UIDVALIDITY still matches, we
 * fetch only the new UID window instead of re-scanning the last N messages.
 * That is what makes incremental sync cheap enough to run every 30 seconds.
 */
export async function listRecentEnvelopes(
  accountId: string,
  opts?: {
    mailbox?: string;
    limit?: number;
    sinceUid?: number;
    sinceUidValidity?: number;
  },
): Promise<ImapMailboxSlice> {
  const mailbox = opts?.mailbox ?? "INBOX";
  const limit = opts?.limit ?? 100;

  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const meta = mailboxMeta(client);
      if (!meta.exists) {
        return {
          envelopes: [],
          uidValidity: meta.uidValidity,
          uidNext: meta.uidNext,
          highestUid: opts?.sinceUid ?? 0,
        };
      }

      const incremental =
        opts?.sinceUid != null &&
        opts.sinceUidValidity === meta.uidValidity &&
        meta.uidNext > opts.sinceUid + 1;

      let range: string;
      if (incremental) {
        const start = Math.max(
          opts!.sinceUid! + 1,
          meta.uidNext - MAX_INCREMENTAL_MESSAGES,
        );
        range = `${start}:*`;
      } else {
        const from = Math.max(1, meta.exists - limit + 1);
        range = `${from}:${meta.exists}`;
      }

      const out: ImapEnvelope[] = [];
      for await (const msg of client.fetch(
        range,
        {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: { start: 0, maxLength: 4096 },
        },
        { uid: incremental },
      )) {
        const env = msg.envelope;
        const fromAddr = env?.from?.[0];
        const fromEmail = (fromAddr?.address ?? "unknown").toLowerCase();
        const fromName = fromAddr?.name || fromEmail.split("@")[0];
        const subject = env?.subject || "(no subject)";
        const flags = [...(msg.flags ?? [])].map(String);
        const snippetSource = msg.source
          ? msg.source.toString("utf8").replace(/\s+/g, " ").slice(0, 180)
          : "";
        const messageId = env?.messageId || undefined;
        const refs =
          (env as { references?: string | string[] } | undefined)?.references ??
          [];
        const refList = Array.isArray(refs) ? refs : [refs];
        const threadKey =
          refList[0] || messageId || `uid-${meta.uidValidity}-${msg.uid}`;

        const to =
          env?.to?.map((a) => ({
            name: a.name || a.address?.split("@")[0] || "",
            email: (a.address ?? "").toLowerCase(),
          })) ?? [];
        const cc =
          env?.cc?.map((a) => ({
            name: a.name || a.address?.split("@")[0] || "",
            email: (a.address ?? "").toLowerCase(),
          })) ?? [];

        const hasAttachment = Boolean(
          msg.bodyStructure &&
            JSON.stringify(msg.bodyStructure).includes('"disposition":"attachment"'),
        );

        const date = env?.date
          ? env.date instanceof Date
            ? env.date
            : new Date(env.date)
          : null;

        out.push({
          uid: msg.uid,
          uidValidity: meta.uidValidity,
          messageId,
          threadId: String(threadKey),
          flags,
          date: date && !Number.isNaN(date.getTime()) ? date : null,
          subject,
          fromName,
          fromEmail,
          to: to.filter((t) => t.email),
          cc: cc.filter((t) => t.email),
          snippet: snippetSource || subject,
          hasAttachment,
          folder: normalizeFolderPath(mailbox),
          mailboxPath: mailbox,
        });
      }

      out.sort((a, b) => a.uid - b.uid);
      const highestUid = out.length
        ? out[out.length - 1].uid
        : (opts?.sinceUid ?? 0);

      return {
        envelopes: out,
        uidValidity: meta.uidValidity,
        uidNext: meta.uidNext,
        highestUid,
      };
    } finally {
      lock.release();
    }
  });
}

export async function fetchMessageSource(
  accountId: string,
  mailbox: string,
  uid: number,
): Promise<ParsedMail> {
  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(
        String(uid),
        { source: true, uid: true },
        { uid: true },
      );
      if (!msg || typeof msg === "boolean" || !msg.source) {
        throw new Error("Message source missing");
      }
      return simpleParser(msg.source);
    } finally {
      lock.release();
    }
  });
}

export async function setImapFlags(
  accountId: string,
  mailbox: string,
  uid: number,
  opts: { add?: string[]; remove?: string[] },
): Promise<void> {
  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      if (opts.add?.length) {
        await client.messageFlagsAdd(String(uid), opts.add, { uid: true });
      }
      if (opts.remove?.length) {
        await client.messageFlagsRemove(String(uid), opts.remove, { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}

export async function moveImapMessage(
  accountId: string,
  mailbox: string,
  uid: number,
  dest: string,
): Promise<void> {
  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageMove(String(uid), dest, { uid: true });
    } finally {
      lock.release();
    }
  });
}

/** Flag + expunge so the message is removed permanently from the mailbox. */
export async function deleteImapMessageForever(
  accountId: string,
  mailbox: string,
  uid: number,
): Promise<void> {
  await withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
      await client.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  });
}

/**
 * Idempotency check for SMTP retries: was a message with this Message-ID
 * already copied to a Sent folder? Best-effort — providers disagree on mailbox
 * names, so failures are treated as "not found".
 */
export async function findSentMessage(
  accountId: string,
  messageId: string,
): Promise<boolean> {
  try {
    return await withImap(accountId, async (client) => {
      for (const box of SENT_MAILBOXES) {
        let lock;
        try {
          lock = await client.getMailboxLock(box);
        } catch {
          continue;
        }
        try {
          const found = await client.search(
            { header: { "message-id": messageId } },
            { uid: true },
          );
          if (found && found.length > 0) return true;
        } catch {
          /* unsupported search — try the next mailbox */
        } finally {
          lock.release();
        }
      }
      return false;
    });
  } catch {
    return false;
  }
}

export async function sendSmtp(
  accountId: string,
  draft: {
    fromName: string;
    fromEmail: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyText: string;
    messageId?: string;
    attachments?: {
      filename: string;
      contentType: string;
      contentBase64: string;
    }[];
  },
): Promise<void> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "imap") {
    throw new Error("IMAP/SMTP credentials missing");
  }
  const implicitTls = creds.smtpPort === 465;
  const transport = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: implicitTls,
    // On 587/25 a failed STARTTLS must abort rather than silently send in the
    // clear with the account password attached.
    requireTLS: !implicitTls,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
    connectionTimeout: 30_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000,
    // Attachments are inlined buffers; never let a path/URL be resolved.
    disableFileAccess: true,
    disableUrlAccess: true,
    pool: false,
  });
  try {
    await transport.sendMail({
      from: `"${draft.fromName.replace(/["\\\r\n]/g, "")}" <${draft.fromEmail}>`,
      to: draft.to.join(", "),
      cc: draft.cc?.join(", "),
      bcc: draft.bcc?.join(", "),
      subject: draft.subject || "(no subject)",
      text: draft.bodyText,
      messageId: draft.messageId?.replace(/^<|>$/g, ""),
      attachments: draft.attachments?.map((a) => ({
        filename: a.filename.replace(/[\r\n"]/g, ""),
        contentType: a.contentType || "application/octet-stream",
        content: Buffer.from(a.contentBase64, "base64"),
      })),
    });
  } finally {
    transport.close();
  }
}

export function parsedToBodies(parsed: ParsedMail): {
  text: string | null;
  html: string | null;
} {
  const text = parsed.text?.trim() || null;
  const html =
    typeof parsed.html === "string" && parsed.html.trim()
      ? parsed.html
      : null;
  return { text, html };
}

export function parsedRecipients(parsed: ParsedMail): {
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  fromName: string;
  fromEmail: string;
} {
  const from = addrs(parsed.from)[0] ?? { name: "Unknown", email: "unknown" };
  return {
    fromName: from.name,
    fromEmail: from.email,
    to: addrs(parsed.to),
    cc: addrs(parsed.cc),
  };
}
