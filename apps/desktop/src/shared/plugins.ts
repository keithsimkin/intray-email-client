/** Shared plugin catalog + IPC types (main ↔ renderer). */

export type PluginId = "google-calendar" | "notion";

/** Public, non-secret plugin state shown in the plugin gallery. */
export type PluginStatus = {
  id: PluginId;
  /** The user has connected or configured this plugin at least once. */
  installed: boolean;
  /** Credentials are present for this plugin. */
  connected: boolean;
  /**
   * Switched on for mail. Turning this off keeps the saved sign-in.
   * Always false when the plugin is not connected.
   */
  enabled: boolean;
  config: {
    /** Google account email for Calendar. */
    email?: string;
    /** Notion workspace / bot name. */
    workspace?: string;
    targetId?: string;
    targetTitle?: string;
    targetType?: "database" | "page";
  };
  /** Local setup that is required before the connect flow can work. */
  setup: {
    ready: boolean;
    hint?: string;
  };
};

export type PluginCatalogEntry = {
  id: PluginId;
  name: string;
  tagline: string;
  description: string;
  /** What the plugin can access, in plain language. */
  permissionLabel: string;
  permissionDetail: string;
  features: string[];
};

export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    tagline: "Turn email into time.",
    description:
      "When an email contains a meeting or a Meet link, add that meeting to your calendar. Other mail does not show your events.",
    permissionLabel: "Calendar events",
    permissionDetail:
      "Reads events on your primary calendar and creates only the events you confirm. Intray never stores your calendar on a server.",
    features: [
      "Add a Meet, Zoom, Teams, or calendar invite from the email",
      "Open the calendar from the Apps rail",
      "Create, edit, delete, and reply to events",
      "Add any email from the toolbar",
      "Turn it off without logging out",
    ],
  },
  {
    id: "notion",
    name: "Notion",
    tagline: "Keep the context.",
    description:
      "Save a thread as a page in Notion — subject, sender, date, and the message text included.",
    permissionLabel: "Write pages",
    permissionDetail:
      "Creates a page in the database or page you choose. Intray never reads or stores your Notion workspace on a server.",
    features: [
      "Save a thread as a Notion page",
      "Pick a database or parent page once",
      "Sender, date, and full thread text included",
      "Works with a standard Notion integration token",
    ],
  },
];

export function pluginCatalogEntry(id: PluginId): PluginCatalogEntry {
  return PLUGIN_CATALOG.find((entry) => entry.id === id) ?? PLUGIN_CATALOG[0]!;
}

export type CalendarPerson = {
  email?: string;
  name?: string;
};

export type CalendarAttendee = CalendarPerson & {
  /** accepted, declined, tentative, or needsAction. */
  response?: string;
  /** This attendee is the signed-in Google account. */
  self?: boolean;
};

export type CalendarRsvp = "accepted" | "declined" | "tentative";

/** One primary-calendar event, with the detail an email calendar shows. */
export type CalendarEventDto = {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
  location?: string;
  htmlLink?: string;
  description?: string;
  /** confirmed, tentative, or cancelled. */
  status?: string;
  organizer?: CalendarPerson;
  attendees?: CalendarAttendee[];
  meetLink?: string;
};

/** Inclusive start, exclusive end, both ISO timestamps. Capped at 42 days. */
export type CalendarRange = {
  startIso: string;
  endIso: string;
};

export type CalendarEventInput = {
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  /** Date-only start and exclusive end (`YYYY-MM-DD`) instead of timestamps. */
  allDay?: boolean;
  /** When set, that person is invited and Google sends the invitation. */
  attendeeEmail?: string;
  /** Ask Google to attach a Meet link to the event. */
  withMeet?: boolean;
};

/** Change an event already on the primary calendar. Guests are left as they are. */
export type CalendarEventUpdate = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  allDay?: boolean;
  withMeet?: boolean;
  /** Tell guests about the change. The calendar page sets this when anyone else is invited. */
  notifyGuests?: boolean;
};

export type CalendarEventResult = {
  event: CalendarEventDto;
};

export type NotionTarget = {
  id: string;
  type: "database" | "page";
  title: string;
  url?: string;
};

export type NotionSaveInput = {
  messageId: string;
  /** Fallbacks when the message is demo data or not in the local store. */
  subject: string;
  from: string;
  fromEmail: string;
  snippet?: string;
  receivedAtMs?: number;
  bodyText?: string;
};

export type NotionSaveResult = {
  pageId: string;
  url?: string;
  targetTitle: string;
};

export type PluginConnectResult = {
  statuses: PluginStatus[];
};
