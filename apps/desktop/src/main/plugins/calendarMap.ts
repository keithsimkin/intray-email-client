import type {
  CalendarAttendee,
  CalendarEventDto,
  CalendarPerson,
  CalendarRsvp,
} from "../../shared/plugins";

type GoogleDate = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

type GooglePerson = {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
};

export type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  hangoutLink?: string;
  start?: GoogleDate;
  end?: GoogleDate;
  organizer?: GooglePerson;
  attendees?: GooglePerson[];
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
};

const EVENT_STATUSES = new Set(["confirmed", "tentative", "cancelled"]);
const RESPONSES = new Set(["accepted", "declined", "tentative", "needsAction"]);

export type GoogleEventInput = {
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  allDay?: boolean;
  attendeeEmail?: string;
  withMeet?: boolean;
};

function plainText(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const decoded = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
  const text = decoded.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function httpUrl(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function asPerson(raw?: GooglePerson): CalendarPerson | undefined {
  const email = raw?.email?.trim() || undefined;
  const name = raw?.displayName?.trim() || undefined;
  if (!email && !name) return undefined;
  return {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
  };
}

function meetLink(raw: GoogleCalendarEvent): string | undefined {
  const hangout = httpUrl(raw.hangoutLink);
  if (hangout) return hangout;
  const video = raw.conferenceData?.entryPoints?.find(
    (point) => point.entryPointType === "video",
  );
  return httpUrl(video?.uri);
}

function attendees(raw: GooglePerson[] | undefined): CalendarAttendee[] | undefined {
  if (!raw?.length) return undefined;
  const people: CalendarAttendee[] = [];
  for (const person of raw.slice(0, 40)) {
    const base = asPerson(person);
    if (!base) continue;
    const response =
      person.responseStatus && RESPONSES.has(person.responseStatus)
        ? person.responseStatus
        : undefined;
    people.push({
      ...base,
      ...(response ? { response } : {}),
      ...(person.self ? { self: true } : {}),
    });
  }
  return people.length ? people : undefined;
}

/** Normalize a Google Calendar event into the detail the mail UI renders. */
export function mapGoogleCalendarEvent(
  raw: GoogleCalendarEvent,
): CalendarEventDto | null {
  const startIso = raw.start?.dateTime ?? raw.start?.date;
  if (!startIso) return null;
  const endIso = raw.end?.dateTime ?? raw.end?.date ?? startIso;
  const status =
    raw.status && EVENT_STATUSES.has(raw.status) ? raw.status : undefined;
  const location = plainText(raw.location, 500);
  const description = plainText(raw.description, 4000);
  const link = httpUrl(raw.htmlLink);
  const organizer = asPerson(raw.organizer);
  const people = attendees(raw.attendees);
  const meet = meetLink(raw);
  return {
    id: raw.id ?? `${startIso}-${raw.summary ?? "event"}`,
    title: raw.summary?.trim() || "(No title)",
    startIso,
    endIso,
    allDay: Boolean(raw.start?.date && !raw.start?.dateTime),
    ...(location ? { location } : {}),
    ...(link ? { htmlLink: link } : {}),
    ...(description ? { description } : {}),
    ...(status ? { status } : {}),
    ...(organizer ? { organizer } : {}),
    ...(people ? { attendees: people } : {}),
    ...(meet ? { meetLink: meet } : {}),
  };
}

/**
 * Build the Events.insert body. Keeping this pure makes the exact payload
 * (especially Meet conference creation) testable without touching Google.
 */
export function buildGoogleCalendarEventBody(
  input: GoogleEventInput,
  requestId: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: input.title.trim(),
    start: input.allDay
      ? { date: input.startIso.slice(0, 10) }
      : { dateTime: input.startIso },
    end: input.allDay
      ? { date: input.endIso.slice(0, 10) }
      : { dateTime: input.endIso },
  };
  const description = input.description?.trim();
  if (description) body.description = description.slice(0, 8000);
  const location = input.location?.trim();
  if (location) body.location = location.slice(0, 500);
  if (input.attendeeEmail) {
    body.attendees = [{ email: input.attendeeEmail }];
  }
  if (input.withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

/** Patch body. Empty description and location clear those fields. Attendees are untouched. */
export function buildGoogleCalendarPatchBody(
  input: GoogleEventInput,
  requestId: string,
): Record<string, unknown> {
  const body = buildGoogleCalendarEventBody(
    { ...input, attendeeEmail: undefined },
    requestId,
  );
  body.description = input.description?.trim().slice(0, 8000) ?? "";
  body.location = input.location?.trim().slice(0, 500) ?? "";
  delete body.attendees;
  return body;
}

/**
 * Set the signed-in guest's response and keep everyone else.
 * Returns null when that account is not on the guest list.
 */
export function applyCalendarRsvp(
  attendees: GooglePerson[] | undefined,
  response: CalendarRsvp,
  accountEmail?: string,
): Array<{ email: string; responseStatus: string }> | null {
  if (!attendees?.length) return null;
  const account = accountEmail?.trim().toLowerCase();
  let found = false;
  const next: Array<{ email: string; responseStatus: string }> = [];
  for (const person of attendees) {
    const email = person.email?.trim();
    if (!email) continue;
    const isSelf =
      person.self === true ||
      (account !== undefined && account !== "" && email.toLowerCase() === account);
    if (isSelf) found = true;
    next.push({
      email,
      responseStatus: isSelf ? response : person.responseStatus || "needsAction",
    });
  }
  return found ? next : null;
}
