import type { Message, ThreadMessage } from "./data/mock";
import { turnPlainText } from "./mailText";
import { looksLikeHeaderDump, readablePreview } from "../shared/mailSnippet";

export type MailLink = {
  href: string;
  label: string;
  /** Short site name shown under the label. Empty when the label already is that site. */
  host: string;
};

const SIGN_OFF =
  /^(?:(?:best|kind|warm|with)\s+)?(?:regards|thanks|thank you|sincerely|cheers|yours truly|yours)\b|^--$|^sent from my\b/i;

const GREETING =
  /^(?:hi|hey|hello|dear|good morning|good afternoon|good evening)\b/i;

function cleanHref(href: string): string {
  return href
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/[),.;]+$/, "");
}

function linkKey(href: string): string {
  return href.replace(/\/+$/, "").toLowerCase();
}

type LinkFace = {
  label: string;
  host: string;
  named: boolean;
};

const BRANDS: { test: RegExp; name: string; host: string }[] = [
  { test: /(^|\.)zoom\.us$/i, name: "Zoom", host: "zoom.us" },
  { test: /(^|\.)meet\.google\.com$/i, name: "Google Meet", host: "meet.google.com" },
  { test: /(^|\.)teams\.(microsoft|live)\.com$/i, name: "Teams", host: "teams.microsoft.com" },
  { test: /(^|\.)(docs|drive)\.google\.com$/i, name: "Google Docs", host: "docs.google.com" },
  { test: /(^|\.)calendar\.google\.com$/i, name: "Google Calendar", host: "calendar.google.com" },
  { test: /(^|\.)linkedin\.com$/i, name: "LinkedIn", host: "linkedin.com" },
  { test: /(^|\.)(twitter\.com|x\.com)$/i, name: "X", host: "x.com" },
  { test: /(^|\.)(youtube\.com|youtu\.be)$/i, name: "YouTube", host: "youtube.com" },
  { test: /(^|\.)github\.com$/i, name: "GitHub", host: "github.com" },
  { test: /(^|\.)notion\.(so|site)$/i, name: "Notion", host: "notion.so" },
  { test: /(^|\.)calendly\.com$/i, name: "Calendly", host: "calendly.com" },
  { test: /convertkit|ck\.page$|(^|\.)kit\.com$/i, name: "ConvertKit", host: "convertkit.com" },
  { test: /(^|\.)substack\.com$/i, name: "Substack", host: "substack.com" },
  { test: /(^|\.)(mailchi\.mp|list-manage\.com|mailchimp\.com)$/i, name: "Mailchimp", host: "mailchimp.com" },
  { test: /(^|\.)beehiiv\.com$/i, name: "beehiiv", host: "beehiiv.com" },
  { test: /(^|\.)loom\.com$/i, name: "Loom", host: "loom.com" },
];

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Anchor text worth showing. URLs, empty merge tags, and bare hosts are not. */
function humanText(text?: string): string {
  const plain = (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/(?:\(\s*\)|\[\s*\])+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length < 2) return "";
  if (/^https?:\/\//i.test(plain) || /^mailto:/i.test(plain)) return "";
  if (/^[\s()[\]{}.,;:!?|/\\_+\-]+$/.test(plain)) return "";
  if (!/\s/.test(plain) && /[a-z0-9-]+\.[a-z]{2,}/i.test(plain)) return "";
  return clip(plain, 72);
}

function stripTrackingHost(hostname: string): string {
  const labels = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "")
    .split(".");
  while (labels.length > 2) {
    const head = labels[0] ?? "";
    const tracking =
      /^(?:click|email|emails|links|link|trk|track|tracking|url|go)$/.test(head) ||
      /^[a-f0-9]{8,}$/.test(head) ||
      (head.length >= 8 && /[a-z]/.test(head) && /\d/.test(head) && !head.includes("-"));
    if (!tracking) break;
    labels.shift();
  }
  return labels.join(".");
}

function brandFor(hostname: string): { name: string; host: string } | null {
  const host = hostname.toLowerCase();
  return BRANDS.find((brand) => brand.test.test(host)) ?? null;
}

function readableSlug(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const raw = parts[i] ?? "";
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,6}$/i.test(decoded)) continue;
    if (!/[a-z]{3,}/i.test(decoded)) continue;
    const words = decoded.replace(/-/g, " ");
    if (words.length > 42) continue;
    return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }
  return "";
}

