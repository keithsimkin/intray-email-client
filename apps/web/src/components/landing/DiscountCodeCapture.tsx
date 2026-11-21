"use client";

import { useEffect } from "react";
import {
  DISCOUNT_CODE_STORAGE_KEY,
  normalizeDiscountCode,
} from "@/lib/checkout-session";

/** Remember `?code=` so a later monthly checkout can prefill it. */
export function DiscountCodeCapture() {
  useEffect(() => {
    const code = normalizeDiscountCode(
      new URLSearchParams(window.location.search).get("code"),
    );
    if (!code) return;
    try {
      sessionStorage.setItem(DISCOUNT_CODE_STORAGE_KEY, code);
    } catch {
      /* private mode */
    }
  }, []);
  return null;
}

export function readPersistedDiscountCode(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = normalizeDiscountCode(
    new URLSearchParams(window.location.search).get("code"),
  );
  if (fromUrl) {
    try {
      sessionStorage.setItem(DISCOUNT_CODE_STORAGE_KEY, fromUrl);
    } catch {
      /* private mode */
    }
    return fromUrl;
  }
  try {
    return normalizeDiscountCode(sessionStorage.getItem(DISCOUNT_CODE_STORAGE_KEY));
  } catch {
    return null;
  }
}
