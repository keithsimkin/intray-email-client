import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Bot,
  FileText,
  KeyRound,
  Keyboard,
  LayoutGrid,
  Layers,
  Link2,
  Lock,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import type { AiSecretId, McpStatus } from "../shared/types";
import { AppSelect } from "./AppSelect";
import { PackLogo } from "./BrandIcon";
import { BridgeLogo, bridgePickerOrder } from "./bridgeLogos";
import { UNIFIED_ID, type Account } from "./data/mock";
import {
  bridgeAiDetect,
  bridgeAiSecretsStatus,
  bridgeAiSetSecret,
  bridgeLaunchAtLogin,
  bridgeMcpStart,
  bridgeMcpStatus,
  bridgeMcpStop,
  bridgeMcpRotateToken,
  bridgeNotifyShow,
  bridgeRemoveAccount,
  bridgeSetLaunchAtLogin,
  bridgeSync,
  hasIntrayBridge,
} from "./mailApi";
import { ProviderLogo, providerById, type ProviderId } from "./providers";
import {
  accentColors,
  aiBridgeMeta,
  defaultPreferences,
  type AccentId,
  type AiBridgeId,
  type Preferences,
  type RemoteImagePolicy,
} from "./preferences";
import {
  designedSignatureHtml,
  looksLikeHtml,
  sanitizeSignatureHtml,
} from "./signatures";
import {
  bindingFromEvent,
  listShortcuts,
  packMeta,
  seedCustomOverrides,
  type ShortcutAction,
  type ShortcutPackId,
} from "./shortcuts";

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    />
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="settings-row">
      <div className="settings-row-copy">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </label>
  );
}

function Block({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-copy">
          <h3 className="settings-section-title">{title}</h3>
          {hint && <p className="settings-section-hint">{hint}</p>}
        </div>
        {action ? (
          <div className="settings-section-action">{action}</div>
        ) : null}
      </div>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function Select<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <AppSelect
      className="settings-app-select"
      ariaLabel="Setting"
      value={String(value)}
      options={options.map((o) => ({
        id: String(o.id),
        label: o.label,
      }))}
      onChange={(id) => {
        const match = options.find((o) => String(o.id) === id);
        if (match) onChange(match.id);
      }}
    />
  );
}

type TabId =
  | "appearance"
  | "inbox"
  | "notifications"
  | "compose"
  | "ai"
  | "shortcuts"
  | "accounts"
  | "privacy";

const SETTINGS_TABS: {
  id: TabId;
  label: string;
  Icon: typeof Moon;
  group: string;
}[] = [
  { id: "appearance", label: "Appearance", Icon: Moon, group: "Workspace" },
  { id: "inbox", label: "Inbox", Icon: LayoutGrid, group: "Mail" },
  { id: "notifications", label: "Notifications", Icon: Bell, group: "Mail" },
  { id: "compose", label: "Compose", Icon: FileText, group: "Mail" },
  { id: "ai", label: "AI & agents", Icon: Bot, group: "Agents" },
  { id: "shortcuts", label: "Shortcuts", Icon: Keyboard, group: "System" },
  { id: "accounts", label: "Accounts", Icon: Layers, group: "System" },
  { id: "privacy", label: "Privacy", Icon: Shield, group: "System" },
];

function linkedAccounts(accounts: Account[]) {
  return accounts.filter((a) => a.id !== UNIFIED_ID);
}

function accountProviderId(account: Account): ProviderId {
  return account.provider ?? "imap";
}

function credentialGuide(account: Account) {
  const provider = providerById(accountProviderId(account));
  if (provider.auth === "oauth") {
    return {
      kind: "oauth" as const,
      title: "Google sign-in",
      summary:
        "This mailbox uses OAuth — not a password field. Tokens stay on this PC (DPAPI).",
      steps: [
        "Update sign-in / Reconnect opens Google in your browser and replaces the stored token.",
        "Revoke access anytime in Google Account → Security → Third-party access.",
        "Remove deletes local mail cache and tokens from this device only.",
      ],
    };
  }
  const where =
    provider.id === "imap"
      ? "your mail host’s security / app-password settings"
      : `${provider.shortName} → Security (app passwords)`;
  return {
    kind: "imap" as const,
    title: "App password (not your login password)",
    summary:
      provider.guide ??
      "IMAP providers need an app-specific password when 2FA is on — not the password you use on the web.",
    steps: [
      `Create an app password in ${where}, then use Update sign-in to paste it.`,
      "Your everyday login password usually will not work once two-factor auth is enabled.",
      "Secrets are encrypted with Windows DPAPI on this PC — mail never routes through Intray servers.",
      "Remove wipes the stored app password and local copies of this mailbox.",
    ],
  };
}

