import type { ReactNode } from "react";
import Image from "next/image";
import { siClaude, siGooglegemini, siOllama } from "simple-icons";
import {
  DemoListPane,
  L,
  Squircle,
} from "./DemoInbox";

const AI_SUBS = [
  {
    name: "Claude",
    how: "API key",
    color: `#${siClaude.hex}`,
    path: siClaude.path,
  },
  {
    name: "OpenAI",
    how: "API key",
    color: "#10a37f",
    // OpenAI mark — simple-icons dropped the brand; keep a compact local path.
    path: "M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.774-4.28 5.989 5.989 0 0 0 3.992-2.9 6.056 6.056 0 0 0-.747-7.099zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.844-3.375L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.409-.672zm2.01-3.023-.141-.085-4.784-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z",
  },
  {
    name: "Grok",
    how: "CLI login",
    color: "#ffffff",
    path: "M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.2 6.7 3.72v.01L12 11.7 5.3 7.93 12 4.2zm-7 5.3 6.2 3.45v6.9L5 16.35V9.5zm8.2 10.35v-6.9L19 9.5v6.85l-5.8 3.3z",
  },
  {
    name: "Gemini",
    how: "API key",
    color: `#${siGooglegemini.hex}`,
    path: siGooglegemini.path,
  },
  {
    name: "Ollama",
    how: "Local",
    color: "#ededed",
    path: siOllama.path,
  },
  {
    name: "Cursor",
    how: "MCP / agents",
    color: "#ffffff",
    path: "M12 2 2 19.5h4.2L12 8.8l5.8 10.7H22L12 2zm0 8.4-2.7 5.1h5.4L12 10.4z",
  },
] as const;

type Feature = {
  title: string;
  body: string;
  span: string;
  visual: ReactNode;
};

const features: Feature[] = [
  {
    title: "One inbox for everything",
    body: "Gmail, Outlook, iCloud, and IMAP in a single tray — triage once, reply from the right account.",
    span: "lg:col-span-2",
    visual: <AllInboxesVisual />,
  },
  {
    title: "Keyboard-first speed",
    body: "Shortcuts, snooze, labels, undo send, and Important — fly through mail without reaching for the mouse.",
    span: "",
    visual: <ShortcutsVisual />,
  },
  {
    title: "Bring your own AI",
    body: "Use the subscription you already pay for — Claude, OpenAI, Grok, Gemini — or run local Ollama. Your keys, your models. No Intray AI tax.",
    span: "lg:col-span-2",
    visual: <AiProvidersVisual />,
  },
  {
    title: "MCP for your agents",
    body: "Connect Cursor and other MCP clients to search mail, read threads, and list accounts — on your machine, loopback only.",
    span: "",
    visual: <McpVisual />,
  },
  {
    title: "Every account you use",
    body: "Gmail, Outlook, iCloud, Yahoo, Fastmail, and any IMAP — OAuth or app password.",
    span: "lg:col-span-2",
    visual: <ProvidersVisual />,
  },
  {
    title: "No mail in the middle",
    body: "TLS straight to your providers. AI talks only to the model you pick — never through an Intray cloud.",
    span: "",
    visual: <PrivacyVisual />,
  },
];

