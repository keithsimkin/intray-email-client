import type { BriefAction, BriefKind, DayBrief } from "./agentBrief";

export type DayCard = {
  id: string;
  when: string;
  who: string;
  what: string;
  note: string;
};

export type DayScene = {
  lede: string;
  meetings: DayCard[];
  missed: DayCard[];
  followups: DayCard[];
  today: DayCard[];
  quiet: string[];
};

export type DayPiece = {
  id: string;
  messageId: string;
  kind: BriefKind;
  when: string;
  who: string;
  what: string;
  note: string;
  ask: string;
};

export type DayMail = {
  id: string;
  from: string;
  time: string;
  subject: string;
  preview: string;
  meeting?: { when: string } | null;
};

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: unknown, max: number): string {
  const line = clean(value);
  if (!line) return "";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

function cards(value: unknown, knownIds: ReadonlySet<string>): DayCard[] {
  if (!Array.isArray(value)) return [];
  const out: DayCard[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || !knownIds.has(id) || out.some((card) => card.id === id)) continue;
    const what = clip(item.what, 72);
    const who = clip(item.who, 48);
    if (!what && !who) continue;
    out.push({
      id,
      when: clip(item.when, 36),
      who,
      what,
      note: clip(item.note, 48),
    });
    if (out.length >= 6) break;
  }
  return out;
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const row of value) {
    if (typeof row !== "string") continue;
    const name = row.replace(/\s+/g, " ").trim();
    if (!name || name.length > 40 || /[.!?]/.test(name)) continue;
    if (out.includes(name)) continue;
    out.push(name);
    if (out.length >= 8) break;
  }
  return out;
}

/** Turn a model rundown into short cards. Prose and unknown mail ids are dropped. */
export function parseDayScene(
  text: string,
  knownIds: ReadonlySet<string>,
): DayScene | null {
  const raw = text.trim();
  if (!raw) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced?.[1]?.trim() || raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lede = clean(record.lede);
  const scene: DayScene = {
    lede: lede.length > 90 ? "" : lede,
    meetings: cards(record.meetings, knownIds),
    missed: cards(record.missed, knownIds),
    followups: cards(record.followups, knownIds),
    today: cards(record.other ?? record.today, knownIds),
    quiet: names(record.quiet),
  };
  const count =
    scene.meetings.length +
    scene.missed.length +
    scene.followups.length +
    scene.today.length +
    scene.quiet.length;
  return count ? scene : null;
}

function pieceFromBrief(item: BriefAction, message?: DayMail): DayPiece {
  const parts = item.detail.split(" · ");
  if (item.kind === "followup") {
    return {
      id: item.id,
      messageId: item.messageId,
      kind: item.kind,
      when: "",
      who: message?.from || parts[1] || "",
      what: item.title,
      note: parts[1] ? parts[0] || "" : "",
      ask: item.ask,
    };
  }
  if (item.kind === "today") {
    return {
      id: item.id,
      messageId: item.messageId,
      kind: item.kind,
      when: message?.time || parts[0] || "",
      who: message?.from || parts[1] || "",
      what: item.title,
      note: "",
      ask: item.ask,
    };
  }
  return {
    id: item.id,
    messageId: item.messageId,
    kind: item.kind,
    when: parts.slice(1).join(" · ") || message?.meeting?.when || "",
    who: message?.from || parts[0] || "",
    what: item.title,
    note: "",
    ask: item.ask,
  };
}

function askFor(kind: BriefKind, what: string, who: string, when: string, hit?: BriefAction): string {
  if (hit) return hit.ask;
  if (kind === "missed") return `Did I miss "${what}"? What should I do about it?`;
  if (kind === "followup") {
    return `What needs a reply in "${what}"${who ? ` from ${who}` : ""}? List the points I should cover.`;
  }
  if (kind === "meeting") {
    return `What do I need to know for "${what}"${when ? ` (${when})` : ""}?`;
  }
  return `Summarize "${what}"${who ? ` from ${who}` : ""} and tell me if I need to act.`;
}

function pieceFromCard(
  card: DayCard,
  kind: BriefKind,
  brief: DayBrief,
  message?: DayMail,
): DayPiece {
  const hit = [brief.meetings, brief.missed, brief.followups, brief.today]
    .flat()
    .find((item) => item.messageId === card.id);
  const what = card.what || message?.subject || hit?.title || "Mail";
  const who = card.who || message?.from || "";
  const when =
    card.when ||
    (kind === "today" ? message?.time ?? "" : message?.meeting?.when ?? "");
  return {
    id: `${kind}:${card.id}`,
    messageId: card.id,
    kind,
    when,
    who,
    what,
    note: card.note,
    ask: askFor(kind, what, who, when, hit),
  };
}

/** A clock or a named day is worth showing. "1d" and "3h" are not. */
export function shownWhen(when: string): string {
  const value = when.trim();
  if (!value || /^(just now|\d+\s*[smhdw]|yesterday)$/i.test(value)) return "";
  return value;
}

export type DayGroups = {
  lede: string;
  quiet: string[];
  groups: { kind: BriefKind; items: DayPiece[] }[];
};

/** Cards for the day page. A parsed scene replaces the brief; otherwise the brief is the layout. */
export function presentDay(
  brief: DayBrief,
  scene: DayScene | null,
  mail: readonly DayMail[],
): DayGroups {
  const byId = new Map(mail.map((row) => [row.id, row]));
  const kinds: { kind: BriefKind; briefItems: BriefAction[]; sceneItems?: DayCard[] }[] = [
    { kind: "meeting", briefItems: brief.meetings, sceneItems: scene?.meetings },
    { kind: "missed", briefItems: brief.missed, sceneItems: scene?.missed },
    { kind: "followup", briefItems: brief.followups, sceneItems: scene?.followups },
    { kind: "today", briefItems: brief.today, sceneItems: scene?.today },
  ];
  return {
    lede: scene?.lede ?? "",
    quiet: scene?.quiet ?? [],
    groups: kinds.map(({ kind, briefItems, sceneItems }) => ({
      kind,
      items: scene
        ? (sceneItems ?? []).map((card) =>
            pieceFromCard(card, kind, brief, byId.get(card.id)),
          )
        : briefItems.map((item) => pieceFromBrief(item, byId.get(item.messageId))),
    })),
  };
}
