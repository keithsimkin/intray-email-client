import {
  BrowserWindow,
  Notification,
  app,
  nativeImage,
  type NativeImage,
} from "electron";
import { loadAppIcon } from "./app-icon";

export type DesktopNotifyPayload = {
  title: string;
  body: string;
  silent?: boolean;
  /** Open this message when the toast is clicked */
  messageId?: string;
  /** Folder to select when the toast is clicked */
  folderId?: string;
};

export type BadgePayload = {
  count: number;
  mode: "count" | "dot" | "important" | "off";
};

let lastBadge = 0;
let appliedBadgeKey = "";
const overlayCache = new Map<string, NativeImage | null>();

function overlayForCount(count: number, mode: BadgePayload["mode"]): NativeImage | null {
  if (mode === "off" || count <= 0) return null;

  const size = 16;
  // Tiny PNG badge drawn via data URL — Electron paints this on the taskbar icon.
  const label =
    mode === "dot" ? "" : count > 99 ? "99+" : String(count);
  const cacheKey = `${mode}:${label}`;
  if (overlayCache.has(cacheKey)) return overlayCache.get(cacheKey) ?? null;
  const fontSize = label.length > 2 ? 8 : label.length > 1 ? 9 : 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <circle cx="8" cy="8" r="8" fill="#C4453D"/>
  ${
    label
      ? `<text x="8" y="11.5" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${label}</text>`
      : ""
  }
</svg>`;
  const img = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  const overlay = img.isEmpty() ? null : img;
  overlayCache.set(cacheKey, overlay);
  return overlay;
}

export function setAppBadge(
  getMainWindow: () => BrowserWindow | null,
  payload: BadgePayload,
): void {
  const count = Math.max(0, Math.floor(payload.count));
  const key = `${payload.mode}:${count}`;
  if (key === appliedBadgeKey) {
    lastBadge = count;
    return;
  }
  lastBadge = count;

  if (process.platform === "win32") {
    const win = getMainWindow();
    if (!win) return;
    appliedBadgeKey = key;
    const overlay = overlayForCount(count, payload.mode);
    win.setOverlayIcon(
      overlay,
      count > 0 ? `${count} unread` : "",
    );
    return;
  }

  if (typeof app.setBadgeCount === "function") {
    appliedBadgeKey = key;
    app.setBadgeCount(payload.mode === "off" ? 0 : count);
  }
}

export function showDesktopNotification(
  getMainWindow: () => BrowserWindow | null,
  payload: DesktopNotifyPayload,
): boolean {
  if (!Notification.isSupported()) return false;

  const icon = loadAppIcon();
  const toast = new Notification({
    title: payload.title,
    body: payload.body,
    silent: payload.silent ?? false,
    ...(icon ? { icon } : {}),
  });

  toast.on("click", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      if (payload.messageId) {
        win.webContents.send("notify:open", {
          messageId: payload.messageId,
          folderId: payload.folderId,
        });
      }
    }
  });

  toast.show();
  return true;
}

export function currentBadgeCount(): number {
  return lastBadge;
}
