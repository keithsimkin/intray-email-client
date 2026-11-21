import { safeStorage } from "electron";
import { deleteSecret, getSecretPayload, setSecretPayload } from "../db";
import type { LicenseActivateResult, LicenseStatus } from "../../shared/license";
import { verifyLicenseToken } from "./token";

const LICENSE_SECRET_KEY = "license.lifetime";

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "OS secure storage is unavailable. Cannot store the license on this device.",
    );
  }
}

export function readLicenseStatus(): LicenseStatus | null {
  const b64 = getSecretPayload(LICENSE_SECRET_KEY);
  if (!b64) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const token = safeStorage.decryptString(Buffer.from(b64, "base64"));
    const payload = verifyLicenseToken(token);
    if (!payload) return null;
    return {
      email: payload.email,
      plan: payload.plan,
      issuedAt: payload.iat,
    };
  } catch {
    return null;
  }
}

export function activateLicense(token: string): LicenseActivateResult {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a license key." };
  }
  const payload = verifyLicenseToken(trimmed);
  if (!payload) {
    return { ok: false, error: "That key isn’t valid. Check it and try again." };
  }
  try {
    assertEncryption();
    const encrypted = safeStorage.encryptString(trimmed);
    setSecretPayload(LICENSE_SECRET_KEY, encrypted.toString("base64"));
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not store the license on this device.",
    };
  }
  return {
    ok: true,
    license: {
      email: payload.email,
      plan: payload.plan,
      issuedAt: payload.iat,
    },
  };
}

export function clearStoredLicense(): void {
  deleteSecret(LICENSE_SECRET_KEY);
}
