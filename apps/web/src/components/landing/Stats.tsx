const stats = [
  {
    tag: "Providers",
    value: "8+",
    body: "Gmail, Outlook, IMAP, and the rest — one Inbox, Sent, and Snoozed.",
  },
  {
    tag: "Relay",
    value: "0",
    body: "Mail never passes through our servers. Device talks to your provider only.",
  },
  {
    tag: "License",
    value: "$4.99",
    body: "7-day full trial, then a one-time lifetime key. Open source, forever yours.",
  },
];

export function Stats() {
  return (
    <section className="border-y border-line bg-surface/40 px-5 py-16 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3 md:gap-8">
        {stats.map((s) => (
          <div key={s.tag} className="text-center md:text-left">
            <span className="inline-flex rounded-full border border-signal/30 bg-signal-soft px-2.5 py-0.5 text-[11px] font-medium text-signal">
              {s.tag}
            </span>
            <p className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">{s.value}</p>
            <p className="mt-3 text-sm text-muted md:max-w-xs">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
