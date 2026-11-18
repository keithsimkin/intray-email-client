import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadAppIcon } from "./app-icon";
import { listAccountRows } from "./db";
import { triggerSync } from "./mail/service";

let tray: Tray | null = null;

function loadTrayImage() {
  const bases = [
    join(__dirname, "../../resources"),
    join(app.getAppPath(), "resources"),
  ];
  for (const base of bases) {
    const path = join(base, "tray-icon.png");
    if (!existsSync(path)) continue;
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) continue;
    // Template images follow the macOS menu-bar tint (light/dark).
    if (process.platform === "darwin") img.setTemplateImage(true);
    return img;
  }

  // Prefer the branded app icon over any Electron/default placeholder.
  const appIcon = loadAppIcon();
  if (appIcon) {
    const size = process.platform === "darwin" ? 22 : 16;
    const resized = appIcon.resize({ width: size, height: size });
    if (process.platform === "darwin") resized.setTemplateImage(true);
    return resized;
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
  if (!tray) return;
  const n = unreadTotal();
  tray.setToolTip(n > 0 ? `Intray · ${n} unread` : "Intray");
}

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;

  tray = new Tray(loadTrayImage());
  refreshTooltip();

  const show = () => {
    const win = getMainWindow();
    if (!win) return;
    win.show();
    win.focus();
  };

  const rebuild = () => {
    const n = unreadTotal();
    tray?.setContextMenu(
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
    refreshTooltip();
  };

  rebuild();
  setInterval(rebuild, 15_000);

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
