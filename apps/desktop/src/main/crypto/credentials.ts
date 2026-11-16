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

function decryptCredentialsPayload(
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
    return parsed;
  } catch {
    // Corrupt ciphertext (profile copy, DPAPI reset) is treated as missing
    // rather than crashing every sync attempt.
    return null;
  }
}

export function loadCredentials(
  accountId: string,
): StoredCredentials | null {
  const parsed = decryptCredentialsPayload(accountId);
  if (!parsed) return null;
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
}

/**
 * Read stored connection settings without requiring a usable password/token.
 * Used to pre-fill re-auth (email, hosts) when the account is logged out.
 */
export function peekCredentials(
  accountId: string,
): StoredCredentials | null {
  const parsed = decryptCredentialsPayload(accountId);
  if (!parsed) return null;
  if (parsed.provider === "gmail") {
    return parsed.tokens ? parsed : null;
  }
  if (parsed.provider === "imap") {
    if (!parsed.email || !parsed.imapHost) return null;
    return parsed;
  }
  return null;
}

/**
 * OAuth Gmail accounts store `{ provider: "gmail" }` tokens. App-password
 * Gmail accounts store `{ provider: "imap", brand: "gmail" }` and must use
 * IMAP even though the account row's provider is still "gmail".
 */
export function accountUsesImap(accountId: string, provider: string): boolean {
  const creds = peekCredentials(accountId) ?? loadCredentials(accountId);
  if (creds?.provider === "imap") return true;
  if (creds?.provider === "gmail") return false;
  return provider !== "gmail";
}

export function isGmailImapAccount(accountId: string): boolean {
  const creds = peekCredentials(accountId) ?? loadCredentials(accountId);
  if (!creds || creds.provider !== "imap") return false;
  return (
    creds.brand === "gmail" ||
    creds.imapHost.trim().toLowerCase() === "imap.gmail.com" ||
    creds.smtpHost.trim().toLowerCase() === "smtp.gmail.com"
  );
}
