# Intray — Windows Unified Mail Product Plan

Reference research: [docs/BLOOP-RESEARCH-BRIEF.md](docs/BLOOP-RESEARCH-BRIEF.md)  
Inspired by [bloop.email](https://bloop.email/) (Mac-only). Goal: Windows-native alternative with the same pillars, adapted to tray / WinUI-adjacent UX / Credential Manager.

**One-liner:** All your inboxes in one place. Native fast. AI enabled.

---

## Locked defaults

| Decision | Default | Why |
| --- | --- | --- |
| **Name** | **Intray** | Short, Windows-tray-forward, not Bloop-adjacent; working name until domain secured |
| **Stack** | **Electron + React + TypeScript + Bun**, with **Rust (`napi-rs`) for the mail store** | UI/IPC stay Electron for speed-to-ship; Discord-style incremental Rust for hot paths (SQLite/FTS first, then sync/MIME) |
| **OS floor** | **Windows 10 22H2+** (Win11 tray/toast polish first) | Lifetime price needs broad reach; WebView2 evergreen |
| **Price** | **7-day trial → $4.99 lifetime** (strike ~$19.99) | Match Bloop’s wedge; Lemon Squeezy / Paddle for keys |
| **Providers (v1)** | **Gmail OAuth + Outlook/M365 OAuth + generic IMAP** | Covers majority; others via IMAP + app-password guides |
| **Marketing UI** | **Echo section order + dark Geist tokens; distinct brand** | Same story beats, own wordmark/screenshots — not a pixel clone |
| **Brand** | **Ram mark · brand `#760E0A` · signal `#C4453D` · lowercase wordmark** | Maroon tile + white monoline ram; signal for unread / CTAs; assets in `/assets` |
| **Mobile** | **Later / “coming soon”** | Protect desktop + tray + MCP wedge |

---

## Product pillars (marketing weight order)

1. **Unified inbox** — Gmail, Outlook, iCloud, Yahoo, AOL, Fastmail, Zoho, any IMAP
2. **Privacy by architecture** — no product server in the mail path; device ↔ provider only
3. **Local / BYO AI** — drafts, ask, summarize, translate; keys/local models, never through our servers
4. **MCP for agent tools** — Cursor, Claude Desktop, Claude Code, Codex (and peers) read/act on mail locally
5. **Simple monetization** — free trial → cheap one-time lifetime license

---

## Architecture

```
Mail providers (Gmail / Graph / IMAP)
        │ TLS
        ▼
┌─────────────────────────────────────┐
│ Intray Desktop (Electron)           │
│  React UI + Tray flyout             │
│  Node sync / OAuth / IMAP / MCP     │
│  DPAPI safeStorage · AI router      │
│         │                           │
│         ▼ napi-rs                   │
│  Rust mail store (@intray/native)   │
│  SQLite WAL + FTS5                  │
└─────────────────────────────────────┘
        │                    │
        ▼                    ▼
  Ollama / BYO keys    Cursor / Claude / Codex
        │
        ▼
  License API (key only — never mail)
```

**Rust strategy (Discord-style, incremental):** keep Electron for UI/tray; move performance-critical stores into Rust via `@intray/native`. Phase 1 = SQLite + FTS5 (done). Next = MIME parse / sync helpers. A full native shell (Tauri/GPUI) is out of scope until the Rust core covers mail paths.

**Hard privacy rules:** mail bodies/headers never leave the machine except to the user’s chosen provider or AI endpoint; crash/analytics off by default; license traffic is key-only.

### Desktop (`apps/desktop`)

- Electron shell (electron-vite + Bun): frameless window + system tray flyout (hero surface)
- React + TypeScript UI: Bloop-inspired dark four-pane shell (account rail · folders · list · reader); layouts **Panels** and **Wide List** in MVP
- Main-process: IMAP (IDLE), Gmail API, Microsoft Graph; Electron `safeStorage` (Windows DPAPI); send queue; MCP
- Rust native addon (`crates/intray-native`): SQLite WAL + FTS5 mail cache loaded from main via napi-rs
- Notifications: Win10/11 toasts + tray panel actions

### Marketing (`apps/web`)

- Next.js dark landing mirroring Bloop section order
- Deploy on Netlify; Windows Download CTA
- Compare vs Spark / Superhuman / Outlook / Windows Mail / Thunderbird
- Tokens: `#000` / `#ededed` / `#8a8f98` / `#ffffff14` / `#0a0a0b` + Geist

### Licensing

- Lemon Squeezy (or Paddle) lifetime SKU; offline-tolerant activation with periodic key check only

---

## Competitive must-win rows

1. All accounts, one inbox  
2. Tray / quick-reply surface  
3. OTP copy + sign-in link from alert  
4. Snooze + send later  
5. AI drafts/summaries included  
6. On-device or BYO AI  
7. MCP one-click  
8. Mail never through our servers  
9. No subscription  
10. Mobile later (“coming soon”)

---

## Phased delivery

### Phase 0 — Brand & marketing site

- This plan + research brief in repo
- Wordmark, icon, domain check for `intray.*`
- Landing: nav → hero → privacy → AI → MCP → features → compare → providers → changelog → FAQ → pricing → footer

### Phase 1 — Core mail

- Gmail OAuth, Outlook OAuth, IMAP + app password
- Local SQLite sync, unified Inbox, Important/Other, search, compose/send, offline indicator, Credential Manager
- Two layouts; Ctrl+1–9 account switch

### Phase 2 — Power mail + tray v1 (Superhuman speed core)

- **Done / partial today:** Snooze (local), Undo Send delay, signatures, Important/Other, Superhuman shortcut pack
- **Ship next (solo productivity parity):**
  - **Send Later** — compose picker (date/time), not only undo-delay; reuse `enqueueDelayedSend`
  - **Snippets** — persist + insert in compose (body, subject, CC/BCC; attachments later); retire Settings sample cards
  - **Remind Me + follow-up engine** — explicit remind date/time; **Waiting for Reply** job using `waitingForReplyDays`; resurface threads with no reply; **Auto Reminders** suggest follow-ups on sent mail
  - **Split Inbox v2** — custom tabs beyond Important/Other (VIP, team/domain, tools/newsletters, label-backed); settings to add/reorder splits
  - **Instant Open / Instant Copy / Instant Intro / Instant Send** — one-key open link from thread, copy address/thread, intro template flow, confirm-less send when enabled
  - **Read Statuses** — opt-in open tracking for sent mail (replace demo ticks); clear privacy copy; off by default (`trackOpens`)
  - **Block + Unsubscribe** — productize block sender; harden unsubscribe helpers
  - Tray flyout: unread/Important, message actions, OTP detect+copy, global hotkey (Ctrl+Alt+M)
  - Subscription cleanup basics

### Phase 3 — AI (Superhuman AI parity, local/BYO)

- Ollama + BYO keys; Write / Ask / Summarize / Translate; Catch Me Up in tray
- Confirmations before destructive AI actions
- **Instant Reply** — short suggested replies on every thread (already partial chips → always-on, one-key send)
- **Auto Labels + library** — built-in categories (marketing, pitch, social, news); wire real `aiSuggestLabel` (today is heuristic-only)
- **Custom Auto Labels** — user prompt → label; power Split Inbox tabs
- **Auto Archive** — skip inbox for matched labels; never auto-skip prior contacts / same domain
- **Auto Drafts** — draft before open for threads that need a reply; never send without user
- **Personalization / Voice Match** — learn tone from sent mail + settings profile (not mic yet)
- Autocomplete / Autocorrect in compose

### Phase 4 — MCP

- Tools: `search_emails`, `read_thread`, label/move/archive/snooze, draft-opens-in-app
- Safe defaults: no Trash/OTP/sign-in links; send opt-in; account allowlist
- One-click Cursor / Claude Desktop config
- Align with Superhuman Mail MCP surface where it does not break privacy defaults

### Phase 5 — Polish

- Shortcut packs (already shipped — keep tightening end-to-end), EN-first i18n hooks, calendar RSVP, parcels
- Offline UX first-class (explicit offline mode + queue clarity)
- Signed MSIX/NSIS + SmartScreen, auto-update, full licensing UX

### Phase 6 — Team collaboration (deferred)

Opt-in collaboration layer **after** solo parity. Must not become a silent mail proxy: shared metadata/comments/drafts only with explicit team sync consent; mail bodies stay provider-direct where possible.

Tracked: [#9](https://github.com/keithsimkin/intray-email-client/issues/9)

- Shared Conversations, Team Comments, Shared Drafts
- Team Snippets, Team Read Statuses, Team Reply Indicators
- Team Scheduling (ties to calendar apps)

### Phase 7 — Calendar & voice (deferred)

Tracked: calendar [#10](https://github.com/keithsimkin/intray-email-client/issues/10) · voice [#11](https://github.com/keithsimkin/intray-email-client/issues/11)

- Full calendar: Share Availability, booking links, Meet/Zoom/Teams, See Your Day/Week, Create Event / Instant Event
- Prefer Apps/add-ons path ([#7](https://github.com/keithsimkin/intray-email-client/issues/7)) where it fits
- Write with Voice (dictation → polished email)

---

## Superhuman parity matrix

CRM / sales (HubSpot, Salesforce, Pipedrive, Smart Send, Recent Opens as sales tooling) is **out of core** — route via Apps/add-ons ([#7](https://github.com/keithsimkin/intray-email-client/issues/7)).

| Superhuman area | Intray target | Wave |
| --- | --- | --- |
| Split Inbox (+ library) | Custom tabs + label-backed splits | Phase 2 |
| Snippets | Persisted + compose insert | Phase 2 |
| Remind Me / Auto Reminders / Waiting for Reply | Follow-up engine | Phase 2 |
| Send Later / Undo Send / Snooze | Finish Send Later; deepen snooze sync later | Phase 2 |
| Instant Open / Copy / Intro / Send | One-key flows | Phase 2 |
| Read Statuses | Opt-in tracking | Phase 2 |
| Unsubscribe / Block | Productize | Phase 2 |
| Instant Reply / Write with AI / Auto Summarize | Local/BYO | Phase 3 |
| Auto Labels / Custom / Auto Archive | Triage engine | Phase 3 |
| Auto Drafts / Personalization | Local/BYO | Phase 3 |
| Offline Support | First-class UX | Phase 5 |
| Team collab suite | Opt-in sync; privacy constraints | Phase 6 · [#9](https://github.com/keithsimkin/intray-email-client/issues/9) |
| Calendar & scheduling | Apps-first where possible | Phase 7 · [#10](https://github.com/keithsimkin/intray-email-client/issues/10) |
| Voice compose | OS speech → AI polish | Phase 7 · [#11](https://github.com/keithsimkin/intray-email-client/issues/11) |
| Enterprise admin (SSO, SCIM, coaching, billing) | Lifetime solo first | [#12](https://github.com/keithsimkin/intray-email-client/issues/12) |
| CRM / sales integrations | Apps marketplace | Excluded from core ([#7](https://github.com/keithsimkin/intray-email-client/issues/7)) |

---

## First implementation steps

1. Persist this document (`PRODUCT-PLAN.md`) — done when committed with scaffold.
2. Scaffold `apps/desktop` (Electron + React + Bun) and `apps/web` (Next.js + Netlify).
3. **UI-first:** polish Bloop-inspired four-pane shell with mock data before sync.
4. Then DPAPI `safeStorage` + SQLite schema + Phase 1 provider sync.
5. **Next build focus:** Phase 2 Superhuman speed core — Send Later, Snippets, Remind Me / follow-up, Instant Open, Read Statuses — then Phase 3 triage AI.

---

## Out of scope until later

Mobile apps · pixel-perfect Bloop clone · Apple Intelligence parity · full provider-native UIs for every host · our-cloud AI or mail proxy by default · **CRM/sales panels in core** (Apps instead) · enterprise SSO/SCIM until a team SKU exists
