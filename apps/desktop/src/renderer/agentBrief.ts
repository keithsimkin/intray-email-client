import type { Message } from "./data/mock";

export type BriefKind = "meeting" | "missed" | "followup" | "today";

export type BriefAction = {
  id: string;
  messageId: string;
  kind: BriefKind;
  title: string;
  detail: string;
  ask: string;
};

export type DayBrief = {
  headline: string;
  meetings: BriefAction[];
  missed: BriefAction[];
  followups: BriefAction[];
  today: BriefAction[];
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Mail timestamps the app uses for the last day: relative hours, yesterday, or a clock time. */
export function isPastDay(time: string): boolean {
  const value = time.trim();
  return (
    /^(just now|\d+m|\d+h)$/i.test(value) ||
    /^yesterday\b/i.test(value) ||
    /^1d$/i.test(value) ||
    /^today\b/i.test(value) ||
    /^\d{1,2}:\d{2}\s*(am|pm)$/i.test(value)
  );
}

function needsReply(message: Message): boolean {
  const hay = `${message.subject}\n${message.preview}`;
  return /\?|please |can you|could you|following up|circling|let me know|action required|need you|waiting on|your thoughts|rsvp/i.test(
    hay,
  );
}

function meetingOf(message: Message): { title: string; when: string } | null {
  const saved =
    message.meeting ?? message.thread.find((turn) => turn.meeting)?.meeting;
  if (saved) return { title: saved.title, when: saved.when };
  const attachment = message.thread.some((turn) => {
    const files = [
      ...(turn.attachments ?? []),
      ...(turn.attachment ? [turn.attachment] : []),
    ];
    return files.some(
      (file) =>
        file.contentType === "text/calendar" || /\.ics$/i.test(file.name),
    );
  });
  const hay = `${message.subject}\n${message.preview}`;
  const invite =
    /\b(invitation|invite|calendar|meeting|standup)\b|accepted:|declined:|tentative:|google meet|zoom\.us|teams\.microsoft/i.test(
      hay,
    );
  if (!attachment && !invite) return null;
  return { title: message.subject, when: "" };
}

function clockMinutes(text: string): number | null {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const ampm = match[3]!.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Upcoming, already passed, or not a schedule we can place on a clock. */
export function meetingStatus(
  when: string,
  now: Date,
): "upcoming" | "missed" | "unscheduled" {
  const text = when.trim();
  if (!text) return "unscheduled";
  if (/yesterday|missed/i.test(text)) return "missed";
  if (/tomorrow|\bnext\b/i.test(text)) return "upcoming";

  const day = WEEKDAYS.find((name) =>
    new RegExp(`\\b${name}\\b`, "i").test(text),
  );
  const todayName = WEEKDAYS[now.getDay()];
  const isToday = /\btoday\b/i.test(text) || day === todayName;
  const minutes = clockMinutes(text);

  if (isToday) {
    if (minutes == null) return "upcoming";
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return minutes + 15 < nowMinutes ? "missed" : "upcoming";
  }

  if (day || minutes != null) return "upcoming";
  return "unscheduled";
}

function missedInCopy(message: Message): boolean {
  return /you missed|missed the|couldn't attend|could not attend|did not attend|didn't attend|no-show|we missed you/i.test(
    `${message.subject}\n${message.preview}`,
  );
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function action(
  message: Message,
  kind: BriefKind,
  title: string,
  detail: string,
  ask: string,
): BriefAction {
  return {
    id: `${kind}:${message.id}`,
    messageId: message.id,
    kind,
    title,
    detail,
    ask,
  };
}

/**
 * Actionable rundown for an empty agent chat.
 * Meetings, missed meetings, follow-ups, and mail from the past day.
 */
export function buildDayBrief(mail: Message[], now: Date): DayBrief {
  const inbox = mail.filter((message) => message.folder === "inbox");
  const used = new Set<string>();
  const meetings: BriefAction[] = [];
  const missed: BriefAction[] = [];

  for (const message of inbox) {
    const info = meetingOf(message);
    if (!info && !missedInCopy(message)) continue;
    const when = info?.when ?? "";
    const status = missedInCopy(message)
      ? "missed"
      : meetingStatus(when, now);
    const title = info?.title || message.subject;
    const whenLabel = when || message.time;
    if (status === "missed") {
      if (missed.length >= 3) continue;
      missed.push(
        action(
          message,
          "missed",
          title,
          `${message.from} · ${whenLabel}`,
          `Did I miss "${title}"? What should I do about it?`,
        ),
      );
    } else {
      if (meetings.length >= 4) continue;
      meetings.push(
        action(
          message,
          "meeting",
          title,
          `${message.from} · ${whenLabel || "Invite"}`,
          `What do I need to know for "${title}"${when ? ` (${when})` : ""}?`,
        ),
      );
    }
    used.add(message.id);
  }

  const followups = inbox
    .filter((message) => !used.has(message.id))
    .filter((message) => message.unread || needsReply(message))
    .sort((a, b) => followScore(b) - followScore(a))
    .slice(0, 4)
    .map((message) => {
      used.add(message.id);
      const why = message.unread
        ? "Unread"
        : message.important
          ? "Important"
          : "Needs a reply";
      return action(
        message,
        "followup",
        message.subject,
        `${why} · ${message.from}`,
        `What needs a reply in "${message.subject}" from ${message.from}? List the points I should cover.`,
      );
    });

  const today = inbox
    .filter((message) => !used.has(message.id) && isPastDay(message.time))
    .sort((a, b) => Number(b.important) - Number(a.important))
    .slice(0, 4)
    .map((message) =>
      action(
        message,
        "today",
        message.subject,
        `${message.time} · ${message.from}`,
        `Summarize "${message.subject}" from ${message.from} and tell me if I need to act.`,
      ),
    );

  const parts: string[] = [];
  if (meetings.length) {
    parts.push(countLabel(meetings.length, "meeting coming up", "meetings coming up"));
  }
  if (missed.length) {
    parts.push(countLabel(missed.length, "you may have missed", "you may have missed"));
  }
  if (followups.length) {
    parts.push(countLabel(followups.length, "to follow up", "to follow up"));
  }
  if (!parts.length && today.length) {
    parts.push(countLabel(today.length, "note from the past day", "notes from the past day"));
  }

  return {
    headline: parts.length
      ? parts.join(" · ")
      : "Nothing in the inbox needs you right now.",
    meetings,
    missed,
    followups,
    today,
  };
}

function followScore(message: Message): number {
  let score = 0;
  if (message.unread) score += 2;
  if (message.important) score += 3;
  if (message.starred) score += 2;
  if (needsReply(message)) score += 4;
  if (isPastDay(message.time)) score += 1;
  return score;
}
