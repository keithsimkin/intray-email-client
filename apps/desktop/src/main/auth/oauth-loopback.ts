import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { shell } from "electron";

export type LoopbackResult = {
  code: string;
  redirectUri: string;
};

/** Start a one-shot loopback HTTP server and open the system browser. */
export async function listenForOAuthRedirect(
  authorizeUrl: (redirectUri: string) => string,
  opts?: { timeoutMs?: number },
): Promise<LoopbackResult> {
  const timeoutMs = opts?.timeoutMs ?? 5 * 60_000;

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
        const host = req.headers.host ?? "127.0.0.1";
        const url = new URL(req.url ?? "/", `http://${host}`);
        if (url.pathname !== "/") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const err = url.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<html><body><h1>Sign-in failed</h1><p>${err}</p><p>You can close this window.</p></body></html>`,
          );
          finish(new Error(url.searchParams.get("error_description") ?? err));
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h1>Missing code</h1></body></html>");
          return;
        }
        const addr = server.address();
        const port =
          addr && typeof addr === "object" ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
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
      void shell.openExternal(url).catch((e) =>
        finish(e instanceof Error ? e : new Error(String(e))),
      );
    });

    server.on("error", (e) => finish(e));
  });
}

export function randomUrlSafe(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(buf)
    .toString("base64url")
    .replace(/=+$/, "");
}

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest)
    .toString("base64url")
    .replace(/=+$/, "");
}
