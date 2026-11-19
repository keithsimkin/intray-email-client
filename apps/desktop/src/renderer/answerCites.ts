/** Turn bracketed message ids in an agent answer into open targets. */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overlaps(
  spans: { start: number; end: number }[],
  start: number,
  end: number,
): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function withoutIdLabels(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\*\*|__)?ID(?:\*\*|__)?\s*:\s*/i, ""))
    .filter((line) => !/^\s*(?:\*\*|__)?ID(?:\*\*|__)?\s*:?\s*$/i.test(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Find known message ids in an answer, in the order they appear.
 * The returned text has those ids and any "ID:" label removed.
 */
export function mailCites(
  text: string,
  ids: string[],
): { text: string; ids: string[] } {
  const sorted = [...new Set(ids)]
    .filter((id) => id.length >= 4)
    .sort((a, b) => b.length - a.length);
  const spans: { start: number; end: number }[] = [];
  const hits: { index: number; id: string }[] = [];
  for (const id of sorted) {
    let from = 0;
    while (from <= text.length - id.length) {
      const at = text.indexOf(id, from);
      if (at < 0) break;
      const end = at + id.length;
      if (!overlaps(spans, at, end)) {
        hits.push({ index: at, id });
        spans.push({ start: at, end });
      }
      from = end;
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const ordered: string[] = [];
  for (const hit of hits) {
    if (!ordered.includes(hit.id)) ordered.push(hit.id);
  }
  if (!ordered.length) return { text, ids: [] };
  let cleaned = text;
  for (const id of [...ordered].sort((a, b) => b.length - a.length)) {
    const token = escapeRegExp(id);
    cleaned = cleaned.replace(new RegExp(`\\[\\s*${token}\\s*\\]`, "g"), "");
    cleaned = cleaned.replace(new RegExp(token, "g"), "");
  }
  return { text: withoutIdLabels(cleaned), ids: ordered };
}
