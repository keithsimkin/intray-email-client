import type { Message } from "./data/mock";
import { bridgeNotifyShow, bridgeSetBadge } from "./mailApi";
import type { BadgeMode, Preferences } from "./preferences";

function parseHm(value: string): number {
  const [h, m] = value.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** True when quiet hours are enabled and the current local time is inside the window. */
export function inQuietHours(prefs: Preferences, now = new Date()): boolean {
  if (!prefs.quietHours) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = parseHm(prefs.quietStart);
  const end = parseHm(prefs.quietEnd);
  if (start === end) return true;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

export function badgeCountForMode(
  mode: BadgeMode,
  mail: Message[],
): number {
  if (mode === "off") return 0;
  const inbox = mail.filter((m) => m.folder === "inbox" && m.unread);
  if (mode === "important") {
    return inbox.filter((m) => m.important).length;
  }
  // count + dot both use the unread total; overlay rendering differs in main
  return inbox.length;
}

export async function syncTaskbarBadge(
  prefs: Preferences,
  mail: Message[],
): Promise<void> {
  const count = badgeCountForMode(prefs.taskbarBadge, mail);
  await bridgeSetBadge({ count, mode: prefs.taskbarBadge });
}

export type NotifyKind = "mail" | "meeting" | "error" | "snooze" | "opened";

export function shouldDesktopNotify(
  prefs: Preferences,
  kind: NotifyKind,
  important = false,
): boolean {
  if (!prefs.notifyDesktop) return false;
  if (inQuietHours(prefs)) return false;
  if (kind === "mail") {
    if (!prefs.notifyNewMail) return false;
    if (prefs.notifyMode === "off") return false;
    if (prefs.notifyMode === "important" && !important) return false;
  }
  if (kind === "meeting" && !prefs.notifyMeetings) return false;
  if (kind === "error" && !prefs.notifyErrors) return false;
  if (kind === "snooze" && !prefs.notifySnooze) return false;
  if (kind === "opened" && !prefs.notifyOpens) return false;
  return true;
}

export async function notifyNewMail(
  prefs: Preferences,
  message: Pick<Message, "id" | "from" | "subject" | "preview" | "important">,
): Promise<void> {
  if (!shouldDesktopNotify(prefs, "mail", message.important)) return;

  const title = prefs.notifyShowSender ? message.from : "New mail";
  const body = prefs.notifyShowPreview
    ? message.subject || message.preview || "Open Intray to read"
    : "You have new mail";

  await bridgeNotifyShow({
    title,
    body,
    silent: !prefs.notifySound,
    messageId: message.id,
    folderId: "inbox",
  });
}

export async function notifySnoozeReturn(
  prefs: Preferences,
  message: Pick<Message, "id" | "from" | "subject">,
): Promise<void> {
  if (!shouldDesktopNotify(prefs, "snooze")) return;

  const title = "Follow up";
  const body = prefs.notifyShowPreview
    ? message.subject || "A snoozed message is back in your inbox"
    : prefs.notifyShowSender
      ? `${message.from} — back in inbox`
      : "A snoozed message is back in your inbox";

  await bridgeNotifyShow({
    title,
    body,
    silent: !prefs.notifySound,
    messageId: message.id,
    folderId: "inbox",
  });
}

export async function notifyMailOpened(
  prefs: Preferences,
  message: Pick<Message, "id" | "subject"> & { recipient?: string },
): Promise<void> {
  if (!shouldDesktopNotify(prefs, "opened")) return;

  const who = message.recipient?.trim();
  const title = who ? `${who} opened your email` : "Your email was opened";
  const body = prefs.notifyShowPreview
    ? message.subject || "Open Sent to see delivery ticks"
    : "Open tracking recorded a read";

  await bridgeNotifyShow({
    title,
    body,
    silent: !prefs.notifySound,
    messageId: message.id,
    folderId: "sent",
  });
}

export async function notifyMeeting(
  prefs: Preferences,
  title: string,
  body: string,
): Promise<void> {
  if (!shouldDesktopNotify(prefs, "meeting")) return;
  await bridgeNotifyShow({
    title,
    body,
    silent: !prefs.notifySound,
  });
}

export async function notifyError(
  prefs: Preferences,
  title: string,
  body: string,
): Promise<void> {
  if (!shouldDesktopNotify(prefs, "error")) return;
  await bridgeNotifyShow({
    title,
    body,
    silent: true,
  });
}
