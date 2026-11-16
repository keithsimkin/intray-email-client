import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  Bot,
  Check,
  Inbox,
  Keyboard,
  LayoutPanelLeft,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { IntrayIcon } from "./IntrayBrand";
import { ProviderLogo } from "./providers";
import {
  bridgeSetLaunchAtLogin,
  bridgeSetChromeTheme,
} from "./mailApi";
import {
  resolvedTheme,
  type Preferences,
  type ThemeMode,
} from "./preferences";
import { completeOnboarding } from "./onboardingStorage";

type Step = "welcome" | "privacy" | "connect" | "prefs" | "ready";

const STEPS: Step[] = ["welcome", "privacy", "connect", "prefs", "ready"];

const privacyPoints = [
  {
    title: "Mail stays on this PC",
    body: "Intray syncs directly with Gmail, Outlook, and IMAP. Nothing routes through our servers.",
  },
  {
    title: "Secrets use Windows DPAPI",
    body: "App passwords and OAuth tokens are encrypted by Credential Manager on this machine.",
  },
  {
    title: "AI is yours to bring",
    body: "Local models or your own API keys — Intray never brokers mail to a cloud AI.",
  },
];

const tips = [
  {
    icon: LayoutPanelLeft,
    title: "Tray triage",
    body: "Unread and Important live in the system tray for quick replies.",
  },
  {
    icon: Keyboard,
    title: "Global hotkey",
    body: "Ctrl+Alt+M opens Intray from anywhere on Windows.",
  },
  {
    icon: Bot,
    title: "Ask & MCP",
    body: "Summarize, draft, and let Cursor or Claude act on mail locally.",
  },
];

