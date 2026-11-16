<img src="assets/icon.svg" width="64" height="64" alt="Intray">

# Intray

Windows unified mail — all your inboxes in one place. Native fast. AI enabled.

Privacy by architecture (no mail relay), local/BYO AI, system tray triage, and built-in MCP. Lifetime license after a 7-day trial.

## Docs

- [PRODUCT-PLAN.md](PRODUCT-PLAN.md) — product + technical plan
- [docs/BLOOP-RESEARCH-BRIEF.md](docs/BLOOP-RESEARCH-BRIEF.md) — research brief
- [docs/ui-ref/](docs/ui-ref/) — frames from the Bloop demo video

## Monorepo

| Package | Path | Role |
| --- | --- | --- |
| `@intray/web` | `apps/web` | Marketing site (Next.js → Netlify) |
| `@intray/desktop` | `apps/desktop` | Desktop app (Electron + React) |

Package manager: **Bun**.

## Develop

```bash
bun install
bun run dev:desktop   # Electron app (demo data until a Gmail account is added)
bun run dev:web       # marketing site
```

### Accounts

| Provider | How you sign in |
| --- | --- |
| **Gmail** | Google OAuth (easiest) — needs `GMAIL_CLIENT_ID` in `apps/desktop/.env` |
| **iCloud / Outlook / Yahoo / Fastmail / other** | Email + **app password** over IMAP/SMTP |

App passwords and OAuth tokens are encrypted with Windows DPAPI on this PC. Mail never routes through an Intray server.

Without a connected account the UI still runs on demo data. Settings → Notifications includes **Start with Windows**.

### AI (BYO)

Settings → **AI & agents**: OpenAI, Grok (xAI), Anthropic, Gemini, Ollama, Claude Code, Codex, or Cursor. API keys are encrypted with Windows DPAPI on this PC. Mail is sent only to the provider you pick.

### MCP

On launch Intray starts a localhost MCP endpoint (`http://127.0.0.1:47821/mcp`) with `search_emails`, `read_thread`, and `list_accounts`. Toggle it in Settings → AI & agents.

## Requirements

- Windows 10 22H2+ (Win11 recommended)
- [Bun](https://bun.sh) 1.3+
