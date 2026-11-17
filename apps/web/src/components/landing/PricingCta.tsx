import { ArrowUpRight, Heart, ShieldCheck } from "lucide-react";
import { siGithub } from "simple-icons";
import { AppWindow } from "./AppWindow";
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
  return null;
}

export function BottomCta() {
  return (
    <section id="pricing" className="landing-light px-5 pb-8 pt-2 md:pb-12">
      <div
        id="open-source"
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] px-6 pb-0 pt-10 md:px-12 md:pt-14"
        style={{
          background: "linear-gradient(145deg, #e8f0f8 0%, #eaf3f0 52%, #eef6e6 100%)",
        }}
      >
        <div className="grid items-end gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="pb-12 md:pb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#3a5a4a]">
              <ShieldCheck size={14} strokeWidth={2.2} />
              Open source · security first
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-[#111]">
                Email is too important to trust a black box
              </h2>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#111] text-white">
                <ArrowUpRight size={16} strokeWidth={2.2} />
              </span>
            </div>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-[#4a5b52] md:text-[15px]">
              That&apos;s why Intray is open source — audit the code, verify there&apos;s no mail
              relay, and run it on your machine. Use it free. If it earns a place in your tray,
              support the project so we can keep shipping.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <a
                href="#download"
                className="group flex flex-col rounded-2xl border border-[#111]/10 bg-white/85 px-4 py-4 transition hover:border-[#111]/25"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                  Monthly
                </span>
                <span className="mt-1 font-display text-3xl tracking-wide text-[#111]">
                  $10<span className="text-lg text-[#6b7280]">/mo</span>
                </span>
                <span className="mt-2 text-sm leading-snug text-[#4a5b52]">
                  Ongoing support for builds, fixes, and local AI work.
                </span>
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#c8f04a] px-3.5 py-2 text-sm font-semibold text-[#111] transition group-hover:brightness-105">
                  Support monthly
                </span>
              </a>

              <a
                href="#download"
                className="group flex flex-col rounded-2xl border border-[#111]/10 bg-white/85 px-4 py-4 transition hover:border-[#111]/25"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                  One-time
                </span>
                <span className="mt-1 inline-flex items-center gap-2 font-display text-3xl tracking-wide text-[#111]">
                  Give once
                  <Heart size={18} strokeWidth={2.2} className="text-[#760e0a]" />
                </span>
                <span className="mt-2 text-sm leading-snug text-[#4a5b52]">
                  A one-time gift when a subscription isn&apos;t your style.
                </span>
                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#111]/15 bg-white px-3.5 py-2 text-sm font-semibold text-[#111] transition group-hover:border-[#111]/35">
                  Give once
                </span>
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={GITHUB_URL}
                className="inline-flex items-center gap-2.5 rounded-full border border-[#111]/12 bg-white/80 px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:border-[#111]/3"
              >
                <SimpleIcon icon={siGithub} size={17} />
                Star us on GitHub
              </a>
            </div>
            <p className="mt-4 text-xs text-[#6b7280]">
              Windows 10/11 · Electron · open source · no mail relay
            </p>
          </div>

          <div className="relative min-w-0 lg:translate-y-8">
            <AppWindow
              alt="Intray unified inbox on Windows"
              className="rounded-t-2xl rounded-b-none border-b-0 shadow-none"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
