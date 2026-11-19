import type {
  NotionSaveInput,
  NotionTarget,
  PluginId,
  PluginStatus,
} from "../../shared/plugins";
import {
  connectGoogleCalendar,
  createCalendarEvent,
  deleteCalendarEvent,
  disconnectGoogleCalendar,
  googleCalendarStatus,
  listCalendarEvents,
  respondToCalendarEvent,
  updateCalendarEvent,
} from "./calendar";
import {
  connectNotion,
  disconnectNotion,
  listNotionTargets,
  notionStatus,
  saveEmailToNotion,
  setNotionTarget,
} from "./notion";
import { setPluginEnabledFlag } from "./store";

export function listPluginStatuses(): PluginStatus[] {
  return [googleCalendarStatus(), notionStatus()];
}

export async function connectCalendarPlugin(): Promise<PluginStatus[]> {
  await connectGoogleCalendar();
  return listPluginStatuses();
}

export async function connectNotionPlugin(
  token: string,
): Promise<PluginStatus[]> {
  await connectNotion(token);
  return listPluginStatuses();
}

export function disconnectPlugin(id: PluginId): PluginStatus[] {
  if (id === "google-calendar") disconnectGoogleCalendar();
  else if (id === "notion") disconnectNotion();
  else throw new Error("Unknown plugin");
  return listPluginStatuses();
}

/** Flip the on/off switch. Does not touch the saved sign-in. */
export function setPluginEnabled(id: PluginId, enabled: boolean): PluginStatus[] {
  const current =
    id === "google-calendar"
      ? googleCalendarStatus()
      : id === "notion"
        ? notionStatus()
        : null;
  if (!current) throw new Error("Unknown plugin");
  if (!current.connected) {
    throw new Error("Connect this plugin before turning it on.");
  }
  setPluginEnabledFlag(id, enabled);
  return listPluginStatuses();
}

export {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  listNotionTargets,
  respondToCalendarEvent,
  saveEmailToNotion,
  setNotionTarget,
  updateCalendarEvent,
};
export type { NotionSaveInput, NotionTarget, PluginId, PluginStatus };
