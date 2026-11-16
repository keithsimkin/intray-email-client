import { avatarForEmail } from "./assets/avatars";
import {
  accounts,
  messages,
  UNIFIED_ID,
  type Recipient,
} from "./data/mock";

export type Contact = Recipient & {
  initials: string;
  color: string;
  avatarUrl?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

/** Deduped people from accounts + threads — source for @mentions. */
export function buildContacts(): Contact[] {
  const map = new Map<string, Contact>();

  const add = (
    name: string,
    email: string,
    color?: string,
    avatarUrl?: string,
  ) => {
    const key = email.toLowerCase();
    if (!key || map.has(key)) return;
    map.set(key, {
      name,
      email,
      initials: initials(name || email),
      color: color ?? "#8a8f98",
      avatarUrl: avatarUrl ?? avatarForEmail(email),
    });
  };

  for (const a of accounts) {
    if (a.id === UNIFIED_ID) continue;
    add(a.name, a.email, a.color, a.avatarUrl);
  }

  for (const m of messages) {
    add(m.from, m.email, m.avatarColor, m.avatarUrl);
    for (const t of m.thread) {
      add(t.from, t.email, t.avatarColor, t.avatarUrl);
      for (const r of t.to ?? []) add(r.name, r.email);
      for (const r of t.cc ?? []) add(r.name, r.email);
    }
  }

  // Extra directory people you might @ without a prior thread
  const extras: { name: string; email: string; color: string }[] = [
    { name: "Jordan Lee", email: "jordan@intray.app", color: "#8b7cf6" },
    { name: "Maya Chen", email: "maya@acme.co", color: "#f5a524" },
    { name: "Noah Kim", email: "noah@northwind.io", color: "#46c5e8" },
    { name: "Priya Shah", email: "priya@intray.app", color: "#3dd68c" },
    { name: "Alex Rivera", email: "alex@ledgerly.com", color: "#ea4335" },
  ];
  for (const e of extras) add(e.name, e.email, e.color);

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export const directory = buildContacts();

export function filterContacts(
  query: string,
  excludeEmails: Set<string> = new Set(),
  limit = 6,
): Contact[] {
  const q = query.trim().toLowerCase();
  return directory
    .filter((c) => !excludeEmails.has(c.email.toLowerCase()))
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

/** Active @query just before the caret, or null. */
export function mentionQueryAt(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = before.match(/(^|[\s([{"'])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = caret - query.length - 1;
  return { start, query };
}
