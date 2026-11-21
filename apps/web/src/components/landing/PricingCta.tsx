import Image from "next/image";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { OsDownload } from "./platform";
import { SupportCheckoutCards } from "./SupportCheckout";

export function Pricing() {
  return (
    <section id="pricing" className="landing-light scroll-mt-24 px-5 py-14 md:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-[1.75rem] border border-white/10 bg-[#121214] px-6 py-10 md:px-12 md:py-14 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c8f04a]">
            Pricing
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
            Simple pricing.
            <br />
            Pick your plan.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9ca3af] md:text-[15px]">
            Subscribe for $10 a month, or buy a lifetime license for $75. One desktop app for
            every inbox — no seat tax, no mail relay.
          </p>
          <p className="mt-6 text-xs text-[#8a8f98]">
            Windows 10/11 · macOS Apple Silicon
          </p>
        </div>
        <SupportCheckoutCards className="mt-0" />
      </div>
    </section>
  );
}

export function Security() {
  return (
    <section id="security" className="landing-light scroll-mt-24 px-5 pb-8 pt-2 md:pb-12">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#121214] pt-10 md:pt-14">
        <div className="grid items-stretch gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="px-6 pb-12 md:px-12 md:pb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c8f04a]">
              <ShieldCheck size={14} strokeWidth={2.2} />
              Private by design
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
                Your mail stays on your machine
              </h2>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c8f04a] text-[#111]">
                <ArrowUpRight size={16} strokeWidth={2.2} />
              </span>
            </div>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9ca3af] md:text-[15px]">
              Intray connects straight to your providers over TLS. There is no Intray mail
              server in the middle — and AI talks only to the model you choose.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <OsDownload labeled />
            </div>
            <p className="mt-4 text-xs text-[#8a8f98]">
              Windows 10/11 · macOS Apple Silicon · no mail relay
            </p>
          </div>

          <div className="relative min-h-[280px] min-w-0 self-stretch lg:min-h-full">
            <div className="relative h-full min-h-[280px] overflow-hidden rounded-tl-2xl border-l border-t border-white/10 lg:absolute lg:inset-0 lg:rounded-tl-2xl lg:rounded-br-[1.7rem]">
              <Image
                src="/mockups/intray-hero.png"
                alt="Intray unified inbox on Windows"
                fill
                unoptimized
                className="object-cover object-left-top"
                sizes="(max-width: 1024px) 100vw, 55vw"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
