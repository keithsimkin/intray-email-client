import { app, nativeImage, type NativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve the packaged / dev Intray app icon.
 * Prefer .ico on Windows (taskbar + window chrome); fall back to PNG elsewhere.
 */
export function resolveAppIconPath(): string | null {
  const names =
    process.platform === "win32"
      ? (["icon.ico", "icon.png"] as const)
      : (["icon.png", "icon.ico"] as const);

  const bases = [
    join(__dirname, "../../resources"),
    join(app.getAppPath(), "resources"),
    join(process.resourcesPath ?? "", "resources"),
  ];

  for (const base of bases) {
    for (const name of names) {
      const candidate = join(base, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function loadAppIcon(): NativeImage | null {
  const path = resolveAppIconPath();
  if (!path) return null;
  const img = nativeImage.createFromPath(path);
  return img.isEmpty() ? null : img;
}
