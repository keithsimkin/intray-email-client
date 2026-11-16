import type { MessageRow } from "../../db";
import {
  extractBodies,
  headerValue,
  type GmailMessage,
} from "./client";

const AVATAR_COLORS = [
  "#5b8def",
  "#ea4335",
  "#0a7cff",
  "#2dd4bf",
  "#8b7cf6",
  "#f5a524",
  "#e85d75",
];

export function initialsFrom(name: string, email: string): string {
  const base = name.trim() || email.split("@")[0] || "?";
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function avatarColorFor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function parseAddressList(raw: string): { name: string; email: string }[] {
  if (!raw.trim()) return [];
  // Simple split on commas outside quotes
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  return parts.map((p) => {
    const m = p.trim().match(/^(?:"?([^"]*)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/);
    if (m) {
      const email = m[2].toLowerCase();
      const name = (m[1] || email.split("@")[0]).trim();
      return { name, email };
    }
    return { name: p.trim(), email: p.trim() };
  });
}

export function folderFromLabels(labelIds: string[] | undefined): string {
  const labels = new Set(labelIds ?? []);
  if (labels.has("TRASH")) return "trash";
  if (labels.has("SPAM")) return "junk";
  if (labels.has("DRAFT")) return "drafts";
  if (labels.has("SENT") && !labels.has("INBOX")) return "sent";
  if (labels.has("INBOX")) return "inbox";
  return "archive";
}

export function gmailMessageToRow(
  accountId: string,
  msg: GmailMessage,
): MessageRow {
  const headers = msg.payload?.headers;
  const fromRaw = headerValue(headers, "From");
  const toRaw = headerValue(headers, "To");
  const ccRaw = headerValue(headers, "Cc");
  const subject = headerValue(headers, "Subject") || "(no subject)";
  const from = parseAddressList(fromRaw)[0] ?? {
    name: "Unknown",
    email: "unknown",
  };
  const labelIds = msg.labelIds ?? [];
  const dateMs = Number(msg.internalDate ?? Date.now());

  return {
    id: `${accountId}:${msg.id}`,
    account_id: accountId,
    thread_id: msg.threadId,
    provider_id: msg.id,
    folder: folderFromLabels(labelIds),
    subject,
    snippet: msg.snippet ?? "",
    from_name: from.name,
    from_email: from.email,
    to_json: JSON.stringify(parseAddressList(toRaw)),
    cc_json: JSON.stringify(parseAddressList(ccRaw)),
    date_ms: dateMs,
    unread: labelIds.includes("UNREAD") ? 1 : 0,
    important:
      labelIds.includes("IMPORTANT") || labelIds.includes("STARRED") ? 1 : 0,
    starred: labelIds.includes("STARRED") ? 1 : 0,
    has_attachment: hasAttachment(msg) ? 1 : 0,
    label_ids_json: JSON.stringify(labelIds),
    ui_label_id: null,
    snooze_until_ms: null,
    internal_date: msg.internalDate ?? null,
  };
}

function hasAttachment(msg: GmailMessage): boolean {
  const walk = (p?: GmailMessage["payload"]): boolean => {
    if (!p) return false;
    if (p.filename && p.body?.attachmentId) return true;
    return (p.parts ?? []).some(walk);
  };
  return walk(msg.payload);
}

export function formatRelativeTime(dateMs: number): string {
  const diff = Date.now() - dateMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function bodiesFromGmail(msg: GmailMessage): {
  text?: string;
  html?: string;
} {
  return extractBodies(msg.payload);
}