export function UnifiedFeatures() {
  return (
    <section id="features" className="landing-light scroll-mt-24 px-5 pb-6 pt-14 md:pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-5 md:grid-cols-2 md:gap-10">
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
            Manage priorities,
            <br />
            not inboxes.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-[#9ca3af] md:pt-2 md:text-[15px]">
            Split the noise from what matters, move with the keyboard, and put AI to work with
            the local model or paid subscription you already have — plus MCP for Cursor and other
            agents.
          </p>
        </div>

        <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 lg:gap-4">
          {features.map((f) => (
            <article
              key={f.title}
              className={`group relative flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/10 sm:w-auto ${f.span}`}
              style={{ background: L.mutedSurface, color: L.fg }}
            >
              <div className="relative z-10 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
                <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed" style={{ color: L.muted }}>
                  {f.body}
                </p>
              </div>
              <div className="relative min-h-[220px] flex-1 overflow-hidden sm:min-h-[240px]">
                {f.visual}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AllInboxesVisual() {
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 top-2 right-0 -bottom-4 flex overflow-hidden rounded-tl-xl border max-sm:[mask-image:linear-gradient(to_bottom,black_60%,transparent_92%)] sm:left-6 sm:top-3"
        style={{
          borderColor: L.line,
          background: L.elevated,
          boxShadow: "0 18px 40px -28px rgba(0,0,0,0.55)",
        }}
      >
        <div className="w-[34%] border-r p-3" style={{ borderColor: L.line, background: L.mutedSurface }}>
          <p className="text-[11px] font-medium" style={{ color: L.muted }}>
            Accounts
          </p>
          {[
            ["Work · Gmail", "WK", "#7c3aed", "12"],
            ["Personal · Outlook", "PS", "#2563eb", "4"],
            ["Family · iCloud", "IC", "#0891b2", "2"],
          ].map(([label, ini, tone, n], i) => (
            <div
              key={label as string}
              className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 first:mt-3"
              style={{ background: i === 0 ? L.elevated : "transparent" }}
            >
              <Squircle initials={ini as string} tone={tone as string} size={24} />
              <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: L.fgDim }}>
                {label}
              </span>
              <span className="text-[10px]" style={{ color: L.muted }}>
                {n}
              </span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <DemoListPane />
        </div>
      </div>
    </div>
  );
}

function KeyCap({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex min-w-[1.55rem] items-center justify-center rounded-[7px] border px-1.5 py-1 font-mono text-[11px] font-semibold leading-none"
      style={{
        borderColor: "rgba(255,255,255,0.14)",
        background: "linear-gradient(180deg, #2a2a30 0%, #1c1c21 100%)",
        color: L.fg,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(0,0,0,0.35)",
      }}
    >
      {children}
    </span>
  );
}

function ShortcutsVisual() {
  const rows = [
    { keys: ["J", "K"], label: "Next / previous" },
    { keys: ["E"], label: "Archive" },
    { keys: ["H"], label: "Snooze" },
    { keys: ["R"], label: "Reply" },
    { keys: ["C"], label: "Compose" },
    { keys: ["Z"], label: "Undo" },
  ] as const;

  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 top-2 right-0 -bottom-4 overflow-hidden rounded-tl-xl border p-4 sm:left-6 sm:top-3 sm:p-5"
        style={{
          borderColor: L.line,
          background: L.elevated,
          boxShadow: "0 18px 40px -28px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: L.muted }}>
            Shortcuts
          </p>
          <p className="text-[11px]" style={{ color: L.muted }}>
            Superhuman pack
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-xl border px-2.5 py-2"
              style={{ borderColor: L.line, background: L.mutedSurface }}
            >
              <span className="flex items-center gap-1">
                {row.keys.map((key) => (
                  <KeyCap key={key}>{key}</KeyCap>
                ))}
              </span>
              <span className="text-[12px] font-medium" style={{ color: L.fgDim }}>
                {row.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AiProvidersVisual() {
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 top-2 right-0 -bottom-4 overflow-hidden rounded-tl-xl border p-4 sm:left-6 sm:top-3 sm:p-5"
        style={{
          borderColor: L.line,
          background: L.elevated,
          boxShadow: "0 18px 40px -28px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: L.muted }}>
            Supported AI
          </p>
          <p className="text-[11px]" style={{ color: L.muted }}>
            Your keys · your sub
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AI_SUBS.map((ai) => (
            <div
              key={ai.name}
              className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2"
              style={{ borderColor: L.line, background: L.mutedSurface }}
            >
              <span
                className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
                style={{ background: L.elevated, color: ai.color }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d={ai.path} />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold" style={{ color: L.fg }}>
                  {ai.name}
                </p>
                <p className="truncate text-[10px]" style={{ color: L.muted }}>
                  {ai.how}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProvidersVisual() {
  const providers = [
    { name: "Gmail", logo: "/logos/gmail.png", how: "OAuth" },
    { name: "Outlook", logo: "/logos/outlook.png", how: "OAuth" },
    { name: "iCloud", logo: "/logos/icloud.png", how: "App password" },
    { name: "Yahoo", logo: "/logos/yahoo.png", how: "OAuth" },
    { name: "Fastmail", logo: "/logos/fastmail.png", how: "App password" },
    { name: "IMAP", logo: "/logos/imap.png", how: "Any host" },
  ] as const;

  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 top-2 right-0 -bottom-4 overflow-hidden rounded-tl-xl border p-4 sm:left-6 sm:top-3 sm:p-5"
        style={{
          borderColor: L.line,
          background: L.elevated,
          boxShadow: "0 18px 40px -28px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: L.muted }}>
            Supported
          </p>
          <p className="text-[11px]" style={{ color: L.muted }}>
            Direct TLS · no relay
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {providers.map((p) => (
            <div
              key={p.name}
              className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2"
              style={{ borderColor: L.line, background: L.mutedSurface }}
            >
              <span
                className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
                style={{ background: L.elevated }}
              >
                <Image src={p.logo} alt="" width={28} height={28} className="object-contain" unoptimized />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold" style={{ color: L.fg }}>
                  {p.name}
                </p>
                <p className="truncate text-[10px]" style={{ color: L.muted }}>
                  {p.how}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function McpVisual() {
  const tools = [
    ["search_emails", "Find threads fast"],
    ["read_thread", "Open a conversation"],
    ["list_accounts", "See connected mail"],
  ] as const;

  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 top-2 right-0 -bottom-4 overflow-hidden rounded-tl-xl border p-4 sm:left-6 sm:top-3 sm:p-5"
        style={{
          borderColor: L.line,
          background: L.elevated,
          boxShadow: "0 18px 40px -28px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: L.muted }}>
            Local MCP
          </p>
          <p className="text-[11px] font-semibold" style={{ color: L.blue }}>
            Loopback · running
          </p>
        </div>
        <p className="mt-2 font-mono text-[11px]" style={{ color: L.muted }}>
          http://127.0.0.1:3847/mcp
        </p>
        <div className="mt-3 space-y-2">
          {tools.map(([name, hint]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2"
              style={{ borderColor: L.line, background: L.mutedSurface }}
            >
              <span className="truncate font-mono text-[12px] font-semibold" style={{ color: L.fg }}>
                {name}
              </span>
              <span className="shrink-0 text-[10px]" style={{ color: L.muted }}>
                {hint}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PrivacyVisual() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center px-5"
      style={{ background: L.bg }}
    >
      <div
        className="w-full max-w-[220px] rounded-2xl border border-dashed p-4 text-center"
        style={{ borderColor: L.lineStrong, background: L.elevated }}
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: L.muted }}>
          Intray server
        </p>
        <p
          className="mt-2 font-display text-3xl uppercase tracking-wide"
          style={{ color: "rgba(20,20,22,0.22)" }}
        >
          None
        </p>
        <div className="mt-4 space-y-2 text-left text-[11px]" style={{ color: L.fgDim }}>
          <div
            className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5"
            style={{ background: L.mutedSurface }}
          >
            <span>Your PC</span>
            <span className="font-semibold" style={{ color: L.blue }}>
              TLS
            </span>
          </div>
          <div
            className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5"
            style={{ background: L.mutedSurface }}
          >
            <span>Providers</span>
            <span className="font-semibold" style={{ color: L.blue }}>
              direct
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const privacyPoints = [
  {
    title: "Direct to your providers",
    body: "Intray opens TLS straight to Gmail, Outlook, iCloud, and IMAP. There is no Intray mail server, and your messages are not stored on one.",
  },
  {
    title: "AI on your terms",
    body: "Drafts and summaries go to Claude, OpenAI, Grok, Gemini, or local Ollama — the model you pick, with your key or CLI login. Nothing routes through an Intray cloud.",
  },
  {
    title: "Lives on your desktop",
    body: "Your inbox, labels, and search stay in the app on this machine. Intray has no account for you to upload them to.",
  },
] as const;

export function Privacy() {
  return (
    <section id="privacy" className="landing-light scroll-mt-24 px-5 py-14 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-5 md:grid-cols-2 md:gap-10">
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
            Own your attention.
            <br />
            Own your mail.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-[#9ca3af] md:pt-2 md:text-[15px]">
            Intray is a desktop app — your provider on one side, the AI you already use on the
            other, and nothing of ours sitting in between.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {privacyPoints.map((point) => (
            <article
              key={point.title}
              className="rounded-2xl border border-white/10 bg-[#121214] px-5 py-5"
            >
              <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
                {point.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[#9ca3af]">{point.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Kept for compatibility with older imports. */
export function AiAndAgents() {
  return null;
}
