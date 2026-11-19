import { dialog, shell, type BrowserWindow } from "electron";
import { app } from "electron";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import type { ParsedMail } from "mailparser";
import { accountUsesImap } from "../crypto/credentials";
import {
  attachmentMetaKnown,
  getAccountRow,
  getMessageRow,
  markHasAttachment,
  readAttachmentMetaJson,
  saveAttachmentMeta,
} from "../db";
import {
  getMessageAttachment,
  getMessageFull,
  headerValue,
  type GmailMessage,
  type GmailMessagePart,
} from "../providers/gmail/client";
import { fetchMessageSource } from "../providers/imap/client";
import { mailboxMetaFromRow } from "../providers/imap/map";
import {
  ATTACHMENT_BYTE_LIMIT,
  attachmentExtension,
  attachmentKind,
  describeAttachment,
  formatByteSize,
  shouldListAttachment,
} from "../../shared/attachmentPreview";
import type {
  AttachmentActionResult,
  AttachmentDto,
  AttachmentPreviewResult,
  ComposeAttachment,
} from "../../shared/types";

type StoredAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  cached: boolean;
  tooBig?: boolean;
  gmailAttachmentId?: string;
};

type IncomingAttachment = {
  filename?: string;
  contentType?: string;
  bytes?: Buffer;
  declaredSize?: number;
  gmailAttachmentId?: string;
};

const downloads = new Map<
  string,
  Promise<{ meta: StoredAttachment; path: string } | null>
>();

function cacheRoot(): string {
  return resolve(app.getPath("userData"), "attachment-cache");
}

function cacheFile(
  messageId: string,
  attachmentId: string,
  name?: string,
): string {
  const root = cacheRoot();
  const key = messageId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  const ext = attachmentExtension(name).slice(0, 8);
  // Keep the real extension so Windows can open the cached file.
  const leaf =
    /^\d{1,3}$/.test(attachmentId) && ext ? `${attachmentId}.${ext}` : attachmentId;
  const path = resolve(root, key, leaf);
  if (path !== root && !path.startsWith(root + sep)) {
    throw new Error("Invalid attachment path");
  }
  return path;
}

