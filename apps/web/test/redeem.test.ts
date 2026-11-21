import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { claimStoreFromBlobs, type BlobsLike } from "../src/lib/appsumo-store";
import {
  hashAppSumoCode,
  signLicenseToken,
  type LicensePayload,
} from "../src/lib/license";
import {
  RedeemError,
  redeemAppSumoCode,
  type ClaimRecord,
  type ClaimStore,
} from "../src/lib/redeem";
import {
  consumeRedeemAttempt,
  mergeAndIncrement,
  REDEEM_RATE_LIMIT,
  REDEEM_RATE_WINDOW_MS,
  type RateBucket,
} from "../src/lib/redeem-rate";

const CODE = "APPSUMO-CODE-21CHARS";

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

class MemoryStore implements ClaimStore {
  readonly map = new Map<string, ClaimRecord>();
  gets = 0;
  sets = 0;

  async get(key: string): Promise<ClaimRecord | null> {
    this.gets += 1;
    return this.map.get(key) ?? null;
  }

  async setIfAbsent(key: string, value: ClaimRecord): Promise<boolean> {
    this.sets += 1;
    if (this.map.has(key)) return false;
    this.map.set(key, value);
    return true;
  }
}

function redeemWith(store: ClaimStore, pair = keys()) {
  let ids = 0;
  return {
    pair,
    run: (email: string, code = CODE) =>
      redeemAppSumoCode({
        code,
        email,
        store,
        privateKeyPem: pair.privateKeyPem,
        publicKeyPem: pair.publicKeyPem,
        isKnownHash: (hash) => hash === hashAppSumoCode(CODE),
        now: () => 1_700_000_000_000,
        newId: () => `id-${++ids}`,
      }),
  };
}

describe("AppSumo claims", () => {
  test("first claim stores the license and a repeat with the same email returns it", async () => {
    const store = new MemoryStore();
    const { run } = redeemWith(store);
    const first = await run("Buyer@Example.com");
    const second = await run("buyer@example.com");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.license).toBe(first.license);
    expect(second.licenseId).toBe(first.licenseId);
    expect(second.email).toBe("buyer@example.com");
    expect(store.sets).toBe(1);
    expect(store.map.size).toBe(1);
    const saved = store.map.get(hashAppSumoCode(CODE));
    expect(saved).toMatchObject({
      email: "buyer@example.com",
      licenseId: first.licenseId,
      license: first.license,
      ts: 1_700_000_000_000,
    });
  });

  test("the same code with a different email is rejected and the stored license stays", async () => {
    const store = new MemoryStore();
    const { run } = redeemWith(store);
    const first = await run("one@example.com");
    await expect(run("two@example.com")).rejects.toEqual(
      expect.objectContaining({
        name: "RedeemError",
        code: "redeemed",
        message: "This code has already been redeemed.",
      }),
    );
    expect(store.map.get(hashAppSumoCode(CODE))?.license).toBe(first.license);
    expect(store.sets).toBe(1);
  });

  test("a lost race returns the winning license for the same email", async () => {
    const pair = keys();
    const winnerPayload: LicensePayload = {
      v: 1,
      plan: "lifetime",
      email: "one@example.com",
      src: "appsumo",
      iat: 1_700_000_000,
      id: "winner",
    };
    const winner: ClaimRecord = {
      email: "one@example.com",
      licenseId: "winner",
      license: signLicenseToken(winnerPayload, pair.privateKeyPem),
      ts: 1_700_000_000_000,
    };
    let reads = 0;
    const store: ClaimStore = {
      async get() {
        reads += 1;
        return reads === 1 ? null : winner;
      },
      async setIfAbsent() {
        return false;
      },
    };
    const result = await redeemAppSumoCode({
      code: CODE,
      email: "one@example.com",
      store,
      privateKeyPem: pair.privateKeyPem,
      publicKeyPem: pair.publicKeyPem,
      isKnownHash: (hash) => hash === hashAppSumoCode(CODE),
      now: () => 1_700_000_000_000,
      newId: () => "should-not-win",
    });
    expect(result.license).toBe(winner.license);
    expect(result.licenseId).toBe("winner");
    expect(result.created).toBe(false);
  });

  test("an unknown code is a generic error and does not touch the store", async () => {
    const store = new MemoryStore();
    const { run } = redeemWith(store);
    await expect(run("one@example.com", "NOT-A-REAL-CODE")).rejects.toBeInstanceOf(RedeemError);
    try {
      await run("one@example.com", "NOT-A-REAL-CODE");
    } catch (error) {
      expect(error).toMatchObject({
        message: "That code isn't valid. Check it and try again.",
      });
    }
    expect(store.gets).toBe(0);
    expect(store.sets).toBe(0);
  });

  test("a missing signing key does not claim the code", async () => {
    const store = new MemoryStore();
    await expect(
      redeemAppSumoCode({
        code: CODE,
        email: "one@example.com",
        store,
        privateKeyPem: null,
        isKnownHash: () => true,
      }),
    ).rejects.toMatchObject({
      code: "signing_unavailable",
      message: "License signing is temporarily unavailable. Please try again soon.",
    });
    expect(store.gets).toBe(0);
  });

  test("a private key that does not match the public key does not claim the code", async () => {
    const store = new MemoryStore();
    const signing = keys();
    const other = keys();
    await expect(
      redeemAppSumoCode({
        code: CODE,
        email: "one@example.com",
        store,
        privateKeyPem: signing.privateKeyPem,
        publicKeyPem: other.publicKeyPem,
        isKnownHash: () => true,
        now: () => 1_700_000_000_000,
        newId: () => "id-1",
      }),
    ).rejects.toMatchObject({ code: "signing_unavailable" });
    expect(store.sets).toBe(0);
  });
});

