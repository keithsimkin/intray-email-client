import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadAppIcon } from "./app-icon";
import { listAccountRows } from "./db";
import { triggerSync } from "./mail/service";

let tray: Tray | null = null;
/** Count the native menu was last built for; -1 forces the first build. */
let menuUnread = -1;
let applyUnread: ((n: number) => void) | null = null;

function loadTrayImage() {
  const bases = [
    join(__dirname, "../../resources"),
    join(app.getAppPath(), "resources"),
  ];
  for (const base of bases) {
    const path = join(base, "tray-icon.png");
    if (!existsSync(path)) continue;
    const img = nativeImage.createFromPath(path);
    if (!img.isEmpty()) return img;
  }

  // Prefer the branded app icon over any Electron/default placeholder.
  const appIcon = loadAppIcon();
  if (appIcon) {
    return appIcon.resize({ width: 16, height: 16 });
  }

  return nativeImage.createEmpty();
}

function unreadTotal(): number {
  try {
    return listAccountRows().reduce((n, a) => n + (a.unread ?? 0), 0);
  } catch {
    return 0;
  }
}

function refreshTooltip(): void {
  if (!applyUnread) return;
  applyUnread(unreadTotal());
}

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;

  tray = new Tray(loadTrayImage());

  const show = () => {
    const win = getMainWindow();
    if (!win) return;
    win.show();
    win.focus();
  };

  applyUnread = (n: number) => {
    if (!tray) return;
    tray.setToolTip(n > 0 ? `Intray · ${n} unread` : "Intray");
    // Rebuilding a native menu allocates a fresh Menu + items; the item labels
    // only change with the unread count, so skip the churn when it is the same.
    if (n === menuUnread) return;
    menuUnread = n;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Intray", click: show },
        {
          label: n > 0 ? `Unread · ${n}` : "Inbox zero",
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Sync all accounts",
          click: () => {
            void triggerSync().catch(() => undefined);
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          click: () => {
            app.quit();
          },
        },
      ]),
    );
  };

  applyUnread(unreadTotal());
  setInterval(() => applyUnread?.(unreadTotal()), 15_000);

  tray.on("click", show);
  return tray;
}

export function refreshTray(): void {
  refreshTooltip();
}

export function setTrayBadgeCount(count: number): void {
  if (!tray) return;
  const n = Math.max(0, Math.floor(count));
  tray.setToolTip(n > 0 ? `Intray · ${n} unread` : "Intray");
}
