import type { ReactNode } from "react";
import Image from "next/image";
import { siClaude, siGithub, siGooglegemini, siOllama } from "simple-icons";
import { IntrayMark } from "../Brand";
import { GITHUB_URL } from "./site";

const mailProviders = [
  { src: "/logos/gmail.png", name: "Gmail" },
  { src: "/logos/outlook.png", name: "Outlook" },
  { src: "/logos/icloud.png", name: "iCloud" },
  { src: "/logos/yahoo.png", name: "Yahoo" },
  { src: "/logos/fastmail.png", name: "Fastmail" },
] as const;

const aiProviders = [
  {
    name: "Claude",
    color: `#${siClaude.hex}`,
    path: siClaude.path,
  },
  {
    name: "OpenAI",
    color: "#10a37f",
    path: "M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.774-4.28 5.989 5.989 0 0 0 3.992-2.9 6.056 6.056 0 0 0-.747-7.099zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.844-3.375L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.409-.672zm2.01-3.023-.141-.085-4.784-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z",
  },
  {
    name: "Grok",
    color: "#ffffff",
    path: "M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.2 6.7 3.72v.01L12 11.7 5.3 7.93 12 4.2zm-7 5.3 6.2 3.45v6.9L5 16.35V9.5zm8.2 10.35v-6.9L19 9.5v6.85l-5.8 3.3z",
  },
  {
    name: "Gemini",
    color: `#${siGooglegemini.hex}`,
    path: siGooglegemini.path,
  },
  {
    name: "Ollama",
    color: "#ededed",
    path: siOllama.path,
  },
] as const;

function GithubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg role="img" viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <title>{siGithub.title}</title>
      <path d={siGithub.path} fill="currentColor" />
    </svg>
  );
}

function WindowsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M0 2.2 7.2 1.2v6.4H0zm8  -.9L16 0v7.6H8zM0 8.8h7.2V15.2L0 14.2zm8 .1H16V16l-8-1.1z" />
    </svg>
  );
}

function ProviderTile({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#17171b] transition-colors duration-300 hover:bg-[#202025] md:h-10 md:w-10"
    >
      {children}
    </span>
  );
}

function AiTiles() {
  return (
    <>
      {aiProviders.map((ai) => (
        <ProviderTile key={ai.name} label={ai.name}>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: ai.color }}
            className="h-5 w-5 md:h-[22px] md:w-[22px]"
            aria-hidden
          >
            <path d={ai.path} />
          </svg>
        </ProviderTile>
      ))}
    </>
  );
}

function MailTiles() {
  return (
    <>
      {mailProviders.map((p) => (
        <ProviderTile key={p.name} label={p.name}>
          <Image
            src={p.src}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 object-contain md:h-7 md:w-7"
            unoptimized
          />
        </ProviderTile>
      ))}
    </>
  );
}

/** Brand hub — one maroon app tile between the two provider stacks. */
function IntrayHub() {
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-[#760E0A] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_18px_44px_-16px_rgba(196,69,61,0.65)]">
      <IntrayMark size={25} />
    </span>
  );
}

/**
 * Compact provider rail — AI on the left, inboxes on the right, Intray landing
 * in the middle. Built from equal-width halves so it stays perfectly mirrored.
 */
function ProviderRail() {
  return (
    <div
      className="brand-rise brand-rise-delay-2 relative z-10 mt-6 w-full max-w-3xl sm:mt-7"
      aria-hidden
    >
      <div className="hidden items-center gap-3 sm:flex md:gap-4">
        <div className="flex shrink-0 items-center gap-1.5">
          <AiTiles />
        </div>
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20"
        />
        <IntrayHub />
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <MailTiles />
        </div>
      </div>

      <div className="flex flex-col items-center sm:hidden">
        <div className="flex items-center gap-1.5">
          <AiTiles />
        </div>
        <span aria-hidden className="h-5 w-px bg-gradient-to-b from-transparent to-white/20" />
        <IntrayHub />
        <span aria-hidden className="h-5 w-px bg-gradient-to-b from-white/20 to-transparent" />
        <div className="flex items-center gap-1.5">
          <MailTiles />
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-black pb-0 pt-6 md:pt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px]"
        style={{
          background:
            "radial-gradient(58% 52% at 50% 0%, rgba(118,14,10,0.22), transparent 74%)",
        }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 pt-4 text-center md:pt-6">
        <p className="brand-rise text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c8f04a]/80 md:text-xs">
          Intray · Easy for Email
        </p>

        <h1 className="brand-rise brand-rise-delay-1 mt-3 max-w-[16ch] font-display text-[clamp(2.4rem,6.5vw,4.2rem)] uppercase leading-[0.92] tracking-[0.01em] text-white">
          Email built for the AI age
        </h1>

        <ProviderRail />

        <p className="brand-rise brand-rise-delay-2 relative z-10 mt-6 max-w-lg text-sm leading-relaxed text-[#9ca3af] md:text-base">
          Your AI subscriptions meet every inbox in one open-source Windows app — Superhuman speed,
          no mail relay.
        </p>

        <div
          id="download"
          className="brand-rise brand-rise-delay-3 relative z-10 mt-7 flex flex-col items-center gap-3"
        >
          <a
            href="#pricing"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#760E0A] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-18px_rgba(118,14,10,0.7)] transition hover:brightness-110"
          >
            <WindowsIcon />
            Download for Windows
          </a>
          <a
            href={GITHUB_URL}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#9ca3af] transition hover:text-white"
          >
            <GithubIcon />
            Steal our code (legally)
            <span aria-hidden>↗</span>
          </a>
        </div>

        <div className="brand-rise brand-rise-delay-4 relative z-10 mt-9 w-full max-w-5xl md:mt-11">
          <div className="overflow-hidden rounded-t-2xl border border-b-0 border-white/10 bg-[#121214] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <Image
              src="/mockups/intray-hero.png"
              alt="Intray unified inbox — compose, triage, and read mail in one Windows app"
              width={1600}
              height={1000}
              priority
              unoptimized
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
