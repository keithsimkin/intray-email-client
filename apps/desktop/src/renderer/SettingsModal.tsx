import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Bot,
  Clapperboard,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  ImagePlus,
  Info,
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
import type {
  AiModelList,
  AiProviderStatus,
  AiSecretId,
  AppUpdateStatus,
  McpStatus,
} from "../shared/types";
import { AppSelect } from "./AppSelect";
import { PackLogo } from "./BrandIcon";
import { BridgeLogo, bridgePickerOrder } from "./bridgeLogos";
import { UNIFIED_ID, type Account } from "./data/mock";
import {
  accountDtoToUi,
  bridgeAddAccountIdentity,
  bridgeAiDetect,
  bridgeAiModels,
  bridgeAiSecretsStatus,
  bridgeAiSetSecret,
  bridgeAppInfo,
  bridgeCheckForUpdates,
  bridgeChooseAccountAvatar,
  bridgeClearAccountAvatar,
  bridgeInstallUpdate,
  bridgeLaunchAtLogin,
  bridgeMcpStart,
  bridgeMcpStatus,
  bridgeMcpStop,
  bridgeMcpRotateToken,
  bridgeNotifyShow,
  bridgeOnUpdateStatus,
  bridgeOpenReleases,
  bridgeRemoveAccount,
  bridgeRemoveAccountIdentity,
  bridgeSetLaunchAtLogin,
  bridgeSync,
  bridgeUpdateAccount,
  bridgeUpdateStatus,
  hasIntrayBridge,
} from "./mailApi";
import { ProviderLogo, providerById, type ProviderId } from "./providers";
import {
  CREATOR_BLUR_OPTIONS,
  shouldBlurAddress,
  shouldBlurName,
  shouldBlurPreview,
  shouldBlurSubject,
  type CreatorBlurId,
  type MailKind,
} from "./creatorMode";
import {
  accentColors,
  aiBridgeMeta,
  defaultPreferences,
  type AccentId,
  type AiBridgeId,
  type Preferences,
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

function AccountFace({
  name,
  initials,
  color,
  avatarUrl,
  large = false,
}: {
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string;
  large?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [avatarUrl]);
  const faceClass = large
    ? "account-avatar-preview"
    : "account-bridge-face";

  if (avatarUrl && !broken) {
    return (
      <img
        className={faceClass}
        src={avatarUrl}
        alt=""
        title={name}
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={`${faceClass} fallback`}
      style={{ background: color }}
      title={name}
      aria-hidden
    >
      {initials}
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
  | "creator"
  | "inbox"
  | "notifications"
  | "compose"
  | "ai"
  | "shortcuts"
  | "accounts"
  | "privacy"
  | "testing"
  | "about";

const SETTINGS_TABS: {
  id: TabId;
  label: string;
  Icon: typeof Moon;
  group: string;
}[] = [
  { id: "appearance", label: "Appearance", Icon: Moon, group: "Workspace" },
  { id: "creator", label: "Creator", Icon: Clapperboard, group: "Workspace" },
  { id: "inbox", label: "Inbox", Icon: LayoutGrid, group: "Mail" },
  { id: "notifications", label: "Notifications", Icon: Bell, group: "Mail" },
  { id: "compose", label: "Compose", Icon: FileText, group: "Mail" },
  { id: "ai", label: "AI & agents", Icon: Bot, group: "Agents" },
  { id: "shortcuts", label: "Shortcuts", Icon: Keyboard, group: "System" },
  { id: "accounts", label: "Accounts", Icon: Layers, group: "System" },
  { id: "privacy", label: "Privacy", Icon: Shield, group: "System" },
  { id: "testing", label: "Testing support", Icon: FlaskConical, group: "System" },
  { id: "about", label: "About", Icon: Info, group: "System" },
];

function updateStatusCopy(status: AppUpdateStatus): string {
  switch (status.state) {
    case "checking":
      return "Checking GitHub Releases…";
    case "available":
      return status.availableVersion
        ? `Version ${status.availableVersion} is available — downloading…`
        : "An update is available — downloading…";
    case "downloading":
      return typeof status.downloadPercent === "number"
        ? `Downloading update… ${status.downloadPercent}%`
        : "Downloading update…";
    case "ready":
      return status.availableVersion
        ? `Intray ${status.availableVersion} is ready. Restart to install.`
        : "Update ready. Restart to install.";
    case "not-available":
      return "You’re on the latest release.";
    case "error":
      return status.error || "Couldn’t check for updates.";
    case "disabled":
      return (
        status.detail ||
        "Updates apply to installed builds only (not electron-vite dev)."
      );
    default:
      return "Intray checks GitHub Releases for new versions automatically.";
  }
}

function linkedAccounts(accounts: Account[]) {
  return accounts.filter((a) => a.id !== UNIFIED_ID);
}

function accountProviderId(account: Account): ProviderId {
  return account.provider ?? "imap";
}

const ACCOUNT_COLORS = [
  "#ea4335",
  "#f5a524",
  "#f5d042",
  "#3dd68c",
  "#5b8def",
  "#8b7cf6",
  "#46c5e8",
  "#ff5c5c",
  "#0a7cff",
  "#6001d2",
  "#3693F3",
  "#8a8f98",
];

function normalizeHexColor(value: string): string | null {
  const raw = value.trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
  return withHash.toLowerCase();
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
      `Create an app password in ${where}, then use Reconnect / Update sign-in — only the password is asked for; email and server settings stay.`,
      "Your everyday login password usually will not work once two-factor auth is enabled.",
      "Secrets are encrypted with Windows DPAPI on this PC — mail never routes through Intray servers.",
      "Remove wipes the stored app password and local copies of this mailbox.",
    ],
  };
}

function CreatorSettings({
  prefs,
  patch,
}: {
  prefs: Preferences;
  patch: (partial: Partial<Preferences>) => void;
}) {
  const previewPrefs = {
    creatorMode: true as const,
    creatorBlur: prefs.creatorBlur,
  };
  const mask = (kind: MailKind, field: "name" | "address" | "subject" | "preview") => {
    if (field === "name") return shouldBlurName(previewPrefs, kind);
    if (field === "address") return shouldBlurAddress(previewPrefs, kind);
    if (field === "subject") return shouldBlurSubject(previewPrefs, kind);
    return shouldBlurPreview(previewPrefs, kind);
  };
  const toggleBlur = (id: CreatorBlurId, on: boolean) => {
    const next = on
      ? prefs.creatorBlur.includes(id)
        ? prefs.creatorBlur
        : [...prefs.creatorBlur, id]
      : prefs.creatorBlur.filter((item) => item !== id);
    patch({ creatorBlur: next });
  };

  return (
    <>
      <div className="creator-intro">
        <Clapperboard size={15} strokeWidth={1.75} />
        <p>
          Blur names and addresses on screen while you record or share. The mail
          itself is not changed, and Settings stays readable.
        </p>
      </div>
      <Block
        title="Creator mode"
        hint="One click applies the options below across the inbox, reader, and compose window. Click the clapperboard in the title bar to flip it while you record."
      >
        <Row
          title="Creator mode"
          hint={
            prefs.creatorMode
              ? "On — matching details are blurred."
              : "Off — the inbox is fully readable."
          }
        >
          <Toggle
            on={prefs.creatorMode}
            onChange={(creatorMode) => {
              if (creatorMode && prefs.creatorBlur.length === 0) {
                patch({ creatorMode: true, creatorBlur: ["addresses"] });
                return;
              }
              patch({ creatorMode });
            }}
          />
        </Row>
      </Block>
      <Block
        title="What to blur"
        hint="Turn on several at once. All email addresses already includes personal, marketing, and your accounts. Use Personal or Marketing on their own when you want the other kind to stay sharp."
      >
        {CREATOR_BLUR_OPTIONS.map((option) => (
          <Row key={option.id} title={option.title} hint={option.hint}>
            <Toggle
              on={prefs.creatorBlur.includes(option.id)}
              onChange={(on) => toggleBlur(option.id, on)}
            />
          </Row>
        ))}
        <div className="creator-preview" aria-hidden>
          <div className="creator-preview-row">
            <span className={mask("personal", "name") ? "creator-blur" : undefined}>
              Ava Martin
            </span>
            <span className={mask("personal", "address") ? "creator-blur" : undefined}>
              ava@northwind.io
            </span>
          </div>
          <div className="creator-preview-row">
            <span className={mask("marketing", "name") ? "creator-blur" : undefined}>
              GitHub
            </span>
            <span
              className={mask("marketing", "address") ? "creator-blur" : undefined}
            >
              noreply@github.com
            </span>
          </div>
          <div className="creator-preview-row">
            <span className={mask("own", "name") ? "creator-blur" : undefined}>
              You
            </span>
            <span className={mask("own", "address") ? "creator-blur" : undefined}>
              you@gmail.com
            </span>
          </div>
          <div className="creator-preview-row">
            <span className={mask("personal", "subject") ? "creator-blur" : undefined}>
              Subject · Thursday review
            </span>
          </div>
          <div className="creator-preview-row">
            <span className={mask("personal", "preview") ? "creator-blur" : undefined}>
              Preview · Sending the latest draft
            </span>
          </div>
        </div>
        <p className="settings-inline-note creator-preview-note">
          Preview uses the options above. The inbox changes only while creator
          mode is on.
        </p>
      </Block>
    </>
  );
}

export function SettingsModal({
  prefs,
  accounts,
  demoActive = false,
  canUnloadDemo = false,
  onLoadDemo,
  onUnloadDemo,
  onChange,
  onAddAccount,
  onReconnectAccount,
  onRemoveAccount,
  onUpdateAccount,
  onClose,
}: {
  prefs: Preferences;
  accounts: Account[];
  /** True while the sample inbox is showing instead of synced mail. */
  demoActive?: boolean;
  /** True when at least one real account can be restored after unloading demo. */
  canUnloadDemo?: boolean;
  onLoadDemo?: () => void;
  onUnloadDemo?: () => void;
  onChange: (p: Preferences) => void;
  onAddAccount: () => void;
  onReconnectAccount?: (account: Account) => void;
  onRemoveAccount?: (accountId: string) => void;
  onUpdateAccount?: (account: Account) => void;
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
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountLabelDraft, setAccountLabelDraft] = useState("");
  const [accountColorDraft, setAccountColorDraft] = useState("#8a8f98");
  const [identityEmailDraft, setIdentityEmailDraft] = useState("");
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityNote, setIdentityNote] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [justAddedIdentityId, setJustAddedIdentityId] = useState<string | null>(
    null,
  );
  const navSearchRef = useRef<HTMLInputElement>(null);
  const [secretStatus, setSecretStatus] = useState<Record<AiSecretId, boolean>>({
    openai: false,
    grok: false,
    anthropic: false,
    gemini: false,
    ollama: false,
  });
  const [secretDraft, setSecretDraft] = useState("");
  const [detectedRows, setDetectedRows] = useState<AiProviderStatus[]>([]);
  const [modelList, setModelList] = useState<AiModelList | null>(null);
  const [modelListLoading, setModelListLoading] = useState(true);
  const [connectionCheck, setConnectionCheck] = useState(0);
  const [pathOverrideOpen, setPathOverrideOpen] = useState(false);
  const detected = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const row of detectedRows) map[row.id] = row.available;
    return map;
  }, [detectedRows]);
  const [mcpInfo, setMcpInfo] = useState<McpStatus>({
    running: false,
    port: null,
    url: null,
  });
  const [appVersion, setAppVersion] = useState("…");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({
    state: "idle",
    currentVersion: "…",
    packaged: false,
  });

  useEffect(() => {
    void bridgeLaunchAtLogin().then((s) => {
      setLaunchAtLogin(s.openAtLogin);
    });
  }, []);

  useEffect(() => {
    let cancel = false;
    void bridgeAppInfo().then((info) => {
      if (!cancel) setAppVersion(info.version);
    });
    void bridgeUpdateStatus().then((status) => {
      if (!cancel) setUpdateStatus(status);
    });
    const stop = bridgeOnUpdateStatus((status) => {
      if (!cancel) setUpdateStatus(status);
    });
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  useEffect(() => {
    if (tab !== "ai") return;
    let cancel = false;
    setModelListLoading(true);
    void (async () => {
      try {
        const [rows, secrets, models, mcp] = await Promise.all([
          bridgeAiDetect(prefs.aiBridgePath || undefined),
          bridgeAiSecretsStatus(),
          prefs.aiBridge === "none"
            ? Promise.resolve<AiModelList>({ connected: false, models: [] })
            : bridgeAiModels(prefs.aiBridge, prefs.aiBridgePath || undefined),
          bridgeMcpStatus(),
        ]);
        if (cancel) return;
        setDetectedRows(rows);
        setSecretStatus(secrets);
        setModelList(prefs.aiBridge === "none" ? null : models);
        setMcpInfo(mcp);
        const liveIds = new Set(models.models.map((m) => m.id));
        if (
          prefs.aiBridge !== "none" &&
          models.models.length > 0 &&
          prefs.aiModelHint &&
          !liveIds.has(prefs.aiModelHint)
        ) {
          patch({ aiModelHint: "" });
        }
      } catch {
        if (cancel) return;
        setModelList({
          connected: false,
          models: [],
          detail:
            "Couldn’t check the connection. Try again once the desktop app is running.",
        });
      } finally {
        if (!cancel) setModelListLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [tab, prefs.aiBridge, prefs.aiBridgePath, connectionCheck]);

  useEffect(() => {
    setPathOverrideOpen(false);
  }, [prefs.aiBridge]);

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

  const selectedMailAccount = useMemo(
    () =>
      mailAccounts.find((a) => a.id === selectedAccountId) ??
      mailAccounts[0] ??
      null,
    [mailAccounts, selectedAccountId],
  );

  useEffect(() => {
    if (!selectedMailAccount) {
      setAccountNameDraft("");
      setAccountLabelDraft("");
      setAccountColorDraft("#8a8f98");
      setIdentityEmailDraft("");
      setIdentityNote(null);
      setJustAddedIdentityId(null);
      return;
    }
    setAccountNameDraft(selectedMailAccount.name);
    setAccountLabelDraft(selectedMailAccount.label);
    setAccountColorDraft(
      normalizeHexColor(selectedMailAccount.color) ?? "#8a8f98",
    );
    setIdentityEmailDraft("");
    setIdentityBusy(false);
    setIdentityNote(null);
    setJustAddedIdentityId(null);
  }, [selectedMailAccount?.id]);

  useEffect(() => {
    if (tab !== "accounts") setAccountNote(null);
  }, [tab]);

  async function saveAccountAppearance(patch: {
    name?: string;
    label?: string;
    color?: string;
  }) {
    const selected = selectedMailAccount;
    if (!selected) return;
    const name = (patch.name ?? accountNameDraft).trim();
    const label = (patch.label ?? accountLabelDraft).trim();
    const color =
      normalizeHexColor(patch.color ?? accountColorDraft) ??
      selected.color;
    if (!name) {
      setAccountNote("Display name can’t be empty.");
      setAccountNameDraft(selected.name);
      return;
    }
    if (!normalizeHexColor(color)) {
      setAccountNote("Pick a hex color like #ea4335.");
      setAccountColorDraft(
        normalizeHexColor(selected.color) ?? "#8a8f98",
      );
      return;
    }
    const nameChanged = name !== selected.name;
    const labelChanged = label !== selected.label;
    const colorChanged =
      color.toLowerCase() !== selected.color.toLowerCase();
    if (!nameChanged && !labelChanged && !colorChanged) return;

    setAccountBusy(selected.id);
    setAccountNote(null);
    try {
      const input = {
        accountId: selected.id,
        ...(nameChanged ? { name } : {}),
        // If only the display name changed, omit label so initials refresh.
        ...(labelChanged ? { label: label || undefined } : {}),
        ...(colorChanged ? { color: color.toLowerCase() } : {}),
      };
      let next: Account = {
        ...selected,
        name: nameChanged ? name : selected.name,
        label: labelChanged ? label || selected.label : selected.label,
        color: colorChanged ? color.toLowerCase() : selected.color,
      };
      if (hasIntrayBridge()) {
        const dto = await bridgeUpdateAccount(input);
        next = {
          ...selected,
          ...accountDtoToUi(dto),
        };
      } else if (nameChanged && !labelChanged) {
        const parts = name.split(/[\s._-]+/).filter(Boolean);
        next = {
          ...next,
          label:
            parts.length >= 2
              ? (parts[0][0] + parts[1][0]).toUpperCase()
              : name.slice(0, 2).toUpperCase(),
        };
      }
      onUpdateAccount?.(next);
      setAccountNameDraft(next.name);
      setAccountLabelDraft(next.label);
      setAccountColorDraft(
        normalizeHexColor(next.color) ?? color.toLowerCase(),
      );
      setAccountNote("Appearance updated — no sign-in needed.");
    } catch (err) {
      setAccountNote(
        err instanceof Error ? err.message : "Could not update account.",
      );
      setAccountNameDraft(selected.name);
      setAccountLabelDraft(selected.label);
      setAccountColorDraft(
        normalizeHexColor(selected.color) ?? "#8a8f98",
      );
    } finally {
      setAccountBusy(null);
    }
  }

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
    // Grok is CLI-first (grok login); do not gate it on an API key field.
    if (id === "openai" || id === "anthropic" || id === "gemini") return id;
    if (id === "ollama") return "ollama";
    return null;
  };

  const activeBridge = aiBridgeMeta[prefs.aiBridge] ?? aiBridgeMeta.none;
  const activeStatus = detectedRows.find((row) => row.id === prefs.aiBridge);
  const detectedPath = activeStatus?.path ?? "";
  const liveModels = (modelList?.models ?? []).filter(
    (model) => model.id && model.id !== "auto",
  );
  const hasAuto = (modelList?.models ?? []).some((model) => model.id === "auto");
  const modelOptions =
    liveModels.length > 0 || hasAuto
      ? [
          { id: "", label: hasAuto ? "Auto" : "Account default" },
          ...liveModels,
        ]
      : [];
  const modelHint = modelListLoading
    ? "Checking the connection on this PC."
    : modelOptions.length > 0
      ? `Models reported by ${activeBridge.name}.`
      : modelList?.connected
        ? "Connected, but no models were returned."
        : "Not connected.";
  const connectionDetail =
    modelList?.detail ||
    (activeBridge.kind === "api"
      ? `Connect ${activeBridge.name} by adding an API key above, then check the connection.`
      : activeBridge.kind === "ollama"
        ? "Connect Ollama on this PC, then check the connection."
        : `Connect ${activeBridge.name} on this PC — install ${activeBridge.binary ?? "the CLI"} or paste its path — then check the connection.`);

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
                  <Row
                    title="Reading width"
                    hint="Narrow keeps a short column. Medium and Wide use the width of the pane."
                  >
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

            {tab === "creator" && (
              <CreatorSettings prefs={prefs} patch={patch} />
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
                  hint="Desktop toasts for snooze wakes, read receipts, and other reminders."
                  action={
                    <button
                      type="button"
                      className="settings-section-btn"
                      onClick={() => {
                        void bridgeNotifyShow({
                          title: "Follow up",
                          body: prefs.notifyShowPreview
                            ? "Time to follow up"
                            : "A snoozed message is back in your inbox",
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
                  title="Notify me about"
                  hint="Reminders and activity — not a stream of every new email."
                >
                  <Row
                    title="Snooze reminders"
                    hint="When a snoozed message returns to your inbox"
                  >
                    <Toggle
                      on={prefs.notifySnooze}
                      onChange={(notifySnooze) => patch({ notifySnooze })}
                    />
                  </Row>
                  <Row
                    title="Read receipts"
                    hint="When someone opens a tracked email you sent"
                  >
                    <Toggle
                      on={prefs.notifyOpens}
                      onChange={(notifyOpens) => patch({ notifyOpens })}
                    />
                  </Row>
                  <Row title="Meetings" hint="Calendar / join reminders">
                    <Toggle
                      on={prefs.notifyMeetings}
                      onChange={(notifyMeetings) => patch({ notifyMeetings })}
                    />
                  </Row>
                  <Row
                    title="New mail"
                    hint="Optional inbox arrivals (Important-only uses the inbox split)"
                  >
                    <Toggle
                      on={prefs.notifyNewMail}
                      onChange={(notifyNewMail) => patch({ notifyNewMail })}
                    />
                  </Row>
                  {prefs.notifyNewMail && (
                    <Row
                      title="Which new mail"
                      hint="Only applies when New mail is on"
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
                  )}
                  <Row title="Errors" hint="Sync failures and send problems">
                    <Toggle
                      on={prefs.notifyErrors}
                      onChange={(notifyErrors) => patch({ notifyErrors })}
                    />
                  </Row>
                </Block>

                <Block title="Message content">
                  <Row
                    title="Show sender / recipient"
                    hint="Names in reminder and read-receipt toasts"
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
                        : activeBridge.kind === "api"
                          ? detected[prefs.aiBridge]
                            ? "API key saved on this PC."
                            : "Add an API key below."
                          : activeBridge.kind === "ollama"
                            ? detected[prefs.aiBridge]
                              ? "Ollama is running on this PC."
                              : "Not reachable — set the host below."
                            : detectedPath
                              ? "CLI found on this PC."
                              : "Not detected yet — set a path below."}
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
                                setConnectionCheck((n) => n + 1);
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
                    {activeBridge.kind === "cli" && (
                      <Block
                        title="CLI path"
                        hint={
                          detectedPath && !prefs.aiBridgePath
                            ? `Found ${activeBridge.binary ?? "the CLI"} on this PC.`
                            : prefs.aiBridgePath &&
                                detectedPath &&
                                prefs.aiBridgePath !== detectedPath
                              ? `Custom path. Detected install is ${detectedPath}.`
                              : prefs.aiBridgePath
                                ? "Custom path. Clear the field to search PATH and the usual install folders."
                                : `Not found yet. Paste the full path to ${activeBridge.binary ?? "the CLI"}, or leave blank to search PATH.`
                        }
                      >
                        {detectedPath && !prefs.aiBridgePath && (
                          <p className="settings-detected-path">{detectedPath}</p>
                        )}
                        {(prefs.aiBridgePath ||
                          !detectedPath ||
                          pathOverrideOpen) && (
                          <input
                            className="settings-input settings-input-wide"
                            spellCheck={false}
                            placeholder={
                              detectedPath
                                ? "Override path (optional)"
                                : (activeBridge.pathPlaceholder ??
                                  "Full path to the CLI")
                            }
                            value={prefs.aiBridgePath}
                            onChange={(e) =>
                              patch({ aiBridgePath: e.target.value })
                            }
                          />
                        )}
                        {detectedPath &&
                          !prefs.aiBridgePath &&
                          !pathOverrideOpen && (
                            <button
                              type="button"
                              className="settings-path-change"
                              onClick={() => setPathOverrideOpen(true)}
                            >
                              Use a different path
                            </button>
                          )}
                      </Block>
                    )}
                    <Block title="Model" hint={modelHint}>
                      <div className="settings-connect">
                        {modelListLoading ? (
                          <p>Checking the connection…</p>
                        ) : modelOptions.length > 0 ? (
                          <AppSelect
                            className="settings-model-select"
                            ariaLabel={`${activeBridge.name} model`}
                            value={
                              modelOptions.some(
                                (o) => o.id === prefs.aiModelHint,
                              )
                                ? prefs.aiModelHint
                                : ""
                            }
                            options={modelOptions}
                            onChange={(aiModelHint) => patch({ aiModelHint })}
                          />
                        ) : (
                          <p>{connectionDetail}</p>
                        )}
                        <button
                          type="button"
                          className="settings-check"
                          disabled={modelListLoading}
                          onClick={() => setConnectionCheck((n) => n + 1)}
                        >
                          Check connection
                        </button>
                      </div>
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
                          <AccountFace
                            name={a.name}
                            initials={a.label.slice(0, 2)}
                            color={a.color}
                            avatarUrl={a.avatarUrl}
                          />
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
                        title="Account appearance"
                        hint="Change display name, photo, initials, and color locally — no sign-in required."
                      >
                        <Row
                          title="Profile photo"
                          hint="Shown on the account rail and sidebar. Overrides Google / Gravatar."
                        >
                          <div className="account-avatar-editor">
                            <AccountFace
                              name={selected.name}
                              initials={
                                accountLabelDraft.trim().slice(0, 2) ||
                                selected.label.slice(0, 2)
                              }
                              color={
                                normalizeHexColor(accountColorDraft) ??
                                selected.color
                              }
                              avatarUrl={selected.avatarUrl}
                              large
                            />
                            <div className="account-avatar-actions">
                              <button
                                type="button"
                                className="settings-section-btn"
                                disabled={busy || !hasIntrayBridge()}
                                onClick={() => {
                                  void (async () => {
                                    setAccountBusy(selected.id);
                                    setAccountNote(null);
                                    try {
                                      const dto =
                                        await bridgeChooseAccountAvatar(
                                          selected.id,
                                        );
                                      const next = {
                                        ...selected,
                                        ...accountDtoToUi(dto),
                                      };
                                      onUpdateAccount?.(next);
                                      setAccountNote(
                                        next.avatarUrl
                                          ? "Profile photo updated."
                                          : "No photo selected.",
                                      );
                                    } catch (err) {
                                      setAccountNote(
                                        err instanceof Error
                                          ? err.message
                                          : "Could not update photo.",
                                      );
                                    } finally {
                                      setAccountBusy(null);
                                    }
                                  })();
                                }}
                              >
                                <ImagePlus size={14} strokeWidth={1.75} />
                                {selected.avatarUrl
                                  ? "Change photo"
                                  : "Add photo"}
                              </button>
                              {selected.avatarUrl
                                ?.toLowerCase()
                                .startsWith("data:image/") ? (
                                <button
                                  type="button"
                                  className="settings-section-btn"
                                  disabled={busy || !hasIntrayBridge()}
                                  onClick={() => {
                                    void (async () => {
                                      setAccountBusy(selected.id);
                                      setAccountNote(null);
                                      try {
                                        const dto =
                                          await bridgeClearAccountAvatar(
                                            selected.id,
                                          );
                                        const next = {
                                          ...selected,
                                          ...accountDtoToUi(dto),
                                        };
                                        onUpdateAccount?.(next);
                                        setAccountNote(
                                          next.avatarUrl
                                            ? "Reverted to Google / Gravatar photo."
                                            : "Photo removed — showing initials.",
                                        );
                                      } catch (err) {
                                        setAccountNote(
                                          err instanceof Error
                                            ? err.message
                                            : "Could not remove photo.",
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
                              ) : null}
                            </div>
                          </div>
                        </Row>
                        <Row
                          title="Display name"
                          hint="Shown in the sidebar and as the From name when you send"
                        >
                          <input
                            className="settings-input"
                            value={accountNameDraft}
                            disabled={busy}
                            maxLength={80}
                            aria-label="Display name"
                            onChange={(e) => setAccountNameDraft(e.target.value)}
                            onBlur={() => {
                              void saveAccountAppearance({
                                name: accountNameDraft,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </Row>
                        <Row
                          title="Initials"
                          hint="Short label on the account chip (1–3 characters)"
                        >
                          <input
                            className="settings-input account-label-input"
                            value={accountLabelDraft}
                            disabled={busy}
                            maxLength={3}
                            aria-label="Account initials"
                            onChange={(e) =>
                              setAccountLabelDraft(
                                e.target.value.replace(/\s+/g, "").slice(0, 3),
                              )
                            }
                            onBlur={() => {
                              void saveAccountAppearance({
                                label: accountLabelDraft,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </Row>
                        <Row
                          title="Account color"
                          hint="Used for the chip, rail, and message badges"
                        >
                          <div className="accent-row account-color-row">
                            {ACCOUNT_COLORS.map((c) => {
                              const active =
                                accountColorDraft.toLowerCase() ===
                                c.toLowerCase();
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  className={`accent-swatch${active ? " active" : ""}`}
                                  style={{ background: c }}
                                  title={c}
                                  aria-label={`Color ${c}`}
                                  aria-pressed={active}
                                  disabled={busy}
                                  onClick={() => {
                                    setAccountColorDraft(c.toLowerCase());
                                    void saveAccountAppearance({ color: c });
                                  }}
                                />
                              );
                            })}
                            <label
                              className="account-color-custom"
                              title="Custom color"
                            >
                              <span className="sr-only">Custom color</span>
                              <input
                                type="color"
                                value={
                                  normalizeHexColor(accountColorDraft) ??
                                  "#8a8f98"
                                }
                                disabled={busy}
                                onChange={(e) => {
                                  const next = e.target.value.toLowerCase();
                                  setAccountColorDraft(next);
                                  void saveAccountAppearance({ color: next });
                                }}
                              />
                            </label>
                          </div>
                        </Row>
                      </Block>

                      <Block
                        title="Linked addresses"
                        hint={
                          selected.provider === "icloud"
                            ? "Custom domain and alias addresses that deliver to this iCloud mailbox. Add them to send as those addresses."
                            : "Extra From addresses for this mailbox (aliases, custom domains). Mail still syncs through this account."
                        }
                      >
                        <div className="account-identity-panel">
                          <div className="account-identity-list">
                            {(
                              selected.identities?.length
                                ? selected.identities
                                : [
                                    {
                                      id: `${selected.id}-primary`,
                                      email: selected.email,
                                      name: selected.name,
                                      primary: true,
                                    },
                                  ]
                            ).map((identity) => (
                              <div
                                key={identity.id}
                                className={`account-identity-row${
                                  justAddedIdentityId === identity.id
                                    ? " just-added"
                                    : ""
                                }`}
                              >
                                <div className="account-identity-meta">
                                  <strong>{identity.email}</strong>
                                  <span>
                                    {identity.primary
                                      ? "Primary"
                                      : "Send as"}
                                    {identity.name &&
                                    identity.name !== selected.name
                                      ? ` · ${identity.name}`
                                      : ""}
                                  </span>
                                </div>
                                {!identity.primary ? (
                                  <button
                                    type="button"
                                    className="settings-section-btn"
                                    disabled={
                                      busy ||
                                      identityBusy ||
                                      !hasIntrayBridge()
                                    }
                                    aria-label={`Remove ${identity.email}`}
                                    onClick={() => {
                                      setIdentityBusy(true);
                                      setIdentityNote(null);
                                      void (async () => {
                                        try {
                                          const dto =
                                            await bridgeRemoveAccountIdentity(
                                              selected.id,
                                              identity.id,
                                            );
                                          onUpdateAccount?.({
                                            ...selected,
                                            ...accountDtoToUi(dto),
                                          });
                                          setJustAddedIdentityId(null);
                                          setIdentityNote({
                                            kind: "ok",
                                            text: `Removed ${identity.email}.`,
                                          });
                                        } catch (err) {
                                          setIdentityNote({
                                            kind: "err",
                                            text:
                                              err instanceof Error
                                                ? err.message
                                                : "Could not remove address.",
                                          });
                                        } finally {
                                          setIdentityBusy(false);
                                        }
                                      })();
                                    }}
                                  >
                                    <Trash2 size={14} strokeWidth={1.75} />
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          <div className="account-identity-add">
                            <input
                              className="settings-input"
                              type="email"
                              value={identityEmailDraft}
                              disabled={
                                identityBusy || !hasIntrayBridge()
                              }
                              placeholder="you@yourdomain.com"
                              aria-label="Linked email address"
                              onChange={(e) => {
                                setIdentityEmailDraft(e.target.value);
                                if (identityNote?.kind === "err") {
                                  setIdentityNote(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                (
                                  e.currentTarget
                                    .parentElement?.querySelector(
                                      "button.account-identity-add-btn",
                                    ) as HTMLButtonElement | null
                                )?.click();
                              }}
                            />
                            <button
                              type="button"
                              className="compose settings-add account-identity-add-btn"
                              disabled={
                                identityBusy ||
                                !hasIntrayBridge() ||
                                !identityEmailDraft.trim()
                              }
                              onClick={() => {
                                const email = identityEmailDraft.trim();
                                if (!email) return;
                                setIdentityBusy(true);
                                setIdentityNote(null);
                                void (async () => {
                                  try {
                                    const before = new Set(
                                      (selected.identities ?? []).map(
                                        (i) => i.id,
                                      ),
                                    );
                                    const dto =
                                      await bridgeAddAccountIdentity({
                                        accountId: selected.id,
                                        email,
                                      });
                                    const next = {
                                      ...selected,
                                      ...accountDtoToUi(dto),
                                    };
                                    onUpdateAccount?.(next);
                                    const added = next.identities?.find(
                                      (i) =>
                                        !before.has(i.id) &&
                                        i.email.toLowerCase() ===
                                          email.toLowerCase(),
                                    );
                                    setJustAddedIdentityId(
                                      added?.id ?? null,
                                    );
                                    setIdentityEmailDraft("");
                                    setIdentityNote({
                                      kind: "ok",
                                      text: `Added ${email}. It appears above and in From when you compose.`,
                                    });
                                  } catch (err) {
                                    setIdentityNote({
                                      kind: "err",
                                      text:
                                        err instanceof Error
                                          ? err.message
                                          : "Could not link address.",
                                    });
                                  } finally {
                                    setIdentityBusy(false);
                                  }
                                })();
                              }}
                            >
                              {identityBusy ? (
                                <RefreshCw
                                  size={14}
                                  strokeWidth={1.75}
                                  className="spin"
                                />
                              ) : (
                                <Plus size={14} strokeWidth={1.75} />
                              )}
                              {identityBusy ? "Adding…" : "Add"}
                            </button>
                          </div>
                          {identityNote ? (
                            <p
                              className={`account-identity-note ${identityNote.kind}`}
                              role="status"
                              aria-live="polite"
                            >
                              {identityNote.text}
                            </p>
                          ) : (
                            <p className="account-identity-note">
                              {(selected.identities?.length ?? 1) > 1
                                ? `${selected.identities!.length} addresses on this mailbox — pick any as From when composing.`
                                : "Add a custom domain or alias, then pick it as From when composing."}
                            </p>
                          )}
                        </div>
                      </Block>

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
                              if (onReconnectAccount) {
                                onReconnectAccount(selected);
                                return;
                              }
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
                  hint="Remote http(s) images can reveal that you opened a message."
                >
                  <Row
                    title="Download images"
                    hint="Off by default. You can still load images on a message from the header tools."
                  >
                    <Toggle
                      on={prefs.downloadRemoteImages}
                      onChange={(downloadRemoteImages) =>
                        patch({ downloadRemoteImages })
                      }
                    />
                  </Row>
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

            {tab === "testing" && (
              <>
                <Block
                  title="Demo inbox"
                  hint="Load sample mail to try layouts and flows without touching your synced inbox. Unload to return to your regular email."
                >
                  <Row
                    title="Sample data"
                    hint={
                      demoActive
                        ? canUnloadDemo
                          ? "Demo mail is showing — your accounts stay connected."
                          : "Demo mail is showing. Add an account to leave demo."
                        : "Your synced inboxes are showing."
                    }
                  >
                    <div className="settings-demo-actions">
                      <button
                        type="button"
                        className="settings-section-btn"
                        disabled={demoActive || !onLoadDemo}
                        onClick={() => onLoadDemo?.()}
                      >
                        <FlaskConical size={14} strokeWidth={1.75} />
                        Load demo
                      </button>
                      <button
                        type="button"
                        className="settings-section-btn"
                        disabled={!demoActive || !canUnloadDemo || !onUnloadDemo}
                        onClick={() => onUnloadDemo?.()}
                      >
                        <RotateCcw size={14} strokeWidth={1.75} />
                        Unload demo
                      </button>
                    </div>
                  </Row>
                </Block>
                <p className="settings-inline-note">
                  Unloading restores your connected accounts and synced mail. Demo
                  changes are local only and are discarded when you leave demo.
                </p>
              </>
            )}

            {tab === "about" && (
              <>
                <Block
                  title="Intray"
                  hint="Windows unified mail — local-first, no mail relay."
                >
                  <Row title="Version" hint="Installed package version">
                    <span className="settings-version-value">
                      {updateStatus.currentVersion || appVersion}
                    </span>
                  </Row>
                  <Row
                    title="Update channel"
                    hint="Public GitHub Releases for keithsimkin/intray-email-client"
                  >
                    <button
                      type="button"
                      className="settings-section-btn"
                      onClick={() => {
                        void bridgeOpenReleases();
                      }}
                    >
                      <ExternalLink size={14} strokeWidth={1.75} />
                      Releases
                    </button>
                  </Row>
                </Block>

                <Block
                  title="Updates"
                  hint="Installed builds check GitHub for a newer release, download it in the background, then restart to install."
                  action={
                    updateStatus.state === "ready" ? (
                      <button
                        type="button"
                        className="settings-section-btn"
                        disabled={updateBusy}
                        onClick={() => {
                          setUpdateBusy(true);
                          void bridgeInstallUpdate().finally(() =>
                            setUpdateBusy(false),
                          );
                        }}
                      >
                        <Download size={14} strokeWidth={1.75} />
                        Restart and install
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-section-btn"
                        disabled={
                          updateBusy ||
                          updateStatus.state === "checking" ||
                          updateStatus.state === "downloading" ||
                          updateStatus.state === "available" ||
                          updateStatus.state === "disabled"
                        }
                        onClick={() => {
                          setUpdateBusy(true);
                          void bridgeCheckForUpdates()
                            .then((status) => setUpdateStatus(status))
                            .finally(() => setUpdateBusy(false));
                        }}
                      >
                        <RefreshCw size={14} strokeWidth={1.75} />
                        Check for updates
                      </button>
                    )
                  }
                >
                  <p className="settings-inline-note">
                    {updateStatusCopy(updateStatus)}
                  </p>
                  {typeof updateStatus.downloadPercent === "number" &&
                    (updateStatus.state === "downloading" ||
                      updateStatus.state === "available") && (
                      <div
                        className="settings-update-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={updateStatus.downloadPercent}
                        aria-label="Update download progress"
                      >
                        <div
                          className="settings-update-progress-bar"
                          style={{
                            width: `${Math.max(2, updateStatus.downloadPercent)}%`,
                          }}
                        />
                      </div>
                    )}
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
