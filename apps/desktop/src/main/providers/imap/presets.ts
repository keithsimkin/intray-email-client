import {
  GMAIL_IMAP_HOST,
  GMAIL_IMAP_PORT,
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
} from "../../../shared/gmailImap";
import type { ProviderId } from "../../../shared/types";

export type ImapPreset = {
  provider: ProviderId;
  color: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

const PRESETS: Record<string, ImapPreset> = {
  gmail: {
    provider: "gmail",
    color: "#ea4335",
    imapHost: GMAIL_IMAP_HOST,
    imapPort: GMAIL_IMAP_PORT,
    smtpHost: GMAIL_SMTP_HOST,
    smtpPort: GMAIL_SMTP_PORT,
  },
  icloud: {
    provider: "icloud",
    color: "#3693F3",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
  },
  fastmail: {
    provider: "fastmail",
    color: "#3e4eb8",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 587,
  },
  yahoo: {
    provider: "yahoo",
    color: "#6001d2",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
  },
  outlook: {
    provider: "outlook",
    color: "#0a7cff",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  imap: {
    provider: "imap",
    color: "#8a8f98",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 587,
  },
};

export function presetFor(
  provider: ProviderId | string,
): ImapPreset | undefined {
  return PRESETS[provider];
}

/** Common IMAP folder name → Intray folder id */
export function normalizeFolderPath(path: string): string {
  const raw = path.trim();
  if (!raw || /^inbox$/i.test(raw)) return "inbox";

  const lower = raw.toLowerCase();
  // Gmail exposes every label as a mailbox. All Mail, Starred, and Important
  // are not the inbox — filing them there duplicates or mis-files mail.
  if (
    /\[g(?:oogle)?mail\]\/(?:all mail|alle nachrichten|tous les messages)$/i.test(
      lower,
    ) ||
    /\[g(?:oogle)?mail\]\/(?:starred|important)$/i.test(lower)
  ) {
    return "archive";
  }

  const p = lower.replace(/^inbox[./]/i, "");
  if (/sent/i.test(p)) return "sent";
  if (/draft/i.test(p)) return "drafts";
  if (/trash|deleted|papierkorb|corbeille|\bbin\b/i.test(p)) return "trash";
  if (/junk|spam/i.test(p)) return "junk";
  if (/archive|all mail/i.test(p)) return "archive";
  if (/snooze/i.test(p)) return "snoozed";
  return "inbox";
}
