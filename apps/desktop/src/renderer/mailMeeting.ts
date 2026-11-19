import type { MailAttachment, Message } from "./data/mock";
import { turnPlainText } from "./mailText";

export type MailMeetingProvider = "google-meet" | "zoom" | "teams" | "webex" | "calendar";

/** A meeting that belongs to this email, not the rest of the calendar. */
export type MailMeetingHit = {
  title: string;
  /** Original when-phrase, when the message had one. */
  when?: string;
  start?: Date;
  end?: Date;
  url?: string;
  provider: MailMeetingProvider;
  providerLabel: string;
};

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

const INVITE_SUBJECT = /^(?:updated invitation|invitation):\s+\S/i;

const RANGE_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:–|—|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;

const ONE_TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function cleanUrl(raw: string): string {
  let url = raw.replace(/&amp;/gi, "&").replace(/[),.;]+$/, "");
  try {
    const parsed = new URL(url);
    const wrapped = parsed.searchParams.get("q");
    if (
      wrapped &&
      /(?:^|\.)google\.[a-z.]+$/i.test(parsed.hostname) &&
      /^https?:\/\//i.test(wrapped)
    ) {
      url = wrapped;
    }
  } catch {
    /* Keep the original string. */
  }
  return url;
}

function classify(url: string): { provider: MailMeetingProvider; label: string } | null {
  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch {
    return null;
  }
  if (/(^|\.)meet\.google\.com$/.test(host)) {
    const code = /^\/(?:lookup\/)?([a-z0-9-]+)\/?$/i.exec(path)?.[1] ?? "";
    if (code.length < 6 || !code.includes("-")) return null;
    return { provider: "google-meet", label: "Google Meet" };
  }
  if (/(^|\.)zoom\.us$/.test(host) && /^\/(?:j|w|wc\/join|my)\//i.test(path)) {
    return { provider: "zoom", label: "Zoom" };
  }
  if (
    /(^|\.)teams\.(microsoft|live)\.com$/.test(host) &&
    /\/l\/meetup-join\//i.test(path)
  ) {
    return { provider: "teams", label: "Teams" };
  }
  if (/webex\.com$/.test(host) && /(\/j\.php|\/meet\/)/i.test(path)) {
    return { provider: "webex", label: "Webex" };
  }
  return null;
}

function firstConference(blobs: string[], preferred?: string): { url: string; provider: MailMeetingProvider; label: string } | null {
  const candidates = preferred ? [preferred, ...blobs] : blobs;
  for (const blob of candidates) {
    if (!blob) continue;
    const matches = blob.match(URL_RE) ?? [];
    for (const raw of matches) {
      const url = cleanUrl(raw);
      const kind = classify(url);
      if (kind) return { url, ...kind };
    }
  }
  return null;
}

function filesOf(message: Message): MailAttachment[] {
  const files: MailAttachment[] = [];
  for (const turn of message.thread ?? []) {
    if (turn.attachments) files.push(...turn.attachments);
    if (turn.attachment) files.push(turn.attachment);
  }
  return files;
}

function hasCalendarFile(message: Message): boolean {
  return filesOf(message).some(
    (file) => file.contentType === "text/calendar" || /\.ics$/i.test(file.name),
  );
}

function cleanTitle(subject: string): string {
  const trimmed = subject.trim();
  const invite = /^(?:updated invitation|invitation):\s*(.+)$/i.exec(trimmed);
  const raw = (invite?.[1] ?? trimmed).trim();
  const beforeAt = raw.split(/\s+@\s+/)[0]?.trim() ?? raw;
  const title = beforeAt.replace(/\s+/g, " ").trim();
  return (title || "Meeting").slice(0, 200);
}

function marker(value: string | undefined): "am" | "pm" | undefined {
  if (!value) return undefined;
  const mark = value.toLowerCase().replace(/\./g, "");
  return mark === "am" || mark === "pm" ? mark : undefined;
}

