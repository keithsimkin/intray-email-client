"use client";

import { useState } from "react";
import type { SupportPlan } from "@/lib/dodo";

async function startCheckout(plan: SupportPlan) {
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    checkout_url?: string;
    error?: string;
  };

  if (!response.ok || !data.checkout_url) {
    throw new Error(data.error || "Failed to start checkout");
  }

  window.location.assign(data.checkout_url);
}

export function SupportCheckoutCards({ className = "mt-7" }: { className?: string }) {
  const [loading, setLoading] = useState<SupportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCheckout = async (plan: SupportPlan) => {
    try {
      setError(null);
      setLoading(plan);
      await startCheckout(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(null);
    }
  };

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void onCheckout("monthly")}
          disabled={loading !== null}
          className="group flex flex-col rounded-2xl border border-white/10 bg-[#1a1a1e] px-4 py-4 text-left transition hover:border-white/25 disabled:cursor-wait disabled:opacity-70"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
            Monthly
          </span>
          <span className="mt-1 font-display text-3xl tracking-wide text-white">
            $10<span className="text-lg text-[#8a8f98]">/mo</span>
          </span>
          <span className="mt-2 text-sm leading-snug text-[#9ca3af]">
            Full access while subscribed. Cancel anytime.
          </span>
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#760E0A] px-3.5 py-2 text-sm font-semibold text-white transition group-hover:brightness-110">
            {loading === "monthly" ? "Opening checkout…" : "Start monthly"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void onCheckout("once")}
          disabled={loading !== null}
          className="group flex flex-col rounded-2xl border border-white/10 bg-[#1a1a1e] px-4 py-4 text-left transition hover:border-white/25 disabled:cursor-wait disabled:opacity-70"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
            Lifetime license
          </span>
          <span className="mt-1 font-display text-3xl tracking-wide text-white">$75</span>
          <span className="mt-2 text-sm leading-snug text-[#9ca3af]">
            Pay once. Keep Intray for good — no subscription.
          </span>
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-transparent px-3.5 py-2 text-sm font-semibold text-white transition group-hover:border-white/35">
            {loading === "once" ? "Opening checkout…" : "Buy lifetime"}
          </span>
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-[#f87171]">{error}</p> : null}
    </div>
  );
}

export function SupportCheckoutButton({
  plan = "monthly",
  className,
  children,
}: {
  plan?: SupportPlan;
  className?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void startCheckout(plan).catch(() => setLoading(false));
      }}
    >
      {loading ? "Opening…" : children}
    </button>
  );
}
