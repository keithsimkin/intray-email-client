import { Webhooks } from "@dodopayments/nextjs";

function logEvent(kind: string, payload: { type?: string; data?: Record<string, unknown> }) {
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

if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY) {
  console.warn("[dodo webhook] DODO_PAYMENTS_WEBHOOK_KEY is not set");
}

export const POST = Webhooks({
  webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY!,
  onPayload: async (payload) => {
    logEvent("payload", payload);
  },
  onPaymentSucceeded: async (payload) => {
    logEvent("payment.succeeded", payload);
  },
  onPaymentFailed: async (payload) => {
    logEvent("payment.failed", payload);
  },
  onSubscriptionActive: async (payload) => {
    logEvent("subscription.active", payload);
  },
  onSubscriptionRenewed: async (payload) => {
    logEvent("subscription.renewed", payload);
  },
  onSubscriptionCancelled: async (payload) => {
    logEvent("subscription.cancelled", payload);
  },
  onSubscriptionExpired: async (payload) => {
    logEvent("subscription.expired", payload);
  },
  onSubscriptionOnHold: async (payload) => {
    logEvent("subscription.on_hold", payload);
  },
  onSubscriptionFailed: async (payload) => {
    logEvent("subscription.failed", payload);
  },
  onRefundSucceeded: async (payload) => {
    logEvent("refund.succeeded", payload);
  },
});
