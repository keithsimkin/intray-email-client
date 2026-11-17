/** Demo Intray chrome — light theme tokens + layout from apps/desktop, fictional mail only. */

export const L = {
  bg: "#f0f1f3",
  elevated: "#ffffff",
  mutedSurface: "#ebecef",
  fg: "#141416",
  fgDim: "#3a3a3e",
  muted: "#6b6f76",
  line: "#e4e5e8",
  lineStrong: "#d5d6da",
  blue: "#3b6fd9",
  brand: "#760e0a",
} as const;

const DEMO_MAIL = [
  {
    ini: "MC",
    tone: "#c4453d",
    from: "Maya Chen",
    time: "2m",
    chip: "WK",
    chipColor: "#7c3aed",
    subject: "Design review moved to Friday",
    snippet: "Same agenda — Q4 numbers and the hiring plan.",
    unread: true,
  },
  {
    ini: "JW",
    tone: "#0d9488",
    from: "Jonas Weber",
    time: "18m",
    chip: "PS",
    chipColor: "#2563eb",
    subject: "Ship notes for the Windows build",
    snippet: "Tray flyout + OTP copy are ready for QA.",
    unread: true,
  },
  {
    ini: "NQ",
    tone: "#3b6fd9",
    from: "Nora Quinn",
    time: "1h",
    chip: "WK",
    chipColor: "#7c3aed",
    subject: "Security alert — new sign-in",
    snippet: "We noticed a sign-in from a new device in Seattle.",
    unread: false,
  },
  {
    ini: "PS",
    tone: "#d97706",
    from: "Priya Shah",
    time: "3h",
    chip: "IC",
    chipColor: "#0891b2",
    subject: "Can we push the design review?",
    snippet: "Friday at 10 works on my side if you're free.",
    unread: false,
  },
  {
    ini: "AB",
    tone: "#6366f1",
    from: "Acme Billing",
    time: "Yesterday",
    chip: "PS",
    chipColor: "#2563eb",
    subject: "Invoice for October is ready",
    snippet: "Your receipt and PDF are attached.",
    unread: false,
  },
] as const;

function Squircle({
  initials,
  tone,
  size = 36,
}: {
  initials: string;
  tone: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        background: tone,
        borderRadius: Math.round(size * 0.33),
        fontSize: Math.max(10, Math.round(size * 0.3)),
      }}
    >
      {initials}
    </span>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] border px-1.5 text-[10px] font-semibold"
      style={{ borderColor: `${color}55`, color }}
    >
      {label}
    </span>
  );
}

