import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Message } from "./data/mock";
import type { PluginStatus } from "../shared/plugins";
import { pluginErrorFrom } from "../shared/pluginError";
import { isSameLocalDay } from "../shared/calendarWeek";
import {
  bridgeCalendarCreate,
  bridgeNotionSave,
} from "./mailApi";
import { GoogleCalendarBrand, pluginBrandIcons, SimpleBrandIcon } from "./BrandIcon";
import { findMailMeeting, type MailMeetingHit } from "./mailMeeting";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `datetime-local` value in the user's timezone. */
function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultEventRange(): { start: string; end: string } {
  const start = new Date();
  start.setSeconds(0, 0);
  const minutes = start.getMinutes();
  start.setMinutes(start.getMinutes() + (minutes === 0 ? 60 : 60 - minutes));
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function threadExcerpt(message: Message): string {
  return message.thread
    .map((part) => part.body?.join("\n\n").trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 3500);
}

function pluginOn(status: PluginStatus | undefined): status is PluginStatus {
  return Boolean(status?.connected && status.enabled);
}

async function saveMessageToNotion(message: Message): Promise<string> {
  const result = await bridgeNotionSave({
    messageId: message.id,
    subject: message.subject,
    from: message.from,
    fromEmail: message.email,
    snippet: message.preview,
    bodyText: threadExcerpt(message),
  });
  return result.targetTitle;
}

function calendarDescription(message: Message, url?: string): string {
  return [
    url ? `Join: ${url}` : "",
    `From: ${message.from}${message.email ? ` <${message.email}>` : ""}`,
    message.preview ? message.preview : "",
    threadExcerpt(message),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

function hitWhen(hit: MailMeetingHit): string {
  if (!hit.start) return hit.when ?? "";
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const day = hit.start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const start = hit.start.toLocaleTimeString(undefined, time);
  if (hit.end && isSameLocalDay(hit.start, hit.end)) {
    return `${day} · ${start} – ${hit.end.toLocaleTimeString(undefined, time)}`;
  }
  return `${day} · ${start}`;
}

function AddToCalendarDialog({
  message,
  hit,
  onClose,
  onToast,
}: {
  message: Message;
  hit: MailMeetingHit | null;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const titleId = useId();
  const timed = hit?.start && hit.end ? { start: hit.start, end: hit.end } : null;
  const defaults = timed
    ? { start: toLocalInput(timed.start), end: toLocalInput(timed.end) }
    : defaultEventRange();
  const canInvite = message.email.includes("@");
  const [title, setTitle] = useState(hit?.title || message.subject || "Email follow-up");
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [invite, setInvite] = useState(false);
  const [withMeet, setWithMeet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHref, setErrorHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, busy]);

  const create = async () => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Pick a start and end time.");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setError("The event must end after it starts.");
      return;
    }
    setBusy(true);
    setError(null);
    setErrorHref(undefined);
    try {
      const event = await bridgeCalendarCreate({
        title: title.trim(),
        description: calendarDescription(message, hit?.url),
        location: hit?.url?.slice(0, 500),
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        attendeeEmail: invite && canInvite ? message.email : undefined,
        withMeet: hit?.provider === "google-meet" ? false : withMeet,
      });
      onToast(
        event.htmlLink
          ? `Added “${event.title}” to Google Calendar`
          : "Added to Google Calendar",
      );
      onClose();
    } catch (cause) {
      const notice = pluginErrorFrom(cause, "Could not add this email to Google Calendar.");
      setError(notice.text);
      setErrorHref(notice.href);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-root" role="presentation" onClick={onClose}>
      <div
        className="modal plugin-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="plugin-event-head">
          <span className="plugin-mark plugin-mark-google-calendar" aria-hidden>
            <GoogleCalendarBrand size={18} />
          </span>
          <div>
            <h2 id={titleId}>Add to Google Calendar</h2>
            <p>
              {hit
                ? "Adds this meeting from the email. Nothing is sent until you confirm."
                : "Creates one event from this email. Nothing is sent until you confirm."}
            </p>
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
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label>
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={500}
              autoFocus
            />
          </label>
          <div className="plugin-event-times">
            <label>
              <span>Starts</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </label>
          </div>
          {canInvite ? (
            <label className="plugin-check">
              <input
                type="checkbox"
                checked={invite}
                onChange={(event) => setInvite(event.target.checked)}
              />
              <span>Invite {message.email}</span>
            </label>
          ) : null}
          {hit?.url ? (
            <p className="plugin-event-link">
              {hit.provider === "google-meet"
                ? "The Google Meet link from this email is saved on the event."
                : `${hit.providerLabel} link from this email`}
            </p>
          ) : null}
          {hit?.provider === "google-meet" ? null : (
            <label className="plugin-check">
              <input
                type="checkbox"
                checked={withMeet}
                onChange={(event) => setWithMeet(event.target.checked)}
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
            <button type="button" className="plugin-secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="plugin-primary-btn" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : null}
              Add event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Toolbar actions for plugins the user has actually connected. */
export function PluginReaderActions({
  message,
  statuses,
  onToast,
  onOpenPlugins,
  onDialogChange,
}: {
  message: Message;
  statuses: PluginStatus[];
  onToast: (text: string) => void;
  onOpenPlugins: () => void;
  onDialogChange?: (open: boolean) => void;
}) {
  const calendar = statuses.find((status) => status.id === "google-calendar");
  const notion = statuses.find((status) => status.id === "notion");
  const calendarOn = pluginOn(calendar);
  const notionOn = pluginOn(notion);
  const hit = useMemo(
    () => (calendarOn ? findMailMeeting(message) : null),
    [calendarOn, message],
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCalendarOpen(false);
  }, [message.id]);

  useEffect(() => {
    onDialogChange?.(calendarOpen);
  }, [calendarOpen, onDialogChange]);

  useEffect(() => {
    return () => onDialogChange?.(false);
  }, [onDialogChange]);

  const saveToNotion = async () => {
    if (!notionOn || !notion) {
      onOpenPlugins();
      return;
    }
    if (!notion.config.targetId) {
      onToast("Choose a Notion database or page in Plugins first.");
      onOpenPlugins();
      return;
    }
    setSaving(true);
    try {
      onToast(`Saved to ${await saveMessageToNotion(message)}`);
    } catch (cause) {
      const text =
        cause instanceof Error
          ? cause.message
          : "Could not save this email to Notion.";
      onToast(text);
      if (/destination|connect notion|turn notion on/i.test(text)) onOpenPlugins();
    } finally {
      setSaving(false);
    }
  };

  if (!calendarOn && !notionOn) return null;

  return (
    <>
      {calendarOn ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Add to Google Calendar"
          title="Add to Google Calendar"
          onClick={() => setCalendarOpen(true)}
        >
          <GoogleCalendarBrand size={15} />
        </button>
      ) : null}
      {notionOn ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Save to Notion"
          title={
            notion?.config.targetTitle
              ? `Save to Notion · ${notion.config.targetTitle}`
              : "Save to Notion"
          }
          disabled={saving}
          onClick={() => void saveToNotion()}
        >
          {saving ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <SimpleBrandIcon
              icon={pluginBrandIcons.notion}
              size={15}
              color="currentColor"
            />
          )}
        </button>
      ) : null}
      {calendarOpen ? (
        <AddToCalendarDialog
          message={message}
          hit={hit}
          onClose={() => setCalendarOpen(false)}
          onToast={onToast}
        />
      ) : null}
    </>
  );
}

/** A meeting from this email, or Notion, pinned with the message. */
export function PluginInfoPin({
  message,
  statuses,
  onToast,
  onOpenPlugins,
  onDialogChange,
}: {
  message: Message;
  statuses: PluginStatus[];
  onToast: (text: string) => void;
  onOpenPlugins: () => void;
  onDialogChange?: (open: boolean) => void;
}) {
  const notion = statuses.find((status) => status.id === "notion");
  const calendar = statuses.find((status) => status.id === "google-calendar");
  const calendarOn = pluginOn(calendar);
  const notionOn = pluginOn(notion);
  const hit = useMemo(
    () => (calendarOn ? findMailMeeting(message) : null),
    [calendarOn, message],
  );
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const when = hit ? hitWhen(hit) : "";

  useEffect(() => {
    setCalendarOpen(false);
  }, [message.id]);

  useEffect(() => {
    if (!calendarOpen) return;
    onDialogChange?.(true);
    return () => onDialogChange?.(false);
  }, [calendarOpen, onDialogChange]);

  if (!hit && !notionOn) return null;

  const save = async () => {
    if (!notion?.config.targetId) {
      onToast("Choose a Notion database or page in Plugins first.");
      onOpenPlugins();
      return;
    }
    setSaving(true);
    try {
      onToast(`Saved to ${await saveMessageToNotion(message)}`);
    } catch (cause) {
      onToast(
        cause instanceof Error
          ? cause.message
          : "Could not save this email to Notion.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="plugin-pin">
      {hit ? (
        <section className="plugin-pin-card plugin-pin-meeting" aria-label="Meeting in this email">
          <GoogleCalendarBrand size={16} />
          <div className="plugin-pin-copy">
            <strong>{hit.title}</strong>
            <span>{[hit.providerLabel, when].filter(Boolean).join(" · ")}</span>
          </div>
          <button
            type="button"
            className="plugin-pin-action"
            onClick={() => setCalendarOpen(true)}
          >
            Add
          </button>
        </section>
      ) : null}
      {calendarOpen && hit ? (
        <AddToCalendarDialog
          message={message}
          hit={hit}
          onClose={() => setCalendarOpen(false)}
          onToast={onToast}
        />
      ) : null}
      {notionOn ? (
        <section className="plugin-pin-card plugin-pin-notion" aria-label="Notion">
          <SimpleBrandIcon
            icon={pluginBrandIcons.notion}
            size={16}
            color="currentColor"
          />
          <div className="plugin-pin-copy">
            <strong>{notion?.config.targetTitle || "Notion"}</strong>
            <span>
              {notion?.config.targetTitle
                ? "Save this email"
                : "Choose a destination"}
            </span>
          </div>
          <button
            type="button"
            className="plugin-pin-action"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : notion?.config.targetId ? "Save" : "Choose"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
