import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { join } from "node:path";
import { listAccountRows } from "./db";
import { triggerSync } from "./mail/service";

let tray: Tray | null = null;

function loadTrayImage() {
  const fromResources = nativeImage.createFromPath(
    join(__dirname, "../../resources/tray-icon.png"),
  );
  if (!fromResources.isEmpty()) return fromResources;

  const fromPkg = nativeImage.createFromPath(
    join(app.getAppPath(), "resources/tray-icon.png"),
  );
  if (!fromPkg.isEmpty()) return fromPkg;

  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASElEQVR42mNgGD7g7du3/0GYGDVY1eGVJEIer0uI0ohLA8maSXYyIUNIto0UDDfA9s70/+RgFFdQpJlUQ/CGB0WaRhlCkzwEAIt4EdwjNWN7AAAAAElFRkSuQmCC",
  );
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
