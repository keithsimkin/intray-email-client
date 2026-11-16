import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, X } from "lucide-react";
import {
  GMAIL_APP_PASSWORD_URL,
  gmailAppPasswordFormatError,
} from "../shared/gmailImap";
import type { Account } from "./data/mock";
import {
  accountDtoToUi,
  bridgeOAuthStatus,
  bridgeReconnectAccount,
  bridgeReconnectInfo,
  hasIntrayBridge,
} from "./mailApi";
import { ProviderLogo, providerById, type ProviderId } from "./providers";

type Props = {
  account: Account;
  onClose: () => void;
  onReconnected: (account: Account) => void;
};

export function ReauthModal({ account, onClose, onReconnected }: Props) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"imap" | "oauth">("imap");
  const [gmailReady, setGmailReady] = useState<boolean | null>(null);

  const providerId = (account.provider ?? "imap") as ProviderId;
  const provider = providerById(providerId);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!hasIntrayBridge()) {
        setAuthMode("imap");
        return;
      }
      try {
        const [info, oauth] = await Promise.all([
          bridgeReconnectInfo(account.id),
          bridgeOAuthStatus(),
        ]);
        if (cancelled) return;
        setAuthMode(info.authMode);
        setGmailReady(oauth.gmailConfigured);
      } catch {
        if (!cancelled) setAuthMode("imap");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account.id]);

  const submitPassword = async () => {
    const trimmed = password.trim();
    if (!trimmed) {
      setError(
        providerId === "gmail"
          ? "Enter your 16-character Gmail app password."
          : "Enter your app password.",
      );
      inputRef.current?.focus();
      return;
    }
    if (providerId === "gmail") {
      const formatError = gmailAppPasswordFormatError(trimmed);
      if (formatError) {
        setError(formatError);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      if (!hasIntrayBridge()) {
        onReconnected({ ...account, loggedOut: false });
        return;
      }
      const updated = accountDtoToUi(
        await bridgeReconnectAccount({
          accountId: account.id,
          password: trimmed,
          mode: "imap",
        }),
      );
      onReconnected({ ...updated, avatarUrl: account.avatarUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reconnect.");
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const submitOAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!hasIntrayBridge()) {
        throw new Error("Intray bridge unavailable (run inside Electron).");
      }
      const updated = accountDtoToUi(
        await bridgeReconnectAccount({
          accountId: account.id,
          mode: "oauth",
        }),
      );
      onReconnected({ ...updated, avatarUrl: account.avatarUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reconnect.");
      setBusy(false);
    }
  };

  return (
    <div className="modal-root" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="modal reauth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reauth-head">
          <span className="reauth-icon" aria-hidden>
            <ProviderLogo id={providerId} size={18} />
          </span>
          <div className="reauth-copy">
            <h2 id={titleId}>Sign in again</h2>
            <p>{account.email}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="reauth-body">
          {authMode === "oauth" ? (
            <>
              <p>
                This mailbox uses Google sign-in. Open a browser window to
                refresh the token for <strong>{account.email}</strong> — server
                settings stay as they are.
              </p>
              {gmailReady === false && (
                <p className="add-account-error">
                  GMAIL_CLIENT_ID is not set. Use an app password instead, or
                  configure Google OAuth and restart.
                </p>
              )}
              {error && <p className="add-account-error">{error}</p>}
              <div className="reauth-actions">
                <button
                  type="button"
                  className="alert-btn ghost"
                  onClick={onClose}
                  disabled={busy}
                >
                  Not now
                </button>
                <button
                  type="button"
                  className="alert-btn primary"
                  onClick={() => void submitOAuth()}
                  disabled={busy || gmailReady === false}
                >
                  {busy ? (
                    <Loader2 size={14} strokeWidth={1.75} className="spin" />
                  ) : (
                    <ProviderLogo id="gmail" size={14} />
                  )}
                  {busy ? "Signing in…" : "Sign in with Google"}
                </button>
              </div>
              <button
                type="button"
                className="reauth-switch"
                disabled={busy}
                onClick={() => {
                  setAuthMode("imap");
                  setError(null);
                  window.setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                Use an app password instead
              </button>
            </>
          ) : (
            <>
              <p>
                Enter a new app password for <strong>{account.name}</strong>.
                Email and server settings are kept — only the secret is replaced.
              </p>
              {providerId === "gmail" && (
                <p className="reauth-hint">
                  Use the 16-character password from{" "}
                  <a
                    href={GMAIL_APP_PASSWORD_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (window.intray?.openExternal) {
                        e.preventDefault();
                        void window.intray.openExternal(GMAIL_APP_PASSWORD_URL);
                      }
                    }}
                  >
                    Google App Passwords
                  </a>
                  , not your normal Google password.
                </p>
              )}
              {provider.guide && providerId !== "gmail" && (
                <p className="reauth-hint">{provider.guide}</p>
              )}
              <label className="add-field">
                <span>App password</span>
                <div className="add-field-password">
                  <input
                    ref={inputRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitPassword();
                      }
                    }}
                    placeholder={
                      providerId === "gmail"
                        ? "abcd efgh ijkl mnop"
                        : "App-specific password"
                    }
                    autoComplete="current-password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={busy}
                  >
                    {showPassword ? (
                      <EyeOff size={14} strokeWidth={1.75} />
                    ) : (
                      <Eye size={14} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </label>
              <div className="add-account-privacy">
                <Lock size={14} strokeWidth={1.75} />
                Stored with Windows DPAPI on this PC
              </div>
              {error && <p className="add-account-error">{error}</p>}
              <div className="reauth-actions">
                <button
                  type="button"
                  className="alert-btn ghost"
                  onClick={onClose}
                  disabled={busy}
                >
                  Not now
                </button>
                <button
                  type="button"
                  className="alert-btn primary"
                  onClick={() => void submitPassword()}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 size={14} strokeWidth={1.75} className="spin" />
                  ) : null}
                  {busy ? "Checking…" : "Log in again"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
