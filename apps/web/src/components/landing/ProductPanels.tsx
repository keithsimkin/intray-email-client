export function ProductPanels() {
  return (
    <section className="px-5 py-20 md:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
          We love making good first{" "}
          <span className="text-signal">impressions.</span>
        </h2>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="panel p-6 md:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Tray triage</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">12 cleared</p>
              </div>
              <span className="rounded-full border border-line px-2.5 py-1 text-xs text-signal">
                Today
              </span>
            </div>
            <div className="mt-8 space-y-3">
              {[
                ["Archived newsletters", "6", "#C4453D"],
                ["Snoozed for later", "3", "#8a8f98"],
                ["Replied from tray", "2", "#ededed"],
                ["OTP copied", "1", "#C4453D"],
              ].map(([label, n, color]) => (
                <div key={label} className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-xs font-semibold"
                    style={{ color: String(color) }}
                  >
                    {n}
                  </span>
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel p-6 md:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Catch me up</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">84 threads</p>
              </div>
              <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                Local AI
              </span>
            </div>
            <div className="mt-8 flex h-36 items-end gap-2">
              {[40, 65, 48, 80, 55, 92, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-signal/80"
                  style={{
                    height: `${h}%`,
                    opacity: 0.35 + i * 0.08,
                  }}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-line bg-background/50 px-3 py-3">
                <p className="text-xs text-muted">Needs you</p>
                <p className="mt-1 text-lg font-semibold">11</p>
              </div>
              <div className="rounded-xl border border-line bg-background/50 px-3 py-3">
                <p className="text-xs text-muted">FYI only</p>
                <p className="mt-1 text-lg font-semibold">73</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
