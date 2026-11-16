import { useEffect, useId, useRef, useState } from "react";
import { Plug, X } from "lucide-react";

const TESTER_EMAIL = "hello@intray.app";

export function PluginInviteModal({
  onClose,
  onAccepted,
}: {
  onClose: () => void;
  onAccepted?: (code: string) => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter an invite code to continue.");
      inputRef.current?.focus();
      return;
    }
    // Testers-only gate — no public unlock yet; keep the path honest.
    setError(
      "That code isn’t active yet. Plugins are in private testing — email us for access.",
    );
    onAccepted?.(trimmed);
  };

  return (
    <div className="modal-root" role="presentation" onClick={onClose}>
      <div
        className="modal plugin-invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plugin-invite-head">
          <span className="plugin-invite-icon" aria-hidden>
            <Plug size={18} strokeWidth={1.85} />
          </span>
          <div className="plugin-invite-copy">
            <h2 id={titleId}>Plugins</h2>
            <p>Private tester access</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="plugin-invite-body">
          <p>
            We’re actively building the plugin layer — extensions that deepen
            mail without routing your inbox through Intray servers. Early builds
            are invite-only while we harden install, permissions, and privacy.
          </p>
          <label className="plugin-invite-field">
            <span>Invite code</span>
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Enter your tester invite"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
            />
          </label>
          {error ? <p className="plugin-invite-error">{error}</p> : null}
          <p className="plugin-invite-help">
            Need access? Email{" "}
            <a href={`mailto:${TESTER_EMAIL}?subject=Plugin%20tester%20access`}>
              {TESTER_EMAIL}
            </a>{" "}
            and we’ll send a code when a seat opens.
          </p>
        </div>

        <div className="plugin-invite-actions">
          <button type="button" className="alert-btn ghost" onClick={onClose}>
            Not now
          </button>
          <button type="button" className="alert-btn primary" onClick={submit}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
