import Image from "next/image";
import { ArrowUpRight, Heart, ShieldCheck } from "lucide-react";
import { siGithub } from "simple-icons";
import { GITHUB_URL, SUPPORT_MONTHLY_URL, SUPPORT_ONCE_URL } from "./site";

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
  return null;
}

export function BottomCta() {
  return (
    <section id="pricing" className="landing-light px-5 pb-8 pt-2 md:pb-12">
      <div
        id="open-source"
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#121214] pt-10 md:pt-14"
      >
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
              relay, and run it on your machine. Use it free. If it earns a place in your tray,
              support the project so we can keep shipping.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <a
                href={SUPPORT_MONTHLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-2xl border border-white/10 bg-[#1a1a1e] px-4 py-4 transition hover:border-white/25"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
                  Monthly
                </span>
                <span className="mt-1 font-display text-3xl tracking-wide text-white">
                  $10<span className="text-lg text-[#8a8f98]">/mo</span>
                </span>
                <span className="mt-2 text-sm leading-snug text-[#9ca3af]">
                  Ongoing support for builds, fixes, and local AI work.
                </span>
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#760E0A] px-3.5 py-2 text-sm font-semibold text-white transition group-hover:brightness-110">
                  Support monthly
                </span>
              </a>

              <a
                href={SUPPORT_ONCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-2xl border border-white/10 bg-[#1a1a1e] px-4 py-4 transition hover:border-white/25"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8f98]">
                  One-time
                </span>
                <span className="mt-1 inline-flex items-center gap-2 font-display text-3xl tracking-wide text-white">
                  Give once
                  <Heart size={18} strokeWidth={2.2} className="text-[#c4453d]" />
                </span>
                <span className="mt-2 text-sm leading-snug text-[#9ca3af]">
                  A one-time gift when a subscription isn&apos;t your style.
                </span>
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-transparent px-3.5 py-2 text-sm font-semibold text-white transition group-hover:border-white/35">
                  Give once
                </span>
              </a>
            </div>

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
              Windows 10/11 · Electron · open source · no mail relay
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
