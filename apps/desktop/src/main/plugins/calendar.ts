import { randomUUID } from "node:crypto";
import {
  listenForOAuthRedirect,
  randomUrlSafe,
  sha256Base64Url,
} from "../auth/oauth-loopback";
import {
  getGmailClientConfig,
  refreshGmailTokens,
} from "../providers/gmail/oauth";
import {
  applyCalendarRsvp,
  buildGoogleCalendarEventBody,
  buildGoogleCalendarPatchBody,
  mapGoogleCalendarEvent,
  type GoogleCalendarEvent,
  type GoogleEventInput,
} from "./calendarMap";
import {
  loadPluginSecret,
  removePluginSecret,
  savePluginSecret,
} from "./secrets";
import {
  clearPluginAccount,
  pluginSwitchOn,
  readPluginConfig,
  savePluginConfig,
} from "./store";
import type {
  CalendarEventDto,
  CalendarEventInput,
  CalendarEventUpdate,
  CalendarRange,
  CalendarRsvp,
  PluginStatus,
} from "../../shared/plugins";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

type CalendarTokens = {
  accessToken: string;
  refreshToken?: string;
  expiryMs: number;
  scope?: string;
};

function readTokens(): CalendarTokens | null {
  const raw = loadPluginSecret("google-calendar.tokens");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalendarTokens;
    if (!parsed?.accessToken || typeof parsed.accessToken !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeTokens(tokens: CalendarTokens): void {
  savePluginSecret("google-calendar.tokens", JSON.stringify(tokens));
}

export function googleCalendarConfigured(): boolean {
  return Boolean(getGmailClientConfig().clientId);
}

export function googleCalendarStatus(): PluginStatus {
  const tokens = readTokens();
  const config = readPluginConfig("google-calendar");
  const configured = googleCalendarConfigured();
  const connected = Boolean(tokens);
  return {
    id: "google-calendar",
    installed: connected,
    connected,
    enabled: pluginSwitchOn("google-calendar", connected),
    config: { email: config.email },
    setup: {
      ready: configured,
      hint: configured
        ? undefined
        : "Set GMAIL_CLIENT_ID (or GOOGLE_CLIENT_ID) in the environment, then enable the Google Calendar API for that OAuth client.",
    },
  };
}

async function googleError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
    };
    const message =
      typeof json.error === "string" ? json.error : json.error?.message;
    if (message) return message;
  } catch {
    /* plain text error */
  }
  return `Google Calendar request failed (${res.status}).`;
}

/** Connect with the same Google OAuth desktop client used for Gmail. */
export async function connectGoogleCalendar(): Promise<void> {
  const { clientId, clientSecret } = getGmailClientConfig();
  if (!clientId) {
    throw new Error(
      "Set GMAIL_CLIENT_ID (or GOOGLE_CLIENT_ID) before connecting Google Calendar.",
    );
  }

  const verifier = randomUrlSafe(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomUrlSafe(16);

  const { code, redirectUri } = await listenForOAuthRedirect(
    (redirect) => {
      const url = new URL(AUTH);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirect);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SCOPES);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      return url.toString();
    },
    { expectedState: state },
  );

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const tokenRes = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google sign-in failed: ${await googleError(tokenRes)}`);
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  const previous = readTokens();
  const refreshToken = tokenJson.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Remove Intray from your Google Account permissions and try again.",
    );
  }

  writeTokens({
    accessToken: tokenJson.access_token,
    refreshToken,
    expiryMs: Date.now() + tokenJson.expires_in * 1000 - 60_000,
    scope: tokenJson.scope,
  });

  let email: string | undefined;
  try {
    const profile = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (profile.ok) {
      const json = (await profile.json()) as { email?: string };
      if (json.email) email = json.email;
    }
  } catch {
    /* the connection still works without the display email */
  }
  savePluginConfig(
    "google-calendar",
    { email: email ?? readPluginConfig("google-calendar").email },
    { enable: true },
  );
}

function requireCalendarConnected(): void {
  if (!googleCalendarStatus().connected) {
    throw new Error("Connect Google Calendar in Plugins first.");
  }
}

async function accessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) {
    throw new Error("Connect Google Calendar in Plugins first.");
  }
  if (tokens.expiryMs > Date.now() + 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    throw new Error(
      "Google Calendar sign-in expired. Reconnect it from Plugins.",
    );
  }
  const refreshed = await refreshGmailTokens(tokens.refreshToken);
  writeTokens({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiryMs: refreshed.expiryMs,
    scope: refreshed.scope ?? tokens.scope,
  });
  return refreshed.accessToken;
}

const MAX_RANGE_MS = 42 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;

/** Every primary-calendar event that overlaps the range, following nextPageToken. */
export async function listCalendarEvents(
  range: CalendarRange,
): Promise<CalendarEventDto[]> {
  requireCalendarConnected();
  const start = Date.parse(range.startIso);
  const end = Date.parse(range.endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Pick a valid calendar range.");
  }
  if (end - start > MAX_RANGE_MS) {
    throw new Error("That calendar range is too long.");
  }

  const token = await accessToken();
  const events: CalendarEventDto[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
    url.searchParams.set("timeMin", new Date(start).toISOString());
    url.searchParams.set("timeMax", new Date(end).toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(await googleError(res));
    const json = (await res.json()) as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
    };
    for (const item of json.items ?? []) {
      const event = mapGoogleCalendarEvent(item);
      if (event) events.push(event);
    }
    if (!json.nextPageToken) return events;
    pageToken = json.nextPageToken;
  }
  return events;
}

function preparedEvent(input: {
  title?: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  allDay?: boolean;
  attendeeEmail?: string;
  withMeet?: boolean;
}): GoogleEventInput {
  const title = input.title?.trim() ?? "";
  if (!title) throw new Error("Give the event a title.");
  if (title.length > 500) throw new Error("Event title is too long.");
  const shared = {
    title,
    description: input.description,
    location: input.location,
    attendeeEmail: input.attendeeEmail?.trim() || undefined,
    withMeet: Boolean(input.withMeet),
  };
  if (input.allDay) {
    const start = input.startIso.trim().slice(0, 10);
    const end = input.endIso.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new Error("Pick a valid event date.");
    }
    if (end <= start) throw new Error("The event must end after it starts.");
    return { ...shared, startIso: start, endIso: end, allDay: true };
  }
  const startMs = Date.parse(input.startIso);
  const endMs = Date.parse(input.endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("Pick a valid event time.");
  }
  if (endMs <= startMs) throw new Error("The event must end after it starts.");
  return {
    ...shared,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function eventUrl(id: string): URL {
  const clean = id.trim();
  if (!clean || clean.length > 512) throw new Error("That event could not be found.");
  return new URL(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(clean)}`,
  );
}

