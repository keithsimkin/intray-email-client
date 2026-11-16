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

export async function withImap<T>(
  accountId: string,
  fn: (client: ImapFlow, creds: ImapCredentials) => Promise<T>,
): Promise<T> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "imap") {
    throw new Error("IMAP credentials missing");
  }
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapPort === 993,
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
    logger: false,
  });
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
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapPort === 993,
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
    logger: false,
  });
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

export async function listRecentEnvelopes(
  accountId: string,
  opts?: { mailbox?: string; limit?: number },
): Promise<ImapEnvelope[]> {
  const mailbox = opts?.mailbox ?? "INBOX";
  const limit = opts?.limit ?? 100;

  return withImap(accountId, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const exists = client.mailbox && typeof client.mailbox !== "boolean"
        ? client.mailbox.exists
        : 0;
      if (!exists) return [];

      const from = Math.max(1, exists - limit + 1);
      const out: ImapEnvelope[] = [];
      const uidValidity =
        client.mailbox && typeof client.mailbox !== "boolean"
          ? Number(client.mailbox.uidValidity)
          : 0;

      for await (const msg of client.fetch(`${from}:${exists}`, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 4096 },
      })) {
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
        const refs = env?.references ?? [];
        const threadKey =
          (Array.isArray(refs) && refs[0]) ||
          messageId ||
          `uid-${uidValidity}-${msg.uid}`;

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

        out.push({
          uid: msg.uid,
          uidValidity,
          messageId,
          threadId: String(threadKey),
          flags,
          date: env?.date ?? null,
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
      return out.reverse();
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
      if (!msg?.source) throw new Error("Message source missing");
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
  const transport = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpPort === 465,
    auth: {
      user: creds.username || creds.email,
      pass: creds.password,
    },
  });
  await transport.sendMail({
    from: `"${draft.fromName}" <${draft.fromEmail}>`,
    to: draft.to.join(", "),
    cc: draft.cc?.join(", "),
    bcc: draft.bcc?.join(", "),
    subject: draft.subject || "(no subject)",
    text: draft.bodyText,
    attachments: draft.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType || "application/octet-stream",
      content: Buffer.from(a.contentBase64, "base64"),
    })),
  });
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
