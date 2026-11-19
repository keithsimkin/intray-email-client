import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileAudio,
  FileText,
  FileType,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  attachmentKind,
  type AttachmentKind,
} from "../shared/attachmentPreview";
import type {
  AttachmentActionResult,
  AttachmentPreviewResult,
} from "../shared/types";
import type { MailAttachment } from "./data/mock";

let pdfModuleReady: Promise<typeof import("pdfjs-dist")> | null = null;

/** Load PDF.js only when a PDF is opened, and host its worker in a blob so file:// works. */
function ensurePdfWorker(): Promise<typeof import("pdfjs-dist")> {
  pdfModuleReady ??= (async () => {
    const [pdfjs, workerMod] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?raw"),
    ]);
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      const blob = new Blob([workerMod.default], { type: "text/javascript" });
      pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    }
    return pdfjs;
  })();
  return pdfModuleReady;
}

function kindOf(file: MailAttachment): AttachmentKind {
  return file.kind ?? attachmentKind(file.contentType, file.name);
}

function glyph(kind: AttachmentKind) {
  const props = { size: 15, strokeWidth: 1.75 as const };
  if (kind === "image") return <ImageIcon {...props} />;
  if (kind === "audio") return <FileAudio {...props} />;
  if (kind === "video") return <FileVideo {...props} />;
  if (kind === "text") return <FileType {...props} />;
  if (kind === "pdf") return <FileText {...props} />;
  return <File {...props} />;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return Uint8Array.from(value);
  }
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data) && data.every((item) => typeof item === "number")) {
      return Uint8Array.from(data);
    }
  }
  return null;
}

function previewError(error: AttachmentPreviewResult["error"]): string {
  if (error === "too-big") {
    return "This file is over 32 MB, so it can't be previewed here.";
  }
  if (error === "missing") return "This file isn't available.";
  return "Couldn't preview this file.";
}

function textFromBytes(bytes: Uint8Array): { text: string; binary: boolean } {
  const sample = bytes.subarray(0, 8000);
  let controls = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32) controls += 1;
  }
  if (sample.length > 0 && controls / sample.length > 0.08) {
    return { text: "", binary: true };
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (decoded.length <= 200_000) return { text: decoded, binary: false };
  return { text: `${decoded.slice(0, 200_000)}\n…`, binary: false };
}

