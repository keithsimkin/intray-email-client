import type { Message } from "./data/mock";

export type SearchField =
  | "text"
  | "from"
  | "to"
  | "subject"
  | "tag"
  | "has"
  | "is";

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

const FIELD_ALIASES: Record<string, SearchField> = {
  from: "from",
  sender: "from",
  to: "to",
  subject: "subject",
  subj: "subject",
  tag: "tag",
  label: "tag",
  has: "has",
  is: "is",
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

/** Parse a typed fragment into tokens. Supports from:"Ava Martin" and from:ava. */
export function parseSearchInput(raw: string): {
  tokens: SearchToken[];
  rest: string;
} {
  const tokens: SearchToken[] = [];
  let rest = raw.trim();
  const re =
    /\b(from|sender|to|subject|subj|tag|label|has|is):(?:"([^"]*)"|(\S+))/gi;

  rest = rest
    .replace(re, (_m, key: string, quoted?: string, bare?: string) => {
      const field = FIELD_ALIASES[key.toLowerCase()];
      const value = (quoted ?? bare ?? "").trim();
      if (field && value) tokens.push(makeToken(field, value));
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  return { tokens, rest };
}

export function serializeSearch(tokens: SearchToken[]): string {
  return tokens
    .map((t) => {
      if (t.field === "text") return t.value;
      const needsQuotes = /\s/.test(t.value);
      const v = needsQuotes ? `"${t.value}"` : t.value;
      return `${t.field}:${v}`;
    })
    .filter(Boolean)
    .join(" ");
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
        if (!(includes(message.from, v) || includes(message.email, v))) {
          return false;
        }
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
