import { connection, NextResponse } from "next/server";
import { openAppSumoBlobs } from "@/lib/appsumo-store";
import { sendAppSumoLicense } from "@/lib/resend";
import { consumeRedeemAttempt } from "@/lib/redeem-rate";
import type { RateBucket, RateStore } from "@/lib/redeem-rate";
import {
  RedeemError,
  redeemAppSumoCode,
  redeemStatus,
  type ClaimStore,
} from "@/lib/redeem";

const attempts = new Map<string, RateBucket>();
let loggedBlobsFailure = false;

function clientIp(req: Request): string {
  const netlify = req.headers.get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify.slice(0, 128);
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return "local";
}

function json(body: unknown, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Netlify-CDN-Cache-Control", "no-store");
  return response;
}

function isBlobsUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  return (
    name === "MissingBlobsEnvironmentError" ||
    name === "BlobsConsistencyError" ||
    name === "BlobsInternalError"
  );
}

export async function POST(req: Request) {
  await connection();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const record = body as { code?: unknown; email?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const email = typeof record.email === "string" ? record.email : "";

  let claims: ClaimStore;
  let rates: RateStore | undefined;
  try {
    const blobs = openAppSumoBlobs();
    claims = blobs.claims;
    rates = blobs.rates;
  } catch (error) {
    if (!loggedBlobsFailure) {
      loggedBlobsFailure = true;
      console.error("[redeem] blobs unavailable", error instanceof Error ? error.name : "error");
    }
    const unavailable = () => {
      throw new Error("blobs-unavailable");
    };
    claims = { get: unavailable, setIfAbsent: unavailable };
  }

  const allowed = await consumeRedeemAttempt({
    ip: clientIp(req),
    now: Date.now(),
    memory: attempts,
    remote: rates,
  });
  if (!allowed) {
    return json({ error: "Too many attempts. Wait a few minutes and try again." }, 429);
  }

  try {
    const result = await redeemAppSumoCode({
      code,
      email,
      store: claims,
      privateKeyPem: process.env.LICENSE_PRIVATE_KEY,
    });
    const sent = await sendAppSumoLicense({
      to: result.email,
      license: result.license,
      licenseId: result.licenseId,
    });
    const emailed = "data" in sent && Boolean(sent.data);
    return json({ ...result, emailed }, 200);
  } catch (error) {
    if (error instanceof RedeemError) {
      return json({ error: error.message }, redeemStatus(error.code));
    }
    if (isBlobsUnavailable(error)) {
      return json(
        { error: "Redemption is temporarily unavailable. Please try again soon." },
        503,
      );
    }
    console.error("[redeem] failed", error instanceof Error ? error.name : "error");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
