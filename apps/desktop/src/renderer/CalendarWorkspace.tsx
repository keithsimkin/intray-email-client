import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  eventFallsOnDay,
  isSameLocalDay,
  parseAllDay,
  startOfLocalDay,
  weekContaining,
  weekStartsOn,
  type CalendarWeek,
} from "../shared/calendarWeek";
import type { CalendarEventDto, CalendarRsvp } from "../shared/plugins";
import { pluginErrorFrom, type PluginErrorNotice } from "../shared/pluginError";
import {
  bridgeCalendarDelete,
  bridgeCalendarEvents,
  bridgeCalendarRespond,
  CALENDAR_CHANGED,
} from "./mailApi";
import { CalendarEventDialog } from "./CalendarEventDialog";
import { GoogleCalendarBrand } from "./BrandIcon";

const HOUR_PX = 52;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** Matches the main-process calendar fetch cap. A longer range is rejected. */
const MAX_SPAN_MS = 42 * 24 * 60 * 60 * 1000;
const VIEW_KEY = "intray.calendar.view";
const VIEWS = ["day", "week", "month", "schedule"] as const;

type CalendarView = (typeof VIEWS)[number];

const VIEW_LABEL: Record<CalendarView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  schedule: "Schedule",
};

function readCalendarView(): CalendarView {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === "day" || stored === "week" || stored === "month" || stored === "schedule") {
      return stored;
    }
  } catch {
    /* The view falls back to week when storage is unavailable. */
  }
  return "week";
}

function saveCalendarView(view: CalendarView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* A private window can refuse storage. The choice still applies this session. */
  }
}

type CalendarSpan = {
  start: Date;
  end: Date;
  days: Date[];
  label: string;
};

function daysBetween(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return next;
  });
}

