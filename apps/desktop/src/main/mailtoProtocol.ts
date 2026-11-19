import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import {
  extractMailto,
  findMailtoArg,
  type MailtoHandlerState,
} from "../shared/mailto";

const FILE = "mailto-handler.json";
const PROG_ID = "Intray.mailto";
const CLIENT_KEY = "HKCU\\Software\\Clients\\Mail\\Intray";
const CLASS_KEY = `HKCU\\Software\\Classes\\${PROG_ID}`;

let pending: string | null = null;
let rendererReady = false;
let lastSent = "";
let lastSentAt = 0;
let ensureWindow: (() => BrowserWindow | null) | null = null;

function handlerFile(): string {
  return join(app.getPath("userData"), FILE);
}

function readEnabled(): boolean {
  try {
    const parsed = JSON.parse(readFileSync(handlerFile(), "utf8")) as {
      enabled?: unknown;
    };
    if (typeof parsed.enabled === "boolean") return parsed.enabled;
  } catch {
    /* first run */
  }
  return true;
}

function writeEnabled(enabled: boolean): void {
  writeFileSync(handlerFile(), JSON.stringify({ enabled }), "utf8");
}

function markSent(url: string): void {
  lastSent = url;
  lastSentAt = Date.now();
}

function focus(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function flushMailto(): void {
  if (!pending) return;
  const win = ensureWindow?.() ?? null;
  if (!win || win.isDestroyed()) return;
  focus(win);
  if (!rendererReady || win.webContents.isLoading()) return;
  const url = pending;
  pending = null;
  markSent(url);
  win.webContents.send("mailto:open", url);
}

/**
 * Remember a mailto URL from the OS or from a link inside the window.
 * The renderer claims it once the compose screen is listening.
 */
export function queueMailto(raw: string): boolean {
  const url = extractMailto(raw);
  if (!url) return false;
  if (pending === url) {
    flushMailto();
    return true;
  }
  if (url === lastSent && Date.now() - lastSentAt < 800) return true;
  pending = url;
  flushMailto();
  return true;
}

export function queueMailtoFromArgs(args: readonly string[]): boolean {
  const url = findMailtoArg(args);
  if (!url) return false;
  return queueMailto(url);
}

export function bindMailtoWindow(ensure: () => BrowserWindow | null): void {
  ensureWindow = ensure;
  flushMailto();
}

/** Renderer is up. Hand it a mailto that arrived during startup, if any. */
export function claimMailto(): string | null {
  rendererReady = true;
  const win = ensureWindow?.() ?? null;
  if (win && !win.isDestroyed() && pending) focus(win);
  const url = pending;
  pending = null;
  if (url) markSent(url);
  return url;
}

export function getMailtoHandlerState(): MailtoHandlerState {
  const enabled = readEnabled();
  const canRegister = app.isPackaged;
  let isDefault = false;
  if (canRegister) {
    try {
      isDefault = app.isDefaultProtocolClient("mailto");
    } catch {
      isDefault = false;
    }
  }
  return {
    enabled,
    isDefault,
    canRegister,
    platform: process.platform,
  };
}

/**
 * Register or clear the OS mailto handler.
 * Dev sessions skip this: the executable is electron.exe, and registering it
 * would steal mailto links from the real mail app.
 * Windows UserChoice is hash-protected, so a packaged build shows up as an
 * Email app and the user may still need to pick it under Default apps.
 */
export async function setMailtoHandler(
  enabled: boolean,
): Promise<MailtoHandlerState> {
  writeEnabled(enabled);
  if (app.isPackaged) await applyOsRegistration(enabled);
  return getMailtoHandlerState();
}

export async function ensureMailtoHandler(): Promise<void> {
  if (!app.isPackaged) return;
  await applyOsRegistration(readEnabled());
}

async function applyOsRegistration(enabled: boolean): Promise<void> {
  if (enabled) {
    try {
      app.setAsDefaultProtocolClient("mailto");
    } catch (error) {
      console.warn("mailto protocol register failed", error);
    }
    if (process.platform === "win32") await registerWindowsMailClient();
    return;
  }
  try {
    app.removeAsDefaultProtocolClient("mailto");
  } catch (error) {
    console.warn("mailto protocol remove failed", error);
  }
  if (process.platform === "win32") await unregisterWindowsMailClient();
}

function reg(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile("reg", args, { windowsHide: true }, (error) => {
      if (error) {
        console.warn("mailto registry update failed", args[1] ?? args[0]);
      }
      resolve();
    });
  });
}

async function registerWindowsMailClient(): Promise<void> {
  const command = `"${process.execPath}" "%1"`;
  await reg(["add", CLASS_KEY, "/ve", "/d", "URL:Intray Mail", "/f"]);
  await reg(["add", CLASS_KEY, "/v", "URL Protocol", "/d", "", "/f"]);
  await reg([
    "add",
    `${CLASS_KEY}\\shell\\open\\command`,
    "/ve",
    "/d",
    command,
    "/f",
  ]);
  await reg([
    "add",
    CLIENT_KEY,
    "/ve",
    "/d",
    "Intray",
    "/f",
  ]);
  await reg([
    "add",
    `${CLIENT_KEY}\\Capabilities`,
    "/v",
    "ApplicationName",
    "/d",
    "Intray",
    "/f",
  ]);
  await reg([
    "add",
    `${CLIENT_KEY}\\Capabilities`,
    "/v",
    "ApplicationDescription",
    "/d",
    "Intray opens mailto links as a new message",
    "/f",
  ]);
  await reg([
    "add",
    `${CLIENT_KEY}\\Capabilities\\URLAssociations`,
    "/v",
    "mailto",
    "/d",
    PROG_ID,
    "/f",
  ]);
  await reg([
    "add",
    "HKCU\\Software\\RegisteredApplications",
    "/v",
    "Intray",
    "/d",
    "Software\\Clients\\Mail\\Intray\\Capabilities",
    "/f",
  ]);
}

async function unregisterWindowsMailClient(): Promise<void> {
  await reg(["delete", CLIENT_KEY, "/f"]);
  await reg(["delete", CLASS_KEY, "/f"]);
  await reg([
    "delete",
    "HKCU\\Software\\RegisteredApplications",
    "/v",
    "Intray",
    "/f",
  ]);
}

export function openDefaultAppsSettings(): boolean {
  if (process.platform !== "win32") return false;
  void shell.openExternal("ms-settings:defaultapps").catch(() => undefined);
  return true;
}
