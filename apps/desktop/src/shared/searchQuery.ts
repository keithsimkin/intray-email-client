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
