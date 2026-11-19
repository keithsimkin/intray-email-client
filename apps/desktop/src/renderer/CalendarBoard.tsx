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
import type {
  CalendarAttendee,
  CalendarEventDto,
  CalendarRsvp,
} from "../shared/plugins";
import { pluginErrorFrom, type PluginErrorNotice } from "../shared/pluginError";
import {
  bridgeCalendarDelete,
  bridgeCalendarEvents,
  bridgeCalendarRespond,
  CALENDAR_CHANGED,
} from "./mailApi";
import { CalendarEventDialog } from "./CalendarEventDialog";

const RESPONSE_LABEL: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
  needsAction: "No reply",
};

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function formatWeek(week: CalendarWeek): string {
  const start = week.days[0]!;
  const end = week.days[6]!;
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear !== endYear) {
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

function formatWhen(event: CalendarEventDto): string {
  if (event.allDay) {
    const start = parseAllDay(event.startIso);
    const endExclusive = parseAllDay(event.endIso);
    const last = new Date(endExclusive);
    last.setDate(last.getDate() - 1);
    const day: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
    };
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(last.getTime()) ||
      last.getTime() < start.getTime() ||
      isSameLocalDay(start, last)
    ) {
      return "All day";
    }
    return `All day · ${start.toLocaleDateString(undefined, day)} – ${last.toLocaleDateString(undefined, day)}`;
  }
  const start = new Date(event.startIso);
  const end = new Date(event.endIso);
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const dateTime: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...time,
  };
  if (Number.isNaN(start.getTime())) return "Time unavailable";
  if (Number.isNaN(end.getTime()) || isSameLocalDay(start, end)) {
    const endText = Number.isNaN(end.getTime())
      ? ""
      : ` – ${end.toLocaleTimeString(undefined, time)}`;
    return `${start.toLocaleString(undefined, dateTime)}${endText}`;
  }
  return `${start.toLocaleString(undefined, dateTime)} – ${end.toLocaleString(undefined, dateTime)}`;
}

