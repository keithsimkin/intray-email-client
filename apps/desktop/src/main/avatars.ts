import { createHash } from "node:crypto";
import { BrowserWindow } from "electron";
import {
  getAccountRow,
  getContact,
  listAccountRows,
  listContacts,
  setAccountAvatarUrl,
  setContactAvatarUrl,
  upsertContact,
} from "./db";
import { avatarColorFor } from "./providers/gmail/map";

const GRAVATAR_TIMEOUT_MS = 8_000;
const MAX_IN_FLIGHT = 3;
const pending = new Set<string>();
const queue: string[] = [];
let active = 0;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** User-uploaded photos are stored as data URLs so CSP can render them. */
export function isCustomAvatarUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim().toLowerCase().startsWith("data:image/"));
}

function isUsableAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isCustomAvatarUrl(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function broadcastAvatar(email: string, avatarUrl: string): void {
  const payload = { email: normalizeEmail(email), avatarUrl };
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("avatars:updated", payload);
  }
}

function persistContactAvatar(email: string, avatarUrl: string): void {
  setContactAvatarUrl(email, avatarUrl);
  if (isUsableAvatarUrl(avatarUrl)) broadcastAvatar(email, avatarUrl);
}

function persistAccountAvatar(accountId: string, avatarUrl: string): void {
  setAccountAvatarUrl(accountId, avatarUrl);
  const row = getAccountRow(accountId);
  if (row && isUsableAvatarUrl(avatarUrl)) {
    broadcastAvatar(row.email, avatarUrl);
  }
}

/** MD5 Gravatar hash — only for avatar lookup, never logged. */
export function gravatarHash(email: string): string {
  return createHash("md5")
    .update(normalizeEmail(email))
    .digest("hex");
}

