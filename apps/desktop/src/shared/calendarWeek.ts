import type { CalendarEventDto } from "./plugins";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight for the calendar day that contains `date`. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * First day of the week for a locale. 0 is Sunday, 1 is Monday.
 * Falls back to Sunday when the runtime has no week info.
 */
export function weekStartsOn(locale?: string): number {
  const tag =
    locale ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
  try {
    const info = (
      new Intl.Locale(tag) as Intl.Locale & { weekInfo?: { firstDay?: number } }
    ).weekInfo;
    const first = info?.firstDay;
    if (first === 7) return 0;
    if (typeof first === "number" && first >= 1 && first <= 6) return first;
  } catch {
    /* Locale or weekInfo is unavailable. */
  }
  return 0;
}

export type CalendarWeek = {
  /** Local midnight of the first day. */
  start: Date;
  /** Local midnight after the last day. Exclusive. */
  end: Date;
  days: Date[];
};

export function weekContaining(date: Date, weekStart = 0): CalendarWeek {
  const day = startOfLocalDay(date);
  const delta = (day.getDay() - weekStart + 7) % 7;
  const start = new Date(day);
  start.setDate(day.getDate() - delta);
  const days = Array.from({ length: 7 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return next;
  });
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end, days };
}

/** Google all-day values are `YYYY-MM-DD`. Read the date in local time. */
export function parseAllDay(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return startOfLocalDay(new Date(iso));
}

/**
 * All-day events occupy every local day they cover (end is exclusive).
 * Timed events stay on the day they start, so a late meeting is not duplicated.
 */
export function eventFallsOnDay(event: CalendarEventDto, day: Date): boolean {
  const dayStart = startOfLocalDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  if (event.allDay) {
    const start = parseAllDay(event.startIso).getTime();
    const end = parseAllDay(event.endIso).getTime();
    return start < dayEnd && end > dayStart;
  }
  const start = new Date(event.startIso).getTime();
  if (!Number.isFinite(start)) return false;
  return start >= dayStart && start < dayEnd;
}
