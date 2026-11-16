import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Bot,
  FileText,
  Keyboard,
  LayoutGrid,
  Layers,
  Moon,
  Plus,
  Search,
  Shield,
  X,
} from "lucide-react";
import type { AiSecretId } from "../shared/types";
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
  bridgeNotifyShow,
  bridgeSetLaunchAtLogin,
} from "./mailApi";
import {
  accentColors,
  aiBridgeMeta,
  type AccentId,
  type AiBridgeId,
  type Preferences,
} from "./preferences";
import {
  designedSignatureHtml,
  looksLikeHtml,
  sanitizeSignatureHtml,
} from "./signatures";
import { listShortcuts, packMeta, type ShortcutPackId } from "./shortcuts";

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

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`segment${value === o.id ? " active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
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
      <div>
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-block">
      <strong>{title}</strong>
      {hint && <span className="settings-hint">{hint}</span>}
      {children}
    </div>
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
    <select
      className="settings-select"
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.id) === raw);
        if (match) onChange(match.id);
      }}
    >
      {options.map((o) => (
        <option key={String(o.id)} value={String(o.id)}>
          {o.label}
        </option>
      ))}
    </select>
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

export function SettingsModal({
  prefs,
  accounts,
  onChange,
  onAddAccount,
  onClose,
}: {
  prefs: Preferences;
  accounts: Account[];
  onChange: (p: Preferences) => void;
  onAddAccount: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>("appearance");
  const [query, setQuery] = useState("");
  const [snippetFilter, setSnippetFilter] = useState("");
  const [launchAtLogin, setLaunchAtLogin] = useState(prefs.launchAtLogin);
  const [secretStatus, setSecretStatus] = useState<Record<AiSecretId, boolean>>({
    openai: false,
    grok: false,
    anthropic: false,
    gemini: false,
    ollama: false,
  });
  const [secretDraft, setSecretDraft] = useState("");
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [mcpInfo, setMcpInfo] = useState<{
    running: boolean;
    url: string | null;
  }>({ running: false, url: null });

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
    void bridgeMcpStatus().then((s) =>
      setMcpInfo({ running: s.running, url: s.url }),
    );
  }, [tab, prefs.aiBridge, prefs.aiBridgePath]);

  const secretIdForBridge = (id: AiBridgeId): AiSecretId | null => {
    if (id === "openai" || id === "grok" || id === "anthropic" || id === "gemini")
      return id;
    if (id === "ollama") return "ollama";
    return null;
  };

  const tabs: { id: TabId; label: string; Icon: typeof Moon }[] = [
    { id: "appearance", label: "Appearance", Icon: Moon },
    { id: "inbox", label: "Inbox", Icon: LayoutGrid },
    { id: "notifications", label: "Notifications", Icon: Bell },
    { id: "compose", label: "Compose", Icon: FileText },
    { id: "ai", label: "AI & agents", Icon: Bot },
    { id: "shortcuts", label: "Shortcuts", Icon: Keyboard },
    { id: "accounts", label: "Accounts", Icon: Layers },
    { id: "privacy", label: "Privacy", Icon: Shield },
  ];

  const patch = (partial: Partial<Preferences>) =>
    onChange({ ...prefs, ...partial });

  const shortcutRows = listShortcuts(prefs.shortcutPack).filter(
    (s) =>
      !query ||
      s.label.toLowerCase().includes(query.toLowerCase()) ||
      s.keys.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = ["Navigate", "Actions", "Compose", "Jump", "Help"] as const;

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
        <div className="modal-head">
          <h2>Settings</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav">
            {tabs.map(({ id, label, Icon }) => (
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
          </nav>

          <div className="settings-body">
            {tab === "appearance" && (
              <>
                <Block
                  title="Theme"
                  hint="Match Windows, or lock light/dark. No glow effects."
                >
                  <Segmented
                    value={prefs.theme}
                    onChange={(theme) => patch({ theme })}
                    options={[
                      { id: "light", label: "Light" },
                      { id: "dark", label: "Dark" },
                      { id: "system", label: "System" },
                    ]}
                  />
                </Block>

                <Block title="Accent color" hint="Highlights, Join pills, unread dots.">
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
                </Block>

                <Block
                  title="Layout"
                  hint="Compact = list + reader side by side. Wide = bigger list. Full screen = open mail on its own page."
                >
                  <Segmented
                    value={prefs.layout}
                    onChange={(layout) => patch({ layout })}
                    options={[
                      { id: "panels", label: "Compact" },
                      { id: "wide", label: "Wide list" },
                      { id: "stack", label: "Full screen" },
                    ]}
                  />
                </Block>

                <Block title="Density">
                  <Segmented
                    value={prefs.density}
                    onChange={(density) => patch({ density })}
                    options={[
                      { id: "comfortable", label: "Comfortable" },
                      { id: "compact", label: "Compact" },
                      { id: "dense", label: "Dense" },
                    ]}
                  />
                </Block>

                <Block title="Reading width">
                  <Segmented
                    value={prefs.readingWidth}
                    onChange={(readingWidth) => patch({ readingWidth })}
                    options={[
                      { id: "narrow", label: "Narrow" },
                      { id: "medium", label: "Medium" },
                      { id: "wide", label: "Wide" },
                    ]}
                  />
                </Block>

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
              </>
            )}

            {tab === "inbox" && (
              <>
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
              </>
            )}

            {tab === "notifications" && (
              <>
                <Block
                  title="Windows notifications"
                  hint="System toasts in the notification center — like WhatsApp’s master switch."
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
                  <button
                    type="button"
                    className="compose settings-add"
                    style={{ marginTop: 8 }}
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
                    Send test notification
                  </button>
                </Block>

                <Block
                  title="Which mail"
                  hint="Important-only matches the inbox Important / Other split."
                >
                  <Segmented
                    value={prefs.notifyMode}
                    onChange={(notifyMode) => patch({ notifyMode })}
                    options={[
                      { id: "all", label: "All mail" },
                      { id: "important", label: "Important" },
                      { id: "off", label: "Off" },
                    ]}
                  />
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

                <Block
                  title="Taskbar badge"
                  hint="Unread count overlay on the Windows taskbar icon"
                >
                  <Segmented
                    value={prefs.taskbarBadge}
                    onChange={(taskbarBadge) => patch({ taskbarBadge })}
                    options={[
                      { id: "count", label: "Count" },
                      { id: "dot", label: "Dot" },
                      { id: "important", label: "Important" },
                      { id: "off", label: "Off" },
                    ]}
                  />
                </Block>

                <Block title="Tray badge" hint="Tooltip / tray flyout unread signal">
                  <Segmented
                    value={prefs.trayBadge}
                    onChange={(trayBadge) => patch({ trayBadge })}
                    options={[
                      { id: "count", label: "Count" },
                      { id: "dot", label: "Dot" },
                      { id: "important", label: "Important" },
                      { id: "off", label: "Off" },
                    ]}
                  />
                </Block>

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
              </>
            )}

            {tab === "compose" && (
              <>
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
                              ? "Key saved on this PC (DPAPI). Paste a new one to replace."
                              : "Stored only on this device with Windows DPAPI."
                          }
                        >
                          <input
                            className="settings-input settings-input-wide"
                            type="password"
                            autoComplete="off"
                            placeholder={
                              secretStatus[secretId]
                                ? "•••••••••••• (saved)"
                                : "sk-…"
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

                <div className="section-label">Features</div>
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

                <div className="section-label">MCP</div>
                <Block
                  title="Local MCP server"
                  hint={
                    mcpInfo.running && mcpInfo.url
                      ? `Listening at ${mcpInfo.url} — tools: search_emails, read_thread, list_accounts`
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
                        ).then((s) =>
                          setMcpInfo({ running: s.running, url: s.url }),
                        );
                      }}
                    />
                  </Row>
                </Block>
              </>
            )}

            {tab === "shortcuts" && (
              <>
                <Block
                  title="Shortcut pack"
                  hint="Gmail, Superhuman, or Outlook muscle memory. Press ? for a cheat sheet."
                >
                  <div className="pack-grid">
                    {(Object.keys(packMeta) as ShortcutPackId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`pack-card${prefs.shortcutPack === id ? " active" : ""}`}
                        onClick={() => patch({ shortcutPack: id })}
                      >
                        <strong>{packMeta[id].name}</strong>
                        <span>{packMeta[id].blurb}</span>
                      </button>
                    ))}
                  </div>
                </Block>
                <label className="shortcut-search">
                  <Search size={14} strokeWidth={1.75} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter shortcuts…"
                  />
                </label>
                {groups.map((group) => {
                  const rows = shortcutRows.filter((s) => s.group === group);
                  if (!rows.length) return null;
                  return (
                    <div key={group} className="shortcut-group">
                      <div className="section-label">{group}</div>
                      {rows.map((s) => (
                        <div
                          key={`${s.action}-${s.keys}`}
                          className="settings-row"
                        >
                          <strong>{s.label}</strong>
                          <kbd className="keycap">{s.keys}</kbd>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}

            {tab === "accounts" && (
              <div className="settings-accounts">
                {accounts
                  .filter((a) => a.id !== UNIFIED_ID)
                  .map((a) => (
                    <div key={a.id} className="settings-account">
                      {a.avatarUrl ? (
                        <img
                          className="avatar photo"
                          src={a.avatarUrl}
                          alt=""
                          draggable={false}
                        />
                      ) : (
                        <div
                          className="avatar"
                          style={{ background: a.color, color: "#0a0a0b" }}
                        >
                          {a.label}
                        </div>
                      )}
                      <div>
                        <strong>{a.name}</strong>
                        <span>{a.email}</span>
                      </div>
                      <span className="muted-pill">Connected</span>
                    </div>
                  ))}
                <button
                  type="button"
                  className="compose settings-add"
                  onClick={onAddAccount}
                >
                  <Plus size={15} strokeWidth={2} />
                  Add account
                </button>
                <p className="settings-hint" style={{ marginTop: 12 }}>
                  Credentials stay on this PC (DPAPI). Remove an account from the
                  Add account flow or by disconnecting in a future settings row.
                </p>
              </div>
            )}

            {tab === "privacy" && (
              <>
                <div className="privacy-banner">
                  <Shield size={16} strokeWidth={1.75} />
                  Mail never routes through Intray servers. Device ↔ provider
                  only. License checks send a key — never message content.
                </div>
                <Row
                  title="Block remote images"
                  hint="Stop trackers until you choose to load"
                >
                  <Toggle
                    on={prefs.blockRemoteImages}
                    onChange={(blockRemoteImages) =>
                      patch({ blockRemoteImages })
                    }
                  />
                </Row>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
