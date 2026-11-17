import type { ReactNode } from "react";
import Image from "next/image";
import {
  Chip,
  DEMO_MAIL,
  DemoListPane,
  L,
  Squircle,
} from "./DemoInbox";

type Feature = {
  title: string;
  body: string;
  span: string;
  id?: string;
  visual: ReactNode;
};

const features: Feature[] = [
  {
    title: "All inboxes",
    body: "Gmail, Outlook, iCloud, and IMAP in one tray — switch without switching apps.",
    span: "lg:col-span-2",
    visual: <AllInboxesVisual />,
  },
  {
    title: "Important first",
    body: "Local AI ranks what needs you now. The rest waits quietly.",
    span: "",
    visual: <ImportantVisual />,
  },
  {
    title: "OTP in one click",
    body: "Copy codes from the toast before the window even focuses.",
    span: "",
    visual: <OtpVisual />,
  },
  {
    title: "Ask on your machine",
    body: "Draft replies and summarize threads with a local model — mail never leaves this PC for AI.",
    span: "lg:col-span-2",
    visual: <TrayVisual />,
  },
  {
    title: "Any mailbox",
    body: "Gmail, Outlook, iCloud, Yahoo, Fastmail, and any IMAP — OAuth or app password.",
    span: "lg:col-span-2",
    visual: <ProvidersVisual />,
  },
  {
    title: "No mail relay",
    body: "TLS straight to providers. Nothing routes through Intray servers.",
    span: "",
    id: "privacy",
    visual: <PrivacyVisual />,
  },
];

export function UnifiedFeatures() {
  return (
    <section id="features" className="landing-light px-5 pb-6 pt-14 md:pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-5 md:grid-cols-2 md:gap-10">
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] uppercase leading-[0.95] tracking-[0.02em] text-[#111]">
            Features.
            <br />
            Everything your tray needs.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-[#4a5b52] md:pt-2 md:text-[15px]">
            Unified accounts, tray triage, local AI, and privacy by architecture — with the small
            Windows details that make daily mail feel lighter.
          </p>
        </div>

        <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 lg:gap-4">
          {features.map((f) => (
            <article
              key={f.title}
              id={f.id}
              className={`group relative flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#e4e5e8] sm:w-auto ${f.span}`}
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
        className="absolute left-5 top-2 right-0 -bottom-4 flex overflow-hidden rounded-tl-xl border bg-white max-sm:[mask-image:linear-gradient(to_bottom,black_60%,transparent_92%)] sm:left-6 sm:top-3"
        style={{ borderColor: L.line, boxShadow: "0 18px 40px -28px rgba(20,24,40,0.35)" }}
      >
        <div className="w-[34%] border-r p-3" style={{ borderColor: L.line, background: L.mutedSurface }}>
          <p className="text-[11px] font-medium" style={{ color: L.muted }}>
            Accounts
          </p>
          {[
            ["Work · Gmail", "WK", "#7c3aed", "12"],
            ["Personal · Outlook", "PS", "#2563eb", "4"],
            ["Family · iCloud", "IC", "#0891b2", "2"],
          ].map(([label, ini, tone, n]) => (
            <div
              key={label as string}
              className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 first:mt-3 first:bg-white"
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

function ImportantVisual() {
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 right-0 top-2 bottom-0 overflow-hidden rounded-tl-xl border bg-white sm:left-6 sm:top-3"
        style={{ borderColor: L.line }}
      >
        <DemoListPane filter="important" />
      </div>
    </div>
  );
}

function OtpVisual() {
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 right-5 top-5 rounded-2xl border bg-white p-4 sm:left-6 sm:right-6"
        style={{ borderColor: L.line, boxShadow: "0 16px 40px -24px rgba(20,24,40,0.35)" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-8 w-8 items-center justify-center text-[11px] font-bold text-white"
            style={{ background: L.brand, borderRadius: 10 }}
          >
            in
          </span>
          <div>
            <p className="text-[13px] font-semibold tracking-[-0.01em]">GitHub</p>
            <p className="text-[12px]" style={{ color: L.muted }}>
              Verification code · now
            </p>
          </div>
        </div>
        <p className="mt-3 font-mono text-[22px] font-semibold tracking-[0.18em]">482 917</p>
        <button
          type="button"
          tabIndex={-1}
          className="mt-3 inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-white"
          style={{ background: L.fg }}
        >
          Copy code
        </button>
      </div>
      <div
        className="float-b absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold"
        style={{
          background: L.elevated,
          color: L.fg,
          border: `1px solid ${L.line}`,
          boxShadow: "0 10px 28px -10px rgba(20,24,40,0.35)",
        }}
      >
        Copied to clipboard
      </div>
    </div>
  );
}

function TrayVisual() {
  const mail = DEMO_MAIL[3];
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: L.bg }}>
      <div
        className="absolute left-5 top-2 right-0 -bottom-4 flex overflow-hidden rounded-tl-xl border bg-white sm:left-6 sm:top-3"
        style={{ borderColor: L.line, boxShadow: "0 18px 40px -28px rgba(20,24,40,0.35)" }}
      >
        <div className="hidden w-[42%] shrink-0 border-r sm:block" style={{ borderColor: L.line }}>
          <DemoListPane />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-3" style={{ borderColor: L.line }}>
            <p className="text-[14px] font-semibold tracking-[-0.02em]">{mail.subject}</p>
            <div className="mt-2 flex items-center gap-2">
              <Squircle initials={mail.ini} tone={mail.tone} size={28} />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold">{mail.from}</p>
                <p className="text-[11px]" style={{ color: L.muted }}>
                  To you · {mail.time}
                </p>
              </div>
              <Chip label={mail.chip} color={mail.chipColor} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
            <p className="text-[12.5px] leading-relaxed" style={{ color: L.fgDim }}>
              {mail.snippet} Happy to move if Friday is tight on your side.
            </p>
          </div>
          <div className="border-t p-3" style={{ borderColor: L.line, background: L.mutedSurface }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold" style={{ color: L.fgDim }}>
                Ask
              </span>
              <span className="text-[11px]" style={{ color: L.muted }}>
                Local model · on this PC
              </span>
            </div>
            <p className="mt-2 text-right text-[12px]" style={{ color: L.fgDim }}>
              Draft a short yes to Friday 10
            </p>
            <div className="mt-2 rounded-xl bg-white p-2.5" style={{ border: `1px solid ${L.line}` }}>
              <p className="text-[12.5px] leading-relaxed">
                Friday at 10 works — I&apos;ll lock the room and send the invite.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Insert reply", "Shorter", "Warmer"].map((a, i) => (
                  <span
                    key={a}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      background: i === 0 ? L.fg : L.mutedSurface,
                      color: i === 0 ? "#fff" : L.fgDim,
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
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
        className="absolute left-5 top-2 right-0 -bottom-4 overflow-hidden rounded-tl-xl border bg-white p-4 sm:left-6 sm:top-3 sm:p-5"
        style={{ borderColor: L.line, boxShadow: "0 18px 40px -28px rgba(20,24,40,0.35)" }}
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
              <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white">
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

function PrivacyVisual() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center px-5"
      style={{ background: L.bg }}
    >
      <div
        className="w-full max-w-[220px] rounded-2xl border border-dashed bg-white p-4 text-center"
        style={{ borderColor: L.lineStrong }}
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

/** Kept for compatibility with older imports. */
export function AiAndAgents() {
  return null;
}
