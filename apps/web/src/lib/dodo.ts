export type SupportPlan = "monthly" | "once";

export const SUPPORT_PLANS: Record<
  SupportPlan,
  { label: string; envKey: "DODO_PRODUCT_MONTHLY" | "DODO_PRODUCT_ONCE" }
> = {
  monthly: { label: "Monthly license · $10/mo", envKey: "DODO_PRODUCT_MONTHLY" },
  once: { label: "Lifetime license · $75", envKey: "DODO_PRODUCT_ONCE" },
};

export function productIdForPlan(plan: SupportPlan): string | null {
  const id = process.env[SUPPORT_PLANS[plan].envKey]?.trim();
  return id || null;
}

export function dodoEnvironment(): "test_mode" | "live_mode" {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode"
    ? "test_mode"
    : "live_mode";
}
