import { useEffect, useState } from "react";
import { avatarForEmail } from "./assets/avatars";
import {
  accounts as seedAccounts,
  messages as seedMessages,
  UNIFIED_ID,
  type Account,
  type Message,
  type Recipient,
} from "./data/mock";
import type { ContactDto } from "../shared/types";

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

function addContact(
  map: Map<string, Contact>,
  name: string,
  email: string,
  color?: string,
  avatarUrl?: string,
) {
  const key = email.toLowerCase();
  if (!key || map.has(key)) return;
  map.set(key, {
    name,
    email,
    initials: initials(name || email),
    color: color ?? "#8a8f98",
    avatarUrl: avatarUrl ?? avatarForEmail(email),
  });
}

/** Build a directory from accounts + thread participants (+ optional extras). */
export function buildContacts(opts?: {
  accounts?: Account[];
  messages?: Message[];
  remote?: ContactDto[];
  /** Fictional extras for offline demo only. */
  includeDemoExtras?: boolean;
}): Contact[] {
  const map = new Map<string, Contact>();
  const accountList = opts?.accounts ?? seedAccounts;
  const messageList = opts?.messages ?? seedMessages;
  const includeExtras = opts?.includeDemoExtras ?? !opts;

  for (const c of opts?.remote ?? []) {
    addContact(map, c.name, c.email, c.color, c.avatarUrl);
  }

  for (const a of accountList) {
    if (a.id === UNIFIED_ID) continue;
    addContact(map, a.name, a.email, a.color, a.avatarUrl);
  }

  for (const m of messageList) {
    addContact(map, m.from, m.email, m.avatarColor, m.avatarUrl);
    for (const t of m.thread) {
      addContact(map, t.from, t.email, t.avatarColor, t.avatarUrl);
      for (const r of t.to ?? []) addContact(map, r.name, r.email);
      for (const r of t.cc ?? []) addContact(map, r.name, r.email);
    }
  }

  if (includeExtras) {
    const extras: { name: string; email: string; color: string }[] = [
      { name: "Jordan Lee", email: "jordan@intray.app", color: "#8b7cf6" },
      { name: "Maya Chen", email: "maya@acme.co", color: "#f5a524" },
      { name: "Noah Kim", email: "noah@northwind.io", color: "#46c5e8" },
      { name: "Priya Shah", email: "priya@intray.app", color: "#3dd68c" },
      { name: "Alex Rivera", email: "alex@ledgerly.com", color: "#ea4335" },
    ];
    for (const e of extras) addContact(map, e.name, e.email, e.color);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

const demoDirectory = buildContacts();

let activeDirectory: Contact[] = demoDirectory;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Swap the shared picker directory (search, @mentions, compose).
 * Pass `null` to restore the offline demo corpus; pass `[]` for an empty live directory.
 */
export function setContactDirectory(contacts: Contact[] | null) {
  activeDirectory = contacts === null ? demoDirectory : contacts;
  notify();
}

export function getContactDirectory(): Contact[] {
  return activeDirectory;
}

/** Subscribe to directory updates (live login replaces demo people). */
export function useContacts(): Contact[] {
  const [contacts, setContacts] = useState(activeDirectory);
  useEffect(() => {
    const onChange = () => setContacts(activeDirectory);
    listeners.add(onChange);
    onChange();
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return contacts;
}

/** Deduped people — offline demo corpus until live contacts are loaded. */
export const directory = demoDirectory;

export function filterContacts(
  query: string,
  excludeEmails: Set<string> = new Set(),
  limit = 6,
  source: Contact[] = activeDirectory,
): Contact[] {
  const q = query.trim().toLowerCase();
  return source
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
