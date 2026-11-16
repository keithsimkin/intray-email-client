import { shell } from "electron";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Only hand user-visible links to the OS shell. `shell.openExternal` will
 * happily launch `file:`, `smb:`, or custom protocol handlers, so an
 * attacker-controlled link inside a mail body could otherwise start a local
 * app or fetch a UNC path.
 */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function openExternalSafely(raw: string): boolean {
  if (!isSafeExternalUrl(raw)) return false;
  void shell.openExternal(raw).catch(() => undefined);
  return true;
}
