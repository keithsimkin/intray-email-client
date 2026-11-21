import { getStore } from "@netlify/blobs";
import { asClaimRecord, type ClaimRecord, type ClaimStore } from "./redeem";
import { type RateBucket, type RateStore } from "./redeem-rate";

export const APPSUMO_STORE = "appsumo-redemptions";

export type BlobsLike = {
  get(key: string, options: { type: "json"; consistency?: "strong" }): Promise<unknown>;
  setJSON(
    key: string,
    data: unknown,
    options?: { onlyIfNew?: boolean },
  ): Promise<{ modified: boolean }>;
};

function isRateBucket(value: unknown): value is RateBucket {
  if (!value || typeof value !== "object") return false;
  const bucket = value as RateBucket;
  return (
    typeof bucket.count === "number" &&
    Number.isFinite(bucket.count) &&
    typeof bucket.start === "number" &&
    Number.isFinite(bucket.start)
  );
}

export function claimStoreFromBlobs(store: BlobsLike): ClaimStore {
  return {
    async get(key: string): Promise<ClaimRecord | null> {
      const value = await store.get(key, { type: "json", consistency: "strong" });
      return asClaimRecord(value);
    },
    async setIfAbsent(key: string, value: ClaimRecord): Promise<boolean> {
      const result = await store.setJSON(key, value, { onlyIfNew: true });
      return result.modified;
    },
  };
}

export function rateStoreFromBlobs(store: BlobsLike): RateStore {
  return {
    async getBucket(key: string): Promise<RateBucket | null> {
      const value = await store.get(key, { type: "json", consistency: "strong" });
      return isRateBucket(value) ? value : null;
    },
    async setBucket(key: string, bucket: RateBucket): Promise<void> {
      await store.setJSON(key, bucket);
    },
  };
}

export function openAppSumoBlobs(): { claims: ClaimStore; rates: RateStore } {
  const store = getStore({
    name: APPSUMO_STORE,
    consistency: "strong",
  }) as BlobsLike;
  return {
    claims: claimStoreFromBlobs(store),
    rates: rateStoreFromBlobs(store),
  };
}