export function SettingsModal({
  prefs,
  accounts,
  onChange,
  onAddAccount,
  onRemoveAccount,
  onClose,
}: {
  prefs: Preferences;
  accounts: Account[];
  onChange: (p: Preferences) => void;
  onAddAccount: () => void;
  onRemoveAccount?: (accountId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>("appearance");
  const [navQuery, setNavQuery] = useState("");
  const [query, setQuery] = useState("");
  const [snippetFilter, setSnippetFilter] = useState("");
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(
    null,
  );
  const [chordPending, setChordPending] = useState<string | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState(prefs.launchAtLogin);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [accountNote, setAccountNote] = useState<string | null>(null);
  const [trustedDraft, setTrustedDraft] = useState("");
  const navSearchRef = useRef<HTMLInputElement>(null);
  const [secretStatus, setSecretStatus] = useState<Record<AiSecretId, boolean>>({
    openai: false,
    grok: false,
    anthropic: false,
    gemini: false,
    ollama: false,
  });
  const [secretDraft, setSecretDraft] = useState("");
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [mcpInfo, setMcpInfo] = useState<McpStatus>({
    running: false,
    port: null,
    url: null,
  });

  useEffect(() => {
    void bridgeLaunchAtLogin().then((s) => {
      setLaunchAtLogin(s.openAtLogin);
    });
  }, []);

  useEffect(() => {
    if (tab !== "ai") return;
    void bridgeAiSecretsStatus().then(setSecretStatus);
    void bridgeAiDetect(prefs.aiBridgePath || undefined).then((list) => {
      const map: Record<string, boolean> = {};
      for (const row of list) map[row.id] = row.available;
      setDetected(map);
    });
    void bridgeMcpStatus().then(setMcpInfo);
  }, [tab, prefs.aiBridge, prefs.aiBridgePath]);

  useEffect(() => {
    if (tab !== "shortcuts") {
      setRecordingAction(null);
      setChordPending(null);
    }
  }, [tab]);

  const mailAccounts = useMemo(() => linkedAccounts(accounts), [accounts]);

  useEffect(() => {
    if (mailAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }
    if (
      !selectedAccountId ||
      !mailAccounts.some((a) => a.id === selectedAccountId)
    ) {
      setSelectedAccountId(mailAccounts[0].id);
    }
  }, [mailAccounts, selectedAccountId]);

  useEffect(() => {
    if (tab !== "accounts") setAccountNote(null);
  }, [tab]);

  useEffect(() => {
    if (!recordingAction || !chordPending) return;
    const timer = window.setTimeout(() => {
      onChange({
        ...prefs,
        shortcutOverrides: {
          ...(prefs.shortcutOverrides ?? {}),
          [recordingAction]: chordPending,
        },
      });
      setRecordingAction(null);
      setChordPending(null);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [chordPending, recordingAction, onChange, prefs]);

  useEffect(() => {
    if (!recordingAction) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingAction(null);
        setChordPending(null);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        const next = { ...(prefs.shortcutOverrides ?? {}) };
        delete next[recordingAction];
        onChange({ ...prefs, shortcutOverrides: next });
        setRecordingAction(null);
        setChordPending(null);
        return;
      }
      if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;

      const hasMod = e.ctrlKey || e.metaKey || e.altKey;
      if (
        !hasMod &&
        !e.shiftKey &&
        e.key.length === 1 &&
        !chordPending
      ) {
        setChordPending(e.key.toUpperCase());
        return;
      }
      if (chordPending && !hasMod && e.key.length === 1) {
        const binding = `${chordPending} ${e.key.toUpperCase()}`;
        onChange({
          ...prefs,
          shortcutOverrides: {
            ...(prefs.shortcutOverrides ?? {}),
            [recordingAction]: binding,
          },
        });
        setRecordingAction(null);
        setChordPending(null);
        return;
      }

      const binding = bindingFromEvent(e);
      if (!binding) return;
      onChange({
        ...prefs,
        shortcutOverrides: {
          ...(prefs.shortcutOverrides ?? {}),
          [recordingAction]: binding,
        },
      });
      setRecordingAction(null);
      setChordPending(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingAction, chordPending, onChange, prefs]);

  const secretIdForBridge = (id: AiBridgeId): AiSecretId | null => {
    if (id === "openai" || id === "grok" || id === "anthropic" || id === "gemini")
      return id;
    if (id === "ollama") return "ollama";
    return null;
  };

  const navGroups = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    const filtered = q
      ? SETTINGS_TABS.filter((t) => t.label.toLowerCase().includes(q))
      : SETTINGS_TABS;
    const groups: { name: string; items: typeof SETTINGS_TABS }[] = [];
    for (const item of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.name === item.group) last.items.push(item);
      else groups.push({ name: item.group, items: [item] });
    }
    return groups;
  }, [navQuery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      navSearchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeTab = SETTINGS_TABS.find((t) => t.id === tab) ?? SETTINGS_TABS[0];

  const restoreDefaults = () => {
    onChange({ ...defaultPreferences });
    setLaunchAtLogin(defaultPreferences.launchAtLogin);
    void bridgeSetLaunchAtLogin(
      defaultPreferences.launchAtLogin,
      defaultPreferences.launchToTray,
    );
  };

  const patch = (partial: Partial<Preferences>) =>
    onChange({ ...prefs, ...partial });

  const overrides = prefs.shortcutOverrides ?? {};
  const shortcutRows = listShortcuts(prefs.shortcutPack, overrides).filter(
    (s) =>
      !query ||
      s.label.toLowerCase().includes(query.toLowerCase()) ||
      s.keys.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = ["Navigate", "Actions", "Compose", "Jump", "Help"] as const;
  const customCount = Object.keys(overrides).length;

  const snippets = [
    { name: "Thanks — will review", body: "Thanks, I'll take a look and get back to you." },
    { name: "Intro call", body: "Would love 20 minutes next week — does Tue/Wed work?" },
    { name: "Out of office", body: "I'm out until Monday with limited access to email." },
  ].filter(
    (s) =>
      !snippetFilter ||
      s.name.toLowerCase().includes(snippetFilter.toLowerCase()),
  );

  return (
    <div className="modal-root" role="presentation" onClick={onClose}>
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings categories">
            <label className="settings-nav-search">
              <Search size={14} strokeWidth={1.75} aria-hidden />
              <input
                ref={navSearchRef}
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Search settings"
                aria-label="Search settings"
              />
              <kbd className="settings-nav-kbd">/</kbd>
            </label>

            <div className="settings-nav-scroll">
              {navGroups.length === 0 ? (
                <p className="settings-nav-empty">No matching categories</p>
              ) : (
                navGroups.map((group) => (
                  <div key={group.name} className="settings-nav-group">
                    <div className="settings-nav-group-label">{group.name}</div>
                    {group.items.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        className={`nav-item${tab === id ? " active" : ""}`}
                        onClick={() => setTab(id)}
                      >
                        <Icon size={15} strokeWidth={1.75} />
                        {label}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </nav>

          <div className="settings-main">
            <header className="settings-topbar">
              <div className="settings-breadcrumb" aria-label="Breadcrumb">
                <span>Settings</span>
                <span className="settings-breadcrumb-sep" aria-hidden>
                  /
                </span>
                <span className="settings-breadcrumb-current">
                  {activeTab.label}
                </span>
              </div>
              <div className="settings-topbar-actions">
                <button
                  type="button"
                  className="settings-restore-btn"
                  onClick={restoreDefaults}
                >
                  <RotateCcw size={14} strokeWidth={1.75} />
                  Restore defaults
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
            </header>

            <div className="settings-body">
            {tab === "appearance" && (
              <>
                <Block
                  title="Appearance"
                  hint="Match Windows, or lock light/dark. No glow effects."
                >
                  <Row title="Theme" hint="Light, dark, or follow the OS">
                    <Select
                      value={prefs.theme}
                      onChange={(theme) => patch({ theme })}
                      options={[
                        { id: "light", label: "Light" },
                        { id: "dark", label: "Dark" },
                        { id: "system", label: "System" },
                      ]}
                    />
                  </Row>
                  <Row
                    title="Accent color"
                    hint="Highlights, Join pills, unread dots"
                  >
                    <div className="accent-row">
                      {(Object.keys(accentColors) as AccentId[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={`accent-swatch${prefs.accent === id ? " active" : ""}`}
                          style={{ background: accentColors[id] }}
                          title={id}
                          onClick={() => patch({ accent: id })}
                        />
                      ))}
                    </div>
                  </Row>
                </Block>

                <Block
                  title="Layout"
                  hint="Compact = list + reader side by side. Wide = bigger list. Full screen = open mail on its own page."
                >
                  <Row
                    title="Panels"
                    hint="How the list and reading pane sit together"
                  >
                    <Select
                      value={prefs.layout}
                      onChange={(layout) => patch({ layout })}
                      options={[
                        { id: "panels", label: "Compact" },
                        { id: "wide", label: "Wide list" },
                        { id: "stack", label: "Full screen" },
                      ]}
                    />
                  </Row>
                  <Row title="Density">
                    <Select
                      value={prefs.density}
                      onChange={(density) => patch({ density })}
                      options={[
                        { id: "comfortable", label: "Comfortable" },
                        { id: "compact", label: "Compact" },
                        { id: "dense", label: "Dense" },
                      ]}
                    />
                  </Row>
                  <Row title="Reading width">
                    <Select
                      value={prefs.readingWidth}
                      onChange={(readingWidth) => patch({ readingWidth })}
                      options={[
                        { id: "narrow", label: "Narrow" },
                        { id: "medium", label: "Medium" },
                        { id: "wide", label: "Wide" },
                      ]}
                    />
                  </Row>
                  <Row
                    title="Interface scale"
                    hint={`${prefs.fontScale}% — list and reading pane`}
                  >
                    <input
                      className="settings-range"
                      type="range"
                      min={90}
                      max={120}
                      step={5}
                      value={prefs.fontScale}
                      onChange={(e) =>
                        patch({ fontScale: Number(e.target.value) })
                      }
                    />
                  </Row>
                </Block>

                <Block title="Display">
                  <Row title="Sender avatars" hint="Show photos / initials in the list">
                    <Toggle
                      on={prefs.showAvatars}
                      onChange={(showAvatars) => patch({ showAvatars })}
                    />
                  </Row>
                  <Row
                    title="Preview lines"
                    hint="Second line snippet under the subject"
                  >
                    <Toggle
                      on={prefs.showPreviewLines}
                      onChange={(showPreviewLines) =>
                        patch({ showPreviewLines })
                      }
                    />
                  </Row>
                  <Row
                    title="Sticky subject"
                    hint="Keep the thread subject pinned while scrolling"
                  >
                    <Toggle
                      on={prefs.stickySubject}
                      onChange={(stickySubject) => patch({ stickySubject })}
                    />
                  </Row>
                  <Row
                    title="Force dark HTML bodies"
                    hint="Restyle light newsletters when the app is dark"
                  >
                    <Toggle
                      on={prefs.forceDarkHtml}
                      onChange={(forceDarkHtml) => patch({ forceDarkHtml })}
                    />
                  </Row>
                  <Row title="Reduce motion" hint="Disable list fade and soft transitions">
                    <Toggle
                      on={prefs.reduceMotion}
                      onChange={(reduceMotion) => patch({ reduceMotion })}
                    />
                  </Row>
                </Block>
              </>
            )}

            {tab === "inbox" && (
              <>
                <Block title="Inbox">
                  <Row
                    title="Unified Inbox"
                    hint="Merge every account into one Inbox"
                  >
                    <Toggle
                      on={prefs.unifiedInbox}
                      onChange={(unifiedInbox) => patch({ unifiedInbox })}
                    />
                  </Row>
                  <Row
                    title="Important / Other split"
                    hint="People & security first; newsletters in Other"
                  >
                    <Toggle
                      on={prefs.importantSplit}
                      onChange={(importantSplit) => patch({ importantSplit })}
                    />
                  </Row>
                  <Row
                    title="Conversation view"
                    hint="Group replies into threads in the reading pane"
                  >
                    <Toggle
                      on={prefs.conversationView}
                      onChange={(conversationView) =>
                        patch({ conversationView })
                      }
                    />
                  </Row>
                </Block>
                <Block title="Reading">
                  <Row
                    title="Waiting for Reply"
                    hint="Auto-label after this many days with no response"
                  >
                    <Select
                      value={prefs.waitingForReplyDays}
                      onChange={(waitingForReplyDays) =>
                        patch({ waitingForReplyDays })
                      }
                      options={[
                        { id: 2, label: "2 days" },
                        { id: 3, label: "3 days" },
                        { id: 5, label: "5 days" },
                        { id: 7, label: "7 days" },
                      ]}
                    />
                  </Row>
                  <Row title="Unread dots in list">
                    <Toggle
                      on={prefs.showUnreadBadgeInList}
                      onChange={(showUnreadBadgeInList) =>
                        patch({ showUnreadBadgeInList })
                      }
                    />
                  </Row>
                  <Row title="Mark as read when opened">
                    <Toggle
                      on={prefs.markReadOnOpen}
                      onChange={(markReadOnOpen) => patch({ markReadOnOpen })}
                    />
                  </Row>
                  <Row
                    title="Mark as read on scroll"
                    hint="Like Superhuman — reading past the fold clears unread"
                  >
                    <Toggle
                      on={prefs.markReadOnScroll}
                      onChange={(markReadOnScroll) =>
                        patch({ markReadOnScroll })
                      }
                    />
                  </Row>
                  <Row
                    title="Hover actions on rows"
                    hint="Unread, snooze, archive, delete without opening"
                  >
                    <Toggle
                      on={prefs.hoverActions}
                      onChange={(hoverActions) => patch({ hoverActions })}
                    />
                  </Row>
                </Block>
              </>
            )}

            {tab === "notifications" && (
              <>
                <Block
                  title="Windows notifications"
                  hint="System toasts in the notification center — like WhatsApp’s master switch."
                  action={
                    <button
                      type="button"
                      className="settings-section-btn"
                      onClick={() => {
                        void bridgeNotifyShow({
                          title: prefs.notifyShowSender
                            ? "Ava Martin"
                            : "Intray",
                          body: prefs.notifyShowPreview
                            ? "Q4 roadmap — notes attached"
                            : "You have new mail",
                          silent: !prefs.notifySound,
                        });
                      }}
                    >
                      <Bell size={14} strokeWidth={1.75} />
                      Send test
                    </button>
                  }
                >
                  <Row
                    title="Show desktop notifications"
                    hint="Uses Windows notification banners when Intray is in the background"
                  >
                    <Toggle
                      on={prefs.notifyDesktop}
                      onChange={(notifyDesktop) => patch({ notifyDesktop })}
                    />
                  </Row>
                </Block>

                <Block
                  title="Which mail"
                  hint="Important-only matches the inbox Important / Other split."
                >
                  <Row
                    title="Notify about"
                    hint="Which arrivals raise a desktop toast"
                  >
                    <Select
                      value={prefs.notifyMode}
                      onChange={(notifyMode) => patch({ notifyMode })}
                      options={[
                        { id: "all", label: "All mail" },
                        { id: "important", label: "Important" },
                        { id: "off", label: "Off" },
                      ]}
                    />
                  </Row>
                </Block>

                <Block title="Message content">
                  <Row
                    title="Show sender name"
                    hint="Who the mail is from"
                  >
                    <Toggle
                      on={prefs.notifyShowSender}
                      onChange={(notifyShowSender) =>
                        patch({ notifyShowSender })
                      }
                    />
                  </Row>
                  <Row
                    title="Show message preview"
                    hint="Subject line in the toast body"
                  >
                    <Toggle
                      on={prefs.notifyShowPreview}
                      onChange={(notifyShowPreview) =>
                        patch({ notifyShowPreview })
                      }
                    />
                  </Row>
                  <Row title="Notification sound">
                    <Toggle
                      on={prefs.notifySound}
                      onChange={(notifySound) => patch({ notifySound })}
                    />
                  </Row>
                </Block>

                <Block
                  title="Notify me about"
                  hint="Turn individual categories on or off."
                >
                  <Row title="New mail" hint="Inbox arrivals that match the filter above">
                    <Toggle
                      on={prefs.notifyNewMail}
                      onChange={(notifyNewMail) => patch({ notifyNewMail })}
                    />
                  </Row>
                  <Row title="Meetings" hint="Calendar / join reminders">
                    <Toggle
                      on={prefs.notifyMeetings}
                      onChange={(notifyMeetings) => patch({ notifyMeetings })}
                    />
                  </Row>
                  <Row title="Errors" hint="Sync failures and send problems">
                    <Toggle
                      on={prefs.notifyErrors}
                      onChange={(notifyErrors) => patch({ notifyErrors })}
                    />
                  </Row>
                </Block>

                <Block title="Badges">
                  <Row
                    title="Taskbar badge"
                    hint="Unread overlay on the Windows taskbar icon"
                  >
                    <Select
                      value={prefs.taskbarBadge}
                      onChange={(taskbarBadge) => patch({ taskbarBadge })}
                      options={[
                        { id: "count", label: "Count" },
                        { id: "dot", label: "Dot" },
                        { id: "important", label: "Important" },
                        { id: "off", label: "Off" },
                      ]}
                    />
                  </Row>
                  <Row
                    title="Tray badge"
                    hint="Tooltip / tray flyout unread signal"
                  >
                    <Select
                      value={prefs.trayBadge}
                      onChange={(trayBadge) => patch({ trayBadge })}
                      options={[
                        { id: "count", label: "Count" },
                        { id: "dot", label: "Dot" },
                        { id: "important", label: "Important" },
                        { id: "off", label: "Off" },
                      ]}
                    />
                  </Row>
                </Block>

                <Block title="Startup & tray">
                  <Row
                    title="Start with Windows"
                    hint="Open Intray when you sign in (hidden to tray)"
                  >
                    <Toggle
                      on={launchAtLogin}
                      onChange={(next) => {
                        setLaunchAtLogin(next);
                        patch({ launchAtLogin: next });
                        void bridgeSetLaunchAtLogin(next, prefs.launchToTray);
                      }}
                    />
                  </Row>
                  <Row
                    title="Launch to system tray"
                    hint="Keep Intray available from the notification area"
                  >
                    <Toggle
                      on={prefs.launchToTray}
                      onChange={(launchToTray) => {
                        patch({ launchToTray });
                        if (launchAtLogin) {
                          void bridgeSetLaunchAtLogin(true, launchToTray);
                        }
                      }}
                    />
                  </Row>
                  <Row
                    title="Global hotkey"
                    hint="Ctrl+Alt+M opens the tray quick panel"
                  >
                    <Toggle
                      on={prefs.globalHotkey}
                      onChange={(globalHotkey) => patch({ globalHotkey })}
                    />
                  </Row>
                  <Row title="Quiet hours" hint="Mute Windows toasts overnight">
                    <Toggle
                      on={prefs.quietHours}
                      onChange={(quietHours) => patch({ quietHours })}
                    />
                  </Row>
                  {prefs.quietHours && (
                    <div className="quiet-row">
                      <label>
                        From
                        <input
                          type="time"
                          value={prefs.quietStart}
                          onChange={(e) =>
                            patch({ quietStart: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        To
                        <input
                          type="time"
                          value={prefs.quietEnd}
                          onChange={(e) => patch({ quietEnd: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </Block>
              </>
            )}

            {tab === "compose" && (
              <>
                <Block title="Sending">
                  <Row
                    title="Undo Send"
                    hint="Hold messages in Outbox before they leave"
                  >
                    <Select
                      value={prefs.undoSendSeconds}
                      onChange={(undoSendSeconds) =>
                        patch({ undoSendSeconds })
                      }
                      options={[
                        { id: 5, label: "5 seconds" },
                        { id: 10, label: "10 seconds" },
                        { id: 20, label: "20 seconds" },
                        { id: 0, label: "Off" },
                      ]}
                    />
                  </Row>
                  <Row title="Default to Reply all">
                    <Toggle
                      on={prefs.defaultReplyAll}
                      onChange={(defaultReplyAll) => patch({ defaultReplyAll })}
                    />
                  </Row>
                  <Row
                    title="Send & Archive"
                    hint="Archive the thread when you hit Send"
                  >
                    <Toggle
                      on={prefs.sendAndArchive}
                      onChange={(sendAndArchive) => patch({ sendAndArchive })}
                    />
                  </Row>
                  <Row title="Spellcheck">
                    <Toggle
                      on={prefs.spellcheck}
                      onChange={(spellcheck) => patch({ spellcheck })}
                    />
                  </Row>
                  <Row
                    title="Open tracking"
                    hint="Delivery ticks on Sent — gray when delivered, blue when opened"
                  >
                    <Toggle
                      on={prefs.trackOpens}
                      onChange={(trackOpens) => patch({ trackOpens })}
                    />
                  </Row>
                </Block>
                <Block title="Signatures">
                  <Row title="Signature on replies">
                    <Toggle
                      on={prefs.includeSignatureOnReply}
                      onChange={(includeSignatureOnReply) =>
                        patch({ includeSignatureOnReply })
                      }
                    />
                  </Row>
                  <Row title="Signature on forwards">
                    <Toggle
                      on={prefs.includeSignatureOnForward}
                      onChange={(includeSignatureOnForward) =>
                        patch({ includeSignatureOnForward })
                      }
                    />
                  </Row>
                </Block>
                <Block
                  title="Signatures by account"
                  hint="Plain text or HTML. Use a designed Intray card, or paste your own markup."
                >
                  <div className="signature-accounts">
                    {accounts
                      .filter((a) => a.id !== UNIFIED_ID)
                      .map((a) => {
                        const value = prefs.signaturesByAccount[a.id] ?? "";
                        const html = looksLikeHtml(value);
                        return (
                          <div key={a.id} className="signature-account">
                            <div className="signature-account-head">
                              <span
                                className="account-chip"
                                style={{
                                  background: "transparent",
                                  color: a.color,
                                  borderColor: a.color,
                                }}
                              >
                                {a.label}
                              </span>
                              <div>
                                <strong>{a.name}</strong>
                                <span>{a.email}</span>
                              </div>
                              <button
                                type="button"
                                className="pill-btn signature-template-btn"
                                onClick={() =>
                                  patch({
                                    signaturesByAccount: {
                                      ...prefs.signaturesByAccount,
                                      [a.id]: designedSignatureHtml(a),
                                    },
                                  })
                                }
                              >
                                Designed HTML
                              </button>
                            </div>
                            <textarea
                              className="settings-textarea signature-editor"
                              rows={html ? 8 : 4}
                              spellCheck={!html}
                              placeholder={
                                html
                                  ? "<table>… HTML signature …</table>"
                                  : prefs.signature || "Your signature…"
                              }
                              value={value}
                              onChange={(e) =>
                                patch({
                                  signaturesByAccount: {
                                    ...prefs.signaturesByAccount,
                                    [a.id]: e.target.value,
                                  },
                                })
                              }
                            />
                            {value.trim() && (
                              <div className="signature-preview">
                                <span className="signature-preview-label">
                                  Preview{html ? " · HTML" : " · plain"}
                                </span>
                                {html ? (
                                  <div
                                    className="signature-html"
                                    dangerouslySetInnerHTML={{
                                      __html: sanitizeSignatureHtml(value),
                                    }}
                                  />
                                ) : (
                                  <pre className="signature-plain-preview">
                                    {value}
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </Block>
                <Block
                  title="Default signature"
                  hint="Fallback when an account has no signature of its own. Plain text or HTML."
                >
                  <textarea
                    className="settings-textarea signature-editor"
                    rows={4}
                    value={prefs.signature}
                    onChange={(e) => patch({ signature: e.target.value })}
                  />
                  {prefs.signature.trim() && looksLikeHtml(prefs.signature) && (
                    <div className="signature-preview">
                      <span className="signature-preview-label">
                        Preview · HTML
                      </span>
                      <div
                        className="signature-html"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeSignatureHtml(prefs.signature),
                        }}
                      />
                    </div>
                  )}
                </Block>
                <Block
                  title="Snippets"
                  hint="Reusable replies — Superhuman-style. Insert while composing."
                >
                  <label className="shortcut-search">
                    <Search size={14} strokeWidth={1.75} />
                    <input
                      value={snippetFilter}
                      onChange={(e) => setSnippetFilter(e.target.value)}
                      placeholder="Filter snippets…"
                    />
                  </label>
                  <div className="snippet-list">
                    {snippets.map((s) => (
                      <div key={s.name} className="snippet-card">
                        <strong>{s.name}</strong>
                        <span>{s.body}</span>
                      </div>
                    ))}
                    <button type="button" className="compose settings-add">
                      <Plus size={15} strokeWidth={2} />
                      New snippet
                    </button>
                  </div>
                </Block>
              </>
            )}

            {tab === "ai" && (
              <>
                <Block
                  title="AI provider"
                  hint="BYO keys and local CLIs. Mail never goes through Intray servers — only to the provider you pick."
                >
                  <div
                    className="bridge-icons"
                    role="radiogroup"
                    aria-label="AI provider"
                  >
                    {bridgePickerOrder.map((id) => {
                      const meta = aiBridgeMeta[id];
                      const selected = prefs.aiBridge === id;
                      const ready = detected[id] ?? meta.status === "detected";
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={meta.name}
                          title={meta.name}
                          className={`bridge-icon${selected ? " active" : ""}${id === "none" ? " bridge-icon-off" : ""}`}
                          onClick={() => {
                            patch({ aiBridge: id });
                            setSecretDraft("");
                          }}
                        >
                          <BridgeLogo id={id} size={22} />
                          {ready && id !== "none" && (
                            <span className="bridge-dot" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="bridge-selection">
                    <strong>{aiBridgeMeta[prefs.aiBridge].name}</strong>
                    <span>
                      {prefs.aiBridge === "none"
                        ? "AI features stay off until you pick a provider."
                        : detected[prefs.aiBridge]
                          ? "Ready on this PC."
                          : aiBridgeMeta[prefs.aiBridge].needsKey
                            ? "Add an API key below."
                            : "Not detected yet — set a path if needed."}
                    </span>
                  </div>
                </Block>

                {prefs.aiBridge !== "none" && (
                  <>
                    {(() => {
                      const secretId = secretIdForBridge(prefs.aiBridge);
                      if (!secretId || prefs.aiBridge === "ollama") {
                        return prefs.aiBridge === "ollama" ? (
                          <Block
                            title="Ollama host"
                            hint="Leave blank for http://127.0.0.1:11434"
                          >
                            <input
                              className="settings-input settings-input-wide"
                              placeholder="http://127.0.0.1:11434"
                              value={secretDraft}
                              onChange={(e) => setSecretDraft(e.target.value)}
                              onBlur={() => {
                                void bridgeAiSetSecret(
                                  "ollama",
                                  secretDraft.trim(),
                                ).then(() =>
                                  bridgeAiSecretsStatus().then(setSecretStatus),
                                );
                              }}
                            />
                          </Block>
                        ) : null;
                      }
                      return (
                        <Block
                          title={`${aiBridgeMeta[prefs.aiBridge].name} API key`}
                          hint={
                            secretStatus[secretId]
                              ? "Provider API key saved on this PC (DPAPI) — not your email password. Paste a new key to replace."
                              : "This is a provider API key (sk-…), not a mail account password. Stored only on this device with Windows DPAPI."
                          }
                        >
                          <input
                            className="settings-input settings-input-wide"
                            type="password"
                            autoComplete="off"
                            placeholder={
                              secretStatus[secretId]
                                ? "•••••••••••• (saved)"
                                : "sk-… API key"
                            }
                            value={secretDraft}
                            onChange={(e) => setSecretDraft(e.target.value)}
                            onBlur={() => {
                              if (!secretDraft.trim()) return;
                              void bridgeAiSetSecret(
                                secretId,
                                secretDraft.trim(),
                              ).then(() => {
                                setSecretDraft("");
                                void bridgeAiSecretsStatus().then(
                                  setSecretStatus,
                                );
                                void bridgeAiDetect(
                                  prefs.aiBridgePath || undefined,
                                ).then((list) => {
                                  const map: Record<string, boolean> = {};
                                  for (const row of list)
                                    map[row.id] = row.available;
                                  setDetected(map);
                                });
                              });
                            }}
                          />
                          <p className="settings-inline-note">
                            Create or rotate keys in your{" "}
                            {aiBridgeMeta[prefs.aiBridge].name} dashboard, then
                            paste here. Clearing and blurring with an empty
                            field leaves the saved key unchanged.
                          </p>
                        </Block>
                      );
                    })()}
                    <Block
                      title="CLI path"
                      hint="For Claude Code / Codex / Cursor — leave blank to use PATH."
                    >
                      <input
                        className="settings-input settings-input-wide"
                        placeholder="e.g. C:\Users\…\claude.exe"
                        value={prefs.aiBridgePath}
                        onChange={(e) =>
                          patch({ aiBridgePath: e.target.value })
                        }
                      />
                    </Block>
                    <Block
                      title="Model"
                      hint="Optional override (gpt-4o-mini, grok-2-latest, llama3.2, …)"
                    >
                      <input
                        className="settings-input settings-input-wide"
                        placeholder="e.g. gpt-4o-mini, grok-2-latest"
                        value={prefs.aiModelHint}
                        onChange={(e) =>
                          patch({ aiModelHint: e.target.value })
                        }
                      />
                    </Block>
                  </>
                )}

                <Block title="Features">
                  <Row title="Write with AI" hint="Suggested replies in your voice">
                    <Toggle
                      on={prefs.aiWriteEnabled}
                      onChange={(aiWriteEnabled) => patch({ aiWriteEnabled })}
                    />
                  </Row>
                  <Row title="Ask AI" hint="Natural language over your mail">
                    <Toggle
                      on={prefs.aiAskEnabled}
                      onChange={(aiAskEnabled) => patch({ aiAskEnabled })}
                    />
                  </Row>
                  <Row title="Summarize">
                    <Toggle
                      on={prefs.aiSummarizeEnabled}
                      onChange={(aiSummarizeEnabled) =>
                        patch({ aiSummarizeEnabled })
                      }
                    />
                  </Row>
                  <Row title="Translate">
                    <Toggle
                      on={prefs.aiTranslateEnabled}
                      onChange={(aiTranslateEnabled) =>
                        patch({ aiTranslateEnabled })
                      }
                    />
                  </Row>
                  <Row
                    title="Auto-label"
                    hint="Suggest labels from subject, sender, and body via your AI provider"
                  >
                    <Toggle
                      on={prefs.aiAutoLabel}
                      onChange={(aiAutoLabel) => patch({ aiAutoLabel })}
                    />
                  </Row>
                  <Row
                    title="Catch Me Up"
                    hint="Tray summary of unread, actionable first"
                  >
                    <Toggle
                      on={prefs.aiCatchMeUp}
                      onChange={(aiCatchMeUp) => patch({ aiCatchMeUp })}
                    />
                  </Row>
                  <Row
                    title="Confirm destructive AI actions"
                    hint="Show exact emails before Trash / Junk"
                  >
                    <Toggle
                      on={prefs.aiConfirmDestructive}
                      onChange={(aiConfirmDestructive) =>
                        patch({ aiConfirmDestructive })
                      }
                    />
                  </Row>
                </Block>

                <Block
                  title="Local MCP server"
                  hint={
                    mcpInfo.running && mcpInfo.url
                      ? `Listening at ${mcpInfo.url} — tools: search_emails, read_thread, list_accounts. Loopback only; browser origins rejected.`
                      : "Exposes mail tools to Cursor / Claude Desktop on localhost only."
                  }
                >
                  <Row
                    title="Enable MCP"
                    hint={mcpInfo.running ? "Running" : "Stopped"}
                  >
                    <Toggle
                      on={prefs.mcpEnabled}
                      onChange={(mcpEnabled) => {
                        patch({ mcpEnabled });
                        void (mcpEnabled
                          ? bridgeMcpStart()
                          : bridgeMcpStop()
                        ).then(setMcpInfo);
                      }}
                    />
                  </Row>
                  {mcpInfo.running && mcpInfo.config && (
                    <div className="settings-field">
                      <p className="settings-hint">
                        Paste this into your MCP client. The bearer token is
                        required — requests without it are rejected.
                      </p>
                      <pre className="signature-plain-preview">
                        {mcpInfo.config}
                      </pre>
                      <button
                        type="button"
                        className="compose settings-add"
                        style={{ marginTop: 8 }}
                        onClick={() => {
                          void bridgeMcpRotateToken().then(setMcpInfo);
                        }}
                      >
                        Rotate access token
                      </button>
                      <p className="settings-hint">
                        Rotating signs out every connected MCP client; update
                        their config with the new snippet.
                      </p>
                    </div>
                  )}
                </Block>
              </>
            )}

            {tab === "shortcuts" && (
              <>
                <Block
                  title="Shortcut pack"
                  hint="Gmail, Superhuman, or Outlook muscle memory. Press ? for a cheat sheet."
                >
                  <div
                    className="bridge-icons"
                    role="radiogroup"
                    aria-label="Shortcut pack"
                  >
                    {(Object.keys(packMeta) as ShortcutPackId[]).map((id) => {
                      const selected = prefs.shortcutPack === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={packMeta[id].name}
                          title={packMeta[id].name}
                          className={`bridge-icon${selected ? " active" : ""}`}
                          onClick={() => {
                            if (id === "custom") {
                              if (prefs.shortcutPack === "custom") return;
                              patch({
                                shortcutPack: "custom",
                                shortcutOverrides: seedCustomOverrides(
                                  prefs.shortcutPack,
                                  overrides,
                                ),
                              });
                              return;
                            }
                            patch({ shortcutPack: id });
                          }}
                        >
                          <PackLogo id={id} size={22} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="bridge-selection">
                    <strong>{packMeta[prefs.shortcutPack].name}</strong>
                    <span>{packMeta[prefs.shortcutPack].blurb}</span>
                  </div>
                </Block>
                <Block
                  title="Bindings"
                  hint="Click a key to remap it. Esc cancels; Backspace clears a custom binding."
                >
                  <label className="shortcut-search">
                    <Search size={15} strokeWidth={1.75} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter shortcuts…"
                      aria-label="Filter shortcuts"
                    />
                  </label>
                  {groups.map((group) => {
                    const rows = shortcutRows.filter((s) => s.group === group);
                    if (!rows.length) return null;
                    return (
                      <div key={group} className="shortcut-group">
                        <div className="settings-card-group-label">{group}</div>
                        {rows.map((s) => {
                          const recording = recordingAction === s.action;
                          return (
                            <div
                              key={s.action}
                              className={`settings-row shortcut-row${s.customized ? " customized" : ""}`}
                            >
                              <strong>{s.label}</strong>
                              <div className="shortcut-keys">
                                {s.customized && !recording && (
                                  <button
                                    type="button"
                                    className="shortcut-reset"
                                    title="Reset to pack default"
                                    aria-label={`Reset ${s.label}`}
                                    onClick={() => {
                                      const next = { ...overrides };
                                      delete next[s.action];
                                      patch({ shortcutOverrides: next });
                                    }}
                                  >
                                    <RotateCcw size={12} strokeWidth={2} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`keycap keycap-edit${recording ? " recording" : ""}${s.customized ? " custom" : ""}`}
                                  onClick={() => {
                                    setChordPending(null);
                                    setRecordingAction(
                                      recording ? null : s.action,
                                    );
                                  }}
                                  aria-pressed={recording}
                                  title={
                                    recording
                                      ? chordPending
                                        ? `${chordPending} then…`
                                        : "Press a key…"
                                      : "Click to customize"
                                  }
                                >
                                  {recording
                                    ? chordPending
                                      ? `${chordPending} then…`
                                      : "Press key…"
                                    : s.keys}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {customCount > 0 && (
                    <button
                      type="button"
                      className="compose settings-add shortcut-reset-all"
                      onClick={() => patch({ shortcutOverrides: {} })}
                    >
                      <RotateCcw size={14} strokeWidth={1.75} />
                      Reset {customCount} custom shortcut
                      {customCount === 1 ? "" : "s"}
                    </button>
                  )}
                </Block>
              </>
            )}

            {tab === "accounts" && (
              <>
                <Block
                  title="Connected accounts"
                  hint="Pick a mailbox to manage. Credentials stay on this PC (Windows DPAPI) — mail never routes through Intray servers."
                >
                  <div
                    className="bridge-icons"
                    role="radiogroup"
                    aria-label="Connected accounts"
                  >
                    {mailAccounts.map((a) => {
                      const selected = selectedAccountId === a.id;
                      const providerId = accountProviderId(a);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={`${a.name} (${a.email})`}
                          title={`${a.name} · ${a.email}`}
                          className={`bridge-icon account-bridge-icon${selected ? " active" : ""}${a.loggedOut ? " account-bridge-warn" : ""}`}
                          onClick={() => {
                            setSelectedAccountId(a.id);
                            setAccountNote(null);
                          }}
                        >
                          {a.avatarUrl ? (
                            <img
                              className="account-bridge-face"
                              src={a.avatarUrl}
                              alt=""
                              draggable={false}
                            />
                          ) : (
                            <span
                              className="account-bridge-face fallback"
                              style={{ background: a.color }}
                            >
                              {a.label.slice(0, 2)}
                            </span>
                          )}
                          <span className="account-bridge-provider" aria-hidden>
                            <ProviderLogo id={providerId} size={12} />
                          </span>
                          {!a.loggedOut && (
                            <span className="bridge-dot" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="bridge-icon bridge-icon-off"
                      aria-label="Add account"
                      title="Add account"
                      onClick={onAddAccount}
                    >
                      <Plus size={18} strokeWidth={1.75} />
                    </button>
                  </div>
                  {(() => {
                    const selected =
                      mailAccounts.find((a) => a.id === selectedAccountId) ??
                      mailAccounts[0];
                    if (!selected) {
                      return (
                        <div className="bridge-selection">
                          <strong>No accounts yet</strong>
                          <span>
                            Add Gmail (Google sign-in) or any IMAP mailbox with
                            an app password.
                          </span>
                        </div>
                      );
                    }
                    const provider = providerById(
                      accountProviderId(selected),
                    );
                    return (
                      <div className="bridge-selection">
                        <div className="bridge-selection-title">
                          <strong>{selected.name}</strong>
                          <span
                            className={`muted-pill account-status-pill${selected.loggedOut ? " danger" : ""}`}
                          >
                            {selected.loggedOut
                              ? "Needs reconnect"
                              : "Connected"}
                          </span>
                        </div>
                        <span>
                          {selected.email} · {provider.name} ·{" "}
                          {provider.auth === "oauth"
                            ? "OAuth sign-in"
                            : "App password + IMAP"}
                        </span>
                      </div>
                    );
                  })()}
                </Block>

                {(() => {
                  const selected =
                    mailAccounts.find((a) => a.id === selectedAccountId) ??
                    null;
                  if (!selected) return null;
                  const provider = providerById(accountProviderId(selected));
                  const guide = credentialGuide(selected);
                  const busy = accountBusy === selected.id;
                  return (
                    <>
                      <Block
                        title="Manage this account"
                        hint={
                          selected.loggedOut
                            ? "Sign-in expired or was revoked — reconnect before syncing or sending."
                            : "Sync, refresh credentials, or remove this mailbox from Intray."
                        }
                      >
                        <div className="account-manage-actions">
                          <button
                            type="button"
                            className="compose settings-add"
                            disabled={busy}
                            onClick={() => {
                              setAccountNote(null);
                              onAddAccount();
                            }}
                          >
                            <Link2 size={14} strokeWidth={1.75} />
                            {selected.loggedOut ? "Reconnect" : "Update sign-in"}
                          </button>
                          <button
                            type="button"
                            className="compose settings-add"
                            disabled={busy || !hasIntrayBridge()}
                            onClick={() => {
                              setAccountBusy(selected.id);
                              setAccountNote(null);
                              void bridgeSync(selected.id)
                                .then(() =>
                                  setAccountNote(
                                    `Synced ${selected.email} from ${provider.shortName}.`,
                                  ),
                                )
                                .catch((err: unknown) =>
                                  setAccountNote(
                                    err instanceof Error
                                      ? err.message
                                      : "Sync failed — try reconnecting.",
                                  ),
                                )
                                .finally(() => setAccountBusy(null));
                            }}
                          >
                            <RefreshCw
                              size={14}
                              strokeWidth={1.75}
                              className={busy ? "spin" : undefined}
                            />
                            Sync now
                          </button>
                          <button
                            type="button"
                            className="compose settings-add account-remove-btn"
                            disabled={busy}
                            onClick={() => {
                              const ok = window.confirm(
                                `Remove ${selected.email} from Intray?\n\nLocal mail for this account and stored credentials will be deleted from this PC. Nothing changes on ${provider.shortName}.`,
                              );
                              if (!ok) return;
                              setAccountBusy(selected.id);
                              setAccountNote(null);
                              void (async () => {
                                try {
                                  if (hasIntrayBridge()) {
                                    await bridgeRemoveAccount(selected.id);
                                  }
                                  onRemoveAccount?.(selected.id);
                                  setAccountNote(`Removed ${selected.email}.`);
                                } catch (err) {
                                  setAccountNote(
                                    err instanceof Error
                                      ? err.message
                                      : "Could not remove account.",
                                  );
                                } finally {
                                  setAccountBusy(null);
                                }
                              })();
                            }}
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                            Remove
                          </button>
                        </div>
                        {accountNote && (
                          <p className="settings-inline-note">{accountNote}</p>
                        )}
                      </Block>

                      <Block
                        title={guide.title}
                        hint={guide.summary}
                      >
                        <div className="account-credential-card">
                          <div className="account-credential-head">
                            {guide.kind === "oauth" ? (
                              <Lock size={15} strokeWidth={1.75} />
                            ) : (
                              <KeyRound size={15} strokeWidth={1.75} />
                            )}
                            <div>
                              <strong>
                                {guide.kind === "oauth"
                                  ? "No password to store"
                                  : "Use an app password"}
                              </strong>
                              <span>
                                {guide.kind === "oauth"
                                  ? "Browser sign-in issues a token Intray keeps encrypted locally."
                                  : "In the connect form, use App password — paste the app-specific password from your provider, not your web login."}
                              </span>
                            </div>
                          </div>
                          <ol className="account-credential-steps">
                            {guide.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      </Block>
                    </>
                  );
                })()}
              </>
            )}

            {tab === "privacy" && (
              <>
                <div className="privacy-banner">
                  <Shield size={16} strokeWidth={1.75} />
                  Mail never routes through Intray servers. Device ↔ provider
                  only. License checks send a key — never message content.
                </div>
                <Block
                  title="Remote images"
                  hint="Remote http(s) images can reveal that you opened a message. Per-message Load images still works when blocked."
                >
                  <Row
                    title="Download policy"
                    hint="Always, never, or only from trusted senders"
                  >
                    <Select
                      value={prefs.remoteImagePolicy}
                      onChange={(remoteImagePolicy: RemoteImagePolicy) =>
                        patch({ remoteImagePolicy })
                      }
                      options={[
                        { id: "always", label: "Always download" },
                        { id: "never", label: "Never download" },
                        {
                          id: "trusted",
                          label: "Trusted sources only",
                        },
                      ]}
                    />
                  </Row>
                  {prefs.remoteImagePolicy === "trusted" && (
                    <div className="trusted-image-editor">
                      <p className="settings-inline-note">
                        Add full addresses or domains — e.g.{" "}
                        <code>ava@northwind.io</code>,{" "}
                        <code>@northwind.io</code>, or{" "}
                        <code>northwind.io</code>.
                      </p>
                      <div className="trusted-image-add">
                        <input
                          className="settings-input settings-input-wide"
                          type="text"
                          spellCheck={false}
                          placeholder="email@domain.com or @domain.com"
                          value={trustedDraft}
                          onChange={(e) => setTrustedDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const next = trustedDraft.trim();
                            if (!next) return;
                            const existing = prefs.trustedImageSenders.map(
                              (s) => s.toLowerCase(),
                            );
                            if (existing.includes(next.toLowerCase())) {
                              setTrustedDraft("");
                              return;
                            }
                            patch({
                              trustedImageSenders: [
                                ...prefs.trustedImageSenders,
                                next,
                              ],
                            });
                            setTrustedDraft("");
                          }}
                        />
                        <button
                          type="button"
                          className="compose settings-add"
                          disabled={!trustedDraft.trim()}
                          onClick={() => {
                            const next = trustedDraft.trim();
                            if (!next) return;
                            const existing = prefs.trustedImageSenders.map(
                              (s) => s.toLowerCase(),
                            );
                            if (existing.includes(next.toLowerCase())) {
                              setTrustedDraft("");
                              return;
                            }
                            patch({
                              trustedImageSenders: [
                                ...prefs.trustedImageSenders,
                                next,
                              ],
                            });
                            setTrustedDraft("");
                          }}
                        >
                          <Plus size={15} strokeWidth={2} />
                          Add
                        </button>
                      </div>
                      {prefs.trustedImageSenders.length > 0 ? (
                        <ul className="trusted-image-list">
                          {prefs.trustedImageSenders.map((entry) => (
                            <li key={entry} className="trusted-image-chip">
                              <span>{entry}</span>
                              <button
                                type="button"
                                className="trusted-image-chip-x"
                                aria-label={`Remove ${entry}`}
                                onClick={() =>
                                  patch({
                                    trustedImageSenders:
                                      prefs.trustedImageSenders.filter(
                                        (s) => s !== entry,
                                      ),
                                  })
                                }
                              >
                                <X size={12} strokeWidth={2} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="settings-inline-note">
                          No trusted sources yet — remote images stay blocked
                          until you add one or load them on a message.
                        </p>
                      )}
                    </div>
                  )}
                </Block>
                <Block title="Privacy">
                  <Row title="Analytics" hint="Off by default — nothing phones home">
                    <Toggle
                      on={prefs.analytics}
                      onChange={(analytics) => patch({ analytics })}
                    />
                  </Row>
                  <Row title="Crash reports" hint="Optional, no mail bodies">
                    <Toggle
                      on={prefs.crashReports}
                      onChange={(crashReports) => patch({ crashReports })}
                    />
                  </Row>
                  <Row
                    title="Windows Hello lock"
                    hint="Require biometric / PIN when waking from tray"
                  >
                    <Toggle
                      on={prefs.lockWithWindowsHello}
                      onChange={(lockWithWindowsHello) =>
                        patch({ lockWithWindowsHello })
                      }
                    />
                  </Row>
                </Block>
              </>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
