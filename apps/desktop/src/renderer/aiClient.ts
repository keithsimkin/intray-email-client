import type { AiProviderId } from "../shared/types";
import { bridgeAiComplete } from "./mailApi";
import type { Message } from "./data/mock";
import type { Preferences } from "./preferences";

export function providerFromPrefs(prefs: Preferences): AiProviderId {
  return prefs.aiBridge as AiProviderId;
}

function threadText(message: Message, maxChars = 6000): string {
  const parts: string[] = [
    `Subject: ${message.subject}`,
    `From: ${message.from} <${message.email}>`,
  ];
  for (const t of message.thread) {
    const body =
      t.body?.join("\n") ||
      t.bodyHtml?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
      "";
    parts.push(`--- ${t.from} (${t.time}) ---\n${body.slice(0, 2000)}`);
  }
  return parts.join("\n\n").slice(0, maxChars);
}

export async function aiAskAboutMail(opts: {
  prefs: Preferences;
  question: string;
  mail: Message[];
  focus?: Message | null;
}): Promise<string> {
  const context = opts.focus
    ? threadText(opts.focus)
    : opts.mail
        .slice(0, 25)
        .map(
          (m, i) =>
            `${i + 1}. [${m.id}] ${m.from}: ${m.subject} — ${m.preview}`,
        )
        .join("\n");

  const result = await bridgeAiComplete({
    provider: providerFromPrefs(opts.prefs),
    model: opts.prefs.aiModelHint || undefined,
    bridgePath: opts.prefs.aiBridgePath || undefined,
    system:
      "You are Intray's mail assistant. Answer only from the provided mail context. Cite subjects when helpful. Be concise.",
    prompt: `Mail context:\n${context}\n\nUser question:\n${opts.question}`,
  });
  return result.text;
}

export async function aiSummarizeMessage(
  prefs: Preferences,
  message: Message,
): Promise<string> {
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    prompt: `Summarize this email thread in 3–5 short bullets:\n\n${threadText(message)}`,
  });
  return result.text;
}

export async function aiTranslateMessage(
  prefs: Preferences,
  message: Message,
  targetLang = "English",
): Promise<string> {
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    prompt: `Translate the following email into ${targetLang}. Keep names and keep formatting plain:\n\n${threadText(message, 4000)}`,
  });
  return result.text;
}

export async function aiSuggestReplies(
  prefs: Preferences,
  message: Message,
): Promise<string[]> {
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    maxTokens: 400,
    prompt: `Suggest exactly 3 short reply options to this email. Return only the 3 replies, each on its own line, no numbering:\n\n${threadText(message, 3000)}`,
  });
  return result.text
    .split(/\n+/)
    .map((l) => l.replace(/^\d+[\).:-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function aiLabelMessages(
  prefs: Preferences,
  messages: Message[],
  labels: { id: string; name: string; color: string }[],
): Promise<{
  assigned: { messageId: string; id: string; name: string; color: string }[];
  /** Ids the model named, including NONE. Ids it skipped are omitted. */
  decidedIds: string[];
}> {
  if (!messages.length || !labels.length) return { assigned: [], decidedIds: [] };
  const catalog = labels.map((label) => label.name).join(", ");
  const lines = messages
    .map(
      (message) =>
        `${message.id}\t${message.from}\t${message.subject}\t${message.preview}`,
    )
    .join("\n");
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    maxTokens: 500,
    prompt: `Label each email with exactly one name from this list: ${catalog}.
If none fit, use NONE.
Reply with one line per email in the form: <id> <label>
No other text.

${lines}`,
  });
  const assigned: { messageId: string; id: string; name: string; color: string }[] = [];
  const decidedIds: string[] = [];
  for (const line of result.text.split(/\n+/)) {
    const match = /^(\S+)\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const message = messages.find((item) => item.id === match[1]);
    if (!message || decidedIds.includes(message.id)) continue;
    decidedIds.push(message.id);
    const name = match[2]!.replace(/^["']|["']$/g, "").trim();
    if (!name || /^none$/i.test(name)) continue;
    const label = labels.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    if (!label) continue;
    assigned.push({
      messageId: message.id,
      id: label.id,
      name: label.name,
      color: label.color,
    });
  }
  return { assigned, decidedIds };
}

export async function aiCatchMeUp(
  prefs: Preferences,
  messages: Message[],
): Promise<string> {
  const priority = messages.filter((message) => message.unread || message.important);
  const source = (priority.length ? priority : messages).slice(0, 12);
  if (!source.length) return "Nothing in this view to catch up on.";
  const context = source
    .map(
      (message, index) =>
        `${index + 1}. [${message.id}] ${message.unread ? "UNREAD" : "read"} ${message.from}: ${message.subject} — ${message.preview}`,
    )
    .join("\n");
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    system:
      "You are Intray's mail assistant. Summarize only the mail provided. Put anything that needs a reply first. Do not invent senders, dates, or tasks.",
    prompt: `Catch me up on this inbox in at most 6 short bullets:\n\n${context}`,
  });
  return result.text.trim();
}

export async function aiFindUnsubscribeUrl(
  prefs: Preferences,
  message: Message,
): Promise<string | null> {
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    maxTokens: 80,
    prompt: `If the email contains an unsubscribe or manage-preferences URL, reply with that URL only. If it does not, reply NONE.\n\n${threadText(message, 4000)}`,
  });
  const raw = result.text.trim();
  if (!raw || /^none$/i.test(raw)) return null;
  const url = raw.match(/mailto:\S+|https?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/, "");
  if (!url) return null;
  const hay = [
    threadText(message, 8000),
    ...message.thread.map((turn) => turn.bodyHtml ?? ""),
  ].join("\n");
  return hay.includes(url) ? url : null;
}

export async function aiSuggestLabel(
  prefs: Preferences,
  message: Message,
  labels: { id: string; name: string }[],
): Promise<string | null> {
  const names = labels.map((l) => l.name).join(", ");
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    maxTokens: 40,
    prompt: `Pick the single best label for this email from: ${names}.\nReply with ONLY the label name, or NONE.\n\n${threadText(message, 2500)}`,
  });
  const pick = result.text.trim().replace(/^["']|["']$/g, "");
  if (!pick || /^none$/i.test(pick)) return null;
  const match = labels.find(
    (l) => l.name.toLowerCase() === pick.toLowerCase(),
  );
  return match?.id ?? null;
}

export async function aiWriteReply(
  prefs: Preferences,
  message: Message,
  instruction?: string,
): Promise<string> {
  const result = await bridgeAiComplete({
    provider: providerFromPrefs(prefs),
    model: prefs.aiModelHint || undefined,
    bridgePath: prefs.aiBridgePath || undefined,
    prompt: `Write a concise reply to this email${instruction ? ` (${instruction})` : ""}. Return only the reply body:\n\n${threadText(message, 4000)}`,
  });
  return result.text;
}
