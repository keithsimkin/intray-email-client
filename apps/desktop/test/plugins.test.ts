import { describe, expect, test } from "bun:test";
import {
  eventFallsOnDay,
  weekContaining,
} from "../src/shared/calendarWeek";
import {
  applyCalendarRsvp,
  buildGoogleCalendarEventBody,
  buildGoogleCalendarPatchBody,
  mapGoogleCalendarEvent,
} from "../src/main/plugins/calendarMap";
import {
  buildDatabasePageProperties,
  buildPageParentProperties,
  notionParagraphBlocks,
  notionTargetFromSearchResult,
} from "../src/main/plugins/notionMap";

describe("Google Calendar mapping", () => {
  test("keeps timed events and drops events with no start", () => {
    expect(
      mapGoogleCalendarEvent({
        id: "evt-1",
        summary: "  Standup ",
        start: { dateTime: "2026-11-20T15:00:00Z" },
        end: { dateTime: "2026-11-20T15:30:00Z" },
        location: " Room 4 ",
        htmlLink: "https://calendar.google.com/event?eid=evt-1",
      }),
    ).toEqual({
      id: "evt-1",
      title: "Standup",
      startIso: "2026-11-20T15:00:00Z",
      endIso: "2026-11-20T15:30:00Z",
      allDay: false,
      location: "Room 4",
      htmlLink: "https://calendar.google.com/event?eid=evt-1",
    });
    expect(mapGoogleCalendarEvent({ summary: "No time" })).toBeNull();
  });

  test("keeps people, notes, and a Meet link, and drops unsafe links", () => {
    expect(
      mapGoogleCalendarEvent({
        id: "evt-2",
        summary: "Review",
        start: { dateTime: "2026-11-20T15:00:00Z" },
        end: { dateTime: "2026-11-20T16:00:00Z" },
        description: "<p>Bring the notes<br>please</p>",
        status: "tentative",
        hangoutLink: "javascript:alert(1)",
        htmlLink: "https://calendar.google.com/event?eid=evt-2",
        conferenceData: {
          entryPoints: [
            {
              entryPointType: "video",
              uri: "https://meet.google.com/abc-defg-hij",
            },
          ],
        },
        organizer: { email: "ada@example.com", displayName: "Ada" },
        attendees: [
          {
            email: "ada@example.com",
            displayName: "Ada",
            responseStatus: "accepted",
          },
          { email: "gus@example.com", responseStatus: "nope" },
        ],
      }),
    ).toEqual({
      id: "evt-2",
      title: "Review",
      startIso: "2026-11-20T15:00:00Z",
      endIso: "2026-11-20T16:00:00Z",
      allDay: false,
      htmlLink: "https://calendar.google.com/event?eid=evt-2",
      description: "Bring the notes\nplease",
      status: "tentative",
      organizer: { email: "ada@example.com", name: "Ada" },
      attendees: [
        { email: "ada@example.com", name: "Ada", response: "accepted" },
        { email: "gus@example.com" },
      ],
      meetLink: "https://meet.google.com/abc-defg-hij",
    });
  });

  test("marks all-day events from a date-only start", () => {
    expect(
      mapGoogleCalendarEvent({
        start: { date: "2026-11-21" },
        end: { date: "2026-11-22" },
      })?.allDay,
    ).toBe(true);
  });

  test("adds an attendee and Meet request only when asked", () => {
    const plain = buildGoogleCalendarEventBody(
      {
        title: "Follow up",
        description: "  From the thread  ",
        startIso: "2026-11-20T15:00:00.000Z",
        endIso: "2026-11-20T15:30:00.000Z",
      },
      "req-1",
    );
    expect(plain.attendees).toBeUndefined();
    expect(plain.conferenceData).toBeUndefined();
    expect(plain.description).toBe("From the thread");

    const rich = buildGoogleCalendarEventBody(
      {
        title: "Follow up",
        startIso: "2026-11-20T15:00:00.000Z",
        endIso: "2026-11-20T15:30:00.000Z",
        attendeeEmail: "ada@example.com",
        withMeet: true,
      },
      "req-2",
    );
    expect(rich.attendees).toEqual([{ email: "ada@example.com" }]);
    expect(rich.conferenceData).toEqual({
      createRequest: {
        requestId: "req-2",
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    });
  });

  test("writes an all-day event with a place and no guests", () => {
    const body = buildGoogleCalendarEventBody(
      {
        title: "Offsite",
        location: "  Studio  ",
        startIso: "2026-11-21",
        endIso: "2026-11-23",
        allDay: true,
      },
      "req-day",
    );
    expect(body.start).toEqual({ date: "2026-11-21" });
    expect(body.end).toEqual({ date: "2026-11-23" });
    expect(body.location).toBe("Studio");
    expect(body.attendees).toBeUndefined();
  });

  test("a patch can clear notes and place without replacing guests", () => {
    const body = buildGoogleCalendarPatchBody(
      {
        title: "Offsite",
        startIso: "2026-11-21T15:00:00.000Z",
        endIso: "2026-11-21T16:00:00.000Z",
        attendeeEmail: "ada@example.com",
      },
      "req-patch",
    );
    expect(body.description).toBe("");
    expect(body.location).toBe("");
    expect(body.attendees).toBeUndefined();
    expect(body.conferenceData).toBeUndefined();
  });

  test("a reply changes only the signed-in guest", () => {
    expect(
      applyCalendarRsvp(
        [
          { email: "ada@example.com", responseStatus: "accepted" },
          { email: "you@example.com", self: true, responseStatus: "needsAction" },
        ],
        "declined",
      ),
    ).toEqual([
      { email: "ada@example.com", responseStatus: "accepted" },
      { email: "you@example.com", responseStatus: "declined" },
    ]);
    expect(
      applyCalendarRsvp(
        [{ email: "ada@example.com", responseStatus: "accepted" }],
        "accepted",
        "you@example.com",
      ),
    ).toBeNull();
  });

  test("marks the signed-in guest", () => {
    expect(
      mapGoogleCalendarEvent({
        start: { dateTime: "2026-11-20T15:00:00Z" },
        attendees: [
          { email: "you@example.com", self: true, responseStatus: "accepted" },
        ],
      })?.attendees,
    ).toEqual([{ email: "you@example.com", response: "accepted", self: true }]);
  });
});

describe("calendar week", () => {
  test("a week is seven local days from the chosen start weekday", () => {
    const anchor = new Date(2026, 10, 18, 15, 30);
    const sunday = weekContaining(anchor, 0);
    expect(sunday.days).toHaveLength(7);
    expect(sunday.days[0]?.getDay()).toBe(0);
    expect(sunday.days[6]?.getDay()).toBe(6);
    expect(sunday.end.getTime() - sunday.start.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(sunday.start.getTime()).toBeLessThanOrEqual(
      new Date(2026, 10, 18).getTime(),
    );
    expect(sunday.end.getTime()).toBeGreaterThan(new Date(2026, 10, 18).getTime());

    const monday = weekContaining(anchor, 1);
    expect(monday.days[0]?.getDay()).toBe(1);
    expect(monday.start.getTime()).toBeLessThanOrEqual(anchor.getTime());
    expect(monday.end.getTime()).toBeGreaterThan(anchor.getTime());
  });

  test("all-day events cover each day, and timed events stay on the start day", () => {
    const offsite = {
      id: "offsite",
      title: "Offsite",
      startIso: "2026-11-21",
      endIso: "2026-11-23",
      allDay: true,
    };
    expect(eventFallsOnDay(offsite, new Date(2026, 10, 21))).toBe(true);
    expect(eventFallsOnDay(offsite, new Date(2026, 10, 22))).toBe(true);
    expect(eventFallsOnDay(offsite, new Date(2026, 10, 23))).toBe(false);

    const start = new Date(2026, 10, 21, 23, 30);
    const end = new Date(2026, 10, 22, 0, 30);
    const late = {
      id: "late",
      title: "Late",
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      allDay: false,
    };
    expect(eventFallsOnDay(late, new Date(2026, 10, 21))).toBe(true);
    expect(eventFallsOnDay(late, new Date(2026, 10, 22))).toBe(false);
  });
});

describe("Notion mapping", () => {
  test("turns search hits into destinations and ignores unknown objects", () => {
    expect(
      notionTargetFromSearchResult({
        object: "database",
        id: "db-1",
        url: "https://www.notion.so/db-1",
        title: [{ plain_text: "Inbox" }],
      }),
    ).toEqual({
      id: "db-1",
      type: "database",
      title: "Inbox",
      url: "https://www.notion.so/db-1",
    });
    expect(
      notionTargetFromSearchResult({ object: "block", id: "nope" }),
    ).toBeNull();
  });

  test("fills title plus matching sender, email, and date columns only", () => {
    const properties = buildDatabasePageProperties({
      database: {
        properties: {
          Name: { type: "title" },
          From: { type: "rich_text" },
          Email: { type: "email" },
          Received: { type: "date" },
          Status: { type: "select" },
        },
      },
      title: "Q4 notes",
      from: "Ada Lovelace",
      fromEmail: "ada@example.com",
      receivedAtIso: "2026-11-19T12:00:00.000Z",
    });
    expect(properties.Name).toEqual({
      title: [{ type: "text", text: { content: "Q4 notes" } }],
    });
    expect(properties.Email).toEqual({ email: "ada@example.com" });
    expect(properties.Received).toEqual({
      date: { start: "2026-11-19T12:00:00.000Z" },
    });
    expect(properties.Status).toBeUndefined();
    expect(properties.From).toEqual({
      rich_text: [
        { type: "text", text: { content: "Ada Lovelace <ada@example.com>" } },
      ],
    });
  });

  test("refuses a database with no title column", () => {
    expect(() =>
      buildDatabasePageProperties({
        database: { properties: { Notes: { type: "rich_text" } } },
        title: "Hi",
        from: "",
        fromEmail: "",
        receivedAtIso: "2026-11-19T12:00:00.000Z",
      }),
    ).toThrow(/title column/);
  });

  test("uses a page title property and splits long text into a few blocks", () => {
    expect(buildPageParentProperties("Thread")).toEqual({
      title: {
        title: [{ type: "text", text: { content: "Thread" } }],
      },
    });
    const blocks = notionParagraphBlocks(`${"a".repeat(2000)}\n${"b".repeat(2000)}`);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.length).toBeLessThanOrEqual(4);
    expect(blocks[0]?.type).toBe("paragraph");
    expect(notionParagraphBlocks("   ")).toEqual([]);
  });
});
