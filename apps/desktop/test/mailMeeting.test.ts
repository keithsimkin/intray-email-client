import { describe, expect, test } from "bun:test";
import type { Message, ThreadMessage } from "../src/renderer/data/mock";
import { findMailMeeting } from "../src/renderer/mailMeeting";

const now = new Date(2026, 10, 19, 15, 0, 0);

function turn(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id">): ThreadMessage {
  return {
    from: "Ava Martin",
    initials: "AM",
    avatarColor: "#5b8def",
    email: "ava@northwind.io",
    time: "1d",
    ...partial,
  };
}

function message(partial: Partial<Message> = {}): Message {
  return {
    id: "m1",
    accountId: "work",
    from: "Ava Martin",
    initials: "AM",
    avatarColor: "#5b8def",
    email: "ava@northwind.io",
    subject: "The Africa Founder's Brief: November 2026",
    preview: "This month's notes for founders.",
    time: "1d",
    unread: true,
    important: false,
    folder: "inbox",
    thread: [turn({ id: "t1", body: ["Thanks for reading."] })],
    ...partial,
  };
}

describe("findMailMeeting", () => {
  test("ignores a newsletter that is not a meeting", () => {
    const hit = findMailMeeting(
      message({
        preview: "Our community meeting is next month. Plenty of events inside.",
        thread: [
          turn({
            id: "t1",
            bodyText:
              "Join the conversation. This brief covers the founder meeting and upcoming events. https://calendar.google.com https://meet.google.com",
          }),
        ],
      }),
      now,
    );
    expect(hit).toBeNull();
  });

  test("finds a Google Meet link that only exists in the HTML", () => {
    const hit = findMailMeeting(
      message({
        subject: "LvlUp Labs Monthly Live Masterclass",
        thread: [
          turn({
            id: "t1",
            bodyText: "Join with Google Meet",
            bodyHtml:
              '<p>Wednesday Nov 18, 2026 · 8:00pm – 9:00pm</p><a href="https://meet.google.com/abc-defg-hij">Join</a>',
          }),
        ],
      }),
      now,
    );
    expect(hit?.provider).toBe("google-meet");
    expect(hit?.url).toBe("https://meet.google.com/abc-defg-hij");
    expect(hit?.title).toBe("LvlUp Labs Monthly Live Masterclass");
    expect(hit?.start?.getDate()).toBe(18);
    expect(hit?.start?.getHours()).toBe(20);
    expect(hit?.end?.getHours()).toBe(21);
  });

  test("unwraps a Google redirect around a Meet link", () => {
    const hit = findMailMeeting(
      message({
        thread: [
          turn({
            id: "t1",
            bodyText:
              "https://www.google.com/url?q=https%3A%2F%2Fmeet.google.com%2Fxyz-abcd-efg",
          }),
        ],
      }),
      now,
    );
    expect(hit?.url).toBe("https://meet.google.com/xyz-abcd-efg");
  });

  test("reads an invitation subject and a when-line", () => {
    const hit = findMailMeeting(
      message({
        subject:
          "Invitation: LvlUp Labs Monthly Live Masterclass @ Wed Nov 18, 2026 8pm - 9pm (EDT) (keith@gmail.com)",
        thread: [
          turn({
            id: "t1",
            bodyText: "When\nWednesday Nov 18, 2026 ⋅ 8:00pm – 9:00pm (Eastern Time)",
          }),
        ],
      }),
      now,
    );
    expect(hit?.providerLabel).toBe("Calendar invite");
    expect(hit?.title).toBe("LvlUp Labs Monthly Live Masterclass");
    expect(hit?.start?.getHours()).toBe(20);
    expect(hit?.end?.getHours()).toBe(21);
  });

  test("uses the meeting already attached to the message", () => {
    const hit = findMailMeeting(
      message({
        subject: "Q4 roadmap review",
        meeting: {
          title: "Q4 roadmap review",
          when: "Today · 9:00 AM",
          url: "https://meet.google.com/q4-roadmap",
        },
      }),
      now,
    );
    expect(hit?.provider).toBe("google-meet");
    expect(hit?.start?.getDate()).toBe(19);
    expect(hit?.start?.getHours()).toBe(9);
    expect(hit?.end?.getHours()).toBe(10);
  });

  test("finds a Zoom link and a calendar file", () => {
    const zoom = findMailMeeting(
      message({
        thread: [turn({ id: "t1", bodyText: "Join: https://zoom.us/j/1234567890?pwd=abc" })],
      }),
      now,
    );
    expect(zoom?.provider).toBe("zoom");

    const file = findMailMeeting(
      message({
        thread: [
          turn({
            id: "t1",
            attachments: [{ name: "invite.ics", size: "2 KB", contentType: "text/calendar" }],
          }),
        ],
      }),
      now,
    );
    expect(file?.providerLabel).toBe("Calendar file");
  });

  test("does not treat an RSVP notice as a new meeting", () => {
    const hit = findMailMeeting(
      message({
        subject: "Accepted: Debbie's birthday",
        thread: [turn({ id: "t1", bodyText: "You accepted this invitation." })],
      }),
      now,
    );
    expect(hit).toBeNull();
  });
});
