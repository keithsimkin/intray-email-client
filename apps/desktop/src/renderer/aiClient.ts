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
