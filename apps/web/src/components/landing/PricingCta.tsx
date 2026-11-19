import Image from "next/image";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { siGithub } from "simple-icons";
import { SupportCheckoutCards } from "./SupportCheckout";
import { GITHUB_URL } from "./site";

function SimpleIcon({
  icon,
  size = 16,
  className = "",
}: {
  icon: { path: string; title: string };
  size?: number;
  className?: string;
}) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <title>{icon.title}</title>
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="landing-light scroll-mt-24 px-5 py-14 md:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-[1.75rem] border border-white/10 bg-[#121214] px-6 py-10 md:px-12 md:py-14 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c8f04a]">
            Pricing
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
            Free to download
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9ca3af] md:text-[15px]">
            There is no mail plan and no paid tier. Use Intray free. If it earns a place in
            your tray, $10 a month or a one-time gift keeps the builds shipping.
          </p>
          <p className="mt-6 text-xs text-[#8a8f98]">
            Windows 10/11 · macOS Apple Silicon (untested) · no subscription required
          </p>
        </div>
        <SupportCheckoutCards className="mt-0" />
      </div>
    </section>
  );
}

export function OpenSource() {
  return (
    <section id="open-source" className="landing-light scroll-mt-24 px-5 pb-8 pt-2 md:pb-12">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#121214] pt-10 md:pt-14">
        <div className="grid items-stretch gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="px-6 pb-12 md:px-12 md:pb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c8f04a]">
              <ShieldCheck size={14} strokeWidth={2.2} />
              Open source · security first
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
                Email is too important to trust a black box
              </h2>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c8f04a] text-[#111]">
                <ArrowUpRight size={16} strokeWidth={2.2} />
              </span>
            </div>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9ca3af] md:text-[15px]">
              That&apos;s why Intray is open source — audit the code, verify there&apos;s no mail
              relay, and run it on your machine.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={GITHUB_URL}
                className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/35"
              >
                <SimpleIcon icon={siGithub} size={17} />
                Star us on GitHub
              </a>
            </div>
            <p className="mt-4 text-xs text-[#8a8f98]">
              Windows 10/11 · macOS Apple Silicon (untested) · Electron · open source · no mail relay
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