export function gravatarUrl(email: string, size = 128): string {
  return `https://secure.gravatar.com/avatar/${gravatarHash(email)}?s=${size}&d=404`;
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(GRAVATAR_TIMEOUT_MS),
    });
    if (head.ok) {
      const type = head.headers.get("content-type") ?? "";
      if (!type || type.startsWith("image/")) return true;
    }
    // Some CDNs reject HEAD — fall through to a tiny GET.
  } catch {
    /* try GET */
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(GRAVATAR_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    return !type || type.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Resolve a profile photo for an email.
 * Prefer an explicit URL (e.g. Google userinfo `picture`), else Gravatar when present.
 * Returns undefined when nothing is available.
 */
export async function resolveAvatarUrl(
  email: string,
  preferred?: string | null,
): Promise<string | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return undefined;

  if (isUsableAvatarUrl(preferred)) {
    const trimmed = preferred.trim();
    // Custom uploads and Google userinfo pictures don't need a network probe.
    if (
      isCustomAvatarUrl(trimmed) ||
      /googleusercontent\.com|ggpht\.com/i.test(trimmed) ||
      (await urlExists(trimmed))
    ) {
      return trimmed;
    }
  }

  const gravatar = gravatarUrl(normalized);
  if (await urlExists(gravatar)) return gravatar;
  return undefined;
}

function pumpQueue(): void {
  while (active < MAX_IN_FLIGHT && queue.length > 0) {
    const email = queue.shift();
    if (!email) break;
    active += 1;
    void (async () => {
      try {
        await resolveAndStoreContactAvatar(email);
      } finally {
        pending.delete(email);
        active -= 1;
        pumpQueue();
      }
    })();
  }
}

async function resolveAndStoreContactAvatar(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const existing = getContact(normalized);
  // Empty string means "looked up, no photo" — skip until cleared.
  if (existing?.avatar_url !== null && existing?.avatar_url !== undefined) {
    return;
  }

  // Prefer a linked account photo when the sender is one of our mailboxes.
  const linked = listAccountRows().find(
    (a) => a.email.toLowerCase() === normalized && isUsableAvatarUrl(a.avatar_url),
  );
  if (linked?.avatar_url) {
    persistContactAvatar(normalized, linked.avatar_url);
    return;
  }

  const url = await resolveAvatarUrl(normalized);
  persistContactAvatar(normalized, url ?? "");
}

/** Queue a background Gravatar/account photo lookup for a sender. */
export function enqueueContactAvatar(email: string): void {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return;
  const existing = getContact(normalized);
  if (existing?.avatar_url !== null && existing?.avatar_url !== undefined) {
    return;
  }
  if (pending.has(normalized)) return;
  pending.add(normalized);
  queue.push(normalized);
  pumpQueue();
}

/**
 * Remember a sender from sync without bumping compose frequency.
 * Creates the contact row if missing, then resolves a photo in the background.
 */
export function noteSender(
  email: string,
  name?: string,
  preferredAvatarUrl?: string | null,
): void {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return;

  const existing = getContact(normalized);
  if (!existing) {
    upsertContact({
      email: normalized,
      name: name?.trim() || normalized.split("@")[0] || normalized,
      color: avatarColorFor(normalized),
      avatar_url: isUsableAvatarUrl(preferredAvatarUrl)
        ? preferredAvatarUrl.trim()
        : null,
      last_seen_ms: Date.now(),
      frequency: 1,
    });
  } else if (
    isUsableAvatarUrl(preferredAvatarUrl) &&
    !isUsableAvatarUrl(existing.avatar_url)
  ) {
    persistContactAvatar(normalized, preferredAvatarUrl.trim());
  }

  if (isUsableAvatarUrl(preferredAvatarUrl)) return;
  // null/undefined = not looked up yet; any string (incl. "") means resolved.
  if (typeof existing?.avatar_url === "string") return;
  enqueueContactAvatar(normalized);
}

/** Best known avatar URL for a sender (contact cache, then linked account). */
export function lookupAvatarUrl(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;

  const contact = getContact(normalized);
  if (isUsableAvatarUrl(contact?.avatar_url)) return contact.avatar_url.trim();

  const linked = listAccountRows().find(
    (a) => a.email.toLowerCase() === normalized,
  );
  if (isUsableAvatarUrl(linked?.avatar_url)) return linked.avatar_url.trim();

  return undefined;
}

/** Persist an account photo and mirror it onto the contacts row for that mailbox. */
export async function applyAccountAvatar(
  accountId: string,
  preferred?: string | null,
): Promise<string | undefined> {
  const row = getAccountRow(accountId);
  if (!row) return undefined;

  // Never overwrite a photo the user uploaded themselves.
  if (isCustomAvatarUrl(row.avatar_url) && !isCustomAvatarUrl(preferred)) {
    noteSender(row.email, row.name, row.avatar_url);
    return row.avatar_url!.trim();
  }

  if (isUsableAvatarUrl(row.avatar_url) && !preferred) {
    noteSender(row.email, row.name, row.avatar_url);
    return row.avatar_url.trim();
  }

  const url = await resolveAvatarUrl(row.email, preferred ?? row.avatar_url);
  persistAccountAvatar(accountId, url ?? "");
  noteSender(row.email, row.name, url ?? "");
  return url;
}

/** Save a user-picked image (data URL) as the account profile photo. */
export function setCustomAccountAvatar(
  accountId: string,
  dataUrl: string,
): string {
  if (!isCustomAvatarUrl(dataUrl)) {
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  }
  // Cap ~400KB of base64 to keep the SQLite row reasonable.
  if (dataUrl.length > 550_000) {
    throw new Error("That image is too large — try a smaller photo.");
  }
  const row = getAccountRow(accountId);
  if (!row) throw new Error("Account not found.");
  persistAccountAvatar(accountId, dataUrl.trim());
  noteSender(row.email, row.name, dataUrl.trim());
  return dataUrl.trim();
}

/** Clear a custom photo and re-resolve Gravatar / Google picture. */
export async function clearCustomAccountAvatar(
  accountId: string,
): Promise<string | undefined> {
  const row = getAccountRow(accountId);
  if (!row) throw new Error("Account not found.");
  setAccountAvatarUrl(accountId, null);
  // Also clear the contact cache so lookup runs again.
  setContactAvatarUrl(row.email, null);
  return applyAccountAvatar(accountId);
}

/** Fill missing photos for linked accounts and frequent contacts (startup). */
export function refreshMissingAvatars(): void {
  void (async () => {
    const { fetchGmailUserPicture } = await import("./providers/gmail/client");
    const { loadCredentials } = await import("./crypto/credentials");

    for (const account of listAccountRows()) {
      if (isUsableAvatarUrl(account.avatar_url)) {
        noteSender(account.email, account.name, account.avatar_url);
        continue;
      }
      // Empty string = already looked up with no photo.
      if (account.avatar_url === "") continue;

      let preferred: string | undefined;
      try {
        const creds = loadCredentials(account.id);
        if (creds?.provider === "gmail") {
          preferred = await fetchGmailUserPicture(account.id);
        }
      } catch {
        /* fall through to Gravatar */
      }
      await applyAccountAvatar(account.id, preferred).catch(() => undefined);
    }

    for (const contact of listContacts(80)) {
      if (contact.avatar_url !== null && contact.avatar_url !== undefined) continue;
      enqueueContactAvatar(contact.email);
    }
  })();
}
