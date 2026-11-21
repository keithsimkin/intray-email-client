import { createHash } from "node:crypto";

export const REDEEM_RATE_LIMIT = 10;
export const REDEEM_RATE_WINDOW_MS = 10 * 60 * 1000;

export type RateBucket = {
  count: number;
  start: number;
};

export type RateStore = {
  getBucket(key: string): Promise<RateBucket | null>;
  setBucket(key: string, bucket: RateBucket): Promise<void>;
};

export function redeemRateKey(ip: string): string {
  const digest = createHash("sha256").update(ip, "utf8").digest("hex");
  return `rate/${digest}`;
}

export function mergeAndIncrement(
  local: RateBucket | null,
  remote: RateBucket | null,
  now: number,
  windowMs = REDEEM_RATE_WINDOW_MS,
): RateBucket {
  const live = [local, remote].filter(
    (bucket): bucket is RateBucket =>
      !!bucket && Number.isFinite(bucket.count) && Number.isFinite(bucket.start) && now - bucket.start < windowMs,
  );
  if (live.length === 0) return { count: 1, start: now };
  return {
    start: Math.min(...live.map((bucket) => bucket.start)),
    count: Math.max(...live.map((bucket) => bucket.count)) + 1,
  };
}

/**
 * Best-effort per-IP limit. Memory covers this instance. The optional blob
 * store shares the count across instances when it is reachable.
 */
export async function consumeRedeemAttempt(opts: {
  ip: string;
  now: number;
  memory: Map<string, RateBucket>;
  remote?: RateStore;
  limit?: number;
}): Promise<boolean> {
  const limit = opts.limit ?? REDEEM_RATE_LIMIT;
  if (opts.memory.size > 5000) opts.memory.clear();
  const key = redeemRateKey(opts.ip);
  let remoteBucket: RateBucket | null = null;
  if (opts.remote) {
    try {
      remoteBucket = await opts.remote.getBucket(key);
    } catch {
      remoteBucket = null;
    }
  }
  const next = mergeAndIncrement(opts.memory.get(key) ?? null, remoteBucket, opts.now);
  opts.memory.set(key, next);
  if (opts.remote) {
    try {
      await opts.remote.setBucket(key, next);
    } catch {
      /* The in-memory bucket still applies on this instance. */
    }
  }
  return next.count <= limit;
}
