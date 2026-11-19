import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { CalendarEventDto } from "../shared/plugins";
import { parseAllDay } from "../shared/calendarWeek";
import { pluginErrorFrom } from "../shared/pluginError";
import { bridgeCalendarCreate, bridgeCalendarUpdate } from "./mailApi";
import { GoogleCalendarBrand } from "./BrandIcon";
import { useCreatorBlur } from "./creatorBlur";
import { eventMailKind, textHidesAddress } from "./calendarMask";
import { looksLikeEmail } from "./creatorMode";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalInput(date: Date): string {
  return `${formatYmd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function exclusiveAllDay(ymd: string): string {
  const date = parseAllDay(ymd);
  date.setDate(date.getDate() + 1);
  return formatYmd(date);
}

function inclusiveAllDay(exclusiveIso: string): string {
  const date = parseAllDay(exclusiveIso);
  date.setDate(date.getDate() - 1);
  return formatYmd(date);
}

function defaultTimedRange(day?: Date, at?: Date): { start: string; end: string } {
  if (at && !Number.isNaN(at.getTime())) {
    const start = new Date(at);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { start: toLocalInput(start), end: toLocalInput(end) };
  }
  const start = day ? new Date(day) : new Date();
  start.setSeconds(0, 0);
  if (day) {
    start.setHours(9, 0, 0, 0);
  } else {
    const minutes = start.getMinutes();
    start.setMinutes(minutes === 0 ? 60 : minutes + (60 - minutes));
  }
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function isOccurrence(id: string): boolean {
  return /_\d{8}T\d{6}Z$/.test(id);
}

export function CalendarEventDialog({
  mode,
  event,
  day,
  at,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  event?: CalendarEventDto;
  day?: Date;
  /** Exact start for a new event, such as a click on the calendar grid. */
  at?: Date;
  onClose: () => void;
  onSaved: (event: CalendarEventDto) => void;
}) {
  const titleId = useId();
  const editing = mode === "edit" && event;
  const timedDefault = defaultTimedRange(day, at);
  const [title, setTitle] = useState(editing ? event.title : "");
  const [allDay, setAllDay] = useState(Boolean(editing && event.allDay));
  const [start, setStart] = useState(() => {
    if (!editing) return timedDefault.start;
    if (event.allDay) return formatYmd(parseAllDay(event.startIso));
    return toLocalInput(new Date(event.startIso));
  });
  const [end, setEnd] = useState(() => {
    if (!editing) return timedDefault.end;
    if (event.allDay) return inclusiveAllDay(event.endIso);
    return toLocalInput(new Date(event.endIso));
  });
  const [location, setLocation] = useState(editing ? event.location ?? "" : "");
  const [description, setDescription] = useState(
    editing ? event.description ?? "" : "",
  );
  const [guest, setGuest] = useState("");
  const [withMeet, setWithMeet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHref, setErrorHref] = useState<string | null>(null);
  const blur = useCreatorBlur();
  const kind = editing
    ? eventMailKind(blur, editing)
    : blur.kindForMessage({
        email: guest,
        subject: title,
        preview: description,
      });
  const titleBlur = blur.blurSubject(kind) || textHidesAddress(blur, title);
  const notesBlur =
    blur.blurPreview(kind) || textHidesAddress(blur, description);
  const placeBlur = textHidesAddress(blur, location);
  const guestBlur =
    looksLikeEmail(guest) && blur.blurAddress(blur.kindForEmail(guest));

  useEffect(() => {
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const switchAllDay = (next: boolean) => {
    setAllDay(next);
    if (next) {
      setStart((value) => value.slice(0, 10));
      setEnd((value) => value.slice(0, 10));
      return;
    }
    setStart((value) => (value.includes("T") ? value : `${value}T09:00`));
    setEnd((value) => (value.includes("T") ? value : `${value}T09:30`));
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Give the event a title.");
      setErrorHref(null);
      return;
    }
    const guestEmail = guest.trim();
    if (!editing && guestEmail && !guestEmail.includes("@")) {
      setError("Enter a guest email, or leave it blank.");
      setErrorHref(null);
      return;
    }
    let startIso = start;
    let endIso = end;
    if (allDay) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        setError("Pick a start and end date.");
        setErrorHref(null);
        return;
      }
      if (end < start) {
        setError("The event must end on the start date or later.");
        setErrorHref(null);
        return;
      }
      startIso = start;
      endIso = exclusiveAllDay(end);
    } else {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        setError("Pick a start and end time.");
        setErrorHref(null);
        return;
      }
      if (endDate.getTime() <= startDate.getTime()) {
        setError("The event must end after it starts.");
        setErrorHref(null);
        return;
      }
      startIso = startDate.toISOString();
      endIso = endDate.toISOString();
    }

    setBusy(true);
    setError(null);
    setErrorHref(null);
    try {
      const saved = editing
        ? await bridgeCalendarUpdate({
            id: event.id,
            title: title.trim(),
            description,
            location,
            startIso,
            endIso,
            allDay,
            withMeet: withMeet && !event.meetLink,
            notifyGuests: (event.attendees ?? []).some((person) => person.email),
          })
        : await bridgeCalendarCreate({
            title: title.trim(),
            description,
            location,
            startIso,
            endIso,
            allDay,
            attendeeEmail: guestEmail || undefined,
            withMeet,
          });
      onSaved(saved);
    } catch (cause) {
      const notice = pluginErrorFrom(
        cause,
        editing ? "Could not save this event." : "Could not create this event.",
      );
      setError(notice.text);
      setErrorHref(notice.href ?? null);
    } finally {
      setBusy(false);
    }
  };

  const guests =
    editing && (event.attendees ?? []).some((person) => person.email);
  const heading = editing ? "Edit event" : "New event";
  const detail = editing
    ? isOccurrence(event.id)
      ? "Saves this occurrence. People on the event are notified."
      : guests
        ? "Saves this event. People on it are notified."
        : "Saves this event on your primary calendar."
    : "Adds an event on your primary calendar. A guest is invited only if you enter an email.";

  return createPortal(
    <div
      className="modal-root calendar-dialog-root"
      data-calendar-dialog=""
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal plugin-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(click) => click.stopPropagation()}
      >
        <div className="plugin-event-head">
          <span className="plugin-mark plugin-mark-google-calendar" aria-hidden>
            <GoogleCalendarBrand size={18} />
          </span>
          <div>
            <h2 id={titleId}>{heading}</h2>
            <p>{detail}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <form
          className="plugin-event-body"
          onSubmit={(submit) => {
            submit.preventDefault();
            void save();
          }}
        >
          <label>
            <span>Title</span>
            <input
              className={titleBlur ? "creator-blur" : undefined}
              value={title}
              onChange={(input) => setTitle(input.target.value)}
              maxLength={500}
              autoFocus
              required
            />
          </label>
          <label className="plugin-check">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(input) => switchAllDay(input.target.checked)}
            />
            <span>All day</span>
          </label>
          <div className="plugin-event-times">
            <label>
              <span>Starts</span>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={start}
                onChange={(input) => setStart(input.target.value)}
                required
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={end}
                onChange={(input) => setEnd(input.target.value)}
                required
              />
            </label>
          </div>
          <label>
            <span>Place</span>
            <input
              className={placeBlur ? "creator-blur" : undefined}
              value={location}
              onChange={(input) => setLocation(input.target.value)}
              maxLength={500}
              placeholder="Room, address, or link"
            />
          </label>
          <label>
            <span>Notes</span>
            <textarea
              className={notesBlur ? "creator-blur" : undefined}
              value={description}
              onChange={(input) => setDescription(input.target.value)}
              maxLength={4000}
              rows={4}
            />
          </label>
          {editing ? null : (
            <label>
              <span>Guest email</span>
              <input
                className={guestBlur ? "creator-blur" : undefined}
                type="email"
                value={guest}
                onChange={(input) => setGuest(input.target.value)}
                maxLength={320}
                placeholder="Optional"
              />
            </label>
          )}
          {editing && event.meetLink ? null : (
            <label className="plugin-check">
              <input
                type="checkbox"
                checked={withMeet}
                onChange={(input) => setWithMeet(input.target.checked)}
              />
              <span>Add a Google Meet link</span>
            </label>
          )}
          {error ? (
            <p className="plugin-event-error" role="alert">
              {error}
              {errorHref ? (
                <>
                  {" "}
                  <a href={errorHref} target="_blank" rel="noreferrer">
                    Enable Calendar API
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="plugin-event-actions">
            <button
              type="button"
              className="plugin-secondary-btn"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="plugin-primary-btn" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : null}
              {editing ? "Save" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
