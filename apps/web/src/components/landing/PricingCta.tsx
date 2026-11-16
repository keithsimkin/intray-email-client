import { IntrayIcon, IntrayMark } from "../Brand";
import { Cta, CtaGhost } from "./Buttons";
import { GITHUB_URL } from "./site";

export function Pricing() {
  return (
    <section id="pricing" className="px-5 py-16">
      <div className="panel mx-auto max-w-3xl px-6 py-12 text-center md:px-12">
        <div className="mx-auto mb-5 flex justify-center">
          <IntrayIcon size={52} />
        </div>
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Try free. Keep it forever for coffee money.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-muted">
          Full 7-day trial. Then a one-time lifetime license — no subscription. Source stays open
          so you can fork, audit, and build with us.
        </p>
        <p className="mt-8 text-5xl font-semibold tracking-tight">
          $4.99{" "}
          <span className="text-xl font-normal text-muted line-through">$19.99</span>
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Cta href="#download">Download free trial</Cta>
          <CtaGhost href={GITHUB_URL}>Star on GitHub</CtaGhost>
        </div>
      </div>
    </section>
  );
}

export function BottomCta() {
  return (
    <section id="open-source" className="px-5 pb-20 pt-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-line bg-surface px-6 py-14 md:px-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 85% 50%, #c4453d22, transparent 55%)",
          }}
        />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.08]">
              Start triaging smarter today.
            </h2>
            <p className="mt-4 max-w-md text-muted">
              Download the Windows build, or clone the monorepo and run the desktop shell yourself.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Cta href="#download">Download free trial</Cta>
              <CtaGhost href={GITHUB_URL}>View on GitHub</CtaGhost>
            </div>
          </div>
          <div className="panel relative mx-auto w-full max-w-sm overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <IntrayMark size={14} />
              <span className="text-xs font-medium">intray · open source</span>
            </div>
            <div className="space-y-2 p-4 text-sm">
              <p className="text-muted">apps/desktop · Electron + React</p>
              <p className="text-muted">apps/web · this landing site</p>
              <p className="rounded-lg border border-signal/30 bg-signal-soft px-3 py-2 text-signal">
                bun run dev:desktop
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
