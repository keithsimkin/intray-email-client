/** How an attachment can be shown inside the reading pane. */
export type AttachmentKind =
  | "image"
  | "pdf"
  | "text"
  | "audio"
  | "video"
  | "other";

/** Largest file Intray will download for preview, save, or open. */
export const ATTACHMENT_BYTE_LIMIT = 32 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/apng",
  "image/avif",
  "image/svg+xml",
]);

const TEXT_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/xml",
  "text/css",
  "text/javascript",
  "text/html",
  "text/tab-separated-values",
  "text/calendar",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/xhtml+xml",
  "application/x-yaml",
  "text/yaml",
]);

const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/webm",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg"]);

const KIND_BY_EXT: Record<string, AttachmentKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  avif: "image",
  apng: "image",
  svg: "image",
  txt: "text",
  csv: "text",
  md: "text",
  markdown: "text",
  json: "text",
  log: "text",
  xml: "text",
  html: "text",
  htm: "text",
  css: "text",
  js: "text",
  ts: "text",
  yml: "text",
  yaml: "text",
  ics: "text",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  mp4: "video",
  webm: "video",
  ogv: "video",
};

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "text/html": "html",
  "application/json": "json",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function normalizeContentType(contentType: string | undefined): string {
  const type = (contentType || "application/octet-stream")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  return type || "application/octet-stream";
}

export function attachmentExtension(filename: string | undefined): string {
  const base = (filename || "").trim();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function attachmentKind(
  contentType: string | undefined,
  filename?: string,
): AttachmentKind {
  const type = normalizeContentType(contentType);
  if (type === "application/pdf") return "pdf";
  if (IMAGE_TYPES.has(type)) return "image";
  if (TEXT_TYPES.has(type) || type.startsWith("text/")) return "text";
  if (AUDIO_TYPES.has(type)) return "audio";
  if (VIDEO_TYPES.has(type)) return "video";
  const fromName = KIND_BY_EXT[attachmentExtension(filename)];
  if (fromName) return fromName;
  return "other";
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}

/**
 * Real files the reader should list. Inline signature images stay in the HTML
 * body; documents and explicit attachments stay in the file row.
 */
export function shouldListAttachment(part: {
  filename?: string;
  contentType?: string;
  disposition?: string;
  contentId?: string;
  related?: boolean;
}): boolean {
  const name = (part.filename || "").trim();
  const type = normalizeContentType(part.contentType);
  const disposition = (part.disposition || "").toLowerCase();
  const attached = disposition.startsWith("attachment");
  const inline = disposition.startsWith("inline") || Boolean(part.related);
  if (type.startsWith("multipart/")) return false;
  if (!name && (type === "text/plain" || type === "text/html")) return false;
  if (!name && !attached) return false;
  const contentId = (part.contentId || "").trim();
  if (
    !attached &&
    inline &&
    type.startsWith("image/") &&
    (contentId || part.related)
  ) {
    return false;
  }
  return true;
}

export function describeAttachment(input: {
  filename?: string;
  contentType?: string;
  index: number;
}): { name: string; contentType: string; kind: AttachmentKind } {
  const contentType = normalizeContentType(input.contentType);
  const cleaned = (input.filename || "")
    .replace(/[\r\n\0]/g, " ")
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (cleaned) {
    return {
      name: cleaned,
      contentType,
      kind: attachmentKind(contentType, cleaned),
    };
  }
  const rawExt = EXT_BY_TYPE[contentType] || contentType.split("/")[1] || "bin";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const name = `Attachment ${input.index + 1}.${ext}`;
  return { name, contentType, kind: attachmentKind(contentType, name) };
}
