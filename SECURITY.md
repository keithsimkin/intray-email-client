# Security

Intray is an open-source desktop mail client. It stores mail credentials, talks to
mail providers over the network, renders untrusted HTML, and exposes a local MCP
endpoint. This document describes the threat model and the guarantees the code
tries to uphold.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Send a private report
to the maintainers via GitHub's *Report a vulnerability* (Security → Advisories) on
the repository, including:

- affected version/commit,
- reproduction steps,
- impact (what an attacker gains).

We aim to acknowledge reports within a few days. Please give us a reasonable
window to ship a fix before public disclosure.

## Threat model

Assets:

- Mail credentials (IMAP/SMTP passwords, OAuth refresh tokens).
- AI provider API keys.
- Local mail database (headers, bodies, attachments).
- The user's machine and accounts, via the send path.

Trust boundaries:

| Boundary | Trusted | Untrusted |
| --- | --- | --- |
| Renderer ↔ main | main process, preload bridge | renderer DOM, email HTML, remote content |
| Network | TLS endpoints you configure | mail servers, API responses, redirects |
| Localhost | the app's own requests | other local processes, web pages in a browser |
| AI | provider you chose | model output, pasted content |
| Native | bundled `@intray/native` addon | any other `.node` file on disk |

Non-goals: defending against a compromised OS account, malware with the user's
privileges, or a malicious mail server that is already trusted to deliver mail.

## Hardening implemented

### Secrets

- Credentials and API keys live in the **main process only** and are encrypted
  with OS secure storage through Electron `safeStorage` (DPAPI on Windows,
  Keychain on macOS).
- The renderer receives typed IPC results, never raw secrets. The MCP token is the
  one exception shown in Settings, by design, so a client can be configured.
- Corrupt or unexpectedly shaped secret blobs fail closed rather than being used.

### Outbound mail

- Messages are built in the main process by an RFC 5322/MIME builder
  (`src/main/mail/mime.ts`): CR/LF/NUL are stripped from header values, non-ASCII
  is RFC 2047 encoded, attachments are base64 encoded with sanitized filenames,
  and `Date`/`Message-ID` are generated server-side.
- Addresses are validated to a strict `addr-spec` form; display-name strings are
  rejected so a header cannot be broken out of.
- SMTP enforces STARTTLS on non-465 ports (`requireTLS`), TLS 1.2+, connection
  timeouts, and disables file/URL access.
- The outbox retries transient failures with exponential backoff and jitter,
  persists attempts, and uses the RFC 822 `Message-ID` to avoid duplicate sends.
  Permanent failures stop retrying.

### Inbound mail

- IMAP uses TLS and timeouts. Polling tracks `UIDVALIDITY` + last seen UID instead
  of re-scanning a window, with jittered backoff and request coalescing.
- Inbound HTML is sanitized in the main process before it reaches the renderer.
- Email bodies render in a sandboxed iframe with a CSP that blocks all remote
  loads by default. Images load only after an explicit per-message opt-in.
- Links are intercepted and opened through a validated allowlist
  (`http`, `https`, `mailto`); the window blocks unexpected navigation.

### OAuth

- The loopback flow validates `state` with `timingSafeEqual`, is GET-only, checks
  the `Host` header, serves escaped HTML with strict security headers, and keeps
  rotated refresh tokens.
- Provider requests have timeouts and limited retries on 429/5xx.

### Local MCP endpoint

- Binds to `127.0.0.1` only.
- Requires a per-install bearer token (32 random bytes, encrypted at rest with OS secure storage).
- Rejects requests carrying `Origin` or `Sec-Fetch-Mode` (browser drive-bys) and
  invalid `Host` headers, and grants no CORS.
- Caps request bodies at 1 MB and clamps tool arguments.
- Falls back to an ephemeral port if the default is occupied, surfacing the new
  URL in Settings.

### App shell

- `contextIsolation` on, `nodeIntegration` off, sandboxed renderer.
- Permission requests are denied by default; external navigation is blocked.
- The dev-only `.env` loader runs only when the app is unpacked in development,
  so a stray file next to the binary cannot inject configuration.
- The mail cache is a local SQLite database opened in WAL mode by the bundled
  Rust addon (`@intray/native`). It stores mail metadata/bodies, never plaintext
  credentials — those remain OS-encrypted blobs.

### AI

- Gemini uses the `x-goog-api-key` header (not a query string).
- Ollama is restricted to loopback.
- The renderer cannot choose a binary path for bridges.
- Requests have timeouts; provider responses are treated as untrusted.

## Operational notes

- Email is sensitive. Treat exported data and crash logs as secrets.
- The MCP token grants full read access to local mail. Rotate it if it leaks.
- Do not add telemetry, remote config, or a mail relay without an explicit,
  documented opt-in — it would break the privacy model above.
