import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { loadAppIcon, resolveAppIconPath } from "./app-icon";
import { chromeThemeOptions } from "./chrome-theme";
import {
  backfillLinkCounts,
  closeDb,
  initDb,
  listAccountRows,
  runDbMaintenance,
} from "./db";
import { loadDesktopEnv } from "./env";
import { registerIpc } from "./ipc/register";
import { openExternalSafely } from "./security";
import {
  ensureDefaultLaunchAtLogin,
  launchedHidden,
} from "./startup";
import { ensureQueueLoop, stopQueueLoop } from "./mail/queue";
import { startMcpServer, stopMcpServer } from "./mcp/server";
import { startPollingAll, stopAllPolling } from "./sync/engine";
import { startMailWatch, stopAllWatches } from "./sync/watch";
import { createTray } from "./tray";
import { refreshMissingAvatars } from "./avatars";
import { startAppUpdater } from "./updater";

loadDesktopEnv();

// Windows taskbar / jump-list identity — must match electron-builder appId.
if (process.platform === "win32") {
  app.setAppUserModelId("app.intray.desktop");
}
app.setName("Intray");

/**
 * One instance per user session. Two copies would poll the same accounts twice
 * and could dispatch the same outbox row twice (a duplicate email).
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let linkBackfillTimer: NodeJS.Timeout | null = null;
let maintenanceTimer: NodeJS.Timeout | null = null;

/** IDLE watchers make the 30s poll a safety net; see sync/watch.ts. */
function startWatches(accountIds: string[]): void {
  for (const accountId of accountIds) startMailWatch(accountId);
}

function createWindow(opts?: { show?: boolean }): BrowserWindow {
  // Default dark; renderer syncs via app:setChromeTheme once prefs resolve.
  const chrome = chromeThemeOptions("dark");
  const iconPath = resolveAppIconPath();
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: "Intray",
    backgroundColor: chrome.backgroundColor,
    show: false,
    frame: false,
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 14 },
        }
      : {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: chrome.titleBarOverlay,
        }),
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Belt-and-suspenders for Windows taskbar during electron-vite dev
  // (process is still electron.exe; window icon must be set explicitly).
  if (process.platform === "win32") {
    const icon = loadAppIcon();
    if (icon) win.setIcon(icon);
  }

  win.on("ready-to-show", () => {
    if (opts?.show === false) return;
    win.show();
  });
  win.on("closed", () => {
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });

  // The mail window should never navigate away from the bundled app.
  win.webContents.on("will-navigate", (event, url) => {
    const current = win.webContents.getURL();
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) {
      try {
        if (new URL(url).origin === new URL(devUrl).origin) return;
      } catch {
        /* fall through to the block below */
      }
    }
    if (url === current) return;
    event.preventDefault();
    openExternalSafely(url);
  });

  // No feature in Intray needs camera/mic/geolocation/clipboard reads.
  win.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  await initDb();
  registerIpc();
  // Wire updater before the window can invoke check-for-updates IPC.
  startAppUpdater();
  // Resolve Gravatar / Google photos for linked accounts + frequent senders.
  refreshMissingAvatars();
  ensureDefaultLaunchAtLogin();
  ensureQueueLoop();

  const hide = launchedHidden();
  mainWindow = createWindow({ show: !hide });
  createTray(() => mainWindow);

  const accountIds = listAccountRows().map((a) => a.id);
  startPollingAll(accountIds);
  startWatches(accountIds);

  // Off the first paint. Link counts are a one-time HTML scan; vacuum waits
  // longer because it rewrites the file and takes the database lock.
  linkBackfillTimer = setTimeout(() => {
    linkBackfillTimer = null;
    try {
      backfillLinkCounts();
    } catch (error) {
      console.warn("link backfill skipped", error);
    }
  }, 3_000);
  linkBackfillTimer.unref?.();
  maintenanceTimer = setTimeout(() => {
    maintenanceTimer = null;
    try {
      runDbMaintenance();
    } catch (error) {
      console.warn("db maintenance skipped", error);
    }
  }, 20_000);
  maintenanceTimer.unref?.();

  // Local MCP for Cursor / Claude Desktop / Codex — localhost only.
  void startMcpServer().catch((e) =>
    console.warn("MCP server failed to start", e),
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  // Tray keeps the process; quit from tray menu.
});

app.on("before-quit", () => {
  if (linkBackfillTimer) {
    clearTimeout(linkBackfillTimer);
    linkBackfillTimer = null;
  }
  if (maintenanceTimer) {
    clearTimeout(maintenanceTimer);
    maintenanceTimer = null;
  }
  stopQueueLoop();
  stopMcpServer();
  stopAllWatches();
  stopAllPolling();
  closeDb();
});
