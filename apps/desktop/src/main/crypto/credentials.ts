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
  assertEncryption();
  const buf = Buffer.from(b64, "base64");
  const json = safeStorage.decryptString(buf);
  return JSON.parse(json) as StoredCredentials;
}
