import {
  getBody,
  getMessageRow,
  listThreadMessages,
} from "../db";
import {
  buildDatabasePageProperties,
  buildPageParentProperties,
  findTitleProperty,
  notionParagraphBlocks,
  notionTargetFromSearchResult,
  type NotionDatabase,
  type NotionSearchResult,
} from "./notionMap";
import {
  loadPluginSecret,
  removePluginSecret,
  savePluginSecret,
} from "./secrets";
import {
  clearPluginAccount,
  pluginSwitchOn,
  readPluginConfig,
  savePluginConfig,
} from "./store";
import type {
  NotionSaveInput,
  NotionSaveResult,
  NotionTarget,
  PluginStatus,
} from "../../shared/plugins";

const API = "https://api.notion.com/v1";
/** Stable API version that supports the page/database shapes used here. */
const NOTION_VERSION = "2022-06-28";

function readToken(): string | null {
  return loadPluginSecret("notion.token");
}

export function notionStatus(): PluginStatus {
  const token = readToken();
  const config = readPluginConfig("notion");
  const connected = Boolean(token);
  return {
    id: "notion",
    installed: connected || Boolean(config.targetId),
    connected,
    enabled: pluginSwitchOn("notion", connected),
    config: {
      workspace: config.workspace,
      targetId: config.targetId,
      targetTitle: config.targetTitle,
      targetType: config.targetType,
    },
    setup: { ready: true },
  };
}

async function notionError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { message?: string; code?: string };
    if (json.message) {
      return json.code ? `${json.message} (${json.code})` : json.message;
    }
  } catch {
    /* plain text error */
  }
  return `Notion request failed (${res.status}).`;
}

