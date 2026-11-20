/** Private trailer so a local draft can keep Bcc without a schema column. */

export const DRAFT_BCC_MARK = "\u0001intray-draft-bcc:";

export function packDraftBody(body: string, bcc: string[]): string {
  const clean = bcc.map((email) => email.trim()).filter((email) => email.includes("@"));
  if (!clean.length) return body;
  return `${body}${DRAFT_BCC_MARK}${JSON.stringify(clean)}`;
}

export function splitDraftBcc(raw: string | null | undefined): {
  text: string;
  bcc: string[];
} {
  if (!raw) return { text: "", bcc: [] };
  const idx = raw.lastIndexOf(DRAFT_BCC_MARK);
  if (idx < 0) return { text: raw, bcc: [] };
  const tail = raw.slice(idx + DRAFT_BCC_MARK.length);
  try {
    const parsed = JSON.parse(tail) as unknown;
    if (!Array.isArray(parsed)) return { text: raw, bcc: [] };
    const bcc = parsed.filter(
      (item): item is string => typeof item === "string" && item.includes("@"),
    );
    return { text: raw.slice(0, idx).replace(/\s+$/, ""), bcc };
  } catch {
    return { text: raw, bcc: [] };
  }
}

/** List preview: who it's for, then the first line of the body. */
export function draftSnippet(input: {
  to: string[];
  cc: string[];
  bcc: string[];
  body: string;
}): string {
  const who = [
    input.to.length ? `To ${input.to.join(", ")}` : "",
    input.cc.length ? `Cc ${input.cc.join(", ")}` : "",
    input.bcc.length ? `Bcc ${input.bcc.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const preview = input.body.trim().replace(/\s+/g, " ").slice(0, 140);
  return [who, preview].filter(Boolean).join(" — ").slice(0, 180) || "Draft";
}
