import type { ShortcutAction, ShortcutPackId } from "./shortcuts";

export type ThemeMode = "dark" | "light" | "system";
export type Density = "comfortable" | "compact" | "dense";
export type AccentId = "neutral" | "blue" | "teal" | "violet" | "amber";
export type LayoutId = "panels" | "wide" | "stack";
export type ReadingWidth = "narrow" | "medium" | "wide";
export type BadgeMode = "count" | "dot" | "important" | "off";
export type NotifyMode = "all" | "important" | "off";
export type AiBridgeId =
  | "openai"
  | "grok"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "claude-code"
  | "codex"
  | "cursor"
  | "opencode"
  | "none";

export type Preferences = {
  // Appearance
  theme: ThemeMode;
  density: Density;
  accent: AccentId;
  layout: LayoutId;
  readingWidth: ReadingWidth;
  fontScale: number;
  showAvatars: boolean;
  forceDarkHtml: boolean;
  reduceMotion: boolean;
  showPreviewLines: boolean;
  stickySubject: boolean;

  // Inbox
  shortcutPack: ShortcutPackId;
  /** Per-action key overrides on top of the active pack (e.g. archive → "E"). */
  shortcutOverrides: Partial<Record<ShortcutAction, string>>;
  unifiedInbox: boolean;
  importantSplit: boolean;
  conversationView: boolean;
  waitingForReplyDays: 2 | 3 | 5 | 7;
  showUnreadBadgeInList: boolean;
  markReadOnOpen: boolean;
  markReadOnScroll: boolean;
  hoverActions: boolean;

  // Notifications (WhatsApp-style master + per-type)
  /** Master switch for Windows / desktop toasts */
  notifyDesktop: boolean;
  notifyMode: NotifyMode;
  /** Show sender name in toasts */
  notifyShowSender: boolean;
  /** Show subject / preview snippet in toasts */
  notifyShowPreview: boolean;
  /** New mail toasts */
  notifyNewMail: boolean;
  /** Snooze wake reminders */
  notifySnooze: boolean;
  /** Open / read-receipt toasts for tracked sends */
  notifyOpens: boolean;
  /** Meeting / calendar reminders */
  notifyMeetings: boolean;
  /** Sync / send failure toasts */
  notifyErrors: boolean;
  /** Badge on the Windows taskbar icon */
  taskbarBadge: BadgeMode;
  trayBadge: BadgeMode;
  notifySound: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  launchToTray: boolean;
  /** Start Intray when Windows signs in */
  launchAtLogin: boolean;
  globalHotkey: boolean;

  // Compose
  undoSendSeconds: 5 | 10 | 20 | 0;
  defaultReplyAll: boolean;
  sendAndArchive: boolean;
  includeSignatureOnReply: boolean;
  includeSignatureOnForward: boolean;
  /** Fallback signature when an account has none set */
  signature: string;
  /** Per-account signatures keyed by account id */
  signaturesByAccount: Record<string, string>;
  spellcheck: boolean;
  /** Embed open pixel on send; show when / when recipients open */
  trackOpens: boolean;

  // AI (local bridges — no Intray AI subscription)
  aiBridge: AiBridgeId;
  aiBridgePath: string;
  aiModelHint: string;
  aiWriteEnabled: boolean;
  aiAskEnabled: boolean;
  aiSummarizeEnabled: boolean;
  aiTranslateEnabled: boolean;
  aiAutoLabel: boolean;
  aiCatchMeUp: boolean;
  aiConfirmDestructive: boolean;
  aiMemoryEnabled: boolean;
  mcpEnabled: boolean;
  mcpAutoLaunch: boolean;

  // Privacy
  /** When on, HTML mail loads remote http(s) images. Off blocks trackers. */
  downloadRemoteImages: boolean;
  analytics: boolean;
  crashReports: boolean;
  lockWithWindowsHello: boolean;
};

const KEY = "intray.preferences.v2";

