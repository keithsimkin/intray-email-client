import type { AiModelChoice } from "../../shared/types";

const MODEL_ID = /^[\w.-]+$/;

/**
 * Parse `grok models` text.
 * Example lines: `* grok-4.7 (default)` / `- grok-4.6`
 */
export function parseGrokModelList(raw: string): AiModelChoice[] {
  const models: AiModelChoice[] = [];
  const seen = new Set<string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, "").trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (
      lower.startsWith("available models") ||
      lower.startsWith("default model") ||
      lower.startsWith("you are logged") ||
      lower.startsWith("tip:") ||
      lower.startsWith("failed") ||
      lower.startsWith("error") ||
      lower.startsWith("usage:")
    ) {
      continue;
    }
    const bullet = line.match(/^[*+-]\s+(\S+)/);
    const idRaw = (bullet?.[1] ?? line).replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!MODEL_ID.test(idRaw) || idRaw.length > 80) continue;
    if (seen.has(idRaw)) continue;
    seen.add(idRaw);
    models.push({ id: idRaw, label: idRaw });
  }
  return models;
}
