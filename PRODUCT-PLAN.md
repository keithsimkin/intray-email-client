# Intray — Windows Unified Mail Product Plan

Reference research: [docs/BLOOP-RESEARCH-BRIEF.md](docs/BLOOP-RESEARCH-BRIEF.md)  
Inspired by [bloop.email](https://bloop.email/) (Mac-only). Goal: Windows-native alternative with the same pillars, adapted to tray / WinUI-adjacent UX / Credential Manager.

**One-liner:** All your inboxes in one place. Native fast. AI enabled.

---

## Locked defaults

| Decision | Default | Why |
| --- | --- | --- |
| **Name** | **Intray** | Short, Windows-tray-forward, not Bloop-adjacent; working name until domain secured |
| **Stack** | **Electron + React + TypeScript + Bun** | Fastest path for tray/OAuth/IMAP/MCP; Chromium UI; Bun for installs & scripts |
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
│  Node sync · SQLite+FTS5            │
│  DPAPI safeStorage · AI router      │
│  Local MCP server                   │
└─────────────────────────────────────┘
        │                    │
        ▼                    ▼
  Ollama / BYO keys    Cursor / Claude / Codex
        │
        ▼
  License API (key only — never mail)
```

**Hard privacy rules:** mail bodies/headers never leave the machine except to the user’s chosen provider or AI endpoint; crash/analytics off by default; license traffic is key-only.

### Desktop (`apps/desktop`)

- Electron shell (electron-vite + Bun): frameless window + system tray flyout (hero surface)
- React + TypeScript UI: Bloop-inspired dark four-pane shell (account rail · folders · list · reader); layouts **Panels** and **Wide List** in MVP
- Main-process: IMAP (IDLE), Gmail API, Microsoft Graph; SQLite + FTS5; Electron `safeStorage` (Windows DPAPI); send queue; MCP — deferred while UI is the focus
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

### Phase 2 — Power mail + tray v1

- Snooze, Send Later, Undo Send, Waiting for Reply, labels, signatures
- Tray flyout: unread/Important, message actions, OTP detect+copy, global hotkey (Ctrl+Alt+M)
- Subscription cleanup basics

### Phase 3 — AI

- Ollama + BYO keys; Write / Ask / Summarize / Translate; Catch Me Up in tray
- Confirmations before destructive AI actions

### Phase 4 — MCP

- Tools: `search_emails`, `read_thread`, label/move/archive/snooze, draft-opens-in-app
- Safe defaults: no Trash/OTP/sign-in links; send opt-in; account allowlist
- One-click Cursor / Claude Desktop config

### Phase 5 — Polish

- Shortcut packs, EN-first i18n hooks, calendar RSVP, parcels
- Signed MSIX/NSIS + SmartScreen, auto-update, full licensing UX

---

## First implementation steps

1. Persist this document (`PRODUCT-PLAN.md`) — done when committed with scaffold.
2. Scaffold `apps/desktop` (Electron + React + Bun) and `apps/web` (Next.js + Netlify).
3. **UI-first:** polish Bloop-inspired four-pane shell with mock data before sync.
4. Then DPAPI `safeStorage` + SQLite schema + Phase 1 provider sync.

---

## Out of scope until later

Mobile apps · pixel-perfect Bloop clone · Apple Intelligence parity · full provider-native UIs for every host · our-cloud AI or mail proxy
