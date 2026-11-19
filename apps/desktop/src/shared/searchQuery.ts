/** Shared search operators — used by renderer chips and main-process SQL. */

export type SearchField =
  | "text"
  | "from"
  | "to"
  | "subject"
  | "tag"
  | "has"
  | "is";

export type SearchClause = {
  field: SearchField;
  value: string;
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

const OPERATOR_RE =
  /\b(from|sender|to|subject|subj|tag|label|has|is):(?:"([^"]*)"|(\S+))/gi;

/** Slash shortcuts → field (`/from`, `/subj`, `/is`). */
const SLASH_ALIASES: Record<string, Exclude<SearchField, "text">> = {
  from: "from",
  sender: "from",
  f: "from",
  to: "to",
  t: "to",
  subject: "subject",
  subj: "subject",
  s: "subject",
  tag: "tag",
  label: "tag",
  l: "tag",
  has: "has",
  h: "has",
  is: "is",
  i: "is",
};

export function resolveSlashField(
  raw: string,
): Exclude<SearchField, "text"> | null {
  const m = raw.trim().match(/^\/([a-z]*)$/i);
  if (!m) return null;
  const key = (m[1] ?? "").toLowerCase();
  if (!key) return null;
  return SLASH_ALIASES[key] ?? null;
}

/** Match `/from`, `/subj foo`, or a bare `/` prefix for filter menus. */
export function parseSlashDraft(raw: string): {
  field: Exclude<SearchField, "text"> | null;
  /** True when draft is `/` or `/par` (still choosing a field). */
  choosing: boolean;
  /** Remainder after `/field ` when a value follows. */
  rest: string;
  prefix: string;
} {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("/")) {
    return { field: null, choosing: false, rest: "", prefix: "" };
  }
  const body = trimmed.slice(1);
  const space = body.search(/\s/);
  if (space === -1) {
    const key = body.toLowerCase();
    // Still picking: `/`, `/f`, `/fr`, `/from` all keep the slash menu until Space/Enter.
    return { field: SLASH_ALIASES[key] ?? null, choosing: true, rest: "", prefix: key };
  }
  const key = body.slice(0, space).toLowerCase();
  const rest = body.slice(space + 1).trimStart();
  const field = SLASH_ALIASES[key] ?? null;
  return { field, choosing: !field, rest, prefix: key };
}

export function slashFieldChoices(prefix = ""): Array<{
  field: Exclude<SearchField, "text">;
  slash: string;
}> {
  const all: Array<{ field: Exclude<SearchField, "text">; slash: string }> = [
    { field: "from", slash: "/from" },
    { field: "to", slash: "/to" },
    { field: "subject", slash: "/subject" },
    { field: "tag", slash: "/tag" },
    { field: "has", slash: "/has" },
    { field: "is", slash: "/is" },
  ];
  const p = prefix.toLowerCase();
  if (!p) return all;
  return all.filter(
    (row) =>
      row.field.startsWith(p) ||
      row.slash.slice(1).startsWith(p) ||
      (SLASH_ALIASES[p] === row.field && p.length === 1),
  );
}

