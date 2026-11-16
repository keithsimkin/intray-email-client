import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { URL } from "node:url";
import { shell } from "electron";

export type LoopbackResult = {
  code: string;
  redirectUri: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function page(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // The loopback page never needs to load or run anything.
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  res.end(body);
}

/**
 * One-shot loopback HTTP server for the OAuth authorization-code flow.
 *
 * `expectedState` is mandatory for callers that generate a CSRF state value:
 * without it, any local process (or a page that can reach 127.0.0.1) could
 * hand us an authorization code it obtained for a different session.
 */
export async function listenForOAuthRedirect(
  authorizeUrl: (redirectUri: string) => string,
  opts?: { timeoutMs?: number; expectedState?: string },
): Promise<LoopbackResult> {
  const timeoutMs = opts?.timeoutMs ?? 5 * 60_000;
  const expectedState = opts?.expectedState;

  return new Promise((resolve, reject) => {
    const server = createServer();
    let settled = false;

    const finish = (err?: Error, result?: LoopbackResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else if (result) resolve(result);
      else reject(new Error("OAuth cancelled"));
    };

    const timer = setTimeout(
      () => finish(new Error("OAuth timed out — try again.")),
      timeoutMs,
    );

    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      try {
        // Only the browser's GET redirect belongs here.
        if (req.method !== "GET") {
          res.writeHead(405, { Allow: "GET" });
          res.end();
          return;
        }

        const host = req.headers.host ?? "127.0.0.1";
        // Reject DNS-rebinding attempts that present a foreign Host header.
        if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) {
          page(res, 421, "<h1>Invalid host</h1>");
          return;
        }

        const url = new URL(req.url ?? "/", `http://${host}`);
        if (url.pathname !== "/") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const err = url.searchParams.get("error");
        if (err) {
          page(
            res,
            400,
            `<html><body><h1>Sign-in failed</h1><p>${escapeHtml(err)}</p><p>You can close this window.</p></body></html>`,
          );
          finish(
            new Error(url.searchParams.get("error_description") ?? err),
          );
          return;
        }

        const state = url.searchParams.get("state") ?? "";
        if (expectedState && !safeEqual(state, expectedState)) {
          page(
            res,
            400,
            "<html><body><h1>Sign-in rejected</h1><p>Security state mismatch. Start the connection again from Intray.</p></body></html>",
          );
          finish(new Error("OAuth state mismatch — start sign-in again."));
          return;
        }

        const code = url.searchParams.get("code");
        if (!code) {
          page(res, 400, "<html><body><h1>Missing code</h1></body></html>");
          return;
        }

        const addr = server.address();
        const port = addr && typeof addr === "object" ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/`;
        page(
          res,
          200,
          `<html><body style="font-family:Geist,Segoe UI,system-ui,sans-serif;background:#050506;color:#ededed;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="width:48px;height:4px;border-radius:999px;background:#760E0A;margin:0 auto 20px"></div><h1 style="letter-spacing:-0.04em;font-weight:600">intray connected</h1><p style="color:#8a8f98">You can close this window and return to the app.</p></div></body></html>`,
        );
        finish(undefined, { code, redirectUri });
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        finish(new Error("Failed to bind OAuth loopback port"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${addr.port}/`;
      const url = authorizeUrl(redirectUri);
      // Only ever hand an HTTPS authorization URL to the OS shell.
      if (!/^https:\/\//i.test(url)) {
        finish(new Error("Invalid OAuth authorization URL"));
        return;
      }
      void shell.openExternal(url).catch((e) =>
        finish(e instanceof Error ? e : new Error(String(e))),
      );
    });

    server.on("error", (e) => finish(e));
  });
}

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url").replace(/=+$/, "");
}

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest)
    .toString("base64url")
    .replace(/=+$/, "");
}
