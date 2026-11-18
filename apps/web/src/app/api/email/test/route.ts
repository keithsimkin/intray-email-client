import { NextResponse } from "next/server";
import { sendSupportThankYou } from "@/lib/resend";

/**
 * Dev/admin smoke test for Resend.
 * POST { "to": "you@example.com", "kind": "payment" | "subscription" }
 * Disabled in production unless EMAIL_TEST_SECRET matches ?secret=
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.EMAIL_TEST_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!secret || url.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  let body: { to?: string; kind?: "payment" | "subscription"; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const to = body.to?.trim();
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: 'Expected "to" email' }, { status: 400 });
  }

  const kind = body.kind === "subscription" ? "subscription" : "payment";
  const result = await sendSupportThankYou({
    to,
    name: body.name ?? "Friend",
    kind,
    eventId: `test-${kind}-${Date.now()}`,
    amountCents: kind === "subscription" ? 1000 : 2500,
    currency: "USD",
  });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result });
}