/** Parse `from:ada subject:"q4 plan" unread words` into clauses. */
export function parseSearchClauses(raw: string): SearchClause[] {
  const clauses: SearchClause[] = [];
  let rest = raw.trim();
  if (!rest) return clauses;

  rest = rest
    .replace(OPERATOR_RE, (_m, key: string, quoted?: string, bare?: string) => {
      const field = FIELD_ALIASES[key.toLowerCase()];
      const value = (quoted ?? bare ?? "").trim();
      if (field && value) clauses.push({ field, value });
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  if (rest) clauses.push({ field: "text", value: rest });
  return clauses;
}

export function serializeSearchClauses(clauses: SearchClause[]): string {
  return clauses
    .map((t) => {
      if (t.field === "text") return t.value;
      const needsQuotes = /\s/.test(t.value);
      const v = needsQuotes ? `"${t.value}"` : t.value;
      return `${t.field}:${v}`;
    })
    .filter(Boolean)
    .join(" ");
}

const MATCH_OPEN = "\u0001";
const MATCH_CLOSE = "\u0002";

export type MatchPart = { text: string; hit: boolean };

/** Drop FTS snippet markers so plain previews stay readable. */
export function stripMatchMarkers(text: string): string {
  return text.replaceAll(MATCH_OPEN, "").replaceAll(MATCH_CLOSE, "");
}

/** Split an FTS snippet into plain and matched runs. */
export function splitMatchMarkers(text: string): MatchPart[] {
  const parts: MatchPart[] = [];
  const re = new RegExp(`${MATCH_OPEN}([^${MATCH_OPEN}${MATCH_CLOSE}]*)${MATCH_CLOSE}`, "g");
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), hit: false });
    parts.push({ text: match[1] ?? "", hit: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  if (!parts.length) parts.push({ text, hit: false });
  return parts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap query words in snippet markers when the text has none yet.
 * Used for subjects, which FTS may not have chosen as the snippet column.
 */
export function markQuery(text: string, query: string): string {
  if (!text || text.includes(MATCH_OPEN)) return text;
  const words = query
    .replace(/"[^"]*"/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-/, "").replace(/[^\p{L}\p{N}_@.+-]/gu, ""))
    .filter((word) => word.length >= 2 && !word.includes(":"));
  if (!words.length) return text;
  const unique = [...new Set(words.map((word) => word.toLowerCase()))];
  const re = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "ig");
  return text.replace(re, `${MATCH_OPEN}$1${MATCH_CLOSE}`);
}

type FtsTerm = { value: string; phrase: boolean; negate: boolean };

function sanitizeFtsToken(raw: string, phrase: boolean): string {
  const cleaned = raw.replace(/["*]/g, "").trim();
  if (!cleaned) return "";
  if (phrase) {
    return cleaned
      .replace(/[^\p{L}\p{N}\s_@.+-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return cleaned.replace(/[^\p{L}\p{N}_@.+-]/gu, "");
}

/** Tokenize free text into FTS terms. Quoted runs stay phrases. `-word` excludes. */
export function tokenizeFtsQuery(raw: string): FtsTerm[] {
  const out: FtsTerm[] = [];
  const source = raw.trim();
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
    if (i >= source.length) break;
    let negate = false;
    if (source[i] === "-" && i + 1 < source.length && !/\s/.test(source[i + 1] ?? "")) {
      negate = true;
      i += 1;
    }
    if (source[i] === '"') {
      const end = source.indexOf('"', i + 1);
      const body = (end === -1 ? source.slice(i + 1) : source.slice(i + 1, end)).trim();
      i = end === -1 ? source.length : end + 1;
      const value = sanitizeFtsToken(body, true);
      if (value) out.push({ value, phrase: true, negate });
      continue;
    }
    let j = i;
    while (j < source.length && !/\s/.test(source[j] ?? "") && source[j] !== '"') j += 1;
    const word = source.slice(i, j);
    i = j;
    const value = sanitizeFtsToken(word, false);
    if (value) out.push({ value, phrase: false, negate });
  }
  return out;
}

/**
 * FTS5 MATCH expression. Earlier words are exact; only the last positive
 * word is a prefix, so `invo` matches `invoice` while you are still typing.
 * Returns null when there is nothing to match (empty, or only exclusions).
 */
export function buildFtsMatch(raw: string): string | null {
  const terms = tokenizeFtsQuery(raw);
  const positives = terms.filter((term) => !term.negate && term.value);
  if (!positives.length) return null;
  const parts = positives.map((term, index) => {
    const quoted = `"${term.value}"`;
    const last = index === positives.length - 1;
    if (term.phrase || !last) return quoted;
    return `${quoted}*`;
  });
  let query = parts.join(" AND ");
  for (const term of terms) {
    if (term.negate && term.value) query += ` NOT "${term.value}"`;
  }
  return query;
}
