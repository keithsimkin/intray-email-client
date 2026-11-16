import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

export type AlertTone = "danger" | "warning" | "info";

export type AlertRequest = {
  id: string;
  title: string;
  body: ReactNode;
  tone?: AlertTone;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When false, only a single dismiss button is shown. */
  confirmable?: boolean;
};

type Props = {
  alert: AlertRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AlertDialog({ alert, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!alert) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alert, onCancel]);

  if (!alert) return null;

  const tone = alert.tone ?? "warning";
  const confirmable = alert.confirmable !== false;
  const Icon = tone === "info" ? Info : AlertTriangle;

  return (
    <div className="modal-root alert-root" role="presentation" onClick={onCancel}>
      <div
        className={`modal alert-dialog tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="alert-head">
          <span className={`alert-icon tone-${tone}`} aria-hidden>
            <Icon size={18} strokeWidth={1.85} />
          </span>
          <h2 id={titleId}>{alert.title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="alert-body">
          {typeof alert.body === "string" ? <p>{alert.body}</p> : alert.body}
        </div>
        <div className="alert-actions">
          {confirmable ? (
            <>
              <button type="button" className="alert-btn ghost" onClick={onCancel}>
                {alert.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={`alert-btn primary${tone === "danger" ? " danger" : ""}`}
                onClick={onConfirm}
              >
                {alert.confirmLabel ?? "Confirm"}
              </button>
            </>
          ) : (
            <button
              ref={confirmRef}
              type="button"
              className="alert-btn primary"
              onClick={onConfirm}
            >
              {alert.confirmLabel ?? "OK"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

let alertSeq = 0;

export function nextAlertId(prefix = "alert"): string {
  alertSeq += 1;
  return `${prefix}-${alertSeq}`;
}
