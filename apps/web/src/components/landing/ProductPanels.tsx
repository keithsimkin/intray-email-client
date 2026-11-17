import { AppWindow } from "./AppWindow";

const steps = [
  {
    n: "01",
    title: "Connect every account",
    body: "Add Gmail, Outlook, iCloud, Yahoo, Fastmail, or any IMAP inbox into one unified tray.",
  },
  {
    n: "02",
    title: "Triage from the tray",
    body: "Archive, snooze, reply, and copy OTPs from the Windows tray flyout — built for toasts.",
  },
  {
    n: "03",
    title: "Ask AI on your machine",
    body: "Summarize threads and draft replies with Ollama, Copilot+, or your own keys. No mail proxy.",
  },
  {
    n: "04",
    title: "Ship the reply",
    body: "Send from the account that should own the thread — labels, snooze, and Important stay in sync.",
  },
];

export function ProductPanels() {
  return (
    <section id="how-it-works" className="landing-light px-5 py-14 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-[#111]">
            Simple steps to a quieter, sharper inbox
          </h2>
          <p className="text-sm leading-relaxed text-[#4a5b52] md:text-right md:text-[15px]">
            From first account to daily triage — Intray stays on your PC, talking to providers over
            TLS. No relay. Open source so you can verify it.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[0.9fr_1.2fr]">
          <div className="flex flex-col gap-3.5">
            {steps.map((s) => (
              <StepCard key={s.n} {...s} />
            ))}
            <a
              href="#download"
              className="mt-2 inline-flex w-fit items-center justify-center rounded-full bg-[#c8f04a] px-5 py-2.5 text-sm font-semibold text-[#111] transition hover:brightness-105"
            >
              Download App
            </a>
          </div>

          <div className="relative min-w-0">
            <AppWindow alt="Intray Windows desktop app — unified inbox in light mode" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="relative rounded-2xl bg-[#eaf3f0] px-5 py-4">
      <span className="absolute -top-3 left-5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#111] px-2 text-[11px] font-semibold text-white">
        {n}
      </span>
      <h3 className="mt-1 text-base font-semibold text-[#111]">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[#4a5b52]">{body}</p>
    </div>
  );
}
