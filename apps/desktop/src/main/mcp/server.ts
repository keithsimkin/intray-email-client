import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getMail, listMail } from "../mail/service";
import { listAccountRows } from "../db";
import { getMcpToken, verifyMcpToken } from "./auth";

type McpStatus = {
  running: boolean;
  port: number | null;
  url: string | null;
  /** Bearer token clients must send. Only visible in this user's app. */
  token?: string;
  /** Copy-paste config for an MCP client. */
  config?: string;
};

let server: ReturnType<typeof createServer> | null = null;
let port: number | null = null;

const MAX_BODY_BYTES = 1_000_000;
const MAX_QUERY_LENGTH = 500;

const TOOLS = [
  {
    name: "search_emails",
    description:
      "Search local Intray mail by query string. Returns subject, from, preview, and ids.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        folder: { type: "string", description: "Folder id, default inbox" },
        limit: { type: "number", description: "Max results, default 20" },
      },
      required: ["q"],
    },
  },
  {
    name: "read_thread",
    description: "Read a message/thread by Intray message id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message id from search_emails" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_accounts",
    description: "List connected mail accounts on this device.",
    inputSchema: { type: "object", properties: {} },
  },
];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function shortString(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "search_emails": {
      const q = shortString(args.q, MAX_QUERY_LENGTH);
      if (!q.trim()) return { error: "q is required" };
      const folder = shortString(args.folder ?? "inbox", 64) || "inbox";
      const limit = clampInt(args.limit, 1, 100, 20);
      const result = await listMail({
        accountId: "all",
        folder,
        filter: "all",
        limit,
        q,
      });
      return result.messages.map((m) => ({
        id: m.id,
        accountId: m.accountId,
        from: m.from,
        email: m.email,
        subject: m.subject,
        preview: m.preview,
        folder: m.folder,
        unread: m.unread,
        time: m.time,
      }));
    }
    case "read_thread": {
      const id = shortString(args.id, 200);
      if (!id) return { error: "id is required" };
      const msg = await getMail(id);
      if (!msg) return { error: "Message not found" };
      return {
        id: msg.id,
        subject: msg.subject,
        from: msg.from,
        email: msg.email,
        folder: msg.folder,
        thread: msg.thread.map((t) => ({
          id: t.id,
          from: t.from,
          email: t.email,
          time: t.time,
          body: t.body ?? undefined,
          bodyHtml: t.bodyHtml
            ? t.bodyHtml
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 4000)
            : undefined,
        })),
      };
    }
    case "list_accounts":
      return listAccountRows().map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        provider: a.provider,
        unread: a.unread,
      }));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c) => {
      const chunk = Buffer.from(c);
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function validHost(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/i.test(host);
}

/**
 * The endpoint is loopback-only. Browsers always attach `Origin` to
 * cross-origin requests, so rejecting any Origin closes drive-by access from a
 * web page even before the bearer token check runs.
 */
function isBrowserRequest(req: IncomingMessage): boolean {
  return Boolean(req.headers.origin || req.headers["sec-fetch-mode"]);
}

function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }
  const direct = req.headers["x-intray-token"];
  return typeof direct === "string" ? direct.trim() : undefined;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!validHost(req)) {
    json(res, 421, { error: "Invalid Host header" });
    return;
  }

  if (isBrowserRequest(req)) {
    json(res, 403, { error: "Browser origins are not allowed" });
    return;
  }

  if (req.method === "OPTIONS") {
    // No CORS grant: MCP clients here are native apps, not web pages.
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port ?? 0}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (!verifyMcpToken(bearerToken(req))) {
    json(res, 401, { error: "Unauthorized — send the Intray MCP token" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/tools") {
    json(res, 200, { tools: TOOLS });
    return;
  }

  if (req.method === "POST" && url.pathname === "/mcp") {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      json(res, 413, { error: "Request body too large" });
      return;
    }

    let body: {
      jsonrpc?: string;
      id?: string | number;
      method?: string;
      params?: Record<string, unknown>;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return;
    }

    const id = body.id ?? null;
    const method = body.method ?? "";

    if (method === "tools/list") {
      json(res, 200, { jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    }

    if (method === "tools/call") {
      const params = body.params ?? {};
      const name = shortString(params.name, 64);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args);
        json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (e) {
        json(res, 200, {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: e instanceof Error ? e.message : String(e),
          },
        });
      }
      return;
    }

    if (method === "initialize") {
      json(res, 200, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "intray", version: "0.1.0" },
        },
      });
      return;
    }

    json(res, 200, {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
    return;
  }

  // Convenience REST wrapper for quick testing (token-protected like the rest).
  if (req.method === "POST" && url.pathname === "/tools/call") {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      json(res, 413, { error: "Request body too large" });
      return;
    }
    try {
      const body = JSON.parse(raw) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const result = await callTool(
        shortString(body.name, 64),
        body.arguments ?? {},
      );
      json(res, 200, result);
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
}

function configSnippet(token: string, url: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        intray: {
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

export function getMcpStatus(): McpStatus {
  if (!server || !port) {
    return { running: false, port: null, url: null };
  }
  const url = `http://127.0.0.1:${port}/mcp`;
  const token = getMcpToken();
  return {
    running: true,
    port,
    url,
    token,
    config: configSnippet(token, url),
  };
}

export async function startMcpServer(preferredPort = 47821): Promise<McpStatus> {
  if (server && port) return getMcpStatus();

  const listen = (listenPort: number) =>
    new Promise<number>((resolve, reject) => {
      const srv = createServer((req, res) => {
        void handle(req, res).catch((e) => {
          json(res, 500, {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      });
      const onError = (err: NodeJS.ErrnoException) => {
        srv.close();
        reject(err);
      };
      srv.once("error", onError);
      srv.listen(listenPort, "127.0.0.1", () => {
        srv.off("error", onError);
        const addr = srv.address();
        if (!addr || typeof addr === "string") {
          srv.close();
          reject(new Error("Failed to determine MCP port"));
          return;
        }
        server = srv;
        resolve(addr.port);
      });
    });

  try {
    port = await listen(preferredPort);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "EADDRINUSE") throw e;
    // Another process holds the default port; bind an ephemeral one instead of
    // leaving users with a silently disabled MCP server.
    port = await listen(0);
  }

  return getMcpStatus();
}

export function stopMcpServer(): void {
  if (!server) return;
  server.close();
  server = null;
  port = null;
}
