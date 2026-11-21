import { describe, expect, test } from "bun:test";
import { checkoutSessionPayload } from "../src/lib/checkout-session";

const base = {
  productId: "pdt_monthly",
  returnUrl: "https://intray.site/thanks",
};

describe("checkout session discount", () => {
  test("monthly checkout enables the discount field and prefills a code", () => {
    expect(
      checkoutSessionPayload({
        ...base,
        plan: "monthly",
        discountCode: "  SAASFRIDAY25  ",
      }),
    ).toEqual({
      product_cart: [{ product_id: "pdt_monthly", quantity: 1 }],
      return_url: "https://intray.site/thanks",
      feature_flags: { allow_discount_code: true },
      discount_codes: ["SAASFRIDAY25"],
    });
  });

  test("monthly checkout omits a missing or unusable code", () => {
    const none = checkoutSessionPayload({ ...base, plan: "monthly" });
    expect(none.discount_codes).toBeUndefined();
    expect(none.feature_flags.allow_discount_code).toBe(true);
    const junk = checkoutSessionPayload({
      ...base,
      plan: "monthly",
      discountCode: "not a code",
    });
    expect(junk.discount_codes).toBeUndefined();
  });

  test("lifetime checkout never attaches a discount code", () => {
    expect(
      checkoutSessionPayload({
        ...base,
        plan: "once",
        productId: "pdt_once",
        discountCode: "SAASFRIDAY25",
      }),
    ).toEqual({
      product_cart: [{ product_id: "pdt_once", quantity: 1 }],
      return_url: "https://intray.site/thanks",
      feature_flags: { allow_discount_code: true },
    });
  });
});
