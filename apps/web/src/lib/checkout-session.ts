import type { SupportPlan } from "./dodo";

/** Dodo discount codes are short tokens. Anything else is ignored. */
const DISCOUNT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const DISCOUNT_CODE_STORAGE_KEY = "intray.discount-code";

export function normalizeDiscountCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  if (!DISCOUNT_CODE_RE.test(code)) return null;
  return code;
}

/**
 * Checkout session body for Dodo. The discount field is enabled on every
 * plan. A code from the request is attached only to the monthly plan, via
 * `discount_codes` (the current field; singular `discount_code` is deprecated
 * and cannot be sent in the same request).
 */
export function checkoutSessionPayload(input: {
  plan: SupportPlan;
  productId: string;
  returnUrl?: string | null;
  discountCode?: unknown;
}): {
  product_cart: { product_id: string; quantity: number }[];
  return_url?: string;
  feature_flags: { allow_discount_code: true };
  discount_codes?: string[];
} {
  const payload: {
    product_cart: { product_id: string; quantity: number }[];
    return_url?: string;
    feature_flags: { allow_discount_code: true };
    discount_codes?: string[];
  } = {
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    feature_flags: { allow_discount_code: true },
  };
  const returnUrl = input.returnUrl?.trim();
  if (returnUrl) payload.return_url = returnUrl;
  if (input.plan === "monthly") {
    const code = normalizeDiscountCode(input.discountCode);
    if (code) payload.discount_codes = [code];
  }
  return payload;
}