function spanFor(view: CalendarView, anchor: Date, weekStart: number): CalendarSpan {
  const day = startOfLocalDay(anchor);
  if (view === "day") {
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return {
      start: day,
      end,
      days: [day],
      label: day.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    };
  }
  if (view === "week") {
    const week = weekContaining(anchor, weekStart);
    return { start: week.start, end: week.end, days: week.days, label: formatWeek(week) };
  }
  if (view === "month") {
    const first = new Date(day.getFullYear(), day.getMonth(), 1);
    const gridStart = weekContaining(first, weekStart).start;
    const last = new Date(day.getFullYear(), day.getMonth() + 1, 0);
    let gridEnd = weekContaining(last, weekStart).end;
    // A 6-week month that crosses a daylight-saving fallback is 42 calendar
    // days plus an hour. Cap the request so the fetch stays within the limit.
    if (gridEnd.getTime() - gridStart.getTime() > MAX_SPAN_MS) {
      gridEnd = new Date(gridStart.getTime() + MAX_SPAN_MS);
    }
    const count = Math.max(
      1,
      Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000),
    );
    return {
      start: gridStart,
      end: gridEnd,
      days: daysBetween(gridStart, count),
      label: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    };
  }
  const end = new Date(day);
  end.setDate(end.getDate() + 14);
  const lastShown = new Date(end);
  lastShown.setDate(lastShown.getDate() - 1);
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return {
    start: day,
    end,
    days: daysBetween(day, 14),
    label: `${day.toLocaleDateString(undefined, short)} – ${lastShown.toLocaleDateString(undefined, short)}`,
  };
}
const RSVP: Array<{ id: CalendarRsvp; label: string }> = [
  { id: "accepted", label: "Accept" },
  { id: "tentative", label: "Maybe" },
  { id: "declined", label: "Decline" },
];

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function formatWeek(week: CalendarWeek): string {
  const start = week.days[0]!;
  const end = week.days[6]!;
  if (start.getFullYear() !== end.getFullYear()) {
    const full: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    };
    return `${start.toLocaleDateString(undefined, full)} – ${end.toLocaleDateString(undefined, full)}`;
  }
  const startText = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endText = end.toLocaleDateString(undefined, {
    month: start.getMonth() === end.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${startText} – ${endText}`;
}

function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: "numeric",
  });
}

function startMinutes(event: CalendarEventDto): number {
  const date = new Date(event.startIso);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getHours() * 60 + date.getMinutes();
}

function endMinutes(event: CalendarEventDto, day: Date): number {
  const end = new Date(event.endIso);
  const start = startMinutes(event);
  if (Number.isNaN(end.getTime())) return start + 30;
  if (!isSameLocalDay(end, day)) return 24 * 60;
  return Math.max(end.getHours() * 60 + end.getMinutes(), start + 15);
}

function formatWhen(event: CalendarEventDto): string {
  if (event.allDay) return "All day";
  const start = new Date(event.startIso);
  const end = new Date(event.endIso);
  if (Number.isNaN(start.getTime())) return "Time unavailable";
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const endText = Number.isNaN(end.getTime())
    ? ""
    : ` – ${end.toLocaleTimeString(undefined, time)}`;
  return `${start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...time,
  })}${endText}`;
}

type Placed = { event: CalendarEventDto; col: number; cols: number };

function placeTimed(events: CalendarEventDto[], day: Date): Placed[] {
  const timed = events
    .filter((event) => !event.allDay)
    .sort(
      (a, b) =>
        startMinutes(a) - startMinutes(b) ||
        endMinutes(b, day) - endMinutes(a, day),
    );
  const placed: Placed[] = [];
  let cluster: Array<{ event: CalendarEventDto; col: number }> = [];
  let clusterEnd = -1;
  const columnEnds: number[] = [];
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((item) => item.col + 1));
    for (const item of cluster) placed.push({ ...item, cols });
    cluster = [];
    clusterEnd = -1;
    columnEnds.length = 0;
  };
  for (const event of timed) {
    const start = startMinutes(event);
    const end = endMinutes(event, day);
    if (cluster.length > 0 && start >= clusterEnd) flush();
    let col = columnEnds.findIndex((until) => until <= start);
    if (col < 0) {
      col = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[col] = end;
    }
    cluster.push({ event, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return placed;
}

function selfAttendee(event: CalendarEventDto, accountEmail?: string) {
  const email = accountEmail?.trim().toLowerCase();
  return event.attendees?.find(
    (person) =>
      person.self ||
      (email && person.email?.trim().toLowerCase() === email),
  );
}

function hasGuests(event: CalendarEventDto, accountEmail?: string): boolean {
  const email = accountEmail?.trim().toLowerCase();
  return (event.attendees ?? []).some((person) => {
    const personEmail = person.email?.trim().toLowerCase();
    if (!personEmail || person.self) return false;
    return personEmail !== email;
  });
}

export function CalendarWorkspace({
  accountEmail,
  onOpenSettings,
}: {
  accountEmail?: string;
  onOpenSettings: () => void;
}) {
  const weekStart = useMemo(() => weekStartsOn(), []);
  const preferId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const [events, setEvents] = useState<CalendarEventDto[] | null>(null);
  const [error, setError] = useState<PluginErrorNotice | null>(null);
  const [actionError, setActionError] = useState<PluginErrorNotice | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editor, setEditor] = useState<
    | { mode: "create"; at: Date }
    | { mode: "edit"; event: CalendarEventDto }
    | null
  >(null);
  const [view, setView] = useState<CalendarView>(readCalendarView);

  const range = useMemo(
    () => spanFor(view, new Date(anchorMs), weekStart),
    [view, anchorMs, weekStart],
  );
  const today = startOfLocalDay(new Date());

  useEffect(() => {
    const onChange = () => setReload((value) => value + 1);
    window.addEventListener(CALENDAR_CHANGED, onChange);
    return () => window.removeEventListener(CALENDAR_CHANGED, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void bridgeCalendarEvents({
      startIso: range.start.toISOString(),
      endIso: range.end.toISOString(),
    })
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        const preferred = preferId.current;
        preferId.current = null;
        if (
          preferred &&
          rows.some((event) => event.id === preferred && event.status !== "cancelled")
        ) {
          setSelectedId(preferred);
          return;
        }
        setSelectedId((current) =>
          current && rows.some((event) => event.id === current && event.status !== "cancelled")
            ? current
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setEvents([]);
          setError(pluginErrorFrom(cause, "Could not load the calendar."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, reload]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || (view !== "day" && view !== "week")) return;
    const hour = new Date().getHours();
    node.scrollTop = Math.max(0, (hour - 1) * HOUR_PX);
  }, [range.start, view]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedId]);

  const visible = (events ?? []).filter((event) => event.status !== "cancelled");
  const selected = visible.find((event) => event.id === selectedId);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const anchorMonth = new Date(anchorMs).getMonth();
  const stepName =
    view === "day" ? "day" : view === "week" ? "week" : view === "month" ? "month" : "two weeks";

  const shift = (delta: number) => {
    const next = new Date(anchorMs);
    if (view === "day") next.setDate(next.getDate() + delta);
    else if (view === "week") next.setDate(next.getDate() + delta * 7);
    else if (view === "month") next.setMonth(next.getMonth() + delta);
    else next.setDate(next.getDate() + delta * 14);
    setAnchorMs(next.getTime());
  };

  const chooseView = (next: CalendarView) => {
    setView(next);
    saveCalendarView(next);
  };

  const createAt = (at: Date) => {
    setActionError(null);
    setEditor({ mode: "create", at });
  };

  const createOnAnchor = () => {
    const at = startOfLocalDay(new Date(anchorMs));
    const now = new Date();
    if (isSameLocalDay(at, now)) {
      createAt(now);
      return;
    }
    at.setHours(9, 0, 0, 0);
    createAt(at);
  };

  const removeSelected = async () => {
    if (!selected) return;
    setPending(true);
    setActionError(null);
    try {
      await bridgeCalendarDelete(selected.id, hasGuests(selected, accountEmail));
      setSelectedId(null);
      setConfirmDelete(false);
    } catch (cause) {
      setActionError(pluginErrorFrom(cause, "Could not delete this event."));
    } finally {
      setPending(false);
    }
  };

  const reply = async (response: CalendarRsvp) => {
    if (!selected) return;
    preferId.current = selected.id;
    setPending(true);
    setActionError(null);
    try {
      await bridgeCalendarRespond(selected.id, response);
    } catch (cause) {
      preferId.current = null;
      setActionError(pluginErrorFrom(cause, "Could not save your reply."));
    } finally {
      setPending(false);
    }
  };

  const mine = selected ? selfAttendee(selected, accountEmail) : undefined;

  return (
    <div className="plugin-workspace">
      <header className="plugin-workspace-bar">
        <GoogleCalendarBrand size={28} />
        <div className="plugin-workspace-title">
          <h1>Google Calendar</h1>
          <p>{accountEmail ? `${accountEmail} · Primary calendar` : "Primary calendar"}</p>
        </div>
        <div className="cal-view-switch" role="group" aria-label="Calendar view">
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              className={view === option ? "on" : ""}
              aria-pressed={view === option}
              onClick={() => chooseView(option)}
            >
              {VIEW_LABEL[option]}
            </button>
          ))}
        </div>
        <div className="cal-nav plugin-workspace-nav">
          <button
            type="button"
            className="cal-icon"
            aria-label={`Previous ${stepName}`}
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <strong>{range.label}</strong>
          <button type="button" className="cal-today" onClick={() => setAnchorMs(Date.now())}>
            Today
          </button>
          <button
            type="button"
            className="cal-icon"
            aria-label={`Next ${stepName}`}
            onClick={() => shift(1)}
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
          <button type="button" className="cal-today" onClick={createOnAnchor}>
            New event
          </button>
        </div>
        <button type="button" className="plugin-text-btn" onClick={onOpenSettings}>
          Plugin settings
        </button>
      </header>

      {error ? (
        <p className="add-account-error plugin-workspace-alert" role="alert">
          {error.text}
          {error.href ? (
            <>
              {" "}
              <a href={error.href} target="_blank" rel="noreferrer">
                Enable Calendar API
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {actionError ? (
        <p className="add-account-error plugin-workspace-alert" role="alert">
          {actionError.text}
          {actionError.href ? (
            <>
              {" "}
              <a href={actionError.href} target="_blank" rel="noreferrer">
                Enable Calendar API
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="cal-workspace-body">
        {view === "month" ? (
          <div className="cal-month" aria-busy={events === null && !error}>
            {range.days.slice(0, 7).map((day) => (
              <div key={day.getDay()} className="cal-month-weekday">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
            ))}
            {range.days.map((day) => {
              const inMonth = day.getMonth() === anchorMonth;
              const isToday = isSameLocalDay(day, today);
              const items = visible.filter((event) => eventFallsOnDay(event, day));
              const shown = items.slice(0, 3);
              const extra = items.length - shown.length;
              return (
                <div
                  key={day.getTime()}
                  className={`cal-month-cell${inMonth ? "" : " outside"}${isToday ? " today" : ""}`}
                  onClick={(click) => {
                    if (click.target !== click.currentTarget) return;
                    const at = new Date(day);
                    at.setHours(9, 0, 0, 0);
                    createAt(at);
                  }}
                >
                  <button
                    type="button"
                    className="cal-month-date"
                    onClick={() => {
                      setAnchorMs(day.getTime());
                      chooseView("day");
                    }}
                  >
                    {day.getDate()}
                  </button>
                  {shown.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`cal-allday-chip${selectedId === event.id ? " open" : ""}`}
                      onClick={() => setSelectedId(event.id)}
                    >
                      {event.allDay
                        ? event.title
                        : `${new Date(event.startIso).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })} ${event.title}`}
                    </button>
                  ))}
                  {extra > 0 ? (
                    <button
                      type="button"
                      className="cal-month-more"
                      onClick={() => {
                        setAnchorMs(day.getTime());
                        chooseView("day");
                      }}
                    >
                      {extra} more
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : view === "schedule" ? (
          <div className="cal-schedule" aria-busy={events === null && !error}>
            {events === null && !error ? (
              <p className="cal-status">Loading…</p>
            ) : error ? null : visible.length === 0 ? (
              <p className="cal-status">Nothing on your primary calendar in this stretch.</p>
            ) : (
              range.days.map((day) => {
                const items = visible
                  .filter((event) => eventFallsOnDay(event, day))
                  .sort((a, b) => {
                    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
                    return startMinutes(a) - startMinutes(b);
                  });
                if (items.length === 0) return null;
                const isToday = isSameLocalDay(day, today);
                return (
                  <section key={day.getTime()} className="cal-schedule-day">
                    <h3>
                      {day.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                      {isToday ? <span className="cal-today-mark">Today</span> : null}
                    </h3>
                    {items.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`cal-schedule-event${selectedId === event.id ? " open" : ""}`}
                        onClick={() => setSelectedId(event.id)}
                      >
                        <span>
                          {event.allDay
                            ? "All day"
                            : new Date(event.startIso).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                        </span>
                        <strong>{event.title}</strong>
                        {event.location ? <em>{event.location}</em> : null}
                      </button>
                    ))}
                  </section>
                );
              })
            )}
          </div>
        ) : (
        <div className="cal-week-grid" aria-busy={events === null && !error}>
          <div
            className="cal-week-head"
            style={{
              gridTemplateColumns: `56px repeat(${range.days.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="cal-week-gutter" />
            {range.days.map((day) => {
              const isToday = isSameLocalDay(day, today);
              return (
                <div
                  key={day.getTime()}
                  className={`cal-week-dayhead${isToday ? " today" : ""}`}
                >
                  <span>
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <strong>{day.getDate()}</strong>
                </div>
              );
            })}
          </div>
          <div
            className="cal-week-allday"
            style={{
              gridTemplateColumns: `56px repeat(${range.days.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="cal-week-gutter">All day</div>
            {range.days.map((day) => {
              const items = visible.filter(
                (event) => event.allDay && eventFallsOnDay(event, day),
              );
              return (
                <div key={day.getTime()} className="cal-week-allday-col">
                  {items.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`cal-allday-chip${selectedId === event.id ? " open" : ""}`}
                      onClick={() => setSelectedId(event.id)}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="cal-week-scroll" ref={scrollRef}>
            <div className="cal-week-hours" style={{ height: HOURS.length * HOUR_PX }}>
              {HOURS.map((hour) => (
                <div key={hour} className="cal-week-hour" style={{ height: HOUR_PX }}>
                  <span>{hour === 0 ? "" : hourLabel(hour)}</span>
                </div>
              ))}
            </div>
            <div
              className="cal-week-days"
              style={{
                height: HOURS.length * HOUR_PX,
                gridTemplateColumns: `repeat(${range.days.length}, minmax(0, 1fr))`,
              }}
            >
              {range.days.map((day) => {
                const isToday = isSameLocalDay(day, today);
                const dayEvents = visible.filter((event) => eventFallsOnDay(event, day));
                const placed = placeTimed(dayEvents, day);
                return (
                  <div
                    key={day.getTime()}
                    className={`cal-week-col${isToday ? " today" : ""}`}
                    onClick={(click) => {
                      if (click.target !== click.currentTarget) return;
                      const bounds = click.currentTarget.getBoundingClientRect();
                      const y = click.clientY - bounds.top;
                      const raw = Math.max(0, Math.min(24 * 60 - 30, (y / HOUR_PX) * 60));
                      const snapped = Math.floor(raw / 30) * 30;
                      const at = new Date(day);
                      at.setHours(0, snapped, 0, 0);
                      createAt(at);
                    }}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="cal-week-line"
                        style={{ top: hour * HOUR_PX }}
                      />
                    ))}
                    {isToday ? (
                      <div
                        className="cal-now"
                        style={{ top: (nowMinutes / 60) * HOUR_PX }}
                      />
                    ) : null}
                    {placed.map(({ event, col, cols }) => {
                      const start = startMinutes(event);
                      const end = endMinutes(event, day);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          className={`cal-block${selectedId === event.id ? " open" : ""}`}
                          style={{
                            top: (start / 60) * HOUR_PX + 1,
                            height: Math.max(((end - start) / 60) * HOUR_PX - 2, 20),
                            left: `calc(${(col / cols) * 100}% + 2px)`,
                            width: `calc(${100 / cols}% - 4px)`,
                          }}
                          onClick={(click) => {
                            click.stopPropagation();
                            setSelectedId(event.id);
                          }}
                        >
                          <strong>{event.title}</strong>
                          <span>
                            {new Date(event.startIso).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {event.location ? ` · ${event.location}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {events === null && !error ? (
            <p className="cal-status cal-week-loading">Loading…</p>
          ) : null}
        </div>
        )}

        {selected ? (
          <aside className="plugin-inspector" aria-label="Event">
            <h2>{selected.title}</h2>
            <p>{formatWhen(selected)}</p>
            {selected.location ? <p>{selected.location}</p> : null}
            {selected.organizer ? (
              <p>
                Organizer · {selected.organizer.name || selected.organizer.email}
              </p>
            ) : null}
            {selected.attendees && selected.attendees.length > 0 ? (
              <ul className="cal-people">
                {selected.attendees.slice(0, 12).map((person, index) => (
                  <li key={`${person.email ?? person.name ?? "guest"}-${index}`}>
                    {person.name || person.email || "Someone"}
                    {person.response
                      ? ` · ${
                          person.response === "accepted"
                            ? "Accepted"
                            : person.response === "declined"
                              ? "Declined"
                              : person.response === "tentative"
                                ? "Maybe"
                                : "No reply"
                        }`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {selected.description ? (
              <p className="cal-notes">{selected.description}</p>
            ) : null}
            <div className="cal-links">
              {selected.meetLink ? (
                <button
                  type="button"
                  className="cal-link"
                  onClick={() => openExternal(selected.meetLink!)}
                >
                  Join Google Meet
                </button>
              ) : null}
              {selected.htmlLink ? (
                <button
                  type="button"
                  className="cal-link"
                  onClick={() => openExternal(selected.htmlLink!)}
                >
                  Open in Google Calendar
                </button>
              ) : null}
            </div>
            {mine ? (
              <div className="cal-rsvp" role="group" aria-label="Your reply">
                {RSVP.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`plugin-secondary-btn${mine.response === option.id ? " on" : ""}`}
                    disabled={pending || mine.response === option.id}
                    onClick={() => void reply(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {confirmDelete ? (
              <div className="cal-confirm">
                <p>
                  {hasGuests(selected, accountEmail)
                    ? "Delete this event? Guests are notified."
                    : "Delete this event from your primary calendar?"}
                </p>
                <div className="cal-actions">
                  <button
                    type="button"
                    className="plugin-secondary-btn cal-delete"
                    disabled={pending}
                    onClick={() => void removeSelected()}
                  >
                    {pending ? <Loader2 size={13} className="spin" /> : null}
                    Delete
                  </button>
                  <button
                    type="button"
                    className="plugin-secondary-btn"
                    disabled={pending}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="cal-actions">
                <button
                  type="button"
                  className="plugin-secondary-btn"
                  disabled={pending}
                  onClick={() => setEditor({ mode: "edit", event: selected })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="plugin-secondary-btn cal-delete"
                  disabled={pending}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              </div>
            )}
          </aside>
        ) : (
          <aside className="plugin-inspector plugin-inspector-empty">
            <p>Select an event, or click an empty time to add one.</p>
          </aside>
        )}
      </div>

      {editor ? (
        <CalendarEventDialog
          mode={editor.mode}
          event={editor.mode === "edit" ? editor.event : undefined}
          at={editor.mode === "create" ? editor.at : undefined}
          onClose={() => setEditor(null)}
          onSaved={(event) => {
            preferId.current = event.id;
            const when = event.allDay
              ? parseAllDay(event.startIso)
              : new Date(event.startIso);
            if (!Number.isNaN(when.getTime())) setAnchorMs(when.getTime());
            setSelectedId(event.id);
            setEditor(null);
          }}
        />
      ) : null}
    </div>
  );
}
