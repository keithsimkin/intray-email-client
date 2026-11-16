import { app } from "electron";
import type { LaunchAtLoginState } from "../shared/types";

export function getLaunchAtLogin(): LaunchAtLoginState {
  const settings = app.getLoginItemSettings();
  return {
    openAtLogin: settings.openAtLogin,
    openAsHidden: settings.openAsHidden,
  };
}

export function setLaunchAtLogin(
  openAtLogin: boolean,
  openAsHidden = true,
): LaunchAtLoginState {
  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden,
    path: process.execPath,
    args: openAsHidden ? ["--hidden"] : [],
  });
  return getLaunchAtLogin();
}

/** Default: enable login item once for packaged builds if never set. */
export function ensureDefaultLaunchAtLogin(): void {
  if (!app.isPackaged) return;
  const current = app.getLoginItemSettings();
  // Respect an explicit user disable stored by Electron; only set when unset-ish
  if (!current.openAtLogin && !current.executableWillLaunchAtLogin) {
    setLaunchAtLogin(true, true);
  }
}

export function launchedHidden(): boolean {
  return process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAsHidden;
}
