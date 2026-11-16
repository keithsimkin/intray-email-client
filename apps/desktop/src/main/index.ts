import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { chromeThemeOptions } from "./chrome-theme";
import { closeDb, initDb, listAccountRows } from "./db";
import { loadDesktopEnv } from "./env";
import { registerIpc } from "./ipc/register";
import {
  ensureDefaultLaunchAtLogin,
  launchedHidden,
} from "./startup";
import { ensureQueueLoop, stopQueueLoop } from "./mail/queue";
import { startMcpServer, stopMcpServer } from "./mcp/server";
import { startPollingAll, stopAllPolling } from "./sync/engine";
import { createTray } from "./tray";

loadDesktopEnv();

let mainWindow: BrowserWindow | null = null;

function createWindow(opts?: { show?: boolean }): BrowserWindow {
  // Default dark; renderer syncs via app:setChromeTheme once prefs resolve.
  const chrome = chromeThemeOptions("dark");
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: "Intray",
    backgroundColor: chrome.backgroundColor,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: chrome.titleBarOverlay,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => {
    if (opts?.show === false) return;
    win.show();
  });
  win.on("closed", () => {
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(async () => {
  await initDb();
  registerIpc();
  ensureDefaultLaunchAtLogin();
  ensureQueueLoop();

  const hide = launchedHidden();
  mainWindow = createWindow({ show: !hide });
  createTray(() => mainWindow);

  const accountIds = listAccountRows().map((a) => a.id);
  startPollingAll(accountIds);

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

app.on("window-all-closed", () => {
  // Tray keeps the process; quit from tray menu.
});

app.on("before-quit", () => {
  stopQueueLoop();
  stopMcpServer();
  stopAllPolling();
  closeDb();
});
