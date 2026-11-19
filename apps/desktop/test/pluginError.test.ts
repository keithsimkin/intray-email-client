import { describe, expect, test } from "bun:test";
import { pluginErrorFrom, pluginErrorNotice } from "../src/shared/pluginError";

const CALENDAR_IPC =
  "Error invoking remote method 'plugins:calendarAgenda': Error: Google Calendar API has not been used in project 533451691202 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=533451691202 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.";

describe("pluginErrorNotice", () => {
  test("replaces the Calendar API dump and keeps the console link", () => {
    expect(pluginErrorNotice(CALENDAR_IPC)).toEqual({
      text: "Google Calendar API is not enabled for this Google Cloud project. Turn it on, wait a minute, then try again.",
      href: "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=533451691202",
    });
  });

  test("strips an Electron IPC prefix from other plugin failures", () => {
    expect(
      pluginErrorNotice(
        "Error invoking remote method 'plugins:notionSave': Error: Connect Notion in Plugins first.",
      ),
    ).toEqual({ text: "Connect Notion in Plugins first." });
  });

  test("leaves a short message unchanged", () => {
    const text =
      "Google Calendar API is not enabled for this Google Cloud project. Turn it on, wait a minute, then try again.";
    expect(pluginErrorNotice(text).text).toBe(text);
  });
});

describe("pluginErrorFrom", () => {
  test("keeps a link attached after the message was already shortened", () => {
    const error = new Error(
      "Google Calendar API is not enabled for this Google Cloud project. Turn it on, wait a minute, then try again.",
    ) as Error & { href?: string };
    error.href =
      "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=1";
    expect(pluginErrorFrom(error, "Could not load your calendar agenda.")).toEqual({
      text: error.message,
      href: error.href,
    });
  });

  test("uses the fallback when the failure is not an Error", () => {
    expect(pluginErrorFrom("nope", "Could not load your calendar agenda.")).toEqual({
      text: "Could not load your calendar agenda.",
    });
  });
});
