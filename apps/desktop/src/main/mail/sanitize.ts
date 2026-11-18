/**
 * Defence-in-depth sanitizer for untrusted email HTML.
 *
 * The renderer already shows mail in a sandboxed iframe with a locked-down CSP,
 * but mail HTML is the single most hostile input this app handles. We strip
 * active content before it ever reaches the UI so a renderer regression cannot
 * turn into remote code execution or silent tracking.
 *
 * This is intentionally conservative and regex-based (no DOM in the main
 * process). It complements — never replaces — the iframe sandbox.
 */

const BLOCKED_ELEMENTS = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "meta",
  "link",
  "base",
  "svg",
  "math",
];

/** Remove an element including everything between its open and close tag. */
function stripElement(html: string, tag: string): string {
  const paired = new RegExp(
    `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`,
    "gi",
  );
  const unpaired = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  return html.replace(paired, "").replace(unpaired, "");
}

/** Neutralise javascript:/vbscript:/data:text/html URL schemes in attributes. */
function neutralizeUrls(html: string): string {
  return html.replace(
    /\b(href|src|action|formaction|background|poster|cite|data|longdesc|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, attr: string, rawValue: string) => {
      const quote = rawValue.startsWith('"')
        ? '"'
        : rawValue.startsWith("'")
          ? "'"
          : "";
      const value = quote ? rawValue.slice(1, -1) : rawValue;
      const normalized = value
        .replace(/[\u0000-\u0020]+/g, "")
        .toLowerCase();
      const dangerous =
        normalized.startsWith("javascript:") ||
        normalized.startsWith("vbscript:") ||
        normalized.startsWith("data:text/html") ||
        normalized.startsWith("data:image/svg");
      return `${attr}=${quote}${dangerous ? "#" : value}${quote}`;
    },
  );
}

export function sanitizeEmailHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);

  for (const tag of BLOCKED_ELEMENTS) {
    html = stripElement(html, tag);
  }

  // Inline event handlers (onerror, onload, onpointerdown, …).
  html = html.replace(
    /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );

  html = html.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Autofocus inside mail can scroll the reader to a deep element on open.
  html = html.replace(/\sautofocus\b(?:=(["'][^"']*["']|[^\s>]+))?/gi, "");
  html = neutralizeUrls(html);

  return html;
}

/** Strip tags to plain text (used for search previews and MCP output). */
export function htmlToText(input: string | null | undefined): string {
  return sanitizeEmailHtml(input)
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
