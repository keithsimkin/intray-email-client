import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

/**
 * Offline lifetime license tokens.
 * The same file is copied to apps/desktop/src/main/license/token.ts.
 * A test asserts the two copies stay identical.
 */

export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATeY+FG0XKzidzQ+HHf46dKN84kjYZHAy5fSqBMDJkd0=
-----END PUBLIC KEY-----`;

export type LicensePayload = {
  v: 1;
  plan: "lifetime";
  email: string;
  src: "appsumo";
  iat: number;
  id: string;
};

const TOKEN_PREFIX = "INTRAY-";
const TOKEN_RE = /^INTRAY-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CODE_LENGTH = 64;

export function normalizeAppSumoCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashAppSumoCode(code: string): string {
  return createHash("sha256").update(normalizeAppSumoCode(code), "utf8").digest("hex");
}

export function normalizeLicenseEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (value.length < 3 || value.length > 254) return null;
  if (!EMAIL_RE.test(value)) return null;
  return value;
}

/** PKCS#8 PEM, or base64 of that PEM. Accepts literal newlines and `\n` escapes. */
export function readLicensePrivateKeyPem(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replaceAll("\\n", "\n");
  if (!trimmed) return null;
  if (trimmed.includes("BEGIN")) return trimmed;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim().replaceAll("\\n", "\n");
    if (decoded.includes("BEGIN")) return decoded;
  } catch {
    return null;
  }
  return null;
}

export function licensePrivateKey(raw: string | undefined | null): KeyObject | null {
  const pem = readLicensePrivateKeyPem(raw);
  if (!pem) return null;
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "ed25519") return null;
    return key;
  } catch {
    return null;
  }
}

export function canonicalLicenseJson(payload: LicensePayload): string {
  return JSON.stringify({
    v: payload.v,
    plan: payload.plan,
    email: payload.email,
    src: payload.src,
    iat: payload.iat,
    id: payload.id,
  });
}

export function signLicenseToken(
  payload: LicensePayload,
  privateKey: string | KeyObject,
): string {
  const body = Buffer.from(canonicalLicenseJson(payload), "utf8");
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  const sig = sign(null, body, key);
  return `${TOKEN_PREFIX}${body.toString("base64url")}.${sig.toString("base64url")}`;
}

export function verifyLicenseToken(
  token: string,
  publicKeyPem: string = LICENSE_PUBLIC_KEY_PEM,
): LicensePayload | null {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > 4096) return null;
  const match = TOKEN_RE.exec(trimmed);
  if (!match) return null;
  const body = Buffer.from(match[1], "base64url");
  const sig = Buffer.from(match[2], "base64url");
  if (body.length === 0 || sig.length === 0) return null;
  try {
    const ok = verify(null, body, createPublicKey(publicKeyPem), sig);
    if (!ok) return null;
  } catch {
    return null;
  }
  try {
    return parseLicensePayload(JSON.parse(body.toString("utf8")) as unknown);
  } catch {
    return null;
  }
}

export function parseLicensePayload(value: unknown): LicensePayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (record.plan !== "lifetime") return null;
  if (record.src !== "appsumo") return null;
  if (typeof record.email !== "string" || !normalizeLicenseEmail(record.email)) return null;
  if (record.email !== record.email.trim().toLowerCase()) return null;
  if (typeof record.id !== "string" || record.id.length < 1 || record.id.length > 80) return null;
  if (typeof record.iat !== "number" || !Number.isInteger(record.iat)) return null;
  if (record.iat < 1_600_000_000 || record.iat > 10_000_000_000) return null;
  return {
    v: 1,
    plan: "lifetime",
    email: record.email,
    src: "appsumo",
    iat: record.iat,
    id: record.id,
  };
}

export function appSumoCodeError(code: string): "empty" | "invalid" | null {
  if (code.trim().length === 0) return "empty";
  if (normalizeAppSumoCode(code).length > MAX_CODE_LENGTH) return "invalid";
  return null;
}