export const defaultPreferences: Preferences = {
  theme: "dark",
  density: "comfortable",
  accent: "blue",
  layout: "panels",
  readingWidth: "medium",
  fontScale: 100,
  showAvatars: true,
  forceDarkHtml: true,
  reduceMotion: false,
  showPreviewLines: true,
  stickySubject: true,

  shortcutPack: "superhuman",
  shortcutOverrides: {},
  unifiedInbox: true,
  importantSplit: true,
  conversationView: true,
  waitingForReplyDays: 3,
  showUnreadBadgeInList: true,
  markReadOnOpen: true,
  markReadOnScroll: false,
  hoverActions: true,

  notifyDesktop: true,
  notifyMode: "important",
  notifyShowSender: true,
  notifyShowPreview: true,
  notifyNewMail: false,
  notifySnooze: true,
  notifyOpens: true,
  notifyMeetings: true,
  notifyErrors: true,
  taskbarBadge: "count",
  trayBadge: "count",
  notifySound: false,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  launchToTray: true,
  launchAtLogin: true,
  globalHotkey: true,

  undoSendSeconds: 5,
  defaultReplyAll: false,
  sendAndArchive: false,
  includeSignatureOnReply: true,
  includeSignatureOnForward: false,
  signature:
    '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;color:#8a8f98;">Sent with <strong style="color:#141416;">Intray</strong></div>',
  signaturesByAccount: {
    work: `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:420px;">
  <tr>
    <td style="padding:0 14px 0 0;vertical-align:middle;">
      <div style="width:42px;height:42px;border-radius:11px;background:#5b8def;color:#ffffff;font-size:13px;font-weight:700;line-height:42px;text-align:center;">PP</div>
    </td>
    <td style="vertical-align:middle;border-left:2px solid #5b8def;padding:2px 0 2px 14px;">
      <div style="font-size:14px;font-weight:650;color:#141416;letter-spacing:-0.02em;">Pranav Patel</div>
      <div style="margin-top:3px;font-size:12px;"><a href="mailto:pranav@intray.app" style="color:#5b8def;text-decoration:none;">pranav@intray.app</a></div>
      <div style="margin-top:4px;font-size:11px;color:#8a8f98;">Product · Intray</div>
      <div style="margin-top:8px;font-size:11px;color:#8a8f98;">Sent with <span style="color:#141416;font-weight:650;">Intray</span></div>
    </td>
  </tr>
</table>`,
    gmail: `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:420px;">
  <tr>
    <td style="padding:0 14px 0 0;vertical-align:middle;">
      <div style="width:42px;height:42px;border-radius:11px;background:#ea4335;color:#ffffff;font-size:13px;font-weight:700;line-height:42px;text-align:center;">G</div>
    </td>
    <td style="vertical-align:middle;border-left:2px solid #ea4335;padding:2px 0 2px 14px;">
      <div style="font-size:14px;font-weight:650;color:#141416;">Pranav</div>
      <div style="margin-top:3px;font-size:12px;"><a href="mailto:pranav@gmail.com" style="color:#ea4335;text-decoration:none;">pranav@gmail.com</a></div>
      <div style="margin-top:8px;font-size:11px;color:#8a8f98;">Sent with <span style="color:#141416;font-weight:650;">Intray</span></div>
    </td>
  </tr>
</table>`,
    outlook: `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:420px;">
  <tr>
    <td style="padding:0 14px 0 0;vertical-align:middle;">
      <div style="width:42px;height:42px;border-radius:11px;background:#0a7cff;color:#ffffff;font-size:13px;font-weight:700;line-height:42px;text-align:center;">O</div>
    </td>
    <td style="vertical-align:middle;border-left:2px solid #0a7cff;padding:2px 0 2px 14px;">
      <div style="font-size:14px;font-weight:650;color:#141416;">Pranav Patel</div>
      <div style="margin-top:3px;font-size:12px;"><a href="mailto:pranav@outlook.com" style="color:#0a7cff;text-decoration:none;">pranav@outlook.com</a></div>
      <div style="margin-top:8px;font-size:11px;color:#8a8f98;">Sent with <span style="color:#141416;font-weight:650;">Intray</span></div>
    </td>
  </tr>
</table>`,
  },
  spellcheck: true,
  trackOpens: false,

  aiBridge: "openai",
  aiBridgePath: "",
  aiModelHint: "",
  aiWriteEnabled: true,
  aiAskEnabled: true,
  aiSummarizeEnabled: true,
  aiTranslateEnabled: true,
  aiAutoLabel: true,
  aiCatchMeUp: true,
  aiConfirmDestructive: true,
  aiMemoryEnabled: true,
  mcpEnabled: true,
  mcpAutoLaunch: true,

  downloadRemoteImages: false,
  analytics: false,
  crashReports: false,
  lockWithWindowsHello: false,
};

export const accentColors: Record<AccentId, string> = {
  neutral: "#8a8f98",
  blue: "#5b8def",
  teal: "#2dd4bf",
  violet: "#8b7cf6",
  amber: "#f5a524",
};

export type AiBridgeKind = "api" | "cli" | "ollama" | "off";

export type AiBridgeMeta = {
  name: string;
  blurb: string;
  status: "detected" | "optional" | "off";
  needsKey?: boolean;
  kind: AiBridgeKind;
  /** CLI binary the path field is about. */
  binary?: string;
  pathPlaceholder?: string;
};

