import { randomUUID, type KeyObject } from "node:crypto";
import { isKnownAppSumoHash } from "./appsumo-codes";
import {
  appSumoCodeError,
  hashAppSumoCode,
  LICENSE_PUBLIC_KEY_PEM,
  licensePrivateKey,
  normalizeLicenseEmail,
  signLicenseToken,
  verifyLicenseToken,
  type LicensePayload,
} from "./license";

export const REDEEM_MESSAGES = {
  empty_code: "Enter your AppSumo code.",
  invalid_email: "Enter a valid email address.",
  invalid_code: "That code isn't valid. Check it and try again.",
  redeemed: "This code has already been redeemed.",
  signing_unavailable:
    "License signing is temporarily unavailable. Please try again soon.",
  storage_unavailable: "Redemption is temporarily unavailable. Please try again soon.",
} as const;

export type RedeemErrorCode = keyof typeof REDEEM_MESSAGES;

export class RedeemError extends Error {
  readonly code: RedeemErrorCode;

  constructor(code: RedeemErrorCode) {
    super(REDEEM_MESSAGES[code]);
    this.name = "RedeemError";
    this.code = code;
  }
}

export function redeemStatus(code: RedeemErrorCode): number {
  switch (code) {
    case "empty_code":
    case "invalid_email":
    case "invalid_code":
      return 400;
    case "redeemed":
      return 409;
    case "signing_unavailable":
    case "storage_unavailable":
      return 503;
  }
}

export type ClaimRecord = {
  email: string;
  licenseId: string;
  license: string;
  ts: number;
};

export type ClaimStore = {
  get(key: string): Promise<ClaimRecord | null>;
  /** True when this call created the key. */
  setIfAbsent(key: string, value: ClaimRecord): Promise<boolean>;
};

export type RedeemResult = {
  license: string;
  email: string;
  plan: "lifetime";
  licenseId: string;
  created: boolean;
};

function isClaimRecord(value: unknown): value is ClaimRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as ClaimRecord;
  return (
    typeof record.email === "string" &&
    typeof record.licenseId === "string" &&
    typeof record.license === "string" &&
    typeof record.ts === "number"
  );
}

export function asClaimRecord(value: unknown): ClaimRecord | null {
  return isClaimRecord(value) ? value : null;
}

function signingKeyOrThrow(privateKeyPem: string | null | undefined): KeyObject {
  const key = licensePrivateKey(privateKeyPem);
  if (!key) throw new RedeemError("signing_unavailable");
  return key;
}

function assertStoredLicense(
  record: ClaimRecord,
  email: string,
  publicKeyPem: string,
): LicensePayload {
  const payload = verifyLicenseToken(record.license, publicKeyPem);
  if (!payload || payload.email !== email || payload.id !== record.licenseId) {
    throw new RedeemError("storage_unavailable");
  }
  return payload;
}

export async function redeemAppSumoCode(input: {
  code: string;
  email: string;
  store: ClaimStore;
  privateKeyPem: string | null | undefined;
  isKnownHash?: (hash: string) => boolean;
  now?: () => number;
  newId?: () => string;
  publicKeyPem?: string;
}): Promise<RedeemResult> {
  const email = normalizeLicenseEmail(input.email);
  if (!email) throw new RedeemError("invalid_email");

  const codeProblem = appSumoCodeError(input.code);
  if (codeProblem === "empty") throw new RedeemError("empty_code");
  if (codeProblem === "invalid") throw new RedeemError("invalid_code");

  const hash = hashAppSumoCode(input.code);
  const known = input.isKnownHash ?? isKnownAppSumoHash;
  if (!known(hash)) throw new RedeemError("invalid_code");

  const key = signingKeyOrThrow(input.privateKeyPem);
  const publicKeyPem = input.publicKeyPem ?? LICENSE_PUBLIC_KEY_PEM;
  const now = input.now ?? (() => Date.now());
  const newId = input.newId ?? randomUUID;

  let existing: ClaimRecord | null;
  try {
    existing = asClaimRecord(await input.store.get(hash));
  } catch (error) {
    console.error(
      "[redeem] store read failed",
      error instanceof Error ? error.message : "error",
    );
    throw new RedeemError("storage_unavailable");
  }

  if (existing) {
    if (existing.email !== email) throw new RedeemError("redeemed");
    assertStoredLicense(existing, email, publicKeyPem);
    return {
      license: existing.license,
      email,
      plan: "lifetime",
      licenseId: existing.licenseId,
      created: false,
    };
  }

  const licenseId = newId();
  const iat = Math.floor(now() / 1000);
  const payload: LicensePayload = {
    v: 1,
    plan: "lifetime",
    email,
    src: "appsumo",
    iat,
    id: licenseId,
  };
  let license: string;
  try {
    license = signLicenseToken(payload, key);
    if (!verifyLicenseToken(license, publicKeyPem)) {
      throw new Error("public key mismatch");
    }
  } catch (error) {
    console.error(
      "[redeem] signing failed",
      error instanceof Error ? error.name : "error",
    );
    throw new RedeemError("signing_unavailable");
  }

  const record: ClaimRecord = {
    email,
    licenseId,
    license,
    ts: now(),
  };

  let created = false;
  try {
    created = await input.store.setIfAbsent(hash, record);
  } catch (error) {
    console.error(
      "[redeem] store write failed",
      error instanceof Error ? error.message : "error",
    );
    throw new RedeemError("storage_unavailable");
  }

  if (created) {
    return { license, email, plan: "lifetime", licenseId, created: true };
  }

  let winner: ClaimRecord | null;
  try {
    winner = asClaimRecord(await input.store.get(hash));
  } catch (error) {
    console.error(
      "[redeem] store reread failed",
      error instanceof Error ? error.message : "error",
    );
    throw new RedeemError("storage_unavailable");
  }
  if (!winner) throw new RedeemError("storage_unavailable");
  if (winner.email !== email) throw new RedeemError("redeemed");
  assertStoredLicense(winner, email, publicKeyPem);
  return {
    license: winner.license,
    email,
    plan: "lifetime",
    licenseId: winner.licenseId,
    created: false,
  };
}