async function notionFetch(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<Response> {
  const token = init.token ?? readToken();
  if (!token) throw new Error("Connect Notion in Plugins first.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Notion-Version", NOTION_VERSION);
  headers.set("Content-Type", "application/json");
  return fetch(`${API}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
}

/** Verify the integration token and store it encrypted. */
export async function connectNotion(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (token.length < 20 || token.length > 512) {
    throw new Error("Paste a valid Notion integration token.");
  }

  const res = await notionFetch("/users/me", { token });
  if (!res.ok) {
    throw new Error(await notionError(res));
  }
  const me = (await res.json()) as {
    name?: string;
    bot?: { workspace_name?: string };
  };

  savePluginSecret("notion.token", token);
  savePluginConfig(
    "notion",
    { workspace: me.bot?.workspace_name ?? me.name ?? "Notion" },
    { enable: true },
  );
}

export async function listNotionTargets(): Promise<NotionTarget[]> {
  const search = async (object: "database" | "page") => {
    const res = await notionFetch("/search", {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "object", value: object },
        page_size: 50,
      }),
    });
    if (!res.ok) throw new Error(await notionError(res));
    const json = (await res.json()) as { results?: NotionSearchResult[] };
    return (json.results ?? [])
      .map(notionTargetFromSearchResult)
      .filter((target): target is NotionTarget => Boolean(target));
  };

  const [databases, pages] = await Promise.all([
    search("database"),
    search("page"),
  ]);
  const seen = new Set<string>();
  return [...databases, ...pages].filter((target) => {
    if (seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}

export function setNotionTarget(target: NotionTarget): void {
  if (!target?.id || target.id.length > 256) {
    throw new Error("Invalid Notion destination.");
  }
  if (target.type !== "database" && target.type !== "page") {
    throw new Error("Invalid Notion destination type.");
  }
  const current = readPluginConfig("notion");
  savePluginConfig("notion", {
    workspace: current.workspace,
    targetId: target.id,
    targetTitle: target.title.slice(0, 300),
    targetType: target.type,
  });
}

type ThreadContext = {
  subject: string;
  from: string;
  fromEmail: string;
  receivedAtMs: number;
  snippet: string;
  bodyText: string;
  threadCount: number;
};

/** Prefer the local store; fall back to the renderer payload for demo mail. */
function threadContext(input: NotionSaveInput): ThreadContext {
  const row = getMessageRow(input.messageId);
  if (!row) {
    return {
      subject: input.subject,
      from: input.from,
      fromEmail: input.fromEmail,
      receivedAtMs: input.receivedAtMs ?? Date.now(),
      snippet: input.snippet ?? "",
      bodyText: input.bodyText ?? "",
      threadCount: 1,
    };
  }

  const rows = listThreadMessages(row.account_id, row.thread_id).slice(-8);
  const parts: string[] = [];
  for (const message of rows) {
    const body = getBody(message.id)?.text_plain?.trim();
    const who = message.from_name
      ? `${message.from_name} <${message.from_email}>`
      : message.from_email;
    const when = new Date(message.date_ms).toLocaleString();
    parts.push(
      [`From: ${who}`, `Date: ${when}`, "", body || message.snippet]
        .join("\n")
        .trim(),
    );
  }
  return {
    subject: row.subject,
    from: row.from_name,
    fromEmail: row.from_email,
    receivedAtMs: row.date_ms,
    snippet: row.snippet,
    bodyText: parts.join("\n\n---\n\n"),
    threadCount: rows.length,
  };
}

async function getDatabase(id: string): Promise<NotionDatabase> {
  const res = await notionFetch(`/databases/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(
      `${await notionError(res)} If this is a newer Notion data source, pick a parent page instead.`,
    );
  }
  return (await res.json()) as NotionDatabase;
}

export async function saveEmailToNotion(
  input: NotionSaveInput,
): Promise<NotionSaveResult> {
  const config = readPluginConfig("notion");
  if (!readToken()) throw new Error("Connect Notion in Plugins first.");
  if (!pluginSwitchOn("notion", true)) {
    throw new Error("Turn Notion on in Plugins.");
  }
  if (!config.targetId) {
    throw new Error("Choose a Notion database or page in Plugins first.");
  }

  const context = threadContext(input);
  const title =
    context.subject.trim() || `Email from ${context.from || context.fromEmail}`;
  const receivedAtIso = new Date(context.receivedAtMs).toISOString();
  const fromLabel = context.from
    ? `${context.from} <${context.fromEmail}>`
    : context.fromEmail;

  const children: Array<Record<string, unknown>> = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "Email thread" } }],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: `${fromLabel} · ${new Date(context.receivedAtMs).toLocaleString()}` },
          },
        ],
      },
    },
  ];
  if (context.snippet) {
    children.push({
      object: "block",
      type: "quote",
      quote: {
        rich_text: [
          { type: "text", text: { content: context.snippet.slice(0, 1900) } },
        ],
      },
    });
  }
  children.push(...notionParagraphBlocks(context.bodyText));

  let properties: Record<string, unknown>;
  let parent: Record<string, unknown>;
  if (config.targetType === "database") {
    const database = await getDatabase(config.targetId);
    if (!findTitleProperty(database)) {
      throw new Error(
        "That Notion database has no title column. Pick a different database.",
      );
    }
    properties = buildDatabasePageProperties({
      database,
      title,
      from: context.from,
      fromEmail: context.fromEmail,
      receivedAtIso,
    });
    parent = { database_id: config.targetId };
  } else {
    properties = buildPageParentProperties(title);
    parent = { page_id: config.targetId };
  }

  const res = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({ parent, properties, children }),
  });
  if (!res.ok) throw new Error(await notionError(res));
  const page = (await res.json()) as { id?: string; url?: string };
  if (!page.id) throw new Error("Notion created the page but returned no id.");

  return {
    pageId: page.id,
    url: page.url,
    targetTitle: config.targetTitle ?? "Notion",
  };
}

export function disconnectNotion(): void {
  removePluginSecret("notion.token");
  clearPluginAccount("notion");
}