export const aiBridgeMeta: Record<AiBridgeId, AiBridgeMeta> = {
  openai: {
    name: "OpenAI",
    blurb: "GPT models via your OpenAI API key. Keys stay on this device.",
    status: "optional",
    needsKey: true,
    kind: "api",
  },
  grok: {
    name: "Grok",
    blurb:
      "Uses the Grok CLI on this PC (grok login). Same sign-in path as T3 — no API key required.",
    status: "optional",
    kind: "cli",
    binary: "grok",
    pathPlaceholder: String.raw`e.g. C:\Users\…\.grok\bin\grok.exe`,
  },
  anthropic: {
    name: "Anthropic",
    blurb: "Claude models via your Anthropic API key.",
    status: "optional",
    needsKey: true,
    kind: "api",
  },
  gemini: {
    name: "Gemini",
    blurb: "Google Gemini via an AI Studio key.",
    status: "optional",
    needsKey: true,
    kind: "api",
  },
  ollama: {
    name: "Ollama",
    blurb: "Fully local models via Ollama on localhost.",
    status: "detected",
    kind: "ollama",
  },
  "claude-code": {
    name: "Claude Code",
    blurb: "Use the Claude Code CLI already on this PC.",
    status: "optional",
    kind: "cli",
    binary: "claude",
    pathPlaceholder: String.raw`e.g. C:\Users\…\.local\bin\claude.exe`,
  },
  codex: {
    name: "Codex",
    blurb: "OpenAI Codex CLI — keys never leave your machine.",
    status: "optional",
    kind: "cli",
    binary: "codex",
    pathPlaceholder: String.raw`e.g. C:\Users\…\codex.exe`,
  },
  cursor: {
    name: "Cursor",
    blurb:
      "Uses the Cursor agent CLI (cursor-agent). Detects PATH and %LOCALAPPDATA%\\cursor-agent.",
    status: "optional",
    kind: "cli",
    binary: "cursor-agent",
    pathPlaceholder: String.raw`e.g. C:\Users\…\cursor-agent\cursor-agent.cmd`,
  },
  opencode: {
    name: "OpenCode",
    blurb: "Route AI actions through a local OpenCode install.",
    status: "optional",
    kind: "cli",
    binary: "opencode",
    pathPlaceholder: String.raw`e.g. C:\Users\…\opencode.exe`,
  },
  none: {
    name: "Off",
    blurb: "Turn off in-app AI until you pick a provider.",
    status: "off",
    kind: "off",
  },
};

export function loadPreferences(): Preferences {
  try {
    const raw =
      localStorage.getItem(KEY) ?? localStorage.getItem("intray.preferences.v1");
    if (!raw) return { ...defaultPreferences };
    const saved = JSON.parse(raw) as Partial<Preferences> & {
      aiBridge?: string;
      blockRemoteImages?: boolean;
      remoteImages?: string;
      remoteImagePolicy?: string;
      downloadRemoteImages?: boolean;
      trustedImageSenders?: unknown;
    };
    const parsed = {
      ...defaultPreferences,
      ...saved,
      signaturesByAccount: {
        ...defaultPreferences.signaturesByAccount,
        ...(saved.signaturesByAccount ?? {}),
      },
      shortcutOverrides: {
        ...defaultPreferences.shortcutOverrides,
        ...(saved.shortcutOverrides ?? {}),
      },
    } as Preferences & {
      aiBridge?: string;
      layout?: string;
      blockRemoteImages?: boolean;
      remoteImages?: string;
      remoteImagePolicy?: string;
      trustedImageSenders?: unknown;
    };
    // CASA was removed — migrate saved preference to Cursor.
    if ((parsed.aiBridge as string) === "casa") {
      parsed.aiBridge = "cursor";
    }
    // Spark layout became full-screen stack reading.
    if ((parsed.layout as string) === "spark") {
      parsed.layout = "stack";
    }
    const packs = new Set(["gmail", "superhuman", "outlook", "custom"]);
    if (!packs.has(parsed.shortcutPack as string)) {
      parsed.shortcutPack = defaultPreferences.shortcutPack;
    }
    // Migrate legacy image keys → simple on/off.
    if (typeof saved.downloadRemoteImages !== "boolean") {
      if (saved.remoteImagePolicy === "always" || saved.remoteImages === "always") {
        parsed.downloadRemoteImages = true;
      } else if (
        saved.remoteImagePolicy === "never" ||
        saved.remoteImages === "never" ||
        saved.blockRemoteImages === true
      ) {
        parsed.downloadRemoteImages = false;
      } else if (
        saved.remoteImagePolicy === "trusted" ||
        saved.remoteImages === "trusted" ||
        saved.blockRemoteImages === false
      ) {
        // Old "trusted" / unblocked → on (closest match to prior intent).
        parsed.downloadRemoteImages = true;
      } else {
        parsed.downloadRemoteImages = defaultPreferences.downloadRemoteImages;
      }
    }
    delete parsed.blockRemoteImages;
    delete parsed.remoteImages;
    delete parsed.remoteImagePolicy;
    delete parsed.trustedImageSenders;
    if (typeof parsed.downloadRemoteImages !== "boolean") {
      parsed.downloadRemoteImages = defaultPreferences.downloadRemoteImages;
    }
    // Notifications shifted from inbox arrivals → snooze / read reminders.
    if (
      (saved as { notifySnooze?: unknown }).notifySnooze === undefined &&
      (saved as { notifyOpens?: unknown }).notifyOpens === undefined
    ) {
      parsed.notifyNewMail = false;
      parsed.notifySnooze = true;
      parsed.notifyOpens = true;
    }
    return {
      ...defaultPreferences,
      ...parsed,
      downloadRemoteImages: parsed.downloadRemoteImages,
    };
  } catch {
    return { ...defaultPreferences };
  }
}

export function savePreferences(prefs: Preferences): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

export function resolvedTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return mode;
}
