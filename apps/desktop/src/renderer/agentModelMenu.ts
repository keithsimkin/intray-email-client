import type { AiBridgeId } from "./preferences";

/** Providers the chat menu can switch to: ready on this PC, plus the one already chosen. */
export function readyBridgeIds(
  order: readonly AiBridgeId[],
  detected: { id: string; available: boolean }[] | null,
  current: AiBridgeId,
): AiBridgeId[] {
  const ready = new Set<string>();
  if (detected) {
    for (const row of detected) {
      if (row.available && row.id !== "none") ready.add(row.id);
    }
  }
  if (current !== "none") ready.add(current);
  const sequence =
    current === "none" || order.includes(current) ? order : [...order, current];
  const seen = new Set<string>();
  const ids: AiBridgeId[] = [];
  for (const id of sequence) {
    if (id === "none" || !ready.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
