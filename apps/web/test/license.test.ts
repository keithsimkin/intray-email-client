import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hashAppSumoCode,
  LICENSE_PUBLIC_KEY_PEM,
  normalizeAppSumoCode,
  normalizeLicenseEmail,
  readLicensePrivateKeyPem,
  signLicenseToken,
  verifyLicenseToken,
  type LicensePayload,
} from "../src/lib/license";
import { appsumoHashFile, isKnownAppSumoHash } from "../src/lib/appsumo-codes";

const payload: LicensePayload = {
  v: 1,
  plan: "lifetime",
  email: "buyer@example.com",
  src: "appsumo",
  iat: 1_700_000_000,
  id: "lic-1",
};

function throwawayPem() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

describe("AppSumo code normalize and hash", () => {
  test("trims and uppercases without stripping characters inside the code", () => {
    expect(normalizeAppSumoCode("  ab-cd  ")).toBe("AB-CD");
    expect(normalizeAppSumoCode("already")).toBe("ALREADY");
  });

  test("hashes the trimmed uppercase code", () => {
    const expected = createHash("sha256").update("AB-CD", "utf8").digest("hex");
    expect(hashAppSumoCode("  ab-cd  ")).toBe(expected);
    expect(hashAppSumoCode("ab-cd")).toBe(expected);
  });

  test("the committed hash list is 2000 sha256 digests", () => {
    const file = appsumoHashFile();
    expect(file.algo.toLowerCase()).toContain("sha256");
    expect(file.count).toBe(2000);
    expect(file.hashes).toHaveLength(2000);
    expect(new Set(file.hashes.map((hash) => hash.toLowerCase())).size).toBe(2000);
    expect(file.hashes.every((hash) => /^[0-9a-f]{64}$/i.test(hash))).toBe(true);
    expect(isKnownAppSumoHash(file.hashes[0].toUpperCase())).toBe(true);
    expect(isKnownAppSumoHash("0".repeat(64))).toBe(false);
  });
});

describe("license tokens", () => {
  test("signs and verifies with a throwaway keypair", () => {
    const keys = throwawayPem();
    const token = signLicenseToken(payload, keys.privateKeyPem);
    expect(token.startsWith("INTRAY-")).toBe(true);
    expect(verifyLicenseToken(token, keys.publicKeyPem)).toEqual(payload);
    expect(verifyLicenseToken(token)).toBeNull();
  });

  test("rejects a tampered payload and a tampered signature", () => {
    const keys = throwawayPem();
    const token = signLicenseToken(payload, keys.privateKeyPem);
    const [body, sig] = token.slice("INTRAY-".length).split(".");
    const bodyBytes = Buffer.from(body!, "base64url");
    bodyBytes[0] ^= 0xff;
    expect(
      verifyLicenseToken(`INTRAY-${bodyBytes.toString("base64url")}.${sig}`, keys.publicKeyPem),
    ).toBeNull();
    const sigBytes = Buffer.from(sig!, "base64url");
    sigBytes[10] ^= 0xff;
    expect(
      verifyLicenseToken(`INTRAY-${body}.${sigBytes.toString("base64url")}`, keys.publicKeyPem),
    ).toBeNull();
  });

  test("reads a PEM or the base64 of that PEM", () => {
    const keys = throwawayPem();
    const escaped = keys.privateKeyPem.replaceAll("\n", "\\n");
    expect(readLicensePrivateKeyPem(escaped)).toBe(keys.privateKeyPem);
    const encoded = Buffer.from(keys.privateKeyPem, "utf8").toString("base64");
    expect(readLicensePrivateKeyPem(encoded)).toBe(keys.privateKeyPem.trim());
    expect(readLicensePrivateKeyPem("")).toBeNull();
    expect(readLicensePrivateKeyPem("not-a-key")).toBeNull();
  });

  test("the embedded public key is the AppSumo Ed25519 key", () => {
    expect(LICENSE_PUBLIC_KEY_PEM).toBe(
      `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATeY+FG0XKzidzQ+HHf46dKN84kjYZHAy5fSqBMDJkd0=
-----END PUBLIC KEY-----`,
    );
    const token = signLicenseToken(payload, throwawayPem().privateKeyPem);
    expect(verifyLicenseToken(token, LICENSE_PUBLIC_KEY_PEM)).toBeNull();
  });

  test("email normalization", () => {
    expect(normalizeLicenseEmail("  Buyer@Example.com ")).toBe("buyer@example.com");
    expect(normalizeLicenseEmail("not-an-email")).toBeNull();
  });
});

describe("desktop copy", () => {
  test("the web and desktop license modules are the same file", () => {
    const web = readFileSync(resolve(import.meta.dir, "../src/lib/license.ts"), "utf8");
    const desktop = readFileSync(
      resolve(import.meta.dir, "../../desktop/src/main/license/token.ts"),
      "utf8",
    );
    expect(desktop).toBe(web);
  });
});
