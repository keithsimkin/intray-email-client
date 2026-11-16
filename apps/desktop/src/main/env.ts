import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Load apps/desktop/.env into process.env (dev-friendly; never overrides existing). */
export function loadDesktopEnv(): void {
  const candidates = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "apps", "desktop", ".env"),
    join(__dirname, "../../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const text = readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
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
      /* ignore */
    }
  }
}
