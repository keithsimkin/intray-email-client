import {
  loadCredentials,
  saveCredentials,
  type GmailTokens,
} from "../../crypto/credentials";
import { refreshGmailTokens } from "./oauth";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailHeader = { name: string; value: string };
export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
};

export type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailHistoryResponse = {
  history?: {
    id: string;
    messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[];
    messagesDeleted?: { message: { id: string; threadId: string } }[];
    labelsAdded?: { message: { id: string; threadId: string; labelIds?: string[] }; labelIds?: string[] }[];
    labelsRemoved?: { message: { id: string; threadId: string; labelIds?: string[] }; labelIds?: string[] }[];
  }[];
  historyId: string;
  nextPageToken?: string;
};

async function accessTokenFor(accountId: string): Promise<string> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "gmail") {
    throw new Error("Gmail credentials missing");
  }
  let tokens = creds.tokens;
  if (Date.now() >= tokens.expiryMs) {
    tokens = await refreshGmailTokens(tokens.refreshToken);
    saveCredentials(accountId, { provider: "gmail", tokens });
  }
  return tokens.accessToken;
}

export async function persistGmailTokens(
  accountId: string,
  tokens: GmailTokens,
): Promise<void> {
  saveCredentials(accountId, { provider: "gmail", tokens });
}

async function gmailFetch<T>(
  accountId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await accessTokenFor(accountId);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function listMessageIds(
  accountId: string,
  opts: { labelIds?: string[]; q?: string; pageToken?: string; maxResults?: number },
): Promise<GmailListResponse> {
  const params = new URLSearchParams();
  params.set("maxResults", String(opts.maxResults ?? 50));
  for (const id of opts.labelIds ?? ["INBOX"]) params.append("labelIds", id);
  if (opts.q) params.set("q", opts.q);
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  return gmailFetch(accountId, `/messages?${params}`);
}

export async function getMessageMeta(
  accountId: string,
  id: string,
): Promise<GmailMessage> {
  return gmailFetch(
    accountId,
    `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
  );
}

export async function getMessageFull(
  accountId: string,
  id: string,
): Promise<GmailMessage> {
  return gmailFetch(accountId, `/messages/${id}?format=full`);
}

export async function getProfile(
  accountId: string,
): Promise<{ emailAddress: string; historyId: string; messagesTotal: number }> {
  return gmailFetch(accountId, "/profile");
}

export async function listHistory(
  accountId: string,
  startHistoryId: string,
  pageToken?: string,
): Promise<GmailHistoryResponse> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
  });
  params.append("historyTypes", "messageDeleted");
  params.append("historyTypes", "labelAdded");
  params.append("historyTypes", "labelRemoved");
  if (pageToken) params.set("pageToken", pageToken);
  return gmailFetch(accountId, `/history?${params}`);
}

export async function modifyLabels(
  accountId: string,
  id: string,
  add: string[],
  remove: string[],
): Promise<GmailMessage> {
  return gmailFetch(accountId, `/messages/${id}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

export async function trashMessage(
  accountId: string,
  id: string,
): Promise<GmailMessage> {
  return gmailFetch(accountId, `/messages/${id}/trash`, { method: "POST" });
}

export async function spamMessage(
  accountId: string,
  id: string,
): Promise<GmailMessage> {
  return modifyLabels(accountId, id, ["SPAM"], ["INBOX", "UNREAD"]);
}

export async function unspamMessage(
  accountId: string,
  id: string,
): Promise<GmailMessage> {
  return modifyLabels(accountId, id, ["INBOX"], ["SPAM"]);
}

export async function deleteMessageForever(
  accountId: string,
  id: string,
): Promise<void> {
  await gmailFetch(accountId, `/messages/${id}`, { method: "DELETE" });
}

export async function sendRawMessage(
  accountId: string,
  rawRfc822: string,
): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
  const raw = Buffer.from(rawRfc822)
    .toString("base64url")
    .replace(/=+$/, "");
  return gmailFetch(accountId, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
}

export function headerValue(
  headers: GmailHeader[] | undefined,
  name: string,
): string {
  const h = headers?.find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? "";
}

export function decodeBodyData(data?: string): string {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

export function extractBodies(part?: GmailMessagePart): {
  text?: string;
  html?: string;
} {
  if (!part) return {};
  const out: { text?: string; html?: string } = {};

  const walk = (p: GmailMessagePart) => {
    if (p.mimeType === "text/plain" && p.body?.data && !out.text) {
      out.text = decodeBodyData(p.body.data);
    }
    if (p.mimeType === "text/html" && p.body?.data && !out.html) {
      out.html = decodeBodyData(p.body.data);
    }
    for (const child of p.parts ?? []) walk(child);
  };
  walk(part);
  return out;
}
