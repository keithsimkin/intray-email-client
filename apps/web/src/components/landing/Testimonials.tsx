const quotes = [
  {
    body: "I wanted Superhuman-level triage on Windows without handing my mail to another cloud. Local AI plus a real tray panel is the combo.",
    name: "Maya R.",
    role: "Founder, security tooling",
  },
  {
    body: "MCP that can search my inbox from Cursor — without a relay — is the reason I leave Thunderbird open less every week.",
    name: "Jon K.",
    role: "Staff engineer",
  },
  {
    body: "OTP copy from the toast alone paid for the lifetime license. Open source means I can audit the privacy claims myself.",
    name: "Priya S.",
    role: "Windows power user",
  },
];

export function Testimonials() {
  return (
    <section className="px-5 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
          Built in the open for people who{" "}
          <span className="text-signal">live in their inbox.</span>
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {quotes.map((q) => (
            <blockquote key={q.name} className="panel flex flex-col p-6">
              <div className="flex gap-0.5 text-signal" aria-label="5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1.5l1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.3l-3.6 1.9.7-4.1-3-2.9 4.1-.6L8 1.5z" />
                  </svg>
                ))}
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">&ldquo;{q.body}&rdquo;</p>
              <footer className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-signal-soft text-sm font-semibold text-signal">
                  {q.name.slice(0, 1)}
                </div>
                <div>
                  <p className="text-sm font-medium">{q.name}</p>
                  <p className="text-xs text-muted">{q.role}</p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Illustrative early-adopter voices for layout — replace with real quotes as they land.
        </p>
      </div>
    </section>
  );
}