function linkFace(href: string, text?: string): LinkFace {
  if (/^mailto:/i.test(href)) {
    const email = href.replace(/^mailto:/i, "").split("?")[0];
    return { label: email || "Email", host: "", named: true };
  }
  const human = humanText(text);
  let hostname = "";
  let pathname = "";
  try {
    const url = new URL(href);
    hostname = url.hostname;
    pathname = url.pathname;
  } catch {
    return { label: human || clip(href, 48), host: "", named: Boolean(human) };
  }
  const site = stripTrackingHost(hostname);
  const brand = brandFor(hostname) ?? brandFor(site);
  const host = brand?.host ?? site;
  if (human) return { label: human, host, named: true };
  if (brand) return { label: brand.name, host, named: false };
  const slug = readableSlug(pathname);
  if (slug) return { label: slug, host, named: false };
  return { label: host, host, named: false };
}

type Candidate = MailLink & { named: boolean; meeting: boolean };

function pushLink(
  out: Candidate[],
  seen: Set<string>,
  href: string,
  label?: string,
  meeting = false,
) {
  const clean = cleanHref(href);
  if (!clean || !/^(https?:|mailto:)/i.test(clean)) return;
  const key = linkKey(clean);
  if (seen.has(key)) return;
  seen.add(key);
  const face = linkFace(clean, label);
  out.push({
    href: clean,
    label: face.label,
    host: face.host,
    named: face.named || meeting,
    meeting,
  });
}

function chooseLinks(all: Candidate[], limit: number): MailLink[] {
  const namedHosts = new Set(
    all.filter((link) => link.named && link.host).map((link) => link.host),
  );
  const meetings = all.filter((link) => link.meeting);
  const named = all.filter((link) => link.named && !link.meeting);
  const rest = all.filter(
    (link) => !link.named && !link.meeting && !(link.host && namedHosts.has(link.host)),
  );
  const picked: MailLink[] = [];
  for (const link of [...meetings, ...named, ...rest]) {
    picked.push({ href: link.href, label: link.label, host: link.host });
    if (picked.length >= limit) break;
  }
  return picked;
}

function linksInTurn(turn: ThreadMessage, out: Candidate[], seen: Set<string>) {
  if (turn.meeting?.url) {
    pushLink(out, seen, turn.meeting.url, turn.meeting.title || "Join meeting", true);
  }
  const html = turn.bodyHtml ?? "";
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html))) {
    pushLink(out, seen, match[1], match[2]);
  }
  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  const plain = turnPlainText(turn);
  let found: RegExpExecArray | null;
  while ((found = urlRe.exec(plain))) {
    pushLink(out, seen, found[0]);
  }
}

/** Meeting and web links from the newest message, then older turns if needed. */
export function mailLinks(message: Message, limit = 5): MailLink[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  if (message.meeting?.url) {
    pushLink(
      out,
      seen,
      message.meeting.url,
      message.meeting.title || "Join meeting",
      true,
    );
  }
  const turns = [...message.thread].reverse();
  for (const turn of turns) linksInTurn(turn, out, seen);
  return chooseLinks(out, limit);
}

function bodyLines(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !looksLikeHeaderDump(line));
  let start = 0;
  while (
    start < lines.length &&
    (GREETING.test(lines[start] ?? "") || (lines[start]?.length ?? 0) < 12)
  ) {
    start += 1;
  }
  const body = lines.slice(start);
  const cut = body.findIndex((line) => SIGN_OFF.test(line));
  const kept = (cut < 0 ? body : body.slice(0, cut)).filter(
    (line) => !/^https?:\/\//i.test(line),
  );
  if (kept.length) return kept;
  return lines.filter((line) => !GREETING.test(line) && !SIGN_OFF.test(line));
}

/** Two or three sentences from the message, without the greeting or signature. */
export function quickSummary(text: string): string {
  const joined = bodyLines(text)
    .join(" ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/(?:\(\s*\)|\[\s*\])+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!joined || looksLikeHeaderDump(joined)) return "";
  const sentences = joined.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [joined];
  let out = "";
  let count = 0;
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    const next = out ? `${out} ${piece}` : piece;
    if (out && next.length > 380) break;
    out = next;
    count += 1;
    if (count >= 3) break;
  }
  if (out.length > 380) return `${out.slice(0, 377).trimEnd()}…`;
  return out;
}

function latestText(message: Message): string {
  for (let i = message.thread.length - 1; i >= 0; i -= 1) {
    const turn = message.thread[i];
    if (!turn) continue;
    const text = turnPlainText(turn);
    if (text && !looksLikeHeaderDump(text)) return text;
  }
  return "";
}

export function quickMailBrief(message: Message): {
  summary: string;
  links: MailLink[];
} {
  const fromBody = quickSummary(latestText(message));
  return {
    summary: fromBody || readablePreview(message.preview),
    links: mailLinks(message),
  };
}
