# Contributing to Intray

Thanks for helping build Intray. This guide covers how to set up a development environment, where code lives, and how we review changes.

If you only need to run the apps, start with the [README](README.md#quick-start).

---

## License

By contributing, you agree that your contributions are licensed under the same terms as the project: **GPL-3.0-or-later** with the Intray attribution requirements in [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## Code of conduct

Be respectful in issues, PRs, and review comments. Assume good intent; disagree with ideas, not people. Harassment or hostile behavior is not welcome.

---

## Ways to contribute

- **Bugs** — open an issue with OS version, Bun version, steps to reproduce, and screenshots when UI-related
- **Features** — open an issue first for larger ideas so we can align with [PRODUCT-PLAN.md](PRODUCT-PLAN.md)
- **Docs** — README, CONTRIBUTING, product plan clarifications, setup fixes
- **Code** — desktop (`apps/desktop`), Rust mail store (`crates/intray-native`), or marketing site (`apps/web`)
- **Design** — UI polish that matches the existing dark shell and brand tokens (see `assets/` and product plan)

---

## Development setup

### Prerequisites

- Windows 10 22H2+ (Win11 preferred)
- [Bun](https://bun.sh) 1.3+
- [Rust](https://rustup.rs) stable (MSVC toolchain on Windows) — required to build `@intray/native`
- Git
- Optional: Google Cloud Desktop OAuth client for live Gmail

### Clone and install

```powershell
git clone https://github.com/keithsimkin/intray-email-client.git
cd intray-email-client
bun install
bun run build:native   # compiles the Rust SQLite addon
```

### Run apps

```powershell
# Desktop (Electron) — builds native first, then electron-vite
bun run dev:desktop

# Marketing site (Next.js) — separate terminal
bun run dev:web
```

### Optional: Gmail for real sync

```powershell
copy apps\desktop\.env.example apps\desktop\.env
# Set GMAIL_CLIENT_ID, then restart the desktop app
```

See [README → Connect Gmail](README.md#connect-gmail-oauth) for the full Cloud Console steps.

---

## Project structure

```
apps/desktop/src/
  main/        Electron main: mail façade, OAuth, IMAP, MCP, tray, secrets
  preload/     contextBridge — keep thin and typed
  renderer/    React UI
  shared/      Cross-process types

crates/intray-native/
  src/         Rust mail store (SQLite WAL + FTS5) exposed via napi-rs as @intray/native

apps/web/src/
  app/         Next.js App Router pages
  components/  Landing sections and brand
```

### Electron + Rust boundaries (important)

| Do | Don’t |
| --- | --- |
| Keep credentials and AI keys in **main** (`safeStorage` / DPAPI) | Pass secrets into the renderer, DOM, or logs |
| Put persistence / search hot paths in **`crates/intray-native`** | Reintroduce in-process WASM SQLite (`sql.js`) for the mail cache |
| Keep schema owned by Rust (`crates/intray-native/src/schema.rs`) | Drift a second live schema in TypeScript |
| Add IPC via **preload** as a small typed surface | Enable `nodeIntegration` or weaken `contextIsolation` |
| Put shared shapes in `src/shared/` | Duplicate drifting types in main and renderer |
| Prefer privacy defaults (localhost MCP, no mail relay) | Add network calls that send mail to third parties without clear user opt-in |

---

## Branching and commits

1. Fork the repository (or create a branch if you have write access).
2. Branch from `master`:

   ```powershell
   git checkout master
   git pull
   git checkout -b fix/short-description
   ```

3. Keep PRs focused — one problem or feature per PR.
4. Write commit messages that explain **why**, not only what changed.

Examples:

```text
fix: surface missing GMAIL_CLIENT_ID in add-account flow
docs: document IMAP app-password setup in README
feat: add Fastmail IMAP preset defaults
```

---

## Before you open a PR

Checklist:

- [ ] `bun install` succeeds from repo root
- [ ] Desktop and/or web app runs for the area you touched
- [ ] No secrets (`.env`, keys, tokens) in the diff
- [ ] UI changes match existing patterns (avoid unrelated redesigns)
- [ ] Docs updated if you changed setup, env vars, or scripts
- [ ] PR description covers motivation, approach, and how you tested

### Manual test suggestions

**Desktop**

- App launches with demo data
- Add-account modal still opens; Gmail path shows a clear error if `GMAIL_CLIENT_ID` is missing
- Settings → AI & agents / MCP toggles still render
- Tray still appears on Windows

**Web**

- `bun run dev:web` loads the landing page
- `bun run build:web` completes if you changed Next.js pages or components

Automated tests are still sparse — prefer clear manual verification notes in the PR until a test suite lands.

---

## Pull request process

1. Push your branch and open a PR against `master`.
2. Link related issues (`Fixes #123`).
3. Maintainers may ask for changes; push follow-up commits to the same branch.
4. Squash or keep a clean history — either is fine if the final story is clear.

---

## Security and privacy reports

If you find a vulnerability (credential leak, MCP exposure beyond localhost, unsafe IPC, etc.), **do not** open a public issue with exploit detail. Email or message a maintainer privately, or open a minimal issue without reproduction steps that could be abused.

Never commit:

- `.env` files
- OAuth client secrets you were not asked to rotate publicly
- Real mailbox exports or user mail fixtures with personal data

Use synthetic/demo data in screenshots and fixtures.

---

## Brand and UI notes

- Brand color: `#760E0A` (signal `#C4453D`) — see [PRODUCT-PLAN.md](PRODUCT-PLAN.md)
- Assets: [`assets/`](assets/) (icon, mark, wordmark)
- Desktop UI: dark four-pane shell; prefer extending existing CSS/components over introducing a parallel design system
- Marketing site: Next.js landing; keep section purpose clear and avoid cluttering the hero

---

## Questions

- Product / roadmap → [PRODUCT-PLAN.md](PRODUCT-PLAN.md) or a GitHub Discussion/Issue
- Setup stuck → [README troubleshooting](README.md#troubleshooting)
- “Is this a good first issue?” → open an issue and tag it; maintainers can label `good first issue` when scoped
