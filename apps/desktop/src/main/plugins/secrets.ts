import { safeStorage } from "electron";
import {
  deleteSecret,
  getSecretPayload,
  setSecretPayload,
} from "../db";

/**
 * Plugin credentials use the same OS-encrypted `secrets` table as AI keys,
 * namespaced so they can be removed independently of mail accounts.
 */
export type PluginSecretKey = "google-calendar.tokens" | "notion.token";

const PREFIX = "plugin.";

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "OS secure storage is unavailable. Cannot store plugin credentials.",
    );
  }
}

export function savePluginSecret(key: PluginSecretKey, value: string): void {
  assertEncryption();
  const encrypted = safeStorage.encryptString(value);
  setSecretPayload(`${PREFIX}${key}`, encrypted.toString("base64"));
}

export function loadPluginSecret(key: PluginSecretKey): string | null {
  const b64 = getSecretPayload(`${PREFIX}${key}`);
  if (!b64) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

export function removePluginSecret(key: PluginSecretKey): void {
  deleteSecret(`${PREFIX}${key}`);
}
