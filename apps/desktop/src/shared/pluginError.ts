export type PluginErrorNotice = {
  text: string;
  /** Google Cloud console page where the Calendar API can be enabled. */
  href?: string;
};

const IPC_PREFIX = /^(?:Error invoking remote method '[^']+':\s*)+/i;
const CALENDAR_API_OFF =
  /calendar api has not been used|calendar-json\.googleapis\.com|accessNotConfigured/i;

/**
 * Turn an Electron IPC or Google/Notion failure into one short line.
 * The Calendar API-disabled dump becomes a sentence plus the console link.
 */
export function pluginErrorNotice(raw: string): PluginErrorNotice {
  const href = raw.match(
    /https:\/\/console\.developers\.google\.com\/apis\/api\/calendar[^\s)]+/i,
  )?.[0];

  let text = raw.replace(IPC_PREFIX, "").replace(/^(?:Error:\s*)+/i, "");
  text = text.replace(/\s+/g, " ").trim();

  if (CALENDAR_API_OFF.test(raw)) {
    return {
      text: "Google Calendar API is not enabled for this Google Cloud project. Turn it on, wait a minute, then try again.",
      href,
    };
  }

  if (!text) return { text: "Something went wrong with this plugin." };
  if (text.length > 240) text = `${text.slice(0, 237)}…`;
  return { text };
}

export function pluginErrorFrom(
  cause: unknown,
  fallback: string,
): PluginErrorNotice {
  if (cause instanceof Error) {
    const carried = (cause as Error & { href?: string }).href;
    const notice = pluginErrorNotice(cause.message);
    return {
      text: notice.text || fallback,
      href: carried ?? notice.href,
    };
  }
  return { text: fallback };
}
