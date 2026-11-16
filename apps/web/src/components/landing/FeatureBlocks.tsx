import { IntrayMark } from "../Brand";

export function UnifiedFeatures() {
  return (
    <section id="features" className="px-5 py-20 md:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
          Reach every inbox{" "}
          <span className="text-signal">without the browser tabs.</span>
        </h2>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="panel overflow-hidden p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Accounts</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">8+</p>
                <p className="mt-1 text-sm text-muted">providers in one tray</p>
              </div>
              <div className="rounded-full border border-signal/30 bg-signal-soft px-3 py-1 text-xs font-medium text-signal">
                Unified
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2 text-sm">
              {["Gmail", "Outlook", "iCloud", "Yahoo", "Fastmail", "IMAP", "Zoho", "AOL"].map(
                (p) => (
                  <div
                    key={p}
                    className="rounded-xl border border-line bg-background/50 px-3 py-2.5 text-center"
                  >
                    {p}
                  </div>
                ),
              )}
            </div>
            <div className="mt-6 rounded-xl border border-line bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-signal" />
                Important · people & security
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 rounded-full bg-line" />
                Other · newsletters & receipts
              </div>
            </div>
          </article>

          <article className="panel overflow-hidden p-6 md:p-7">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">System tray</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">
              Triage without focusing the window
            </h3>
            <p className="mt-2 text-sm text-muted">
              Read, reply, archive, snooze, and copy OTPs from the flyout — built for Windows 10/11
              toasts and tray habits.
            </p>
            <div className="mt-8 space-y-3">
              {[
                ["Alex Chen", "Q3 deck — need your take", "2m"],
                ["GitHub", "Security alert on repo", "11m"],
                ["Notion", "Invite to workspace", "1h"],
              ].map(([from, sub, time]) => (
                <div
                  key={sub}
                  className="flex items-center gap-3 rounded-xl border border-line bg-background/50 px-3 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal-soft text-xs font-semibold text-signal">
                    {from.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{from}</p>
                    <p className="truncate text-xs text-muted">{sub}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">{time}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                Archive
              </span>
              <span className="rounded-full border border-line px-3 py-1.5 text-xs text-muted">
                Snooze
              </span>
              <span className="rounded-full border border-line px-3 py-1.5 text-xs text-muted">
                Reply
              </span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function AiAndAgents() {
  return (
    <section id="privacy" className="px-5 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
          AI and agents that stay{" "}
          <span className="text-signal">on your side of the wire.</span>
        </h2>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="panel p-6 md:p-7">
            <h3 className="text-xl font-semibold tracking-tight">Write, ask, summarize locally</h3>
            <p className="mt-2 text-sm text-muted">
              Ollama, Copilot+ where available, or BYO OpenAI / Claude / Grok keys. Mail never
              routes through an Intray AI proxy.
            </p>
            <div className="mt-6 rounded-xl border border-line bg-background/60 p-4">
              <p className="text-xs text-muted">Prompt</p>
              <p className="mt-2 text-sm">
                Draft a friendly reply confirming I can review slides before standup.
              </p>
              <div className="mt-4 w-full rounded-full bg-brand py-2.5 text-center text-sm font-semibold text-white">
                Generate with local AI
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                "Happy to review before standup — sending notes by 9:45.",
                "Got it. I’ll mark up 4–7 and ping if anything’s off.",
              ].map((t) => (
                <div key={t} className="rounded-xl border border-line px-4 py-3 text-sm">
                  {t}
                </div>
              ))}
            </div>
          </article>

          <article className="panel p-6 md:p-7">
            <h3 className="text-xl font-semibold tracking-tight">MCP for Cursor & Claude</h3>
            <p className="mt-2 text-sm text-muted">
              One-click local tools so agents can search and act on mail with permissions you
              control. Send is opt-in. Trash, OTP, and sign-in links stay locked down by default.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-xl border border-line bg-background/70 p-4 font-mono text-xs leading-relaxed text-muted">
              <span className="text-signal">you</span>
              {`  Find unanswered investor emails\n\n`}
              <span className="text-signal">agent</span>
              {`  search_emails("investor after:7d")\n`}
              {`  3 threads · 2 drafts ready in Intray`}
            </pre>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {["Local only", "Account allowlist", "Drafts in-app", "Send opt-in"].map((t) => (
                <div
                  key={t}
                  className="rounded-xl border border-line bg-background/50 px-3 py-3 text-center"
                >
                  {t}
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="panel mt-5 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-7">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border border-line bg-background/60 p-2.5">
              <IntrayMark size={22} />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Privacy by architecture</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Device ↔ provider over TLS. No Intray server in the mail path. Licensing checks
                send a key — never message content.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="rounded-lg border border-line px-3 py-2">Provider</span>
            <span>TLS</span>
            <span className="rounded-lg border border-signal/40 bg-signal-soft px-3 py-2 text-foreground">
              Your PC
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