/** Full three-pane Intray shell for laptop screens (designed ~1280×852). */
export function DemoInboxApp({ className = "" }: { className?: string }) {
  const selected = DEMO_MAIL[0];

  return (
    <div
      aria-hidden
      className={`flex h-full w-full flex-col overflow-hidden text-[13px] leading-[1.35] ${className}`}
      style={{
        background: L.bg,
        color: L.fg,
        fontFamily: 'Geist, "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Title bar */}
      <div
        className="flex h-11 shrink-0 items-center gap-3 border-b px-4"
        style={{ borderColor: L.line, background: L.elevated }}
      >
        <span className="pl-1 text-[13px] font-semibold tracking-[-0.03em]">intray</span>
        <div
          className="mx-auto flex h-8 w-full max-w-[420px] items-center rounded-full px-3.5 text-[12px]"
          style={{ background: L.mutedSurface, color: L.muted }}
        >
          Search mail — or add From, Subject, Tag…
        </div>
        <div className="flex items-center gap-2.5 pr-1">
          <span
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px]"
            style={{ background: L.mutedSurface, color: L.muted }}
          >
            ⌂
            <span
              className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white"
              style={{ background: L.blue }}
            >
              3
            </span>
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "52px 188px minmax(280px,1fr) minmax(320px,1.2fr)" }}>
        {/* Account rail */}
        <div
          className="flex flex-col items-center gap-2.5 border-r py-3.5"
          style={{ borderColor: L.line, background: L.mutedSurface }}
        >
          {[
            ["WK", "#7c3aed", "12"],
            ["PS", "#2563eb", "4"],
            ["IC", "#0891b2", "2"],
          ].map(([ini, tone, n]) => (
            <span key={ini} className="relative">
              <Squircle initials={ini} tone={tone} size={32} />
              <span
                className="absolute -right-1 -top-1 rounded-full px-1 text-[8px] font-bold text-white"
                style={{ background: L.fg }}
              >
                {n}
              </span>
            </span>
          ))}
          <span
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[15px]"
            style={{ border: `1px dashed ${L.lineStrong}`, color: L.muted }}
          >
            +
          </span>
        </div>

        {/* Sidebar */}
        <div className="flex min-h-0 flex-col border-r px-3 py-3" style={{ borderColor: L.line }}>
          <div className="mb-2.5 flex items-center gap-2.5 px-1">
            <span
              className="inline-flex h-8 w-8 items-center justify-center text-white"
              style={{ background: L.blue, borderRadius: 9 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 8h16M4 12h10M4 16h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">Unified Inbox</div>
              <div className="truncate text-[11px]" style={{ color: L.muted }}>
                All accounts
              </div>
            </div>
          </div>

          <div
            className="mb-2.5 flex h-9 items-center gap-1.5 rounded-[11px] px-3 text-[12px] font-semibold text-white"
            style={{ background: L.fg }}
          >
            <span className="text-[15px] leading-none">+</span>
            Compose
            <kbd className="ml-auto text-[10px] font-medium opacity-55">Ctrl+N</kbd>
          </div>

          <nav className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
            {[
              ["Unified Inbox", "18", true],
              ["Snoozed", "", false],
              ["Drafts", "2", false],
              ["Sent", "", false],
              ["Archive", "", false],
            ].map(([label, count, active]) => (
              <div
                key={label as string}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
                style={{
                  background: active ? "rgba(0,0,0,0.06)" : "transparent",
                  fontWeight: active ? 600 : 450,
                  color: active ? L.fg : L.fgDim,
                }}
              >
                <span className="truncate">{label}</span>
                {count ? (
                  <span className="ml-auto text-[11px]" style={{ color: L.muted }}>
                    {count}
                  </span>
                ) : null}
              </div>
            ))}
            <div className="px-2.5 pb-1 pt-3.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: L.muted }}>
              Labels
            </div>
            {[
              ["#8b5cf6", "News"],
              ["#eab308", "Promo"],
              ["#ef4444", "Security"],
            ].map(([c, name]) => (
              <div key={name} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ color: L.fgDim }}>
                <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                {name}
              </div>
            ))}
          </nav>
        </div>

        {/* Message list */}
        <div className="flex min-h-0 flex-col border-r" style={{ borderColor: L.line, background: L.elevated }}>
          <div className="border-b px-3.5 py-2.5" style={{ borderColor: L.line }}>
            <div className="text-[14px] font-semibold tracking-[-0.02em]">Unified Inbox</div>
            <div className="mt-2 flex gap-0.5 rounded-[14px] p-1" style={{ background: "rgba(0,0,0,0.04)" }}>
              {["All", "Important", "Other (5)"].map((tab, i) => (
                <span
                  key={tab}
                  className="flex h-8 flex-1 items-center justify-center rounded-[11px] text-[12px]"
                  style={
                    i === 0
                      ? { background: L.elevated, color: L.fg, fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                      : { color: L.muted }
                  }
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden p-2">
            {DEMO_MAIL.map((m, i) => (
              <div
                key={m.subject}
                className="grid grid-cols-[40px_1fr] gap-2.5 rounded-lg px-2 py-2"
                style={{ background: i === 0 ? "rgba(0,0,0,0.06)" : "transparent" }}
              >
                <Squircle initials={m.ini} tone={m.tone} size={40} />
                <div className="min-w-0">
                  <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                    <span
                      className="truncate text-[13px]"
                      style={{ color: L.fgDim, fontWeight: m.unread ? 650 : 550 }}
                    >
                      {m.from}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: L.muted }}>
                      {m.time}
                    </span>
                    <Chip label={m.chip} color={m.chipColor} />
                  </div>
                  <p
                    className="truncate text-[13px] tracking-[-0.01em]"
                    style={{ color: L.fg, fontWeight: m.unread ? 650 : 500 }}
                  >
                    {m.subject}
                  </p>
                  <p className="truncate text-[12px]" style={{ color: L.muted }}>
                    {m.snippet}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reader */}
        <div className="flex min-h-0 flex-col" style={{ background: L.elevated }}>
          <div className="flex items-center gap-1 border-b px-3.5 py-2.5" style={{ borderColor: L.line }}>
            {[
              ["↩ Reply", false],
              ["→ Forward", false],
              ["Archive", false],
              ["Ask AI", true],
            ].map(([a, accent]) => (
              <span
                key={a as string}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
                style={{
                  background: accent ? "rgba(59,111,217,0.1)" : L.mutedSurface,
                  color: accent ? L.blue : L.fgDim,
                }}
              >
                {a}
              </span>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
            <h3 className="text-[20px] font-semibold tracking-[-0.025em]">{selected.subject}</h3>
            <div className="mt-4 flex items-center gap-2.5">
              <Squircle initials={selected.ini} tone={selected.tone} size={36} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{selected.from}</div>
                <div className="text-[12px]" style={{ color: L.muted }}>
                  To you · {selected.time} · via Work · Gmail
                </div>
              </div>
            </div>
            <p className="mt-5 max-w-[36em] text-[13.5px] leading-relaxed" style={{ color: L.fgDim }}>
              Hi — {selected.snippet} I&apos;ll send the deck tonight so we can keep Friday free for
              decisions. If that still works, I&apos;ll lock the room and share the invite.
            </p>
            <p className="mt-4 text-[13px]" style={{ color: L.muted }}>
              — Maya
            </p>
          </div>
          <div className="border-t p-3.5" style={{ borderColor: L.line }}>
            <div
              className="rounded-2xl border px-3.5 py-3"
              style={{ borderColor: L.line, background: L.mutedSurface }}
            >
              <div className="text-[12px]" style={{ color: L.muted }}>
                Reply to Maya Chen… Type @ to Cc someone
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px]" style={{ color: L.muted }}>
                  From Work · Gmail
                </span>
                <span
                  className="inline-flex h-8 items-center rounded-full px-3.5 text-[12px] font-semibold text-white"
                  style={{ background: L.fg }}
                >
                  Send
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoListPane({
  filter = "all",
  className = "",
}: {
  filter?: "all" | "important";
  className?: string;
}) {
  const rows = filter === "important" ? DEMO_MAIL.filter((_, i) => i < 3) : DEMO_MAIL;

  return (
    <div
      aria-hidden
      className={`flex h-full flex-col overflow-hidden ${className}`}
      style={{ background: L.elevated, color: L.fg, fontFamily: 'Geist, "Segoe UI", system-ui, sans-serif' }}
    >
      <div className="border-b px-3 py-2.5" style={{ borderColor: L.line }}>
        <div className="text-[13px] font-semibold tracking-[-0.02em]">Unified Inbox</div>
        <div className="mt-2 flex gap-0.5 rounded-[14px] p-1" style={{ background: "rgba(0,0,0,0.04)" }}>
          {(["All", "Important", "Other (5)"] as const).map((tab) => {
            const active =
              (filter === "all" && tab === "All") || (filter === "important" && tab === "Important");
            return (
              <span
                key={tab}
                className="flex h-[30px] flex-1 items-center justify-center rounded-[11px] text-[12px]"
                style={
                  active
                    ? { background: L.elevated, color: L.fg, fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                    : { color: L.muted }
                }
              >
                {tab}
              </span>
            );
          })}
        </div>
      </div>
      <div className="space-y-0.5 p-2">
        {rows.map((m, i) => (
          <div
            key={m.subject}
            className="grid grid-cols-[36px_1fr] gap-2.5 rounded-md px-2 py-2"
            style={{ background: i === 0 ? "rgba(0,0,0,0.06)" : "transparent" }}
          >
            <Squircle initials={m.ini} tone={m.tone} />
            <div className="min-w-0">
              <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12.5px] font-medium" style={{ color: L.fgDim }}>
                  {m.from}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: L.muted }}>
                  {m.time}
                </span>
                <Chip label={m.chip} color={m.chipColor} />
              </div>
              <p className="truncate text-[12.5px] font-semibold tracking-[-0.01em]">{m.subject}</p>
              <p className="truncate text-[11.5px]" style={{ color: L.muted }}>
                {m.snippet}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { Squircle, Chip, DEMO_MAIL };
