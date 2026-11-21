import { Download, Loader2, RotateCw, X } from "lucide-react";
import type { AppUpdateStatus } from "../shared/types";

type Props = {
  status: AppUpdateStatus;
  onRestart: () => void;
  onRetry: () => void;
  onDismiss: () => void;
};

/** Whether the floating update card should stay on screen for this status. */
export function shouldShowUpdateProgressCard(status: AppUpdateStatus): boolean {
  return (
    status.state === "downloading" ||
    status.state === "ready" ||
    status.state === "installing" ||
    (status.state === "error" && Boolean(status.availableVersion))
  );
}

function titleFor(status: AppUpdateStatus): string {
  const version = status.availableVersion?.trim();
  switch (status.state) {
    case "downloading":
      return version ? `Downloading ${version}` : "Downloading update";
    case "ready":
      return version ? `${version} is ready` : "Update ready";
    case "installing":
      return version ? `Installing ${version}` : "Installing update";
    case "error":
      return "Update failed";
    default:
      return "Update";
  }
}

function detailFor(status: AppUpdateStatus): string {
  switch (status.state) {
    case "downloading":
      return typeof status.downloadPercent === "number"
        ? `Downloading… ${status.downloadPercent}%`
        : "Downloading…";
    case "ready":
      return "Restart Intray to install. The installer runs quietly and the app reopens on its own.";
    case "installing":
      return "Closing Intray and applying the update. This window will reopen when it’s done.";
    case "error":
      return status.error?.trim() || "Something went wrong while updating.";
    default:
      return "";
  }
}

export function UpdateProgressCard({
  status,
  onRestart,
  onRetry,
  onDismiss,
}: Props) {
  if (!shouldShowUpdateProgressCard(status)) return null;

  const percent =
    typeof status.downloadPercent === "number"
      ? Math.max(0, Math.min(100, status.downloadPercent))
      : status.state === "installing" || status.state === "ready"
        ? 100
        : 0;
  const busy =
    status.state === "downloading" || status.state === "installing";
  const canDismiss = status.state === "ready" || status.state === "error";

  return (
    <aside
      className={`update-progress-card fade-up tone-${status.state}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="update-progress-head">
        <span className="update-progress-icon" aria-hidden>
          {status.state === "ready" ? (
            <RotateCw size={16} strokeWidth={1.85} />
          ) : status.state === "error" ? (
            <Download size={16} strokeWidth={1.85} />
          ) : (
            <Loader2 size={16} strokeWidth={1.85} className="spin" />
          )}
        </span>
        <div className="update-progress-copy">
          <strong>{titleFor(status)}</strong>
          <p>{detailFor(status)}</p>
        </div>
        {canDismiss && (
          <button
            type="button"
            className="icon-btn"
            onClick={onDismiss}
            aria-label="Dismiss update status"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {(status.state === "downloading" ||
        status.state === "ready" ||
        status.state === "installing") && (
        <div
          className={`update-progress-track${busy && status.state === "installing" ? " indeterminate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status.state === "installing" ? undefined : percent}
          aria-label="Update progress"
        >
          <div
            className="update-progress-bar"
            style={
              status.state === "installing"
                ? undefined
                : { width: `${Math.max(status.state === "downloading" ? 2 : 0, percent)}%` }
            }
          />
        </div>
      )}

      {status.state === "ready" && (
        <div className="update-progress-actions">
          <button
            type="button"
            className="alert-btn primary"
            onClick={onRestart}
          >
            <RotateCw size={14} strokeWidth={1.75} />
            Restart and install
          </button>
        </div>
      )}

      {status.state === "error" && (
        <div className="update-progress-actions">
          <button type="button" className="alert-btn ghost" onClick={onDismiss}>
            Dismiss
          </button>
          <button
            type="button"
            className="alert-btn primary"
            onClick={onRetry}
          >
            <Download size={14} strokeWidth={1.75} />
            Try again
          </button>
        </div>
      )}
    </aside>
  );
}
