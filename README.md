<p align="center">
  <img src="assets/icon.svg" width="72" height="72" alt="Intray">
</p>

<h1 align="center">Intray</h1>

<p align="center">
  <strong>All your inboxes in one place. Native fast. AI enabled.</strong><br>
  A Windows-first unified mail client — privacy by architecture, local/BYO AI, system tray triage, and built-in MCP.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#desktop-app">Desktop</a>
  ·
  <a href="#marketing-site">Web</a>
  ·
  <a href="#contributing">Contributing</a>
  ·
  <a href="PRODUCT-PLAN.md">Product plan</a>
</p>

<p align="center">
  <img src="docs/ui-ref/intray-electron-screenshot.png" alt="Intray desktop app screenshot" width="900">
</p>

---

## What is Intray?

Intray is an open-source **Windows unified mail client**. It connects Gmail, Outlook, iCloud, Yahoo, Fastmail, and other IMAP providers into one inbox on your PC. Mail stays on the device path to your providers — there is **no Intray mail relay**.

It is inspired by Mac-only clients like [Bloop](https://bloop.email/), built for Windows tray workflows, DPAPI-backed secrets, and agent tooling via MCP.

| Pillar | What it means |
| --- | --- |
| **Unified inbox** | Gmail OAuth + IMAP/SMTP accounts in one UI |
| **Privacy by architecture** | Device ↔ provider only; credentials encrypted with Windows DPAPI |
| **Local / BYO AI** | OpenAI, Anthropic, Gemini, Grok, Ollama, Claude Code, Codex, Cursor — keys stay on this PC |
| **MCP** | Localhost tools so Cursor / Claude / Codex can search and read mail |
| **Tray-first** | System tray triage, notifications, optional start with Windows |

> **Status:** early development (v0.1). The UI runs with demo data until you connect an account. Expect breaking changes.

---

## Table of contents

- [Requirements](#requirements)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Desktop app](#desktop-app)
  - [Run in development](#run-in-development)
  - [Connect Gmail (OAuth)](#connect-gmail-oauth)
  - [Connect IMAP accounts](#connect-imap-accounts)
  - [AI providers](#ai-providers)
  - [MCP server](#mcp-server)
  - [Build a Windows installer](#build-a-windows-installer)
- [Marketing site](#marketing-site)
- [Scripts reference](#scripts-reference)
- [Architecture](#architecture)
- [Privacy model](#privacy-model)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Key contributors](#key-contributors)
- [Docs](#docs)
- [License](#license)

---

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| **OS** | Windows 10 22H2+ | Windows 11 recommended for tray/toast polish |
| **[Bun](https://bun.sh)** | 1.3+ | Package manager and script runner for this monorepo |
| **Git** | recent | Clone and contribute |
| **Google Cloud project** | optional | Only needed for live Gmail OAuth |

Install Bun on Windows (PowerShell):

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Confirm:

```powershell
bun --version
```

---

## Repository layout

This is a **Bun workspaces** monorepo:

```
windows-unified-mail/          # repo root (package name: intray)
├── apps/
│   ├── desktop/               # @intray/desktop — Electron + React mail client
│   │   ├── src/main/          # Node main process (mail, DB, OAuth, MCP, tray)
│   │   ├── src/preload/       # contextBridge IPC surface
│   │   ├── src/renderer/      # React UI
│   │   ├── src/shared/        # shared types
│   │   ├── resources/         # app / tray icons
│   │   └── .env.example       # Gmail OAuth template
│   └── web/                   # @intray/web — Next.js marketing site (Netlify)
├── assets/                    # brand mark, wordmark, icons
├── docs/                      # research brief + UI reference frames
├── PRODUCT-PLAN.md            # product + technical plan
├── netlify.toml               # web deploy config
└── package.json               # workspace scripts
```

| Package | Path | Role |
| --- | --- | --- |
| `@intray/desktop` | [`apps/desktop`](apps/desktop) | Desktop mail app (Electron + React + TypeScript) |
| `@intray/web` | [`apps/web`](apps/web) | Marketing site (Next.js → Netlify) |

---

## Quick start

From a clean machine to a running desktop window:

```powershell
git clone https://github.com/keithsimkin/intray-email-client.git
cd intray-email-client

bun install

# Desktop app (demo inbox until you add a real account)
bun run dev:desktop

# In another terminal — marketing site at http://localhost:3000
bun run dev:web
```

Without a connected account, the desktop UI still loads **demo data** so you can explore layouts and flows.

---

## Desktop app

### Run in development

```powershell
bun install
bun run dev:desktop
```

This runs `electron-vite dev` for `@intray/desktop`. Hot reload applies to the renderer; main-process changes usually require a restart.

Useful variants:

```powershell
# From the desktop package directly
cd apps/desktop
bun run dev

# Production-like local preview (build + open)
bun run preview

# Compile only (no installer)
bun run build
```

### Connect Gmail (OAuth)

Gmail uses a **Google Desktop OAuth client**. Tokens are stored on this PC via Electron `safeStorage` (Windows DPAPI).

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services**.
2. Create or select a project.
3. Enable the **Gmail API**.
4. **Credentials** → **Create credentials** → **OAuth client ID** → type **Desktop app**.
5. Copy the client ID into `apps/desktop/.env`:

```powershell
cd apps/desktop
copy .env.example .env
# Edit .env and set:
# GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Template ([`apps/desktop/.env.example`](apps/desktop/.env.example)):

```env
# Google Cloud Console → APIs & Services → Credentials
# Create an OAuth client ID of type "Desktop app"
# Enable Gmail API on the project.
GMAIL_CLIENT_ID=
# Optional — only if your client is a Web application type
# GMAIL_CLIENT_SECRET=
```

6. Restart the desktop app (`bun run dev:desktop`).
7. In the app: **Add account** → **Gmail** and finish the browser OAuth loopback flow.

> Never commit `.env`. It is gitignored. Only `.env.example` belongs in the repo.

### Connect IMAP accounts

For **iCloud, Outlook.com, Yahoo, Fastmail, Zoho, AOL**, or any generic IMAP provider:

1. Create an **app password** (or IMAP password) in that provider’s security settings.
2. In Intray: **Add account** → pick the provider (or custom IMAP).
3. Enter email + app password.

Credentials are encrypted with Windows DPAPI on this machine. Mail syncs provider ↔ app over TLS; nothing is uploaded to an Intray server.

### AI providers

**Settings → AI & agents** supports:

- OpenAI, Grok (xAI), Anthropic, Gemini
- Ollama (local)
- Claude Code, Codex, Cursor-oriented setups

API keys are encrypted with DPAPI. Mail content is sent only to the AI provider **you** configure — never through an Intray backend.

### MCP server

On launch, Intray starts a **localhost-only** MCP endpoint (default port **47821**):

```text
http://127.0.0.1:47821/mcp
```

Built-in tools:

| Tool | Purpose |
| --- | --- |
| `search_emails` | Search local mail by query |
| `read_thread` | Read a message/thread by id |
| `list_accounts` | List connected accounts on this device |

Toggle MCP under **Settings → AI & agents**. Point Cursor, Claude Desktop, Claude Code, or Codex at that URL when you want agents to read mail locally.

### Build a Windows installer

```powershell
cd apps/desktop
bun run pack
```

This runs `electron-vite build` then `electron-builder --win` (NSIS). Output lands in `apps/desktop/release/`.

App id: `app.intray.desktop` · Product name: **Intray**.

---

## Marketing site

The landing page lives in [`apps/web`](apps/web) (Next.js). Netlify build settings are in [`netlify.toml`](netlify.toml) (`base = apps/web`).

```powershell
bun run dev:web
# → http://localhost:3000

bun run build:web
```

From the web package:

```powershell
cd apps/web
bun run dev
bun run build
bun run lint
```

---

## Scripts reference

From the **repo root** (`package.json`):

| Script | What it does |
| --- | --- |
| `bun install` | Install all workspace dependencies |
| `bun run dev:desktop` | Electron app in development |
| `bun run dev:web` | Next.js marketing site |
| `bun run build:desktop` | Build desktop renderer/main bundles |
| `bun run build:web` | Production build of the marketing site |

Desktop-only (`apps/desktop`):

| Script | What it does |
| --- | --- |
| `bun run dev` | `electron-vite dev` |
| `bun run build` | `electron-vite build` |
| `bun run preview` | Preview the built app |
| `bun run pack` | Build + NSIS Windows installer |

---

## Architecture

```text
Mail providers (Gmail API / IMAP+SMTP)
        │ TLS
        ▼
┌─────────────────────────────────────┐
│ Intray Desktop (Electron)           │
│  React UI + tray                    │
│  Node sync · SQLite (sql.js)        │
│  DPAPI safeStorage · AI router      │
│  Local MCP server (:47821)          │
└─────────────────────────────────────┘
        │                    │
        ▼                    ▼
  Ollama / BYO keys    Cursor / Claude / Codex
```

**Process boundaries** (follow these when contributing):

| Layer | Path | Responsibility |
| --- | --- | --- |
| **Main** | `apps/desktop/src/main/` | Windows, tray, OAuth, IMAP, DB, credentials, AI secrets, MCP, notifications |
| **Preload** | `apps/desktop/src/preload/` | Thin `contextBridge` — typed IPC only, no business logic |
| **Renderer** | `apps/desktop/src/renderer/` | React UI |
| **Shared** | `apps/desktop/src/shared/` | Types shared across processes |

Hard rules:

- Secrets and API keys live in **main** only (DPAPI via `safeStorage`).
- Do not put mail credentials or AI keys in the renderer, logs, or URLs.
- Prefer extending preload with a minimal typed method over widening Node access in the UI.

---

See [SECURITY.md](SECURITY.md) for the threat model and how to report issues.

## Privacy model

- Mail bodies and headers leave the machine only to **your** mail provider or **your** chosen AI endpoint.
- App passwords and OAuth tokens are encrypted with **Windows DPAPI** (`Electron safeStorage`).
- MCP listens on **127.0.0.1** only.
- Crash/analytics are off by default (product plan); do not add phone-home without an explicit, documented opt-in.
- License checks (when added) are key-only — never mail content.

---

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| `GMAIL_CLIENT_ID is not set` | Create `apps/desktop/.env` from `.env.example`, set the Desktop OAuth client ID, restart the app |
| OAuth browser flow fails | Confirm Gmail API is enabled; client type is **Desktop app**; no conflicting `GMAIL_CLIENT_SECRET` unless you intentionally use a Web client |
| App opens with only demo mail | Expected until an account is added — use **Add account** |
| MCP tools unreachable | Check Settings → AI & agents that MCP is enabled; hit `http://127.0.0.1:47821/mcp` from the same machine |
| `bun install` fails | Use Bun 1.3+; delete `node_modules` and retry from repo root |
| DPAPI / encryption errors | Run on a normal Windows user session (encryption needs OS secure storage) |

---

## Contributing

Contributions are welcome — code, docs, bug reports, and UX polish. Newcomers and non-code contributions are encouraged.

**Short path:**

1. Fork the repo and create a branch from `master`.
2. `bun install` at the repo root.
3. Make a focused change (one concern per PR).
4. Run the relevant app (`bun run dev:desktop` or `bun run dev:web`) and verify manually.
5. Open a pull request with a clear description of **why** and how you tested.

Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for project structure, coding conventions, PR checklist, and issue guidance.

### Good first contributions

- Fix typos / clarify docs and README steps
- Improve empty states and error copy in the renderer
- IMAP provider presets and onboarding hints
- Accessibility and keyboard shortcuts
- Marketing site content and performance

Use GitHub Issues for bugs and proposals. Prefer a small reproduction or screenshot for UI bugs.

---

### Key contributors

| Name | Role | Links |
| --- | --- | --- |
| [Keith Simkin](https://github.com/keithsimkin) | Creator / maintainer | [Twitter / X](https://x.com/Ctrlthenarative) (`@Ctrlthenarative`) |

---

## Docs

| Document | Contents |
| --- | --- |
| [PRODUCT-PLAN.md](PRODUCT-PLAN.md) | Product pillars, architecture, phased delivery |
| [docs/BLOOP-RESEARCH-BRIEF.md](docs/BLOOP-RESEARCH-BRIEF.md) | Competitive / research brief |
| [docs/ui-ref/](docs/ui-ref/) | UI reference frames and screenshots |
| [SECURITY.md](SECURITY.md) | Threat model and vulnerability reporting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to develop and submit changes |
| [apps/desktop/.env.example](apps/desktop/.env.example) | Gmail OAuth env template |

---

## License

Intray is licensed under the **[GNU General Public License v3.0 or later](LICENSE)**, with additional attribution terms.

In plain terms:

- You are free to use, study, modify, and share Intray.
- If you **redistribute** it (original or modified), you must keep it **open source** under GPL-3.0-or-later and provide corresponding source as the GPL requires.
- You must **give credit to Intray** — name it as “Intray” or “based on Intray” in your README (or equivalent) and about/credits UI, and keep copyright notices intact.
- Modified versions must be marked as modified and must not claim to be the official Intray release.

See [`LICENSE`](LICENSE) for the full legal text and [`NOTICE`](NOTICE) for the short attribution summary.

---

<p align="center">
  <img src="assets/wordmark.svg" alt="intray" height="28">
</p>