function rowTime(event: CalendarEventDto): string {
  if (event.allDay) return "All day";
  const start = new Date(event.startIso);
  if (Number.isNaN(start.getTime())) return "";
  return start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function personLabel(person?: { email?: string; name?: string }): string {
  return person?.name || person?.email || "";
}

function attendeeLabel(attendee: CalendarAttendee): string {
  const name = attendee.name?.trim();
  const email = attendee.email?.trim();
  const who =
    name && email && name.toLowerCase() !== email.toLowerCase()
      ? `${name} · ${email}`
      : name || email || "Someone";
  const response = attendee.response ? RESPONSE_LABEL[attendee.response] : "";
  return response ? `${who} · ${response}` : who;
}

function firstEventKey(
  rows: CalendarEventDto[],
  week: CalendarWeek,
  today: Date,
): string | null {
  const visible = rows.filter((event) => event.status !== "cancelled");
  const groups = week.days.map((day) => ({
    day,
    events: visible.filter((event) => eventFallsOnDay(event, day)),
  }));
  const preferred =
    groups.find((group) => isSameLocalDay(group.day, today) && group.events[0]) ??
    groups.find((group) => group.events[0]);
  const event = preferred?.events[0];
  if (!preferred || !event) return null;
  return `${preferred.day.getTime()}:${event.id}`;
}

const RSVP_OPTIONS: Array<{ id: CalendarRsvp; label: string }> = [
  { id: "accepted", label: "Accept" },
  { id: "tentative", label: "Maybe" },
  { id: "declined", label: "Decline" },
];

function selfAttendee(
  event: CalendarEventDto,
  accountEmail?: string,
): CalendarAttendee | undefined {
  const email = accountEmail?.trim().toLowerCase();
  return event.attendees?.find(
    (person) =>
      person.self ||
      (email !== undefined &&
        email !== "" &&
        person.email?.trim().toLowerCase() === email),
  );
}

function hasGuests(event: CalendarEventDto, accountEmail?: string): boolean {
  const email = accountEmail?.trim().toLowerCase();
  return (event.attendees ?? []).some((person) => {
    const personEmail = person.email?.trim().toLowerCase();
    if (!personEmail) return false;
    if (person.self) return false;
    return personEmail !== email;
  });
}

function EventDetail({
  event,
  peopleLimit = 8,
  accountEmail,
  pending,
  confirmDelete,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onRespond,
}: {
  event: CalendarEventDto;
  peopleLimit?: number;
  accountEmail?: string;
  pending: boolean;
  confirmDelete: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onRespond: (response: CalendarRsvp) => void;
}) {
  const people = event.attendees ?? [];
  const shown = people.slice(0, peopleLimit);
  const extra = people.length - shown.length;
  const location = event.location?.trim();
  const locationUrl = location && /^https?:\/\//i.test(location) ? location : "";
  const mine = selfAttendee(event, accountEmail);
  const guests = hasGuests(event, accountEmail);
  return (
    <div className="cal-detail">
      <h3 className="cal-detail-title">{event.title}</h3>
      <p>{formatWhen(event)}</p>
      {event.status === "tentative" ? <p>Tentative</p> : null}
      {location ? (
        locationUrl ? (
          <button type="button" className="cal-link" onClick={() => openExternal(locationUrl)}>
            {location}
          </button>
        ) : (
          <p>{location}</p>
        )
      ) : null}
      {personLabel(event.organizer) ? (
        <p>Organizer · {personLabel(event.organizer)}</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="cal-people">
          {shown.map((attendee, index) => (
            <li key={`${attendee.email ?? attendee.name ?? "person"}-${index}`}>
              {attendeeLabel(attendee)}
            </li>
          ))}
          {extra > 0 ? <li>and {extra} more</li> : null}
        </ul>
      ) : null}
      {event.description ? <p className="cal-notes">{event.description}</p> : null}
      <div className="cal-links">
        {event.meetLink ? (
          <button type="button" className="cal-link" onClick={() => openExternal(event.meetLink!)}>
            Join Google Meet
          </button>
        ) : null}
        {event.htmlLink ? (
          <button type="button" className="cal-link" onClick={() => openExternal(event.htmlLink!)}>
            Open in Google Calendar
          </button>
        ) : null}
      </div>
      {mine ? (
        <div className="cal-rsvp" role="group" aria-label="Your reply">
          {RSVP_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`plugin-secondary-btn${mine.response === option.id ? " on" : ""}`}
              disabled={pending || mine.response === option.id}
              onClick={() => onRespond(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {confirmDelete ? (
        <div className="cal-confirm">
          <p>
            {guests
              ? "Delete this event? Guests are notified."
              : "Delete this event from your primary calendar?"}
          </p>
          <div className="cal-actions">
            <button
              type="button"
              className="plugin-secondary-btn cal-delete"
              disabled={pending}
              onClick={onDelete}
            >
              {pending ? <Loader2 size={13} className="spin" /> : null}
              Delete
            </button>
            <button
              type="button"
              className="plugin-secondary-btn"
              disabled={pending}
              onClick={onCancelDelete}
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
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="plugin-secondary-btn cal-delete"
            disabled={pending}
            onClick={onAskDelete}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/** Week of the primary calendar, with every event and its detail. */
export function CalendarBoard({
  active,
  variant = "pin",
  accountEmail,
}: {
  active: boolean;
  /** `panel` lists every day. `pin` lists the days that have events. */
  variant?: "pin" | "panel";
  /** Signed-in Google account, used to show Accept / Maybe / Decline. */
  accountEmail?: string;
}) {
  const weekStart = useMemo(() => weekStartsOn(), []);
  const preferId = useRef<string | null>(null);
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const [events, setEvents] = useState<CalendarEventDto[] | null>(null);
  const [error, setError] = useState<PluginErrorNotice | null>(null);
  const [actionError, setActionError] = useState<PluginErrorNotice | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editor, setEditor] = useState<
    | { mode: "create"; day?: Date }
    | { mode: "edit"; event: CalendarEventDto }
    | null
  >(null);

  const week = useMemo(
    () => weekContaining(new Date(anchorMs), weekStart),
    [anchorMs, weekStart],
  );
  const today = startOfLocalDay(new Date());

  useEffect(() => {
    const onChange = () => setReload((value) => value + 1);
    window.addEventListener(CALENDAR_CHANGED, onChange);
    return () => window.removeEventListener(CALENDAR_CHANGED, onChange);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setEvents(null);
    setError(null);
    setOpenKey(null);
    void bridgeCalendarEvents({
      startIso: week.start.toISOString(),
      endIso: week.end.toISOString(),
    })
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        const preferred = preferId.current;
        if (preferred) {
          preferId.current = null;
          const match = rows.find(
            (item) => item.id === preferred && item.status !== "cancelled",
          );
          if (match) {
            const day =
              week.days.find((item) => eventFallsOnDay(match, item)) ??
              week.days[0]!;
            setOpenKey(`${day.getTime()}:${match.id}`);
            return;
          }
        }
        if (variant === "panel") {
          setOpenKey(firstEventKey(rows, week, startOfLocalDay(new Date())));
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setEvents([]);
          setError(pluginErrorFrom(cause, "Could not load this week."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, variant, week, reload]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [openKey]);

  const savedEvent = (event: CalendarEventDto) => {
    preferId.current = event.id;
    const when = event.allDay ? parseAllDay(event.startIso) : new Date(event.startIso);
    if (!Number.isNaN(when.getTime())) setAnchorMs(when.getTime());
    setEditor(null);
    setActionError(null);
  };

  const removeEvent = async (event: CalendarEventDto) => {
    setPendingId(event.id);
    setActionError(null);
    try {
      await bridgeCalendarDelete(event.id, hasGuests(event, accountEmail));
      setConfirmDelete(false);
    } catch (cause) {
      setActionError(pluginErrorFrom(cause, "Could not delete this event."));
    } finally {
      setPendingId(null);
    }
  };

  const reply = async (event: CalendarEventDto, response: CalendarRsvp) => {
    preferId.current = event.id;
    setPendingId(event.id);
    setActionError(null);
    try {
      await bridgeCalendarRespond(event.id, response);
    } catch (cause) {
      preferId.current = null;
      setActionError(pluginErrorFrom(cause, "Could not save your reply."));
    } finally {
      setPendingId(null);
    }
  };

  const detailProps = (event: CalendarEventDto) => ({
    event,
    accountEmail,
    pending: pendingId === event.id,
    confirmDelete:
      confirmDelete &&
      openKey !== null &&
      openKey.slice(openKey.indexOf(":") + 1) === event.id,
    onEdit: () => {
      setActionError(null);
      setConfirmDelete(false);
      setEditor({ mode: "edit", event });
    },
    onAskDelete: () => {
      setActionError(null);
      setConfirmDelete(true);
    },
    onCancelDelete: () => setConfirmDelete(false),
    onDelete: () => void removeEvent(event),
    onRespond: (response: CalendarRsvp) => void reply(event, response),
  });

  const visible = (events ?? []).filter((event) => event.status !== "cancelled");
  const groups = week.days.map((day) => ({
    day,
    events: visible.filter((event) => eventFallsOnDay(event, day)),
  }));
  const blocks = groups.filter((group) => group.events.length > 0);
  const selectedId =
    variant === "panel" && openKey
      ? openKey.slice(openKey.indexOf(":") + 1)
      : "";
  const selected =
    selectedId !== ""
      ? visible.find((event) => event.id === selectedId)
      : undefined;

  const shiftWeek = (delta: number) => {
    const next = new Date(week.days[0]!);
    next.setDate(next.getDate() + delta * 7);
    setAnchorMs(next.getTime());
  };

  return (
    <div
      className={`cal-board${variant === "panel" ? " cal-board-panel" : ""}`}
      aria-busy={events === null && !error}
    >
      <div className="cal-nav">
        <button
          type="button"
          className="cal-icon"
          aria-label="Previous week"
          onClick={() => shiftWeek(-1)}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <strong>{formatWeek(week)}</strong>
        {events && visible.length > 0 ? (
          <span className="cal-count">
            {visible.length === 1 ? "1 event" : `${visible.length} events`}
          </span>
        ) : null}
        <button
          type="button"
          className="cal-today"
          onClick={() => {
            setActionError(null);
            setEditor({ mode: "create" });
          }}
        >
          New event
        </button>
        <button
          type="button"
          className="cal-today"
          onClick={() => setAnchorMs(Date.now())}
        >
          Today
        </button>
        <button
          type="button"
          className="cal-icon"
          aria-label="Next week"
          onClick={() => shiftWeek(1)}
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>

      {actionError ? (
        <p className="add-account-error" role="alert">
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

      {error ? (
        <p className="add-account-error" role="alert">
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
      ) : events === null ? (
        <p className="cal-status">Loading this week…</p>
      ) : variant === "pin" && visible.length === 0 ? (
        <p className="cal-status">Nothing on your primary calendar this week.</p>
      ) : variant === "panel" ? (
        <>
          <div className="cal-grid">
            {groups.map((group) => {
              const dayMs = group.day.getTime();
              const isToday = isSameLocalDay(group.day, today);
              return (
                <section
                  key={dayMs}
                  className={`cal-grid-day${isToday ? " today" : ""}`}
                >
                  <h3>
                    <span>
                      {group.day.toLocaleDateString(undefined, { weekday: "short" })}
                      {group.events.length > 0 ? ` · ${group.events.length}` : ""}
                    </span>
                    <strong className={isToday ? "today" : undefined}>
                      {group.day.getDate()}
                    </strong>
                  </h3>
                  <div className="cal-grid-events">
                    {group.events.length === 0 ? (
                      <button
                        type="button"
                        className="cal-grid-add"
                        onClick={() => {
                          setActionError(null);
                          setEditor({ mode: "create", day: group.day });
                        }}
                      >
                        Add
                      </button>
                    ) : (
                      group.events.map((event) => {
                        const key = `${dayMs}:${event.id}`;
                        const open = selectedId === event.id;
                        const meta = [event.location, event.meetLink ? "Meet" : ""]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`cal-grid-event${open ? " open" : ""}`}
                            aria-pressed={open}
                            onClick={() => setOpenKey(key)}
                          >
                            <span className="cal-event-time">{rowTime(event)}</span>
                            <span className="cal-event-title">
                              {event.status === "tentative" ? "Tentative · " : ""}
                              {event.title}
                            </span>
                            {meta ? <span className="cal-event-meta">{meta}</span> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {selected ? (
            <div className="cal-detail-pane">
              <EventDetail {...detailProps(selected)} peopleLimit={24} />
            </div>
          ) : (
            <p className="cal-status">
              {visible.length === 0
                ? "Nothing on your primary calendar this week."
                : "Select an event to see the place, people, notes, and links."}
            </p>
          )}
        </>
      ) : (
        <div className="cal-week">
          {blocks.map((group) => {
            const dayMs = group.day.getTime();
            const isToday = isSameLocalDay(group.day, today);
            return (
              <section
                key={dayMs}
                className={`cal-day-block${isToday ? " today" : ""}`}
              >
                <h3>
                  {group.day.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                  {isToday ? <span className="cal-today-mark">Today</span> : null}
                </h3>
                {group.events.length === 0 ? (
                  <p className="cal-status">Nothing scheduled.</p>
                ) : (
                  group.events.map((event) => {
                    const key = `${dayMs}:${event.id}`;
                    const open = openKey === key;
                    const meta = [event.location, event.meetLink ? "Meet" : ""]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div key={key} className="cal-item">
                        <button
                          type="button"
                          className={`cal-event${open ? " open" : ""}`}
                          aria-expanded={open}
                          onClick={() => setOpenKey(open ? null : key)}
                        >
                          <span className="cal-event-time">{rowTime(event)}</span>
                          <span className="cal-event-title">
                            {event.status === "tentative" ? "Tentative · " : ""}
                            {event.title}
                          </span>
                          {meta ? (
                            <span className="cal-event-meta">{meta}</span>
                          ) : null}
                        </button>
                        {open ? <EventDetail {...detailProps(event)} /> : null}
                      </div>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
      {editor ? (
        <CalendarEventDialog
          mode={editor.mode}
          event={editor.mode === "edit" ? editor.event : undefined}
          day={editor.mode === "create" ? editor.day : undefined}
          onClose={() => setEditor(null)}
          onSaved={savedEvent}
        />
      ) : null}
    </div>
  );
}