function clockMinutes(
  hourText: string,
  minuteText: string | undefined,
  ampm: string | undefined,
  fallback?: "am" | "pm",
): number | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? "0");
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  const mark = marker(ampm) ?? fallback;
  if (!mark) return null;
  if (hour < 1 || hour > 12) return null;
  if (mark === "pm" && hour < 12) hour += 12;
  if (mark === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function dayFromLine(line: string, now: Date): Date | null {
  if (/\btoday\b/i.test(line)) return startOfLocalDay(now);
  if (/\btomorrow\b/i.test(line)) {
    const next = startOfLocalDay(now);
    next.setDate(next.getDate() + 1);
    return next;
  }
  const month = /(?:^|[\s,.(])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:\s*,?\s*(\d{4}))?/i.exec(
    line,
  );
  if (month?.[1] && month[2]) {
    const monthIndex = MONTHS[month[1].slice(0, 3).toLowerCase()];
    const day = Number(month[2]);
    const year = month[3] ? Number(month[3]) : now.getFullYear();
    if (monthIndex == null || day < 1 || day > 31) return null;
    const date = new Date(year, monthIndex, day);
    if (date.getMonth() !== monthIndex || date.getDate() !== day) return null;
    if (!month[3]) {
      const cutoff = startOfLocalDay(now);
      cutoff.setDate(cutoff.getDate() - 1);
      if (date < cutoff) date.setFullYear(year + 1);
    }
    return date;
  }
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}`, "i").test(line));
  if (weekday >= 0) {
    const date = startOfLocalDay(now);
    const delta = (weekday - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + delta);
    return date;
  }
  return null;
}

function minutesOnLine(line: string): { start: number; end: number } | null {
  const range = RANGE_RE.exec(line);
  if (range) {
    const endMark = marker(range[6]);
    const start = clockMinutes(range[1]!, range[2], range[3], endMark);
    const end = clockMinutes(range[4]!, range[5], range[6]);
    if (start == null || end == null) return null;
    return { start, end: end <= start ? end + 24 * 60 : end };
  }
  const one = ONE_TIME_RE.exec(line);
  if (!one) return null;
  const start = clockMinutes(one[1]!, one[2], one[3]);
  if (start == null) return null;
  return { start, end: start + 60 };
}

function atMinutes(day: Date, minutes: number): Date {
  const date = new Date(day);
  date.setHours(0, minutes, 0, 0);
  return date;
}

function parseLine(line: string, now: Date): { start: Date; end: Date } | null {
  const day = dayFromLine(line, now);
  const times = minutesOnLine(line);
  if (!day || !times) return null;
  return {
    start: atMinutes(day, times.start),
    end: atMinutes(day, times.end),
  };
}

function parseSchedule(text: string, now: Date): { start: Date; end: Date } | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^when\s*:\s*/i, "").trim())
    .filter((line) => line.length > 0 && line.length < 240);
  const ranked = [
    ...lines.filter((line) => dayFromLine(line, now) && minutesOnLine(line)),
    ...lines,
  ];
  for (const line of ranked.slice(0, 48)) {
    const parsed = parseLine(line, now);
    if (parsed) return parsed;
  }
  return null;
}

function blobsOf(message: Message): string[] {
  const blobs = [message.subject, message.preview];
  if (message.meeting) {
    blobs.push(
      [message.meeting.title, message.meeting.when, message.meeting.url]
        .filter(Boolean)
        .join("\n"),
    );
  }
  for (const turn of message.thread ?? []) {
    blobs.push(turnPlainText(turn));
    if (turn.bodyHtml) blobs.push(turn.bodyHtml);
    if (turn.meeting) {
      blobs.push(
        [turn.meeting.title, turn.meeting.when, turn.meeting.url].filter(Boolean).join("\n"),
      );
    }
  }
  return blobs.filter((blob): blob is string => Boolean(blob)).map((blob) => blob.slice(0, 12_000));
}

/**
 * A Meet, Zoom, Teams, Webex, calendar file, or calendar invitation in this email.
 * A newsletter that only mentions the word "meeting" is not one.
 */
export function findMailMeeting(message: Message, now = new Date()): MailMeetingHit | null {
  const structured =
    message.meeting ?? message.thread?.find((turn) => turn.meeting)?.meeting;
  const blobs = blobsOf(message);
  const link = firstConference(blobs, structured?.url);
  const file = hasCalendarFile(message);
  const invite = INVITE_SUBJECT.test(message.subject.trim());
  if (!structured && !link && !file && !invite) return null;

  const schedule = parseSchedule(
    [structured?.when, ...blobs].filter(Boolean).join("\n"),
    now,
  );
  const when = structured?.when?.trim();
  return {
    title: cleanTitle(structured?.title || message.subject),
    when: when || undefined,
    start: schedule?.start,
    end: schedule?.end,
    url: link?.url ?? structured?.url,
    provider: link?.provider ?? "calendar",
    providerLabel: link?.label ?? (file ? "Calendar file" : "Calendar invite"),
  };
}
