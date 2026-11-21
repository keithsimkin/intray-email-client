import { Checkout } from "@dodopayments/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { checkoutSessionPayload } from "@/lib/checkout-session";
import { dodoEnvironment, productIdForPlan, type SupportPlan } from "@/lib/dodo";

const sessionCheckout = Checkout({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  returnUrl: process.env.DODO_PAYMENTS_RETURN_URL,
  environment: dodoEnvironment(),
  type: "session",
});

export const GET = Checkout({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  returnUrl: process.env.DODO_PAYMENTS_RETURN_URL,
  environment: dodoEnvironment(),
  type: "static",
});

function isSupportPlan(value: unknown): value is SupportPlan {
  return value === "monthly" || value === "once";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = body.plan;
  if (!isSupportPlan(plan)) {
    return NextResponse.json(
      { error: 'Expected plan to be "monthly" or "once"' },
      { status: 400 },
    );
  }

  const productId = productIdForPlan(plan);
  if (!productId) {
    return NextResponse.json(
      { error: `Missing product id for plan "${plan}"` },
      { status: 500 },
    );
  }

  if (!process.env.DODO_PAYMENTS_API_KEY) {
    return NextResponse.json(
      { error: "Dodo Payments is not configured" },
      { status: 500 },
    );
  }

  const rawDiscount =
    "discount_code" in body ? body.discount_code : req.nextUrl.searchParams.get("code");
  const checkoutReq = new NextRequest(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      checkoutSessionPayload({
        plan,
        productId,
        returnUrl: process.env.DODO_PAYMENTS_RETURN_URL,
        discountCode: rawDiscount,
      }),
    ),
  });

  return sessionCheckout(checkoutReq);
}
