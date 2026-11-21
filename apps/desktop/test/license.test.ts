import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  hashAppSumoCode,
  LICENSE_PUBLIC_KEY_PEM,
  normalizeAppSumoCode,
  signLicenseToken,
  verifyLicenseToken,
} from "../src/main/license/token";

describe("desktop license token", () => {
  test("normalizes and hashes the same way the site does", () => {
    expect(normalizeAppSumoCode("  ab-cd  ")).toBe("AB-CD");
    expect(hashAppSumoCode("  ab-cd  ")).toBe(
      createHash("sha256").update("AB-CD", "utf8").digest("hex"),
    );
  });

  test("verifies a token signed by a throwaway key and rejects it against the embedded key", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const token = signLicenseToken(
      {
        v: 1,
        plan: "lifetime",
        email: "buyer@example.com",
        src: "appsumo",
        iat: 1_700_000_000,
        id: "lic-1",
      },
      privateKey,
    );
    expect(verifyLicenseToken(token, publicKeyPem)?.plan).toBe("lifetime");
    expect(verifyLicenseToken(token, LICENSE_PUBLIC_KEY_PEM)).toBeNull();
  });
});
