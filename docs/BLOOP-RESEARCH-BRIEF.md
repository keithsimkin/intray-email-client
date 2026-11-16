# Windows mail app — product brief (inspired by Bloop.email)

Reference: https://bloop.email/ (Mac-only as of Nov 2026, v1.7.26)  
Goal: build a **Windows-native alternative** with the same product pillars, adapted to Windows UX (system tray, WinUI/Fluent, Credential Manager, etc.).

---

## 1. Positioning (copy their wedge)

**One-liner:** All your inboxes in one place. Native fast. AI enabled.

**Pillars (in order of marketing weight):**
1. **Unified inbox** — Gmail, Outlook, iCloud, Yahoo, AOL, Fastmail, Zoho, any IMAP
2. **Privacy by architecture** — no product server in the mail path; device ↔ provider only
3. **Local / BYO AI** — drafts, ask, summarize, translate; keys/local models, never through our servers
4. **MCP for agent tools** — Claude, Claude Code, Codex, Cursor, Antigravity (and Windows peers) can read/act on mail locally
5. **Simple monetization** — free trial → cheap **one-time** lifetime license (Bloop: 7 days, then $4.99)

**Trust strip:** “Used by people at …” logos (TCS, Infosys, AT&T, Vercel, Salesforce, Atlys)

---

## 2. Landing page structure (UI to echo, not clone pixel-for-pixel)

Site is **Next.js on Vercel**, dark-first marketing site.

### Design tokens (from live CSS)
| Token | Value |
| --- | --- |
| Background | `#000` |
| Foreground | `#ededed` |
| Muted | `#8a8f98` |
| Line / hairline | `#ffffff14` |
| Surface | `#0a0a0b` |
| Font | Geist / Geist Mono |
| Primary CTA | white pill, dark text, full-round radius |
| Secondary CTA | dark outline pill |

### Page sections (home, top → bottom)
1. **Nav** — wordmark left · Features / Compare / Pricing / Guides · Download CTA right  
2. **Hero** — “New” MCP badge · H1 · supporting sentence · Download + Buy · OS/trial meta · **demo video** (app walkthrough) · company logos  
3. **Privacy** — split headline + body · diagram: Provider → TLS → Your PC (empty “our server”)  
4. **AI agent** — left copy + vertical tabs; right product mock card  
   - Tabs: Write with AI · Ask AI · Summarize · Translate  
5. **MCP** — headline · Claude-style chat mock (`search_emails`, `read_thread`) · integration chips · 4 benefit cards  
6. **Features** — dense grid of 18 feature cards (each: title + 1–2 sentences + optional visual)  
7. **Compare** — score table vs Spark / Superhuman / Outlook / Apple Mail  
8. **Providers** — account type tiles + setup guide links  
9. **Changelog** — shipping cadence as social proof  
10. **FAQ** — accordion  
11. **Pricing CTA** — trial + lifetime  
12. **Footer** — product / privacy / guides / Discord / X / contact  

### Hero / marketing CTAs
- Primary: Download free trial  
- Secondary: Get lifetime at launch price (strikethrough regular → sale)  
- Sticky bottom bar: trial reminder + buy  
- Cookie banner (optional on our site): Decline / Accept  

### Demo video story beats (from aria label)
Onboarding → read/summarize → suggested reply → switch accounts → Ask AI → snooze → calendar → switch layouts (**Panels**, **Wide List**, **Spark**)

---

## 3. Feature inventory (complete)

### A. Accounts & sync
- Multi-account: Gmail, Outlook/Hotmail/M365, iCloud, Yahoo, AOL, Fastmail, Zoho, generic IMAP  
- Unified views: one Inbox / Sent / Snoozed / label across accounts  
- Account switch shortcuts (Mac ⌘1–⌘9 → Windows Ctrl+1–9)  
- Outlook: OAuth on Microsoft’s page; others: app password  
- Credentials in OS secret store (Mac Keychain → **Windows Credential Manager / DPAPI**)  
- Offline sync; clear offline indicator  
- Aliases with own outgoing SMTP (DMARC-friendly)  
- Sender avatars (domain icon / DuckDuckGo / Gravatar hash); toggleable  
- Full local backup (incl. alias server passwords)

### B. Privacy & security
- No mail relay / no analytics / no crash phones-home (their claim)  
- Tracker blocking: remote images off until user loads  
- No ads from provider web UIs  
- Sandboxed native app  
- License check only talks to licensing provider (key only)

### C. Triage & productivity
- **Important / Other** split (people + security alerts vs newsletters/promos/receipts)  
- **Waiting for Reply** auto-label after 2/3/5/7 days; one-click follow-up draft  
- **Reply Later** — park + remind at chosen time  
- Subscription cleanup: open-rate by sender, one-click unsubscribe, archive all + Undo  
- Snooze: later today / tomorrow / weekend / next week  
- Send Later / Outbox / Scheduled  
- Undo Send (few-second window; tray countdown)  
- Signatures (import from Gmail/Sent)  
- Labels & nested folders, colored, unread counts  
- Star / archive / delete / move  
- Search: local-first, then server; multi-word any-order; show undownloaded hits  
- Two+ layouts: side-by-side (Panels), Wide List (Gmail-like bulk), Spark-like  
- Shortcut packs: Apple Mail / Gmail / Superhuman → remap any key  
- Light / dark / density; force dark HTML bodies in dark mode  
- i18n: EN, ES, FR, DE, IT, PT, RU, JA, KO, ZH, HI  
- Calendar: invites Yes/Maybe/No; “meeting now / within hour” + Join  
- Parcel tracking cards from shipping mail  
- Pin people (always top; unread badge)  
- Sign-in codes: detect + **Copy** from recent mail / alerts  
- Sign-in links: open from notification  