function PdfView({ data }: { data: Uint8Array }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [frameWidth, setFrameWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setFrameWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loading: {
      destroy: () => Promise<void> | void;
      promise: Promise<PDFDocumentProxy>;
    } | null = null;
    void ensurePdfWorker()
      .then((pdfjs) => {
        if (cancelled) return;
        loading = pdfjs.getDocument({
          data: data.slice(),
          isEvalSupported: false,
          verbosity: 0,
        });
        return loading.promise;
      })
      .then((pdf) => {
        if (!pdf || cancelled) {
          void pdf?.destroy();
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setPage(1);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name =
          err && typeof err === "object" && "name" in err ? String(err.name) : "";
        setError(
          name === "PasswordException"
            ? "This PDF is password protected."
            : "Couldn't open this PDF.",
        );
      });
    return () => {
      cancelled = true;
      void loading?.destroy();
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (pdf) void pdf.destroy();
    };
  }, [data]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !pageCount || frameWidth < 32) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const fit = Math.max(1, frameWidth - 24) / base.width;
        const viewport = pdfPage.getViewport({ scale: fit * zoom });
        const dpr = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");
        if (!context || cancelled) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        await task.promise;
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
        if (name === "RenderingCancelledException") return;
        setError("Couldn't draw this page.");
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [page, pageCount, zoom, frameWidth]);

  return (
    <div className="attachment-preview-pdf">
      <div className="attachment-preview-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft size={15} strokeWidth={1.75} />
        </button>
        <span className="attachment-page">
          {pageCount ? `${page} / ${pageCount}` : "PDF"}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next page"
          disabled={!pageCount || page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
        >
          <ChevronRight size={15} strokeWidth={1.75} />
        </button>
        <span className="attachment-preview-gap" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Zoom out"
          disabled={zoom <= 0.75}
          onClick={() => setZoom((current) => Math.max(0.75, Math.round((current - 0.25) * 100) / 100))}
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((current) => Math.min(3, Math.round((current + 0.25) * 100) / 100))}
        >
          <Plus size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="attachment-preview-stage" ref={stageRef}>
        {error ? (
          <p className="attachment-preview-note">{error}</p>
        ) : (
          <>
            {pageCount === 0 && (
              <p className="attachment-preview-note" role="status">
                <Loader2 size={14} strokeWidth={2} className="spin" />
                Opening PDF…
              </p>
            )}
            <canvas
              ref={canvasRef}
              className="attachment-pdf-canvas"
              hidden={pageCount === 0}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function AttachmentBar({
  messageId,
  files,
}: {
  messageId: string;
  files: MailAttachment[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentPreviewResult | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "open" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    setOpenKey(null);
    setPreview(null);
    setNote(null);
    setActionNote(null);
  }, [messageId]);

  const openFile =
    files.find((file, index) => (file.id ?? `local-${index}`) === openKey) ?? null;
  const openKind = openFile ? kindOf(openFile) : null;
  const openFetchKey = openFile
    ? `${messageId}:${openKey}:${openFile.id ?? ""}:${openKind}`
    : "";

  useEffect(() => {
    if (!openFile || !openFetchKey) return;
    const kind = kindOf(openFile);
    if (!openFile.id) {
      setPreview(null);
      setBytes(null);
      setLoading(false);
      setNote("This file isn't included with the demo inbox.");
      return;
    }
    if (kind === "other") {
      setPreview(null);
      setBytes(null);
      setLoading(false);
      setNote(
        "Intray can't preview this kind of file. Save it, or open it in another app.",
      );
      return;
    }
    const previewAttachment = window.intray?.mail?.previewAttachment;
    if (!previewAttachment) {
      setLoading(false);
      setNote("Preview isn't available in this window.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNote(null);
    setPreview(null);
    setBytes(null);
    void previewAttachment(messageId, openFile.id)
      .then((result) => {
        if (cancelled) return;
        const nextBytes = toBytes(result.bytes);
        setPreview(result);
        setBytes(nextBytes);
        if (result.error) setNote(previewError(result.error));
        else if (!nextBytes) setNote("Couldn't preview this file.");
        else setNote(null);
      })
      .catch(() => {
        if (!cancelled) setNote("Couldn't preview this file.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // openFetchKey already covers the file identity. The object itself is new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFetchKey]);

  useEffect(() => {
    if (!bytes || !openKind || openKind === "pdf" || openKind === "text" || openKind === "other") {
      setObjectUrl(null);
      return;
    }
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const url = URL.createObjectURL(
      new Blob([buffer], {
        type: preview?.contentType || "application/octet-stream",
      }),
    );
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes, openKind, preview?.contentType]);

  useEffect(() => {
    if (!openKey) return;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    document.body.setAttribute("data-attachment-preview", "");
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpenKey(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.removeAttribute("data-attachment-preview");
      root?.removeAttribute("inert");
      returnFocus.current?.focus();
    };
  }, [openKey]);

  const runAction = async (action: "save" | "open") => {
    if (!openFile?.id || busy) return;
    const fn =
      action === "save"
        ? window.intray?.mail?.saveAttachment
        : window.intray?.mail?.openAttachment;
    if (!fn) {
      setActionNote("Preview isn't available in this window.");
      return;
    }
    setBusy(action);
    setActionNote(null);
    try {
      const result: AttachmentActionResult = await fn(messageId, openFile.id);
      setActionNote(result.error ?? null);
    } catch {
      setActionNote(action === "save" ? "Couldn't save this file." : "Couldn't open this file.");
    } finally {
      setBusy(null);
    }
  };

  const text = bytes && openKind === "text" ? textFromBytes(bytes) : null;

  const previewBody = (
    <>
      {loading && (
        <div className="attachment-preview-stage">
          <p className="attachment-preview-note" role="status">
            <Loader2 size={14} strokeWidth={2} className="spin" />
            Loading preview…
          </p>
        </div>
      )}

      {!loading && note && (
        <div className="attachment-preview-stage">
          <p className="attachment-preview-note">{note}</p>
        </div>
      )}

      {!loading && !note && openKind === "pdf" && bytes && <PdfView data={bytes} />}

      {!loading && !note && openKind === "image" && objectUrl && (
        <div className="attachment-preview-stage">
          <img src={objectUrl} alt={openFile?.name ?? "Attachment"} />
        </div>
      )}

      {!loading && !note && openKind === "audio" && objectUrl && (
        <div className="attachment-preview-stage">
          <audio controls src={objectUrl} />
        </div>
      )}

      {!loading && !note && openKind === "video" && objectUrl && (
        <div className="attachment-preview-stage">
          <video controls src={objectUrl} />
        </div>
      )}

      {!loading && !note && openKind === "text" && text && !text.binary && (
        <div className="attachment-preview-stage">
          <pre className="attachment-text">{text.text}</pre>
        </div>
      )}

      {!loading && !note && openKind === "text" && text?.binary && (
        <div className="attachment-preview-stage">
          <p className="attachment-preview-note">
            This file doesn't look like text. Save it, or open it in another app.
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="attachment-block">
      <div className="attachment-list">
        {files.map((file, index) => {
          const key = file.id ?? `local-${index}`;
          const kind = kindOf(file);
          const selected = key === openKey;
          return (
            <button
              key={key}
              type="button"
              className={`attachment${selected ? " on" : ""}`}
              aria-pressed={selected}
              aria-haspopup="dialog"
              onClick={(event) => {
                setNote(null);
                setActionNote(null);
                if (selected) {
                  setOpenKey(null);
                  return;
                }
                returnFocus.current = event.currentTarget;
                setOpenKey(key);
              }}
            >
              <span className={`attachment-icon kind-${kind}`}>{glyph(kind)}</span>
              <span className="attachment-meta">
                <strong>{file.name}</strong>
                <span className="attachment-sep" aria-hidden>
                  ·
                </span>
                <span>{file.size}</span>
              </span>
            </button>
          );
        })}
      </div>

      {openFile &&
        createPortal(
          <div
            className="modal-root attachment-pop-root"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpenKey(null);
            }}
          >
            <div
              className="attachment-pop"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              ref={dialogRef}
              tabIndex={-1}
            >
              <div className="attachment-preview-bar">
                <h2 id={titleId} className="attachment-preview-name">
                  {openFile.name}
                </h2>
                <span className="attachment-preview-gap" />
                {openFile.id && (
                  <>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Save"
                      disabled={busy !== null}
                      onClick={() => void runAction("save")}
                    >
                      <Download size={15} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Open in another app"
                      disabled={busy !== null}
                      onClick={() => void runAction("open")}
                    >
                      <ExternalLink size={15} strokeWidth={1.75} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Close"
                  onClick={() => setOpenKey(null)}
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>
              {actionNote && (
                <p className="attachment-action-note" role="status">
                  {actionNote}
                </p>
              )}
              {previewBody}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
