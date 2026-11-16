import { safeStorage } from "electron";
import {
  getCredentialPayload,
  setCredentialPayload,
} from "../db";

export type GmailTokens = {
  accessToken: string;
  refreshToken: string;
  expiryMs: number;
  tokenType?: string;
  scope?: string;
};

export type ImapCredentials = {
  provider: "imap";
  /** Provider brand id stored alongside for presets (icloud, yahoo, …) */
  brand: string;
  email: string;
  username?: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

export type StoredCredentials =
  | { provider: "gmail"; tokens: GmailTokens }
  | ImapCredentials;

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "OS encryption (DPAPI) is unavailable. Cannot store mail credentials.",
    );
  }
}

export function saveCredentials(
  accountId: string,
  creds: StoredCredentials,
): void {
  assertEncryption();
  const json = JSON.stringify(creds);
  const encrypted = safeStorage.encryptString(json);
  setCredentialPayload(accountId, encrypted.toString("base64"));
}

export function loadCredentials(
  accountId: string,
): StoredCredentials | null {
  const b64 = getCredentialPayload(accountId);
  if (!b64) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json) as StoredCredentials;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.provider === "gmail") {
      if (!parsed.tokens?.accessToken || !parsed.tokens?.refreshToken) {
        return null;
      }
      return parsed;
    }
    if (parsed.provider === "imap") {
      if (!parsed.email || !parsed.password || !parsed.imapHost) return null;
      return parsed;
    }
    return null;
  } catch {
    // Corrupt ciphertext (profile copy, DPAPI reset) is treated as missing
    // rather than crashing every sync attempt.
    return null;
  }
}