export function Onboarding({
  prefs,
  onUpdatePrefs,
  accountLinked,
  onRequestAddAccount,
  onComplete,
}: {
  prefs: Preferences;
  onUpdatePrefs: (next: Preferences) => void;
  /** Flips true when an account was added while onboarding is open */
  accountLinked: boolean;
  onRequestAddAccount: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [skippedAccount, setSkippedAccount] = useState(false);
  const index = STEPS.indexOf(step);

  useEffect(() => {
    if (accountLinked && step === "connect") {
      setSkippedAccount(false);
      setStep("prefs");
    }
  }, [accountLinked, step]);

  const patch = (partial: Partial<Preferences>) => {
    onUpdatePrefs({ ...prefs, ...partial });
  };

  const finish = (opts?: { skippedAccount?: boolean }) => {
    completeOnboarding({
      skippedAccount: opts?.skippedAccount ?? skippedAccount,
    });
    onComplete();
  };

  const goNext = () => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
    else finish();
  };

  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };

  const setTheme = (theme: ThemeMode) => {
    patch({ theme });
    void bridgeSetChromeTheme(resolvedTheme(theme));
  };

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-label="Welcome to Intray">
      <div className="onboarding-glow" aria-hidden />
      <div className="onboarding-card">
        <div className="onboarding-progress" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`onboarding-dot${i <= index ? " on" : ""}${i === index ? " current" : ""}`}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="onboarding-panel onboarding-welcome">
            <div className="onboarding-mark fade-up">
              <IntrayIcon size={56} />
            </div>
            <h1 className="fade-up delay-1">
              <span className="onboarding-word">intray</span>
            </h1>
            <p className="onboarding-lead fade-up delay-2">
              All your inboxes in one place. Native fast. AI enabled.
            </p>
            <ul className="onboarding-pillars fade-up delay-3">
              <li>
                <Inbox size={14} strokeWidth={1.75} />
                Unified inbox
              </li>
              <li>
                <ShieldCheck size={14} strokeWidth={1.75} />
                Private by design
              </li>
              <li>
                <Sparkles size={14} strokeWidth={1.75} />
                Local / BYO AI
              </li>
            </ul>
          </div>
        )}

        {step === "privacy" && (
          <div className="onboarding-panel">
            <p className="onboarding-kicker">Privacy</p>
            <h2>Your mail never leaves this PC through us</h2>
            <p className="onboarding-sub">
              Device talks to your providers over TLS. Crash reports and analytics stay off unless you turn them on.
            </p>
            <div className="onboarding-privacy-list">
              {privacyPoints.map((p) => (
                <div key={p.title} className="onboarding-privacy-item">
                  <span className="onboarding-check" aria-hidden>
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                  <div>
                    <strong>{p.title}</strong>
                    <span>{p.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "connect" && (
          <div className="onboarding-panel">
            <p className="onboarding-kicker">Accounts</p>
            <h2>Connect your first inbox</h2>
            <p className="onboarding-sub">
              Gmail via Google sign-in, or Outlook, iCloud, Yahoo, Fastmail, and any IMAP with an app password.
            </p>
            <div className="onboarding-providers" aria-hidden>
              {(["gmail", "outlook", "icloud", "yahoo", "fastmail"] as const).map(
                (id) => (
                  <span key={id} className="onboarding-provider-chip">
                    <ProviderLogo id={id} size={18} />
                  </span>
                ),
              )}
            </div>
            <button
              type="button"
              className="onboarding-primary"
              onClick={onRequestAddAccount}
            >
              Add account
              <ArrowRight size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="onboarding-ghost"
              onClick={() => {
                setSkippedAccount(true);
                setStep("prefs");
              }}
            >
              Explore with demo data
            </button>
          </div>
        )}

        {step === "prefs" && (
          <div className="onboarding-panel">
            <p className="onboarding-kicker">Setup</p>
            <h2>Make it feel like home</h2>
            <p className="onboarding-sub">
              You can change these anytime in Settings.
            </p>

            <div className="onboarding-pref-block">
              <span className="onboarding-pref-label">Appearance</span>
              <div className="onboarding-seg">
                {(
                  [
                    ["dark", "Dark"],
                    ["light", "Light"],
                    ["system", "System"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={prefs.theme === value ? "on" : undefined}
                    onClick={() => setTheme(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="onboarding-toggle">
              <div>
                <strong>Start with Windows</strong>
                <span>Launch Intray when you sign in</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.launchAtLogin}
                onChange={(e) => {
                  const next = e.target.checked;
                  patch({ launchAtLogin: next });
                  void bridgeSetLaunchAtLogin(next, prefs.launchToTray);
                }}
              />
            </label>

            <label className="onboarding-toggle">
              <div>
                <strong>Important notifications</strong>
                <span>Toast when Important mail arrives</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifyMode !== "off"}
                onChange={(e) => {
                  patch({
                    notifyMode: e.target.checked ? "important" : "off",
                  });
                }}
              />
            </label>

            <label className="onboarding-toggle">
              <div>
                <strong>
                  <Bell size={13} strokeWidth={1.75} className="onboarding-inline-icon" />
                  Tray badge
                </strong>
                <span>Show unread count on the tray icon</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.trayBadge !== "off"}
                onChange={(e) => {
                  patch({ trayBadge: e.target.checked ? "count" : "off" });
                }}
              />
            </label>
          </div>
        )}

        {step === "ready" && (
          <div className="onboarding-panel">
            <p className="onboarding-kicker">Ready</p>
            <h2>You’re set</h2>
            <p className="onboarding-sub">
              {accountLinked
                ? "Your inbox is syncing locally. A few things worth knowing:"
                : skippedAccount
                  ? "Demo mail is loaded so you can poke around. Add a real account anytime from Settings."
                  : "A few things worth knowing as you get started:"}
            </p>
            <div className="onboarding-tips">
              {tips.map((t) => (
                <div key={t.title} className="onboarding-tip">
                  <span className="onboarding-tip-icon" aria-hidden>
                    <t.icon size={16} strokeWidth={1.75} />
                  </span>
                  <div>
                    <strong>{t.title}</strong>
                    <span>{t.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="onboarding-actions">
          {step !== "welcome" && step !== "ready" && (
            <button type="button" className="onboarding-back" onClick={goBack}>
              Back
            </button>
          )}
          <div className="onboarding-actions-spacer" />
          {step === "connect" ? null : step === "ready" ? (
            <button
              type="button"
              className="onboarding-primary"
              onClick={() => finish()}
            >
              Open Intray
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          ) : (
            <button type="button" className="onboarding-primary" onClick={goNext}>
              Continue
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
