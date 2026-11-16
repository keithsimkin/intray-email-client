import { aiFindUnsubscribeUrl } from "./aiClient";
import type { Message } from "./data/mock";
import type { Preferences } from "./preferences";

const MARKETING_RE =
  /\b(newsletter|unsubscribe|promotions?|marketing|digest|weekly summary|% off|sale|deal|discount|noreply|no-reply|donotreply|do-not-reply)\b/i;

const UNSUB_HREF_RE =
  /(unsubscribe|opt[-\s]?out|optout|manage[-\s]?preferences|email[-\s]?preferences|subscription[-\s]?center|list-unsubscribe)/i;

export type UnsubscribeTarget = {
  href: string;
  kind: "http" | "mailto";
  label: string;
};

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pushTarget(
  out: UnsubscribeTarget[],
  seen: Set<string>,
  href: string,
  label?: string,
) {
  const clean = href.trim();
  if (!clean || clean === "#" || seen.has(clean.toLowerCase())) return;
  if (/^javascript:/i.test(clean)) return;
  const kind = /^mailto:/i.test(clean) ? "mailto" : "http";
  if (kind === "http" && !/^https?:\/\//i.test(clean)) return;
  seen.add(clean.toLowerCase());
  out.push({
    href: clean,
    kind,
    label: (label && stripTags(label)) || (kind === "mailto" ? "Email unsubscribe" : "Unsubscribe link"),
  });
}

/** Pull List-Unsubscribe / unsubscribe anchors from HTML + plain text. */
export function extractUnsubscribeTargets(message: Message): UnsubscribeTarget[] {
  const out: UnsubscribeTarget[] = [];
  const seen = new Set<string>();

  for (const t of message.thread) {
    const html = t.bodyHtml ?? "";
    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRe.exec(html))) {
      const href = match[1];
      const label = match[2];
      if (UNSUB_HREF_RE.test(href) || UNSUB_HREF_RE.test(label)) {
        pushTarget(out, seen, href, label);
      }
    }

    for (const line of t.body ?? []) {
      if (!UNSUB_HREF_RE.test(line) && !/https?:\/\//i.test(line)) continue;
      const urlRe = /(?:mailto:[^\s<>"']+|https?:\/\/[^\s<>"']+)/gi;
      let um: RegExpExecArray | null;
      while ((um = urlRe.exec(line))) {
        const href = um[0].replace(/[),.;]+$/, "");
        if (UNSUB_HREF_RE.test(href) || UNSUB_HREF_RE.test(line)) {
          pushTarget(out, seen, href);
        }
      }
    }
  }

  return out;
}

export function looksLikeNewsletter(message: Message): boolean {
  if (message.important) {
    // Still allow when an explicit unsubscribe link exists
    return extractUnsubscribeTargets(message).length > 0;
  }

  const tag = message.tag?.label.toLowerCase() ?? "";
  if (/news|promo|update|social|market/.test(tag)) return true;

  const hay = [
    message.from,
    message.email,
    message.subject,
    message.preview,
    ...message.thread.flatMap((t) => [
      t.from,
      t.email,
      ...(t.body ?? []),
      stripTags(t.bodyHtml ?? "").slice(0, 800),
    ]),
  ].join("\n");

  if (MARKETING_RE.test(hay)) return true;
  if (/noreply@|no-reply@|newsletter@|updates@|marketing@/i.test(message.email)) {
    return true;
  }
  if (extractUnsubscribeTargets(message).length > 0) return true;

  // HTML-heavy + not marked important → often digests / promos
  const hasHtml = message.thread.some((t) => Boolean(t.bodyHtml));
  return hasHtml && !message.important;
}

/**
 * Prefer a real unsubscribe link in the message. If the markup hid it, ask
 * the connected provider to quote a URL and accept it only when that exact
 * URL is already in the mail.
 */
export async function aiFindUnsubscribe(
  message: Message,
  prefs?: Preferences,
): Promise<UnsubscribeTarget | null> {
  const targets = extractUnsubscribeTargets(message);
  if (targets.length) {
    const http = targets.find((t) => t.kind === "http");
    const mailto = targets.find((t) => t.kind === "mailto");
    return http ?? mailto ?? targets[0]!;
  }
  if (!prefs || prefs.aiBridge === "none") return null;
  const href = await aiFindUnsubscribeUrl(prefs, message);
  if (!href) return null;
  return {
    href,
    kind: href.toLowerCase().startsWith("mailto:") ? "mailto" : "http",
    label: "Unsubscribe link from this email",
  };
}

export function openUnsubscribeTarget(target: UnsubscribeTarget) {
  window.open(target.href, "_blank", "noopener,noreferrer");
}
