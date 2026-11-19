/**
 * Short line for a provider that refused because a usage or credit limit is hit.
 * Returns null for every other failure so callers keep their own message.
 */
export function usageLimitMessage(raw: string): string | null {
  if (!/usage limit reached|credit balance is too low/i.test(raw)) return null;

  const reset = raw.match(/resets in [^.]+\./i)?.[0];
  const when = reset
    ? ` It ${reset.charAt(0).toLowerCase()}${reset.slice(1)}`
    : "";

  if (/weekly usage limit/i.test(raw)) {
    return `Weekly usage limit reached.${when}`;
  }
  if (/credit balance is too low/i.test(raw)) {
    return "Credit balance is too low.";
  }
  return `Usage limit reached.${when}`;
}
