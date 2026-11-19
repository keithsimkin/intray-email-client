import {
  loadCredentials,
  saveCredentials,
  type GmailTokens,
} from "../../crypto/credentials";
import { fetchGmailProfile, refreshGmailTokens } from "./oauth";

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

async function accessTokenFor(
  accountId: string,
  forceRefresh = false,
): Promise<string> {
  const creds = loadCredentials(accountId);
  if (!creds || creds.provider !== "gmail") {
    throw new Error("Gmail credentials missing");
  }
  let tokens = creds.tokens;
  if (forceRefresh || Date.now() >= tokens.expiryMs - 60_000) {
    // Concurrent callers must share one refresh: Google rotates refresh tokens
    // and a second refresh with a stale token can revoke the account.
    let pending = refreshing.get(accountId);
    if (!pending) {
      pending = refreshGmailTokens(tokens.refreshToken).finally(() => {
        refreshing.delete(accountId);
      });
      refreshing.set(accountId, pending);
    }
    tokens = await pending;
    saveCredentials(accountId, { provider: "gmail", tokens });
  }
  return tokens.accessToken;
}

const refreshing = new Map<string, Promise<GmailTokens>>();

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gmailFetch<T>(
  accountId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let token = await accessTokenFor(accountId);
  const method = (init?.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 3 : 1;

  let lastError: Error | null = null;
  let refreshed = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      // A stalled socket used to wedge the whole sync loop.
      signal: init?.signal ?? AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
    // An expired token is common right after wake-from-sleep. Refresh once and
    // replay the request instead of surfacing a spurious sync/send error.
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      token = await accessTokenFor(accountId, true);
      attempt -= 1;
      continue;
    }
    const text = await res.text().catch(() => "");
    const error = new Error(`Gmail API ${path} → ${res.status}: ${text}`);
    if (!RETRYABLE.has(res.status) || attempt === maxAttempts) throw error;
    lastError = error;
    await sleep(400 * attempt * attempt + Math.random() * 250);
  }
  throw lastError ?? new Error(`Gmail API ${path} failed`);
}

export async function persistGmailTokens(
  accountId: string,
  tokens: GmailTokens,
): Promise<void> {
  saveCredentials(accountId, { provider: "gmail", tokens });
}

/** Google account profile photo URL (userinfo.picture), when available. */
export async function fetchGmailUserPicture(
  accountId: string,
): Promise<string | undefined> {
  const token = await accessTokenFor(accountId);
  const profile = await fetchGmailProfile(token);
  return profile.picture;
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
    `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`,
  );
}

export async function getMessageFull(
  accountId: string,
  id: string,
): Promise<GmailMessage> {
  return gmailFetch(accountId, `/messages/${id}?format=full`);
}

/** Bytes for one Gmail attachment id. `format=full` omits larger parts. */
export async function getMessageAttachment(
  accountId: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await gmailFetch<{ data?: string }>(
    accountId,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { signal: AbortSignal.timeout(120_000) },
  );
  const data = res.data ?? "";
  if (!data) return Buffer.alloc(0);
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
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
  threadId?: string,
): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
  const raw = Buffer.from(rawRfc822)
    .toString("base64url")
    .replace(/=+$/, "");
  const payload: { raw: string; threadId?: string } = { raw };
  // Gmail keeps the reply in the open conversation only when this matches
  // a message named by In-Reply-To or References.
  if (threadId && /^[A-Za-z0-9]+$/.test(threadId)) payload.threadId = threadId;
  return gmailFetch(accountId, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Idempotency check for retries: did a message with this Message-ID already
 * reach Gmail? Prevents duplicate mail when the process dies after the API
 * accepted a send but before the queue row was marked `sent`.
 */
export async function findMessageIdByRfc822(
  accountId: string,
  messageId: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    q: `rfc822msgid:${messageId}`,
    maxResults: "1",
    fields: "messages/id",
  });
  const res = await gmailFetch<GmailListResponse>(
    accountId,
    `/messages?${params}`,
  );
  return res.messages?.[0]?.id ?? null;
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
