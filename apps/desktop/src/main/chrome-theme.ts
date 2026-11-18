import type { BrowserWindow } from "electron";

export type ChromeTheme = "dark" | "light";

/** Native caption overlay + window chrome — keep in sync with CSS --bg / --fg. */
export function chromeThemeOptions(theme: ChromeTheme): {
  backgroundColor: string;
  titleBarOverlay: {
    color: string;
    symbolColor: string;
    height: number;
  };
} {
  if (theme === "light") {
    return {
      backgroundColor: "#f0f1f3",
      titleBarOverlay: {
        color: "#f0f1f3",
        symbolColor: "#141416",
        height: 44,
      },
    };
  }
  return {
    backgroundColor: "#0a0a0b",
    titleBarOverlay: {
      color: "#0a0a0b",
      symbolColor: "#ededed",
      height: 44,
    },
  };
}

export function applyChromeTheme(win: BrowserWindow, theme: ChromeTheme): void {
  const opts = chromeThemeOptions(theme);
  win.setBackgroundColor(opts.backgroundColor);
  // titleBarOverlay is Windows-only; macOS uses hiddenInset + traffic lights.
  if (process.platform === "win32") {
    win.setTitleBarOverlay(opts.titleBarOverlay);
  }
}
