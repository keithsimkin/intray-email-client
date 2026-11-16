import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getMail, listMail } from "../mail/service";
import { listAccountRows } from "../db";

type McpStatus = {
  running: boolean;
  port: number | null;
  url: string | null;
};

let server: ReturnType<typeof createServer> | null = null;
let port: number | null = null;

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

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "search_emails": {
      const q = String(args.q ?? "");
      const folder = args.folder ? String(args.folder) : "inbox";
      const limit = Number(args.limit ?? 20);
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
      const id = String(args.id ?? "");
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
            ? t.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000)
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
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
  });
  res.end(payload);
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port ?? 0}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true, tools: TOOLS.map((t) => t.name) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/tools") {
    json(res, 200, { tools: TOOLS });
    return;
  }

  if (req.method === "POST" && url.pathname === "/mcp") {
    const raw = await readBody(req);
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
      json(res, 200, {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
      return;
    }

    if (method === "tools/call") {
      const params = body.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args);
        json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
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

  // Convenience REST wrappers for quick testing
  if (req.method === "POST" && url.pathname === "/tools/call") {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as {
      name: string;
      arguments?: Record<string, unknown>;
    };
    const result = await callTool(body.name, body.arguments ?? {});
    json(res, 200, result);
    return;
  }

  json(res, 404, { error: "Not found" });
}

export function getMcpStatus(): McpStatus {
  return {
    running: Boolean(server && port),
    port,
    url: port ? `http://127.0.0.1:${port}/mcp` : null,
  };
}

export async function startMcpServer(preferredPort = 47821): Promise<McpStatus> {
  if (server && port) return getMcpStatus();

  await new Promise<void>((resolve, reject) => {
    server = createServer((req, res) => {
      void handle(req, res).catch((e) => {
        json(res, 500, {
          error: e instanceof Error ? e.message : String(e),
        });
      });
    });
    server.once("error", (err) => {
      server = null;
      port = null;
      reject(err);
    });
    server.listen(preferredPort, "127.0.0.1", () => {
      port = preferredPort;
      resolve();
    });
  });

  return getMcpStatus();
}

export function stopMcpServer(): void {
  if (!server) return;
  server.close();
  server = null;
  port = null;
}
