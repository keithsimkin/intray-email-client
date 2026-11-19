import type { Message } from "./data/mock";
import {
  parseSearchClauses,
  serializeSearchClauses,
  type SearchField,
} from "../shared/searchQuery";

export type { SearchField } from "../shared/searchQuery";
export {
  markQuery,
  parseSlashDraft,
  resolveSlashField,
  slashFieldChoices,
} from "../shared/searchQuery";

export type SearchToken = {
  id: string;
  field: SearchField;
  value: string;
};

export const SEARCH_FIELD_META: Record<
  Exclude<SearchField, "text">,
  { label: string; placeholder: string }
> = {
  from: { label: "From", placeholder: "Name or email…" },
  to: { label: "To", placeholder: "Name or email…" },
  subject: { label: "Subject", placeholder: "Words in the subject…" },
  tag: { label: "Tag", placeholder: "Label name…" },
  has: { label: "Has", placeholder: "attachment, link, or meeting" },
  is: { label: "Is", placeholder: "unread, starred, or important" },
};

let tokenSeq = 0;
export function makeToken(field: SearchField, value: string): SearchToken {
  tokenSeq += 1;
  return {
    id: `tok-${Date.now()}-${tokenSeq}`,
    field,
    value: value.trim(),
  };
}

/** Parse a typed fragment into tokens. Supports from:"Ada Martin" and from:ada. */
export function parseSearchInput(raw: string): {
  tokens: SearchToken[];
  rest: string;
} {
  const clauses = parseSearchClauses(raw);
  const tokens: SearchToken[] = [];
  let rest = "";
  for (const c of clauses) {
    if (c.field === "text") rest = c.value;
    else tokens.push(makeToken(c.field, c.value));
  }
  return { tokens, rest };
}

export function serializeSearch(tokens: SearchToken[]): string {
  return serializeSearchClauses(tokens);
}

function includes(hay: string | undefined, needle: string) {
  if (!hay) return false;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function matchHas(message: Message, value: string) {
  const v = value.toLowerCase();
  if (v.startsWith("attach")) {
    return Boolean(
      message.hasAttachment ||
        (message.attachmentCount ?? 0) > 0 ||
        message.thread.some((t) => (t.attachments?.length ?? 0) > 0),
    );
  }
  if (v.startsWith("link")) {
    return (message.linkCount ?? 0) > 0;
  }
  if (v.startsWith("meet") || v === "calendar") {
    return Boolean(message.meeting || message.thread.some((t) => t.meeting));
  }
  return false;
}

function matchIs(message: Message, value: string) {
  const v = value.toLowerCase();
  if (v === "unread") return message.unread;
  if (v === "read") return !message.unread;
  if (v.startsWith("star")) return Boolean(message.starred);
  if (v.startsWith("import")) return message.important;
  return false;
}

function messageHaystack(message: Message) {
  const parts = [
    message.from,
    message.email,
    message.subject,
    message.preview,
    message.tag?.label,
    ...message.thread.flatMap((t) => [
      t.from,
      t.email,
      ...(t.body ?? []),
      ...(t.to?.map((r) => `${r.name} ${r.email}`) ?? []),
      ...(t.cc?.map((r) => `${r.name} ${r.email}`) ?? []),
    ]),
  ];
  return parts.filter(Boolean).join("\n").toLowerCase();
}

function matchFrom(message: Message, value: string) {
  const needle = value.trim().toLowerCase();
  if (!needle) return true;
  const tokens = needle.includes("@")
    ? []
    : needle.split(/\s+/).filter((t) => t.length >= 2);

  const hit = (name?: string, email?: string) => {
    const n = (name ?? "").toLowerCase();
    const e = (email ?? "").toLowerCase();
    if (n.includes(needle) || e.includes(needle)) return true;
    if (tokens.length && tokens.every((t) => n.includes(t))) return true;
    // First name alone — calendar invites often use full name; other mail may not.
    if (tokens.length > 1 && (n.includes(tokens[0]!) || e.includes(tokens[0]!))) {
      return true;
    }
    return false;
  };

  if (hit(message.from, message.email)) return true;
  return message.thread.some((t) => hit(t.from, t.email));
}

export function messageMatchesSearch(
  message: Message,
  tokens: SearchToken[],
): boolean {
  if (!tokens.length) return true;

  for (const token of tokens) {
    const v = token.value.trim();
    if (!v) continue;

    switch (token.field) {
      case "from":
        if (!matchFrom(message, v)) return false;
        break;
      case "to": {
        const hit = message.thread.some((t) =>
          [...(t.to ?? []), ...(t.cc ?? [])].some(
            (r) => includes(r.name, v) || includes(r.email, v),
          ),
        );
        if (!hit) return false;
        break;
      }
      case "subject":
        if (!includes(message.subject, v)) return false;
        break;
      case "tag":
        if (!includes(message.tag?.label, v)) return false;
        break;
      case "has":
        if (!matchHas(message, v)) return false;
        break;
      case "is":
        if (!matchIs(message, v)) return false;
        break;
      case "text":
      default:
        if (!messageHaystack(message).includes(v.toLowerCase())) return false;
        break;
    }
  }
  return true;
}

export const HAS_SUGGESTIONS = ["attachment", "link", "meeting"] as const;
export const IS_SUGGESTIONS = ["unread", "starred", "important", "read"] as const;
