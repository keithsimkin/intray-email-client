import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load apps/desktop/.env in development only.
 *
 * In a packaged build the process working directory is whatever the OS or a
 * shortcut supplies, so reading `.env` from it would let anyone who controls
 * that directory inject `GMAIL_CLIENT_SECRET` or similar into the app.
 */
export function loadDesktopEnv(): void {
  if (app.isPackaged) return;

  const candidates = [
    join(app.getAppPath(), ".env"),
    join(__dirname, "../../.env"),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const text = readFileSync(file, "utf8").slice(0, 64 * 1024);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] == null || process.env[key] === "") {
          process.env[key] = value;
        }
      }
      return;
    } catch {
      /* ignore unreadable env file */
    }
  }
}