### D. Notifications (Mac notch → Windows equivalents)
- Drop-down / toast: read & reply without focusing main window  
- **System tray / notification area panel** (their Menu Bar in 1.7.25):  
  - Unread badge / Important-only / dot  
  - Newest mail: read, reply, archive, delete, star, snooze  
  - AI suggested replies + Write with AI + templates + attachments + dictation  
  - **Catch Me Up** — summarize all unread, actionable first  
  - Ask AI from tray  
  - Waiting on you (people first)  
  - Pin people, OTP codes, meeting card, parcels, follow-ups, Reply Later  
  - Undo Send countdown  
  - Drop files on tray icon → new compose with attachments  
  - Global hotkey (Mac ⌃⌥M → pick Windows chord)  
  - Keyboard in panel: arrows, Enter, E, Delete, U, S, /  
  - Archive all unread newsletters/notifications + Undo  
  - Switch accounts/workspaces; pause alerts  
  - Account connection warning + Try Again  

### E. AI (in-app)
Providers: Apple Intelligence (Mac) → on Windows use **Windows Copilot+/Phi local where available**, **Ollama**, **OpenAI / Claude / Grok keys**, plus CLI bridges (fx, Grok CLI, Claude Code, Codex, Gemini CLI).

| Feature | Behavior |
| --- | --- |
| Write with AI | 3 suggested replies in your voice; stream draft; Shorter / Friendlier / More Formal |
| Ask AI | Natural language over all/selected accounts; citations to emails; Recent Chats |
| Summarize | Thread gist; point count + open asks |
| Translate | Thread or single message |
| AI Memory | How you write per frequent contact; forget anyone |
| Rules rewrite | AI-assisted rules |
| Confirmations | Show exact emails before Trash/Junk; Esc/Enter UX |

### F. MCP server (local)
- Built-in MCP; one-click add for Claude Desktop, Claude Code, Codex, Cursor, Antigravity  
- Tools implied: `search_emails`, `read_thread`, label/move/archive/snooze, draft reply that opens in app  
- Permissions: which accounts; never Trash / OTP / sign-in links by default; Spam only if asked; send only if enabled  
- Local only: app ↔ AI client on same machine  
- Auto-launch / retry if client can’t reach server  

### G. Licensing & onboarding
- 7-day full trial, no card  
- Lifetime key paste / activation link  
- Setup: pick provider → OAuth or app password → use  
- Non-refundable after trial (their policy)

---

## 4. Competitive axes they score (adapt for Windows)

Replace Apple Mail with **Windows Mail / Outlook new / Thunderbird**; keep Spark/Superhuman if relevant.

Must-win rows for our story:
1. All accounts, one inbox  
2. Tray / quick-reply surface (Windows toast + tray panel)  
3. OTP copy + sign-in link from alert  
4. Snooze + send later  
5. AI drafts/summaries included  
6. On-device or BYO AI (Ollama / local)  
7. MCP one-click  
8. Mail never through our servers  
9. No subscription  
10. Mobile later (“coming soon” is fine)

---

## 5. Windows adaptation map

| Bloop (Mac) | Our Windows product |
| --- | --- |
| Native Swift/AppKit-ish Mac app | Prefer **native or near-native**: WinUI 3 / Tauri+WebView2 / Electron only if forced |
| Keychain | Windows Credential Manager |
| Notch notifications | Toast + optional always-on-top quick panel; **system tray** is the hero |
| Menu bar app | Tray flyout (Win11 Notification Center–adjacent UX) |
| Apple Intelligence | Copilot+ NPU / Windows ML / Ollama; always BYO cloud keys |
| ⌘ shortcuts | Ctrl / Win key packs; Gmail + Superhuman maps |
| Notarization | SmartScreen / code signing |
| macOS Sequoia 15+ | Windows 10 22H2+ or Windows 11 focus (decide) |

---

## 6. Suggested MVP scope (build order)

### Phase 0 — Brand & marketing site
Dark Geist-like landing mirroring section order; Windows Download CTA; same privacy diagram language.

### Phase 1 — Core mail
IMAP + Gmail + Outlook OAuth · local SQLite/store · unified inbox · Important/Other · search · compose/send · offline · Credential Manager · two layouts.

### Phase 2 — Power mail
Snooze, Send Later, Undo Send, Waiting for Reply, subscription cleanup, signatures, labels, tray panel v1, OTP copy.

### Phase 3 — AI
BYO keys + Ollama · Write with AI · Ask AI · Summarize · Translate · Catch Me Up in tray.

### Phase 4 — MCP
Local MCP server + one-click Cursor/Claude Desktop setup + permission UI.

### Phase 5 — Polish
Shortcut packs, i18n, calendar cards, parcels, licensing, auto-update, signed installer.

---

## 7. Open decisions (for project thread)

1. **Product name** (not “Bloop”)  
2. **Stack**: WinUI vs Tauri vs Electron  
3. **Windows version floor**  
4. **Price** (match $4.99 lifetime or different)  
5. **First providers** (Gmail+Outlook+IMAP vs all)  
6. **How close to clone the marketing UI** vs distinct brand  
7. **Mobile**: skip / later  

---

## 8. Reference URLs
- Home: https://bloop.email/  
- Features: https://bloop.email/features  
- MCP: https://bloop.email/mcp  
- Compare: https://bloop.email/compare  
- Privacy: https://bloop.email/privacy  
- Download: https://bloop.email/download  
- Changelog: https://bloop.email/changelog  
- Demo video: https://bloop.email/home/demo.mp4  

Screenshots captured this session (hero, AI, MCP): under browser-artifacts.
