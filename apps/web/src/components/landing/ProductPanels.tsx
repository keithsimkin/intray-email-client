import { AppWindow } from "./AppWindow";
import { WINDOWS_DOWNLOAD_URL } from "./site";

const steps = [
  {
    n: "01",
    title: "Unify every inbox",
    body: "Add Gmail, Outlook, iCloud, Yahoo, Fastmail, or any IMAP account into one Superhuman-fast tray.",
  },
  {
    n: "02",
    title: "Triage with power tools",
    body: "Keyboard shortcuts, snooze, labels, undo, and OTP toasts — mail that moves at the speed of thought.",
  },
  {
    n: "03",
    title: "Plug in your AI",
    body: "Use Claude, OpenAI, Grok, Gemini, or Ollama with your own keys or CLI login. Draft, summarize, and label without an Intray AI tax.",
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
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] uppercase leading-[0.95] tracking-[0.02em] text-white">
            Simple steps to a quieter, sharper inbox
          </h2>
          <p className="text-sm leading-relaxed text-[#9ca3af] md:text-right md:text-[15px]">
            Unified email plus your AI stack on one Windows machine — no Intray mail relay, no forced
            model. Open source so you can verify every hop.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[0.9fr_1.2fr]">
          <div className="flex flex-col gap-3.5">
            {steps.map((s) => (
              <StepCard key={s.n} {...s} />
            ))}
            <a
              href={WINDOWS_DOWNLOAD_URL}
              className="mt-2 inline-flex w-fit items-center justify-center rounded-full bg-[#760E0A] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Download App
            </a>
          </div>

          <div className="relative min-w-0">
            <AppWindow alt="Intray Windows desktop app — unified inbox" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#121214] px-5 py-4">
      <span className="absolute -top-3 left-5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#c8f04a] px-2 text-[11px] font-semibold text-[#111]">
        {n}
      </span>
      <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[#9ca3af]">{body}</p>
    </div>
  );
}
