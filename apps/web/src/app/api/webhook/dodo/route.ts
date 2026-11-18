import { Webhooks } from "@dodopayments/nextjs";
import type { NextRequest } from "next/server";
import { sendSupportThankYou } from "@/lib/resend";

type DodoCustomer = {
  email?: string | null;
  name?: string | null;
};

type DodoEventData = {
  payment_id?: string;
  subscription_id?: string;
  customer_id?: string;
  status?: string;
  product_id?: string;
  total_amount?: number;
  currency?: string;
  customer?: DodoCustomer | null;
};

function logEvent(kind: string, payload: { type?: string; data?: DodoEventData }) {
  const data = payload.data ?? {};
  console.log("[dodo webhook]", kind, {
    type: payload.type,
    payment_id: data.payment_id,
    subscription_id: data.subscription_id,
    customer_id: data.customer_id,
    status: data.status,
    product_id: data.product_id,
  });
}

async function thankSupporter(
  kind: "payment" | "subscription",
  data: DodoEventData,
  eventId: string,
) {
  const email = data.customer?.email?.trim();
  if (!email) {
    console.warn("[dodo webhook] missing customer email; skipping thank-you", { kind, eventId });
    return;
  }

  await sendSupportThankYou({
    to: email,
    name: data.customer?.name,
    kind,
    eventId,
    amountCents: data.total_amount,
    currency: data.currency,
  });
}

function createWebhookHandler() {
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  if (!webhookKey) {
    return async () =>
      Response.json(
        { error: "DODO_PAYMENTS_WEBHOOK_KEY is not configured" },
        { status: 503 },
      );
  }

  return Webhooks({
    webhookKey,
    onPayload: async (payload) => {
      logEvent("payload", payload as { type?: string; data?: DodoEventData });
    },
    onPaymentSucceeded: async (payload) => {
      const data = (payload.data ?? {}) as DodoEventData;
      logEvent("payment.succeeded", payload as { type?: string; data?: DodoEventData });
      // Subscriptions also emit payment.succeeded; thank them on subscription.active instead.
      if (data.subscription_id) return;
      const eventId = data.payment_id || `payment-${Date.now()}`;
      await thankSupporter("payment", data, eventId);
    },
    onPaymentFailed: async (payload) => {
      logEvent("payment.failed", payload as { type?: string; data?: DodoEventData });
    },
    onSubscriptionActive: async (payload) => {
      const data = (payload.data ?? {}) as DodoEventData;
      logEvent("subscription.active", payload as { type?: string; data?: DodoEventData });
      const eventId = data.subscription_id || `subscription-${Date.now()}`;
      await thankSupporter("subscription", data, eventId);
    },
    onSubscriptionRenewed: async (payload) => {
      logEvent("subscription.renewed", payload as { type?: string; data?: DodoEventData });
    },
    onSubscriptionCancelled: async (payload) => {
      logEvent("subscription.cancelled", payload as { type?: string; data?: DodoEventData });
    },
    onSubscriptionExpired: async (payload) => {
      logEvent("subscription.expired", payload as { type?: string; data?: DodoEventData });
    },
    onSubscriptionOnHold: async (payload) => {
      logEvent("subscription.on_hold", payload as { type?: string; data?: DodoEventData });
    },
    onSubscriptionFailed: async (payload) => {
      logEvent("subscription.failed", payload as { type?: string; data?: DodoEventData });
    },
    onRefundSucceeded: async (payload) => {
      logEvent("refund.succeeded", payload as { type?: string; data?: DodoEventData });
    },
  });
}

export async function POST(req: NextRequest) {
  return createWebhookHandler()(req);
}
