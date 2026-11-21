import { BrowserWindow, app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";
import type { AppUpdateStatus } from "../shared/types";
import { downloadUpdateAsk } from "../shared/updateAsk";
import { showDesktopNotification } from "./notifications";
import { openExternalSafely } from "./security";

const STARTUP_CHECK_DELAY_MS = 12_000;
const GITHUB_RELEASES_URL =
  "https://github.com/keithsimkin/intray-email-client/releases";

let status: AppUpdateStatus = {
  state: "idle",
  currentVersion: "0.0.0",
  packaged: false,
};
let started = false;
let eventsWired = false;
let notifiedAvailableVersion: string | null = null;
let notifiedReadyVersion: string | null = null;

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("app:updateStatus", status);
  }
}

function setStatus(partial: Partial<AppUpdateStatus>): AppUpdateStatus {
  status = {
    ...status,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    ...partial,
  };
  broadcast();
  return status;
}

function versionOf(info?: UpdateInfo | null): string | undefined {
  const v = info?.version?.trim();
  return v || undefined;
}

function updateWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  );
}

function notifyUpdateAvailable(version: string): void {
  if (notifiedAvailableVersion === version) return;
  notifiedAvailableVersion = version;
  const ask = downloadUpdateAsk(version);
  showDesktopNotification(updateWindow, {
    title: ask.title,
    body: ask.body,
    silent: false,
    updateAsk: "download",
  });
}

function notifyUpdateReady(version: string): void {
  if (notifiedReadyVersion === version) return;
  notifiedReadyVersion = version;
  showDesktopNotification(updateWindow, {
    title: "Update ready",
    body: `Intray ${version} will install when you restart.`,
    silent: false,
  });
}

function wireUpdaterEvents(): void {
  if (eventsWired) return;
  eventsWired = true;

  // Downloads are user-triggered from the rail icon or Settings → About.
  // Installs only happen after the renderer confirms via the in-app dialog.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Public GitHub Releases — no token required for checking/downloading.
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    setStatus({
      state: "checking",
      error: undefined,
      downloadPercent: undefined,
    });
  });

  autoUpdater.on("update-available", (info) => {
    const version = versionOf(info);
    setStatus({
      state: "available",
      availableVersion: version,
      releaseName: info.releaseName || version,
      releaseNotes:
        typeof info.releaseNotes === "string"
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n) => n.note).join("\n")
            : undefined,
      error: undefined,
      downloadPercent: 0,
    });
    if (version) notifyUpdateAvailable(version);
  });

  autoUpdater.on("update-not-available", (info) => {
    setStatus({
      state: "not-available",
      availableVersion: versionOf(info) ?? app.getVersion(),
      error: undefined,
      downloadPercent: undefined,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setStatus({
      state: "downloading",
      downloadPercent: Math.max(
        0,
        Math.min(100, Math.round(progress.percent)),
      ),
      error: undefined,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version = versionOf(info);
    setStatus({
      state: "ready",
      availableVersion: version,
      releaseName: info.releaseName || version,
      downloadPercent: 100,
      error: undefined,
    });
    if (version) notifyUpdateReady(version);
  });

  autoUpdater.on("error", (error) => {
    const message =
      error instanceof Error ? error.message : "Update check failed";
    setStatus({
      state: "error",
      error: message,
      downloadPercent: undefined,
    });
  });
}

export function getUpdateStatus(): AppUpdateStatus {
  return {
    ...status,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
  };
}

export async function checkForAppUpdates(
  opts?: { silent?: boolean },
): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    return setStatus({
      state: "disabled",
      detail: "Updates apply to installed builds only (not electron-vite dev).",
      error: undefined,
      downloadPercent: undefined,
    });
  }

  wireUpdaterEvents();

  try {
    await autoUpdater.checkForUpdates();
    return getUpdateStatus();
  } catch (error) {
    if (opts?.silent) {
      // Startup checks should stay quiet when offline / rate-limited.
      return setStatus({
        state: "idle",
        error: undefined,
        detail: undefined,
      });
    }
    const message =
      error instanceof Error ? error.message : "Could not reach GitHub Releases";
    return setStatus({
      state: "error",
      error: message,
    });
  }
}

export async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) return getUpdateStatus();
  // Allow retry after a failed download when we still know which version to fetch.
  const canStart =
    status.state === "available" ||
    (status.state === "error" && Boolean(status.availableVersion));
  if (!canStart) return getUpdateStatus();

  try {
    setStatus({ state: "downloading", downloadPercent: 0, error: undefined });
    await autoUpdater.downloadUpdate();
    return getUpdateStatus();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not download update";
    return setStatus({
      state: "error",
      error: message,
      downloadPercent: undefined,
    });
  }
}

/**
 * Install a downloaded update with no native Windows dialog and no NSIS wizard.
 * The renderer asks in-app before calling this.
 */
export function quitAndInstallUpdate(): boolean {
  if (!app.isPackaged || status.state !== "ready") return false;

  // Confirmation lives in the renderer (in-app AlertDialog). Broadcast
  // "installing" so the progress card stays visible until quitAndInstall
  // tears the window down and relaunches.
  setStatus({
    state: "installing",
    downloadPercent: 100,
    error: undefined,
  });

  // isSilent=true passes /S to NSIS (no wizard). isForceRunAfter=true relaunches.
  autoUpdater.quitAndInstall(true, true);
  return true;
}

export function openReleasesPage(): boolean {
  return openExternalSafely(GITHUB_RELEASES_URL);
}

/**
 * Wire updater events once and schedule a quiet startup check for packaged builds.
 */
export function startAppUpdater(): void {
  if (started) return;
  started = true;

  status = {
    state: app.isPackaged ? "idle" : "disabled",
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    detail: app.isPackaged
      ? undefined
      : "Updates apply to installed builds only (not electron-vite dev).",
  };

  if (!app.isPackaged) return;

  wireUpdaterEvents();
  setTimeout(() => {
    void checkForAppUpdates({ silent: true });
  }, STARTUP_CHECK_DELAY_MS);
}