async function readMappedEvent(res: Response, failure: string): Promise<CalendarEventDto> {
  if (!res.ok) throw new Error(await googleError(res));
  const json = (await res.json()) as GoogleCalendarEvent;
  const event = mapGoogleCalendarEvent(json);
  if (!event) throw new Error(failure);
  return event;
}

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarEventDto> {
  requireCalendarConnected();
  const prepared = preparedEvent(input);
  const token = await accessToken();
  const requestId = randomUUID();
  const body = buildGoogleCalendarEventBody(prepared, requestId);

  const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
  if (prepared.withMeet) url.searchParams.set("conferenceDataVersion", "1");
  // Only email guests when the user explicitly asked to invite someone.
  if (prepared.attendeeEmail) url.searchParams.set("sendUpdates", "all");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return readMappedEvent(res, "Google created the event but returned no time.");
}

export async function updateCalendarEvent(
  input: CalendarEventUpdate,
): Promise<CalendarEventDto> {
  requireCalendarConnected();
  const prepared = preparedEvent(input);
  const token = await accessToken();
  const requestId = randomUUID();
  const body = buildGoogleCalendarPatchBody(prepared, requestId);
  const url = eventUrl(input.id);
  if (prepared.withMeet) url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("sendUpdates", input.notifyGuests ? "all" : "none");

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return readMappedEvent(res, "Google saved the event but returned no time.");
}

export async function deleteCalendarEvent(
  id: string,
  notifyGuests: boolean,
): Promise<void> {
  requireCalendarConnected();
  const token = await accessToken();
  const url = eventUrl(id);
  url.searchParams.set("sendUpdates", notifyGuests ? "all" : "none");
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 204 || res.status === 200) return;
  if (!res.ok) throw new Error(await googleError(res));
}

const RSVP: ReadonlySet<string> = new Set(["accepted", "declined", "tentative"]);

export async function respondToCalendarEvent(
  id: string,
  response: CalendarRsvp,
): Promise<CalendarEventDto> {
  requireCalendarConnected();
  if (!RSVP.has(response)) throw new Error("Pick a response.");
  const token = await accessToken();
  const url = eventUrl(id);
  const current = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!current.ok) throw new Error(await googleError(current));
  const raw = (await current.json()) as GoogleCalendarEvent;
  const email = readPluginConfig("google-calendar").email;
  const attendees = applyCalendarRsvp(raw.attendees, response, email);
  if (!attendees) throw new Error("You are not on the guest list for this event.");
  const account = email?.trim().toLowerCase();
  const notify = (raw.attendees ?? []).some((person) => {
    const personEmail = person.email?.trim().toLowerCase();
    if (!personEmail) return false;
    const isSelf =
      person.self === true || (account !== undefined && personEmail === account);
    return !isSelf;
  });
  url.searchParams.set("sendUpdates", notify ? "all" : "none");
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ attendees }),
    signal: AbortSignal.timeout(30_000),
  });
  return readMappedEvent(res, "Google saved your reply but returned no event.");
}

export function disconnectGoogleCalendar(): void {
  removePluginSecret("google-calendar.tokens");
  clearPluginAccount("google-calendar");
}
