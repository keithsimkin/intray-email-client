import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Shield,
  X,
} from "lucide-react";
import {
  GMAIL_APP_PASSWORD_URL,
  gmailAppPasswordFormatError,
} from "../shared/gmailImap";
import type { Account } from "./data/mock";
import {
  accountDtoToUi,
  bridgeAddGmail,
  bridgeAddImap,
  bridgeOAuthStatus,
} from "./mailApi";
import {
  mailProviders,
  ProviderLogo,
  providerById,
  type MailProvider,
  type ProviderId,
} from "./providers";

type Step = "pick" | "auth" | "connecting" | "done";

type Draft = {
  email: string;
  password: string;
  displayName: string;
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  showAdvanced: boolean;
};

const emptyDraft = (provider: MailProvider): Draft => ({
  email: "",
  password: "",
  displayName: "",
  imapHost: provider.imapHost ?? "",
  imapPort: String(provider.imapPort ?? 993),
  smtpHost: provider.smtpHost ?? "",
  smtpPort: String(provider.smtpPort ?? 587),
  showAdvanced: provider.id === "imap",
});

const connectPhases = [
  "Opening secure channel…",
  "Verifying credentials…",
  "Syncing folders…",
  "Almost done…",
];

export function AddAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (account: Account, opts?: { live?: boolean }) => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(mailProviders[0]));
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Account | null>(null);
  const [live, setLive] = useState(false);
  const [gmailReady, setGmailReady] = useState<boolean | null>(null);
  const [connectMode, setConnectMode] = useState<"imap" | "oauth">("imap");

  const provider = providerId ? providerById(providerId) : null;

  useEffect(() => {
    void bridgeOAuthStatus().then((s) => setGmailReady(s.gmailConfigured));
  }, []);

  useEffect(() => {
    if (step !== "connecting" || !provider) return;
    setPhase(0);
    setError(null);

    let cancelled = false;
    const timers = connectPhases.map((_, i) =>
      window.setTimeout(() => {
        if (!cancelled) setPhase(i);
      }, i * 700),
    );

    const run = async () => {
      try {
        if (
          (connectMode === "oauth" || provider.auth === "oauth") &&
          provider.id === "gmail"
        ) {
          const account = accountDtoToUi(await bridgeAddGmail());
          if (cancelled) return;
          setCreated(account);
          setLive(true);
          setStep("done");
          return;
        }

        const account = accountDtoToUi(
          await bridgeAddImap({
            provider: provider.id,
            email: draft.email.trim(),
            password: draft.password,
            displayName: draft.displayName.trim() || undefined,
            imapHost: draft.imapHost.trim() || undefined,
            imapPort: Number(draft.imapPort) || undefined,
            smtpHost: draft.smtpHost.trim() || undefined,
            smtpPort: Number(draft.smtpPort) || undefined,
          }),
        );
        if (cancelled) return;
        setCreated(account);
        setLive(true);
        setStep("done");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStep("auth");
      }
    };

    void run();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [step, provider, draft, connectMode]);

  const pickProvider = (id: ProviderId) => {
    const p = providerById(id);
    setProviderId(id);
    setDraft(emptyDraft(p));
    setConnectMode("imap");
    setError(null);
    setStep("auth");
  };

  const startConnect = (mode: "imap" | "oauth" = "imap") => {
    if (!provider) return;
    setError(null);
    if (mode === "oauth") {
      if (gmailReady !== true) {
        setError(
          "Google sign-in needs GMAIL_CLIENT_ID and is limited to test users. Use a Gmail app password instead.",
        );
        return;
      }
      setConnectMode("oauth");
      setStep("connecting");
      return;
    }
    if (provider.auth === "imap") {
      if (!draft.email.trim() || !draft.email.includes("@")) {
        setError("Enter a valid email address.");
        return;
      }
      if (!draft.password.trim()) {
        setError(
          provider.id === "gmail"
            ? "Enter your 16-character Gmail app password."
            : "Enter your password or app password.",
        );
        return;
      }
      if (provider.id === "gmail") {
        const formatError = gmailAppPasswordFormatError(draft.password);
        if (formatError) {
          setError(formatError);
          return;
        }
      }
      if (provider.id === "imap" && !draft.imapHost.trim()) {
        setError("Enter the IMAP server host.");
        return;
      }
    }
    setConnectMode("imap");
    setStep("connecting");
  };

  const title =
    step === "pick"
      ? "Add account"
      : step === "auth"
        ? `Add ${provider?.shortName ?? "account"}`
        : step === "connecting"
          ? "Connecting"
          : "Account added";

  return (
    <div className="modal-root" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-head-left">
            {(step === "auth" || step === "connecting") && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Back"
                onClick={() => {
                  if (step === "connecting") return;
                  setStep("pick");
                  setError(null);
                }}
                disabled={step === "connecting"}
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </button>
            )}
            <h2>{title}</h2>
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

        {step === "pick" && (
          <>
            <div className="provider-grid">
              {mailProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="provider-card"
                  onClick={() => pickProvider(p.id)}
                >
                  <ProviderLogo id={p.id} size={22} />
                  <span className="provider-card-text">
                    <strong>{p.name}</strong>
                    <span>
                    {p.badge ?? (p.auth === "oauth" ? "OAuth" : "IMAP")}
                  </span>
                  </span>
                  <ChevronRight
                    size={14}
                    strokeWidth={1.75}
                    className="provider-chevron"
                  />
                </button>
              ))}
            </div>
            <p className="modal-note">
              Gmail, iCloud, Outlook, Yahoo, and Fastmail use an app password.
              It stays encrypted on this PC with Windows DPAPI. Google sign-in
              stays available for Gmail testers when OAuth is configured.
            </p>
          </>
        )}

        {step === "auth" && provider && (
          <div className="add-account-body">
            <div className="add-account-provider">
              <ProviderLogo id={provider.id} size={28} />
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.description}</span>
              </div>
            </div>

            {provider.auth === "oauth" ? (
              <>
                <p className="add-account-copy">
                  You’ll sign in with {provider.shortName} in your browser.
                  Intray only receives tokens on this device — mail never
                  routes through our servers.
                </p>
                <div className="add-account-privacy">
                  <Shield size={14} strokeWidth={1.75} />
                  Device ↔ provider TLS only
                </div>
                {provider.id === "gmail" && gmailReady === false && (
                  <p className="add-account-error">
                    GMAIL_CLIENT_ID is not set. Create a Google Cloud Desktop
                    OAuth client and restart the app.
                  </p>
                )}
                {error && <p className="add-account-error">{error}</p>}
                <button
                  type="button"
                  className="send add-account-primary"
                  onClick={() => startConnect("oauth")}
                >
                  <ProviderLogo id={provider.id} size={16} />
                  {provider.oauthLabel}
                </button>
              </>
            ) : (
              <>
                {provider.id === "gmail" ? (
                  <div className="add-account-copy add-account-guide">
                    <p>
                      Use a 16-character app password, not your normal Google
                      password. Spaces from Google’s dialog are removed
                      automatically.
                    </p>
                    <ol>
                      <li>Turn on 2-Step Verification for this account.</li>
                      <li>
                        Create a password at{" "}
                        <a
                          href={GMAIL_APP_PASSWORD_URL}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            if (window.intray?.openExternal) {
                              e.preventDefault();
                              void window.intray.openExternal(
                                GMAIL_APP_PASSWORD_URL,
                              );
                            }
                          }}
                        >
                          myaccount.google.com/apppasswords
                        </a>
                        .
                      </li>
                      <li>
                        Some Workspace, school, and Advanced Protection accounts
                        cannot create app passwords.
                      </li>
                      <li>
                        If Gmail rejects the login, enable IMAP under Settings →
                        See all settings → Forwarding and POP/IMAP.
                      </li>
                    </ol>
                  </div>
                ) : (
                  provider.guide && (
                    <p className="add-account-copy">{provider.guide}</p>
                  )
                )}
                <label className="add-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, email: e.target.value }))
                    }
                    placeholder="you@example.com"
                    autoComplete="username"
                    autoFocus
                  />
                </label>
                <label className="add-field">
                  <span>{provider.id === "gmail" ? "App password" : "Password"}</span>
                  <div className="add-field-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={draft.password}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, password: e.target.value }))
                      }
                      placeholder={
                        provider.id === "gmail"
                          ? "abcd efgh ijkl mnop"
                          : "App password"
                      }
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOff size={14} strokeWidth={1.75} />
                      ) : (
                        <Eye size={14} strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </label>
                <label className="add-field">
                  <span>Display name</span>
                  <input
                    value={draft.displayName}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, displayName: e.target.value }))
                    }
                    placeholder="Optional"
                    autoComplete="name"
                  />
                </label>

                <button
                  type="button"
                  className="add-advanced-toggle"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      showAdvanced: !d.showAdvanced,
                    }))
                  }
                >
                  {draft.showAdvanced ? "Hide" : "Show"} server settings
                </button>

                {draft.showAdvanced && (
                  <div className="add-advanced">
                    <label className="add-field">
                      <span>IMAP host</span>
                      <input
                        value={draft.imapHost}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, imapHost: e.target.value }))
                        }
                        placeholder="imap.example.com"
                      />
                    </label>
                    <label className="add-field">
                      <span>IMAP port</span>
                      <input
                        value={draft.imapPort}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, imapPort: e.target.value }))
                        }
                        placeholder="993"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="add-field">
                      <span>SMTP host</span>
                      <input
                        value={draft.smtpHost}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, smtpHost: e.target.value }))
                        }
                        placeholder="smtp.example.com"
                      />
                    </label>
                    <label className="add-field">
                      <span>SMTP port</span>
                      <input
                        value={draft.smtpPort}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, smtpPort: e.target.value }))
                        }
                        placeholder="587"
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                )}

                <div className="add-account-privacy">
                  <Lock size={14} strokeWidth={1.75} />
                  Stored with Windows DPAPI on this PC
                </div>

                {error && <p className="add-account-error">{error}</p>}

                <button
                  type="button"
                  className="send add-account-primary"
                  onClick={() => startConnect("imap")}
                >
                  Connect account
                </button>

                {provider.id === "gmail" && (
                  <>
                    <div className="add-account-or">or</div>
                    <button
                      type="button"
                      className="add-account-secondary"
                      disabled={gmailReady !== true}
                      onClick={() => startConnect("oauth")}
                    >
                      <ProviderLogo id="gmail" size={16} />
                      Sign in with Google (beta / testers)
                    </button>
                    {gmailReady === false && (
                      <p className="add-account-hint">
                        Google sign-in is off until GMAIL_CLIENT_ID is set. An
                        app password works without it, and OAuth stays limited
                        to test users until Google verifies the app.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === "connecting" && provider && (
          <div className="add-account-body add-account-connecting">
            <ProviderLogo id={provider.id} size={36} />
            <Loader2 className="spin" size={20} strokeWidth={1.75} />
            <strong>Connecting to {provider.shortName}</strong>
            <span>{connectPhases[phase]}</span>
            <ul className="connect-steps">
              {connectPhases.map((label, i) => (
                <li
                  key={label}
                  className={
                    i < phase ? "done" : i === phase ? "current" : undefined
                  }
                >
                  {i < phase ? (
                    <Check size={12} strokeWidth={2.5} />
                  ) : (
                    <span className="connect-dot" />
                  )}
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === "done" && created && provider && (
          <div className="add-account-body add-account-done">
            <div
              className="add-account-success-avatar"
              style={{ background: created.color }}
            >
              {created.label}
            </div>
            <strong>{created.name}</strong>
            <span>{created.email}</span>
            <p className="modal-note" style={{ margin: "8px 0 0" }}>
              Sync has started. Messages will appear in your inbox shortly.
            </p>
            <button
              type="button"
              className="send add-account-primary"
              onClick={() => {
                onAdded(created, { live });
                onClose();
              }}
            >
              <Check size={14} strokeWidth={2.25} />
              Open inbox
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