describe("blobs conditional write", () => {
  test("onlyIfNew reports whether the key was created", async () => {
    const map = new Map<string, unknown>();
    const blobs: BlobsLike = {
      async get(key) {
        return map.has(key) ? map.get(key) : null;
      },
      async setJSON(key, data, options) {
        if (options?.onlyIfNew && map.has(key)) return { modified: false };
        map.set(key, data);
        return { modified: true };
      },
    };
    const store = claimStoreFromBlobs(blobs);
    const record: ClaimRecord = {
      email: "one@example.com",
      licenseId: "id-1",
      license: "INTRAY-test.sig",
      ts: 1,
    };
    expect(await store.setIfAbsent("abc", record)).toBe(true);
    expect(await store.setIfAbsent("abc", { ...record, email: "two@example.com" })).toBe(false);
    expect(await store.get("abc")).toEqual(record);
    expect(await store.get("missing")).toBeNull();
  });
});

describe("redeem rate limit", () => {
  test("merges the higher in-window count and starts a new window", () => {
    const now = 10_000;
    expect(
      mergeAndIncrement({ count: 2, start: 9_000 }, { count: 4, start: 8_000 }, now, 5_000),
    ).toEqual({ count: 5, start: 8_000 });
    expect(mergeAndIncrement({ count: 4, start: 1 }, null, now, 5_000)).toEqual({
      count: 1,
      start: now,
    });
  });

  test("blocks the attempt after the limit, including a count stored in blobs", async () => {
    const memory = new Map<string, RateBucket>();
    const remote = new Map<string, RateBucket>();
    const rate = {
      async getBucket(key: string) {
        return remote.get(key) ?? null;
      },
      async setBucket(key: string, bucket: RateBucket) {
        remote.set(key, bucket);
      },
    };
    const now = 5_000_000;
    for (let i = 0; i < REDEEM_RATE_LIMIT; i += 1) {
      expect(
        await consumeRedeemAttempt({ ip: "203.0.113.8", now, memory, remote: rate }),
      ).toBe(true);
    }
    expect(await consumeRedeemAttempt({ ip: "203.0.113.8", now, memory, remote: rate })).toBe(
      false,
    );
    const freshMemory = new Map<string, RateBucket>();
    expect(
      await consumeRedeemAttempt({ ip: "203.0.113.8", now, memory: freshMemory, remote: rate }),
    ).toBe(false);
    expect(
      await consumeRedeemAttempt({
        ip: "203.0.113.8",
        now: now + REDEEM_RATE_WINDOW_MS,
        memory: freshMemory,
        remote: rate,
      }),
    ).toBe(true);
  });
});
