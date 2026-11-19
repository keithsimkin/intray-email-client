import { emailHtmlToText, preferReadableText } from "../shared/htmlText";
import type { Message, ThreadMessage } from "./data/mock";

const PLACEHOLDER = "(No body yet)";

/** Plain text the model should read. Prefers a real text/plain part over CSS-heavy HTML. */
export function turnPlainText(turn: ThreadMessage): string {
  const stored = turn.bodyText?.trim() ?? "";
  const lines = (turn.body ?? [])
    .map((line) => line.trim())
    .filter((line) => line && line !== PLACEHOLDER);
  const plain = stored || lines.join("\n");
  const fromHtml = turn.bodyHtml ? emailHtmlToText(turn.bodyHtml) : "";
  return preferReadableText(plain, fromHtml);
}

export type MailSummary = {
  lead: string;
  bullets: string[];
};

function stripMarkdown(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Turn a model summary into a sentence plus plain bullets, without markdown. */
export function formatMailSummary(raw: string): MailSummary {
  const parts = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const bullet = /^([-*•]|\d+[.)])\s+/.test(trimmed);
      const text = stripMarkdown(trimmed.replace(/^([-*•]|\d+[.)])\s+/, ""));
      return { bullet, text };
    })
    .filter((part) => part.text && !/^summary:?$/i.test(part.text));
  const bullets = parts.filter((part) => part.bullet).map((part) => part.text);
  const lead = parts
    .filter((part) => !part.bullet)
    .map((part) => part.text)
    .join(" ");
  return { lead, bullets };
}

export function threadHasReadableText(message: Message): boolean {
  return message.thread.some((turn) => turnPlainText(turn).length > 0);
}

/** Changes when the message being replied to actually has text. */
export function latestReplyBodyKey(message: Message): string {
  const latest = message.thread[message.thread.length - 1];
  if (!latest) return "";
  const text = turnPlainText(latest);
  if (!text) return "";
  return `${latest.id}:${text.length}:${text.slice(0, 64)}`;
}

/**
 * Subject, sender, and thread text for a model prompt.
 * The newest message is kept when the thread is longer than the budget.
 */
export function threadTextForPrompt(message: Message, maxChars = 6000): string {
  const header = [
    `Subject: ${message.subject}`,
    `From: ${message.from} <${message.email}>`,
  ];
  const turns = message.thread.map((turn) => {
    const body = turnPlainText(turn).slice(0, 2000);
    return `--- ${turn.from} (${turn.time}) ---\n${body}`;
  });
  const kept: string[] = [];
  let used = header.join("\n\n").length;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i] ?? "";
    const next = used + turn.length + 2;
    if (kept.length > 0 && next > maxChars) break;
    kept.push(turn);
    used = next;
  }
  const body = kept.reverse();
  if (body.length === 1 && used > maxChars) {
    const room = Math.max(0, maxChars - header.join("\n\n").length - 2);
    body[0] = (body[0] ?? "").slice(0, room);
  }
  return [...header, ...body].join("\n\n").slice(0, maxChars);
}
