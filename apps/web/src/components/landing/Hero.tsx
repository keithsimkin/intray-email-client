import { IntrayMark, IntrayWordmark } from "../Brand";
import { Cta, CtaGhost } from "./Buttons";
import { GITHUB_URL } from "./site";

function Sparkline() {
  return (
    <svg viewBox="0 0 120 40" className="h-10 w-full" aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C4453D" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#C4453D" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 28 C16 26, 22 12, 34 14 C48 17, 52 30, 66 24 C78 19, 86 8, 98 10 C108 12, 114 18, 120 16 L120 40 L0 40 Z"
        fill="url(#spark)"
      />
      <path
        d="M0 28 C16 26, 22 12, 34 14 C48 17, 52 30, 66 24 C78 19, 86 8, 98 10 C108 12, 114 18, 120 16"
        fill="none"
        stroke="#C4453D"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-10 md:pb-28 md:pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, #c4453d20, transparent 55%), radial-gradient(ellipse 50% 40% at 85% 60%, #ffffff08, transparent 50%), linear-gradient(180deg, #070708 0%, #0a0a0b 100%)",
        }}
      />
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute left-1/2 top-24 h-[380px] w-[380px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "var(--signal-glow)" }}
      />

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="brand-rise mb-6 flex justify-center">
          <IntrayWordmark height={64} className="text-foreground md:[&>span:first-child]:text-[5rem]" />
        </div>

        <h1 className="brand-rise brand-rise-delay-1 mx-auto max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl md:leading-[1.05]">
          All your inboxes.{" "}
          <span className="text-signal">Native on Windows.</span>
        </h1>
        <p className="brand-rise brand-rise-delay-2 mx-auto mt-5 max-w-xl text-base text-muted md:text-lg">
          Open-source unified mail with privacy by architecture, local and BYO AI,
          system tray triage, and built-in MCP — on your PC, not our servers.
        </p>

        <div
          id="download"
          className="brand-rise brand-rise-delay-3 mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Cta href="#pricing">Download free trial</Cta>
          <CtaGhost href={GITHUB_URL}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.7 7.7 0 0 1 8 4.07c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            View on GitHub
          </CtaGhost>
        </div>
        <p className="brand-rise brand-rise-delay-4 mt-4 text-sm text-muted">
          Windows 10 22H2+ · 7-day trial · open source · no mail relay
        </p>
      </div>

      {/* Floating product chrome — template-style orbit around hero */}
      <div className="relative mx-auto mt-14 max-w-5xl md:mt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 md:block" aria-hidden>
          <div className="float-a absolute -left-2 top-2 hidden w-[200px] rounded-2xl border border-line bg-surface-elevated p-4 shadow-[var(--shadow)] sm:block md:-left-4 md:w-[220px]">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Unread today</span>
              <span className="text-signal">+18%</span>
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight">42</p>
            <Sparkline />
          </div>

          <div className="float-b absolute -right-2 top-8 hidden w-[210px] rounded-2xl border border-line bg-surface-elevated p-4 shadow-[var(--shadow)] sm:block md:-right-2 md:w-[230px]">
            <div className="flex items-center gap-2">
              <IntrayMark size={14} />
              <span className="text-xs font-medium">Tray</span>
              <span className="signal-bar ml-auto h-1 w-8 rounded-full bg-signal" />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              OTP ready · copy from toast without leaving your flow.
            </p>
            <div className="mt-3 rounded-lg border border-line bg-background/70 px-2.5 py-2 font-mono text-[11px] text-signal">
              482 913
            </div>
          </div>

          <div className="float-a absolute bottom-0 left-[8%] hidden w-[220px] rounded-2xl border border-line bg-surface-elevated p-4 shadow-[var(--shadow)] md:block">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">AI draft</p>
            <p className="mt-2 text-sm leading-snug">
              Happy to review before standup — notes by 9:45.
            </p>
            <div className="mt-3 flex gap-1.5 text-[10px] text-muted">
              <span className="rounded-md border border-line px-2 py-0.5">Shorter</span>
              <span className="rounded-md border border-signal/40 bg-signal-soft px-2 py-0.5 text-signal">
                Local
              </span>
            </div>
          </div>

          <div className="float-b absolute bottom-4 right-[6%] hidden w-[180px] rounded-2xl border border-line bg-surface-elevated p-4 shadow-[var(--shadow)] md:block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Privacy</span>
              <span className="h-2 w-2 rounded-full bg-signal" />
            </div>
            <p className="mt-2 text-sm font-medium">Device only</p>
            <p className="mt-1 text-[11px] text-muted">0 mail on our servers</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full w-[98%] rounded-full bg-signal" />
            </div>
          </div>
        </div>

        {/* Central product plane */}
        <div className="brand-rise brand-rise-delay-2 relative mx-auto w-full max-w-[560px] overflow-hidden rounded-[1.35rem] border border-line bg-surface shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <IntrayMark size={16} />
            <span className="text-sm font-medium tracking-tight">intray</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Panels
            </span>
          </div>
          <div className="grid min-h-[280px] grid-cols-12 text-sm md:min-h-[340px]">
            <div className="col-span-3 border-r border-line p-4 text-muted">
              <p className="mb-3 flex items-center gap-2 text-foreground">
                Inbox
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal" />
              </p>
              <p>Important</p>
              <p className="mt-2">Snoozed</p>
              <p className="mt-2">Sent</p>
            </div>
            <div className="col-span-4 border-r border-line p-2">
              {[
                ["Alex Chen", "Q3 deck — need your take", true],
                ["GitHub", "Security alert on repo", true],
                ["Stripe", "Your receipt from Stripe", false],
              ].map(([from, sub, unread]) => (
                <div key={String(sub)} className="rounded-lg px-3 py-2.5 hover:bg-white/5">
                  <p className="flex items-center gap-2 text-foreground">
                    {unread ? (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal" />
                    ) : (
                      <span className="inline-block h-1.5 w-1.5" />
                    )}
                    {from}
                  </p>
                  <p className="truncate pl-3.5 text-muted">{sub}</p>
                </div>
              ))}
            </div>
            <div className="col-span-5 p-5">
              <p className="text-xs text-muted">Thread</p>
              <p className="mt-2 text-lg text-foreground">Q3 deck — need your take</p>
              <p className="mt-4 text-muted">
                Can you glance at slides 4–7 before standup? AI suggested reply ready in the tray.
              </p>
              <div className="mt-6 flex gap-2">
                <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                  Reply
                </span>
                <span className="rounded-full border border-line px-3 py-1.5 text-xs text-muted">
                  Snooze
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
