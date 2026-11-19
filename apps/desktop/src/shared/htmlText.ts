/** Visible text from an email HTML part. Drops stylesheets, scripts, and head. */

function decodeEntities(value: string): string {
  const named = value
    .replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => fromCode(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);/g, (match, dec: string) => fromCode(Number(dec), match));
  return named.replace(/&amp;/gi, "&");
}

function fromCode(code: number, original: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return original;
  if (code < 32 && code !== 9 && code !== 10 && code !== 13) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return original;
  }
}

function stripPaired(html: string, tag: string): string {
  return html.replace(
    new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, "gi"),
    " ",
  );
}

/**
 * Use the text/plain part when it is a real message.
 * A short "view in browser" stub loses to the HTML text.
 */
export function preferReadableText(plain: string, fromHtml: string): string {
  const text = plain.trim();
  const html = fromHtml.trim();
  if (!text) return html;
  if (!html) return text;
  if (text.length >= 80 || text.length >= html.length * 0.5) return text;
  return html;
}

export function emailHtmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);
  html = html.replace(/<!--[\s\S]*?-->/g, " ");
  html = stripPaired(html, "head");
  html = stripPaired(html, "style");
  html = stripPaired(html, "script");
  html = stripPaired(html, "noscript");
  html = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  html = decodeEntities(html).replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, "");
  return html
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