function writeCache(
  messageId: string,
  attachmentId: string,
  bytes: Buffer,
  name?: string,
): void {
  const path = cacheFile(messageId, attachmentId, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function readMetas(messageId: string): StoredAttachment[] | null {
  const json = readAttachmentMetaJson(messageId);
  if (json == null) return null;
  try {
    const parsed = JSON.parse(json) as StoredAttachment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMetas(messageId: string, metas: StoredAttachment[]): void {
  saveAttachmentMeta(messageId, JSON.stringify(metas));
  if (metas.length) markHasAttachment(messageId);
}

function patchMeta(
  messageId: string,
  attachmentId: string,
  patch: Partial<StoredAttachment>,
): StoredAttachment | null {
  const metas = readMetas(messageId);
  if (!metas) return null;
  let next: StoredAttachment | null = null;
  const updated = metas.map((meta) => {
    if (meta.id !== attachmentId) return meta;
    next = { ...meta, ...patch };
    return next;
  });
  if (!next) return null;
  writeMetas(messageId, updated);
  return next;
}

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

export function filesFromParsed(parsed: ParsedMail): IncomingAttachment[] {
  const files: IncomingAttachment[] = [];
  for (const att of parsed.attachments ?? []) {
    const filename = att.filename || "";
    const contentType = att.contentType || "application/octet-stream";
    if (
      !shouldListAttachment({
        filename,
        contentType,
        disposition: att.contentDisposition,
        contentId: att.contentId || att.cid,
        related: Boolean(att.related),
      })
    ) {
      continue;
    }
    const bytes = Buffer.isBuffer(att.content) ? att.content : undefined;
    files.push({
      filename,
      contentType,
      bytes,
      declaredSize: att.size || bytes?.length || 0,
    });
  }
  return files;
}

export function filesFromGmail(message: GmailMessage): IncomingAttachment[] | null {
  if (!message.payload) return null;
  const files: IncomingAttachment[] = [];
  const walk = (part: GmailMessagePart) => {
    const filename = part.filename || "";
    const contentType = part.mimeType || "application/octet-stream";
    const disposition = headerValue(part.headers, "content-disposition");
    const contentId = headerValue(part.headers, "content-id");
    if (
      shouldListAttachment({
        filename,
        contentType,
        disposition,
        contentId,
      })
    ) {
      const declaredSize = part.body?.size || 0;
      const encoded = part.body?.data;
      const estimated =
        declaredSize || Math.floor(((encoded?.length ?? 0) * 3) / 4);
      let bytes: Buffer | undefined;
      if (encoded && estimated > 0 && estimated <= ATTACHMENT_BYTE_LIMIT) {
        bytes = decodeBase64Url(encoded);
      }
      files.push({
        filename,
        contentType,
        bytes: bytes && bytes.length > 0 ? bytes : undefined,
        declaredSize: bytes?.length || declaredSize,
        gmailAttachmentId: part.body?.attachmentId,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message.payload);
  return files;
}

export function filesFromCompose(
  files: ComposeAttachment[] | undefined,
): IncomingAttachment[] {
  return (files ?? []).map((file) => {
    const bytes = Buffer.from(file.contentBase64 || "", "base64");
    return {
      filename: file.filename,
      contentType: file.contentType,
      bytes,
      declaredSize: bytes.length || file.size,
    };
  });
}

/** Index files for a body that was just stored. A second call leaves the cache. */
export function rememberAttachments(
  messageId: string,
  files: IncomingAttachment[],
): void {
  if (attachmentMetaKnown(messageId)) return;
  const metas: StoredAttachment[] = [];
  files.forEach((file, index) => {
    const described = describeAttachment({
      filename: file.filename,
      contentType: file.contentType,
      index,
    });
    const id = String(index);
    const size = file.bytes?.length || file.declaredSize || 0;
    const tooBig = size > ATTACHMENT_BYTE_LIMIT;
    let cached = false;
    if (file.bytes && file.bytes.length > 0 && !tooBig) {
      writeCache(messageId, id, file.bytes, described.name);
      cached = true;
    }
    metas.push({
      id,
      name: described.name,
      contentType: described.contentType,
      size,
      cached,
      ...(tooBig ? { tooBig: true } : {}),
      ...(file.gmailAttachmentId
        ? { gmailAttachmentId: file.gmailAttachmentId }
        : {}),
    });
  });
  writeMetas(messageId, metas);
}

export function attachmentDtos(
  json: string | null | undefined,
): AttachmentDto[] | undefined {
  if (json == null) return undefined;
  let stored: StoredAttachment[];
  try {
    stored = JSON.parse(json) as StoredAttachment[];
  } catch {
    return undefined;
  }
  if (!Array.isArray(stored)) return undefined;
  return stored.map((item) => ({
    id: String(item.id),
    name: item.name || "Attachment",
    size: formatByteSize(item.size || 0),
    bytes: item.size || 0,
    contentType: item.contentType || "application/octet-stream",
    kind: attachmentKind(item.contentType, item.name),
  }));
}

async function refetchAll(messageId: string): Promise<void> {
  if (attachmentMetaKnown(messageId)) return;
  const row = getMessageRow(messageId);
  const account = row ? getAccountRow(row.account_id) : undefined;
  if (!row || !account) return;
  if (accountUsesImap(account.id, account.provider)) {
    const box = mailboxMetaFromRow(row);
    if (!box) return;
    const parsed = await fetchMessageSource(
      account.id,
      box.mailbox,
      box.uid,
      { lane: "interactive" },
    );
    rememberAttachments(messageId, filesFromParsed(parsed));
    return;
  }
  const full = await getMessageFull(account.id, row.provider_id);
  const files = filesFromGmail(full);
  if (files) rememberAttachments(messageId, files);
}

async function downloadBytes(
  messageId: string,
  meta: StoredAttachment,
): Promise<Buffer | null> {
  const row = getMessageRow(messageId);
  const account = row ? getAccountRow(row.account_id) : undefined;
  if (!row || !account) return null;
  if (!accountUsesImap(account.id, account.provider)) {
    if (!meta.gmailAttachmentId) return null;
    return getMessageAttachment(
      account.id,
      row.provider_id,
      meta.gmailAttachmentId,
    );
  }
  const box = mailboxMetaFromRow(row);
  if (!box) return null;
  const parsed = await fetchMessageSource(account.id, box.mailbox, box.uid, {
    lane: "interactive",
  });
  const files = filesFromParsed(parsed);
  const current = readMetas(messageId) ?? [];
  files.forEach((file, index) => {
    const existing = current[index];
    if (!existing || existing.cached || !file.bytes) return;
    if (file.bytes.length === 0 || file.bytes.length > ATTACHMENT_BYTE_LIMIT) {
      return;
    }
    writeCache(messageId, existing.id, file.bytes, existing.name);
    patchMeta(messageId, existing.id, {
      cached: true,
      size: file.bytes.length,
      tooBig: false,
    });
  });
  return files[Number(meta.id)]?.bytes ?? null;
}

async function ensureCachedInner(
  messageId: string,
  attachmentId: string,
): Promise<{ meta: StoredAttachment; path: string } | null> {
  if (!/^\d{1,3}$/.test(attachmentId)) return null;
  let metas = readMetas(messageId);
  if (!metas) {
    await refetchAll(messageId);
    metas = readMetas(messageId);
  }
  let meta = metas?.find((item) => item.id === attachmentId) ?? null;
  if (!meta) return null;
  if (meta.tooBig || meta.size > ATTACHMENT_BYTE_LIMIT) {
    return { meta: { ...meta, tooBig: true }, path: "" };
  }
  const path = cacheFile(messageId, attachmentId, meta.name);
  if (meta.cached && existsSync(path) && statSync(path).size > 0) {
    return { meta, path };
  }
  const bytes = await downloadBytes(messageId, meta);
  if (!bytes || bytes.length === 0) return { meta, path: "" };
  if (bytes.length > ATTACHMENT_BYTE_LIMIT) {
    const patched = patchMeta(messageId, attachmentId, {
      tooBig: true,
      cached: false,
      size: bytes.length,
    });
    return { meta: patched ?? { ...meta, tooBig: true, size: bytes.length }, path: "" };
  }
  writeCache(messageId, attachmentId, bytes, meta.name);
  const patched = patchMeta(messageId, attachmentId, {
    cached: true,
    size: bytes.length,
    tooBig: false,
  });
  return { meta: patched ?? { ...meta, cached: true, size: bytes.length }, path };
}

function ensureCached(
  messageId: string,
  attachmentId: string,
): Promise<{ meta: StoredAttachment; path: string } | null> {
  const key = `${messageId}:${attachmentId}`;
  const pending = downloads.get(key);
  if (pending) return pending;
  const task = ensureCachedInner(messageId, attachmentId).finally(() => {
    if (downloads.get(key) === task) downloads.delete(key);
  });
  downloads.set(key, task);
  return task;
}

function emptyPreview(error: AttachmentPreviewResult["error"]): AttachmentPreviewResult {
  return {
    name: "Attachment",
    contentType: "application/octet-stream",
    kind: "other",
    size: 0,
    error,
  };
}

export async function previewAttachment(
  messageId: string,
  attachmentId: string,
): Promise<AttachmentPreviewResult> {
  try {
    const local = await ensureCached(messageId, attachmentId);
    if (!local) return emptyPreview("missing");
    const kind = attachmentKind(local.meta.contentType, local.meta.name);
    const base = {
      name: local.meta.name,
      contentType: local.meta.contentType,
      kind,
      size: local.meta.size,
    };
    if (local.meta.tooBig) return { ...base, error: "too-big" };
    if (kind === "other" || !local.path) return { ...base, error: "unavailable" };
    const bytes = readFileSync(local.path);
    return { ...base, size: bytes.length, bytes };
  } catch (error) {
    console.warn("attachment preview failed", error);
    return emptyPreview("unavailable");
  }
}

async function withLocalFile(
  messageId: string,
  attachmentId: string,
): Promise<{ meta: StoredAttachment; path: string } | AttachmentActionResult> {
  const local = await ensureCached(messageId, attachmentId);
  if (!local) return { ok: false, error: "This file isn't available." };
  if (local.meta.tooBig) {
    return {
      ok: false,
      error: "This file is over 32 MB, so Intray can't download it.",
    };
  }
  if (!local.path) return { ok: false, error: "Couldn't download this attachment." };
  return local;
}

export async function saveAttachment(
  messageId: string,
  attachmentId: string,
  parent?: BrowserWindow,
): Promise<AttachmentActionResult> {
  try {
    const local = await withLocalFile(messageId, attachmentId);
    if ("ok" in local) return local;
    const options = { defaultPath: local.meta.name };
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false };
    copyFileSync(local.path, result.filePath);
    return { ok: true };
  } catch (error) {
    console.warn("attachment save failed", error);
    return { ok: false, error: "Couldn't save this file." };
  }
}

export async function openAttachment(
  messageId: string,
  attachmentId: string,
): Promise<AttachmentActionResult> {
  try {
    const local = await withLocalFile(messageId, attachmentId);
    if ("ok" in local) return local;
    const opened = await shell.openPath(local.path);
    if (opened) return { ok: false, error: "Couldn't open this file." };
    return { ok: true };
  } catch (error) {
    console.warn("attachment open failed", error);
    return { ok: false, error: "Couldn't open this file." };
  }
}
