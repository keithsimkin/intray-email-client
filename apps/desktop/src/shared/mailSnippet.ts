const HEADER_DUMP =
  /\b(return-path|original-recipient|delivered-to|dkim-signature|mime-version|content-type|content-transfer-encoding|authentication-results)\s*:/i;

/** True when text is delivery headers rather than something a person wrote. */
export function looksLikeHeaderDump(text: string): boolean {
  if (HEADER_DUMP.test(text)) return true;
  return /\breceived\s*:\s*from\b/i.test(text);
}

/** First readable words of a raw message. Skips the header block. */
export function mailSnippet(source: string, max = 180): string {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let body = text;
  if (/^[A-Za-z-]{2,40}\s*:/.test(text)) {
    const split = text.search(/\n[ \t]*\n/);
    if (split < 0) return "";
    body = text.slice(split + 1);
  }
  const plain = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain || looksLikeHeaderDump(plain)) return "";
  return plain.slice(0, max).trim();
}

/** Preview safe to show under a subject. Header dumps become empty. */
export function readablePreview(preview: string): string {
  const text = preview.replace(/\s+/g, " ").trim();
  if (!text || looksLikeHeaderDump(text)) return "";
  return text;
}
