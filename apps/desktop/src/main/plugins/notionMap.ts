import type { NotionTarget } from "../../shared/plugins";

type NotionRichText = {
  plain_text?: string;
  text?: { content?: string };
};

type NotionProperty = {
  id?: string;
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
};

export type NotionSearchResult = {
  object?: string;
  id?: string;
  url?: string;
  title?: NotionRichText[];
  properties?: Record<string, NotionProperty>;
};

export type NotionDatabase = {
  id?: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
};

export type NotionPageProperties = Record<string, unknown>;

function richText(value: string): Array<Record<string, unknown>> {
  return [{ type: "text", text: { content: value.slice(0, 2000) } }];
}

function plainText(parts: NotionRichText[] | undefined): string {
  if (!parts?.length) return "";
  return parts
    .map((part) => part.plain_text ?? part.text?.content ?? "")
    .join("")
    .trim();
}

export function notionSearchTitle(item: NotionSearchResult): string {
  const fromTitle = plainText(item.title);
  if (fromTitle) return fromTitle;
  for (const property of Object.values(item.properties ?? {})) {
    if (property.type === "title") {
      const title = plainText(property.title);
      if (title) return title;
    }
  }
  return item.id ? "Untitled" : "Notion item";
}

/** Turn a Notion search hit into a pickable destination. */
export function notionTargetFromSearchResult(
  item: NotionSearchResult,
): NotionTarget | null {
  if (!item.id) return null;
  if (item.object === "database") {
    return {
      id: item.id,
      type: "database",
      title: notionSearchTitle(item),
      url: item.url,
    };
  }
  if (item.object === "page") {
    return {
      id: item.id,
      type: "page",
      title: notionSearchTitle(item),
      url: item.url,
    };
  }
  return null;
}

export function findTitleProperty(
  database: NotionDatabase,
): { name: string; property: NotionProperty } | null {
  for (const [name, property] of Object.entries(database.properties ?? {})) {
    if (property.type === "title") return { name, property };
  }
  return null;
}

/**
 * Build properties for a page created inside a Notion database. We only fill
 * the title plus naturally matching URL / date / email / sender columns, so a
 * normal task or notes database is not rejected for unexpected properties.
 */
export function buildDatabasePageProperties(opts: {
  database: NotionDatabase;
  title: string;
  from: string;
  fromEmail: string;
  receivedAtIso: string;
  sourceUrl?: string;
}): NotionPageProperties {
  const titleProperty = findTitleProperty(opts.database);
  if (!titleProperty) {
    throw new Error(
      "That Notion database has no title column. Pick a different database.",
    );
  }

  const properties: NotionPageProperties = {
    [titleProperty.name]: { title: richText(opts.title) },
  };
  const fromLabel = opts.from
    ? `${opts.from} <${opts.fromEmail}>`
    : opts.fromEmail;

  for (const [name, property] of Object.entries(
    opts.database.properties ?? {},
  )) {
    if (name === titleProperty.name) continue;
    const lower = name.toLowerCase();
    switch (property.type) {
      case "url":
        if (opts.sourceUrl) properties[name] = { url: opts.sourceUrl };
        break;
      case "email":
        if (opts.fromEmail) properties[name] = { email: opts.fromEmail };
        break;
      case "date":
        if (/date|received|sent|created/i.test(lower)) {
          properties[name] = { date: { start: opts.receivedAtIso } };
        }
        break;
      case "rich_text":
        if (/from|sender|person|contact|email/i.test(lower) && fromLabel) {
          properties[name] = { rich_text: richText(fromLabel) };
        }
        break;
      default:
        break;
    }
  }

  return properties;
}

/** Properties for a page created directly under another Notion page. */
export function buildPageParentProperties(
  title: string,
): NotionPageProperties {
  return {
    title: { title: richText(title) },
  };
}

/** Split long email text into Notion paragraph blocks under the 2000 char cap. */
export function notionParagraphBlocks(
  text: string,
  maxChunks = 4,
): Array<Record<string, unknown>> {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let rest = clean;
  while (rest && chunks.length < maxChunks) {
    if (rest.length <= 1900) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n", 1900);
    if (cut < 900) cut = rest.lastIndexOf(" ", 1900);
    if (cut < 400) cut = 1900;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return chunks.map((content) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(content) },
  }));
}
