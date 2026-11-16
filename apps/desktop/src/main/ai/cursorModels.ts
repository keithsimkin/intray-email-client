import type { AiModelChoice } from "../../shared/types";

const MODEL_ID = /^[\w.+:[\]=,/-]+$/;

/** Parse `cursor-agent --list-models` text. Ids change with the account, so this stays loose. */
export function parseCursorModelList(raw: string): AiModelChoice[] {
  const models: AiModelChoice[] = [];
  const seen = new Set<string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, "").trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (
      lower.startsWith("available models") ||
      lower.startsWith("no models") ||
      lower.startsWith("tip:") ||
      lower.startsWith("failed") ||
      lower.startsWith("error") ||
      lower.startsWith("authentication") ||
      lower.startsWith("usage:")
    ) {
      continue;
    }
    const sep = line.indexOf(" - ");
    const id = (sep > 0 ? line.slice(0, sep) : line).trim();
    if (!MODEL_ID.test(id) || id.length > 80) continue;
    const label =
      sep > 0
        ? line
            .slice(sep + 3)
            .replace(/\s*\([^)]*\)\s*$/, "")
            .trim() || id
        : id;
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label });
  }
  return models;
}
