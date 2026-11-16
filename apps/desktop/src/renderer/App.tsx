import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Archive,
  ArrowLeft,
  Bell,
  Bot,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Eraser,
  FileText,
  Folder,
  Forward,
  Inbox,
  Calendar,
  ImageOff,
  Languages,
  Layers,
  Link2,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  MinusSquare,
  MoreHorizontal,
  Paperclip,
  Plug,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  AlertCircle,
  ShieldAlert,
  UserMinus,
  X,
} from "lucide-react";
import { AddAccountModal } from "./AddAccountModal";
import {
  AlertDialog,
  nextAlertId,
  type AlertRequest,
} from "./AlertDialog";
import { PluginInviteModal } from "./PluginInviteModal";
import { ReauthModal } from "./ReauthModal";
import { FloatingAsk } from "./FloatingAsk";
import { IntrayBrandLockup } from "./IntrayBrand";
import { Onboarding } from "./Onboarding";
import {
  completeOnboarding,
  isOnboardingComplete,
} from "./onboardingStorage";
import { SearchBar } from "./SearchBar";
import type { Contact } from "./contacts";
import {
  aiFindUnsubscribe,
  looksLikeNewsletter,
  openUnsubscribeTarget,
} from "./newsletter";
import {
  messageMatchesSearch,
  serializeSearch,
  type SearchToken,
} from "./searchQuery";
import {
  UNIFIED_ID,
  accounts as seedAccounts,
  customFolders as seedCustomFolders,
  folders,
  labels as seedLabels,
  meeting,
  messages as seedMessages,
  type Account,
  type Label,
  type Message,
  type OpenTracking,
  type Recipient,
  type ThreadMessage,
} from "./data/mock";
import {
  MentionTextarea,
  RecipientChips,
} from "./MentionTextarea";
import { AppSelect } from "./AppSelect";
import { useUndoStack } from "./useUndoStack";
import {
  looksLikeHtml,
  sanitizeSignatureHtml,
} from "./signatures";
import {
  aiCatchMeUp,
  aiLabelMessages,
  aiSuggestReplies,
  aiSummarizeMessage,
  aiTranslateMessage,
  aiWriteReply,
} from "./aiClient";
import {
  registerTrackedSend,
  trackingSummary,
} from "./openTracking";
import {
  accentColors,
  aiBridgeMeta,
  allowRemoteImagesForSender,
  loadPreferences,
  resolvedTheme,
  savePreferences,
  type Preferences,
} from "./preferences";
import {
  listShortcuts,
  packMeta,
  resolveShortcut,
  type ShortcutAction,
  type ShortcutPackId,
} from "./shortcuts";
import { SettingsModal } from "./SettingsModal";
import {
  accountDtoToUi,
  bridgeAccounts,
  bridgeCancelSend,
  bridgeCreateLabel,
  bridgeGetMail,
  bridgeHasRealAccounts,
  bridgeListLabels,
  bridgeListMail,
  bridgeMutateMail,
  bridgeOnNotifyOpen,
  bridgeOnSendFlushed,
  bridgeOnSyncProgress,
  bridgeOnMailUpdated,
  bridgeOnUnsnoozed,
  bridgeSendLater,
  bridgeSendMail,
  bridgeSetChromeTheme,
  bridgeSync,
  isAuthFailureMessage,
  messageDtoToUi,
} from "./mailApi";
import { notifyMeeting, syncTaskbarBadge } from "./notify";
import type { SyncStatus } from "../shared/types";

type MailAction =
  | "reply"
  | "reply-all"
  | "forward"
  | "toggle-read"
  | "star"
  | "snooze"
  | "archive"
  | "trash"
  | "spam"
  | "not-spam"
  | "delete-forever"
  | "move"
  | "label"
  | "auto-label"
  | "clear-label";

type ReplyMode = "reply" | "reply-all";

type Filter = "important" | "other" | "all";

const folderIcons = {
  inbox: Inbox,
  file: FileText,
  send: Send,
  archive: Archive,
  alert: AlertCircle,
  trash: Trash2,
  clock: Clock,
} as const;

function accountFor(id: string, list: Account[] = seedAccounts): Account {
  return list.find((a) => a.id === id) ?? list[0];
}

/** Plain-text quote used when Forward opens compose. */
function forwardDraft(message: Message): { subject: string; body: string } {
  const subject = /^fwd:/i.test(message.subject.trim())
    ? message.subject
    : `Fwd: ${message.subject}`;
  const latest = message.thread[message.thread.length - 1];
  const plain = latest?.body?.join("\n\n")?.trim() ?? "";
  const fromHtml = latest?.bodyHtml
    ? latest.bodyHtml
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const content = plain || fromHtml || message.preview || "";
  const body = [
    "",
    "",
    "---------- Forwarded message ----------",
    `From: ${message.from} <${message.email}>`,
    `Date: ${message.time}`,
    `Subject: ${message.subject}`,
    "",
    content,
  ].join("\n");
  return { subject, body };
}

/** Actions that remove a thread from the current folder view. */
function leavesCurrentFolder(action: MailAction): boolean {
  return (
    action === "archive" ||
    action === "trash" ||
    action === "spam" ||
    action === "not-spam" ||
    action === "delete-forever" ||
    action === "snooze" ||
    action === "move"
  );
}

const seedOwnEmails = new Set(
  seedAccounts
    .filter((a) => a.id !== UNIFIED_ID)
    .map((a) => a.email.toLowerCase()),
);

function ownEmailSet(accounts: Account[]): Set<string> {
  const set = new Set<string>();
  for (const a of accounts) {
    if (a.id === UNIFIED_ID) continue;
    const email = a.email?.trim().toLowerCase();
    if (email) set.add(email);
  }
  // Keep seed addresses so mock / offline still marks "You" correctly.
  for (const email of seedOwnEmails) set.add(email);
  return set;
}

function isOwnRecipient(r: Recipient, own: Set<string> = seedOwnEmails) {
  return own.has(r.email.toLowerCase());
}

function dedupeRecipients(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of list) {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: r.name || key.split("@")[0], email: r.email.trim() });
  }
  return out;
}

/**
 * Standard mail clients:
 * - Reply: To = sender (or original To when replying to your own sent mail). No Cc.
 * - Reply all: To = sender + other To recipients; Cc = original Cc.
 *   Always exclude your own addresses. Never resurrect Bcc.
 */
function buildReplyRecipients(
  message: Message,
  mode: ReplyMode,
  own: Set<string>,
): { to: Recipient[]; cc: Recipient[] } {
  const latest = message.thread[message.thread.length - 1];
  const sender: Recipient = {
    name: latest?.from ?? message.from,
    email: (latest?.email ?? message.email).trim(),
  };
  const isOwn = (email: string) => own.has(email.trim().toLowerCase());
  const fromSelf = isOwn(sender.email);
  const originalTo = (latest?.to ?? []).filter((r) => r.email.trim());
  const originalCc = (latest?.cc ?? []).filter((r) => r.email.trim());

  if (mode === "reply") {
    if (fromSelf) {
      const targets = originalTo.filter((r) => !isOwn(r.email));
      return { to: dedupeRecipients(targets.slice(0, 1)), cc: [] };
    }
    return { to: dedupeRecipients([sender]), cc: [] };
  }

  if (fromSelf) {
    return {
      to: dedupeRecipients(originalTo.filter((r) => !isOwn(r.email))),
      cc: dedupeRecipients(originalCc.filter((r) => !isOwn(r.email))),
    };
  }

  const to = dedupeRecipients([
    sender,
    ...originalTo.filter(
      (r) =>
        !isOwn(r.email) &&
        r.email.trim().toLowerCase() !== sender.email.toLowerCase(),
    ),
  ]);
  const toKeys = new Set(to.map((r) => r.email.toLowerCase()));
  const cc = dedupeRecipients(
    originalCc.filter(
      (r) => !isOwn(r.email) && !toKeys.has(r.email.trim().toLowerCase()),
    ),
  );
  return { to, cc };
}

function listBadgeCounts(m: Message) {
  const threadAttachments = m.thread.reduce((n, t) => {
    if (t.attachments?.length) return n + t.attachments.length;
    if (t.attachment) return n + 1;
    return n;
  }, 0);
  const attachmentCount =
    m.attachmentCount ??
    (m.hasAttachment ? Math.max(1, threadAttachments) : threadAttachments);
  const linkCount = m.linkCount ?? 0;
  const mediaCount =
    m.mediaCount ?? (m.meeting || m.thread.some((t) => t.meeting) ? 1 : 0);
  return { attachmentCount, linkCount, mediaCount };
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractMessageLinks(m: Message): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
  const seen = new Set<string>();

  const push = (href: string, label?: string) => {
    const clean = href.trim();
    if (!clean || clean === "#" || seen.has(clean)) return;
    if (/^javascript:/i.test(clean)) return;
    seen.add(clean);
    const fallback = clean.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    const text = (label && stripHtml(label)) || fallback;
    out.push({
      href: clean,
      label: text.length > 42 ? `${text.slice(0, 40)}…` : text,
    });
  };

  if (m.meeting?.url) push(m.meeting.url, m.meeting.title);
  for (const t of m.thread) {
    if (t.meeting?.url) push(t.meeting.url, t.meeting.title);
    const html = t.bodyHtml ?? "";
    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRe.exec(html))) {
      push(match[1], match[2]);
    }
    for (const line of t.body ?? []) {
      const urlRe = /https?:\/\/[^\s<>"']+/gi;
      let um: RegExpExecArray | null;
      while ((um = urlRe.exec(line))) {
        push(um[0].replace(/[),.;]+$/, ""));
      }
    }
  }

  return out.slice(0, 6);
}

function PersonAvatar({
  name,
  initials,
  color,
  avatarUrl,
  className = "avatar",
}: {
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        className={`${className} photo`}
        src={avatarUrl}
        alt=""
        title={name}
        draggable={false}
      />
    );
  }
  return (
    <div className={className} style={{ background: color }} aria-hidden>
      {initials}
    </div>
  );
}

/** WhatsApp-style ticks: gray = delivered, blue = opened/read */
function DeliveryTicks({
  tracking,
  size = 14,
}: {
  tracking: OpenTracking;
  size?: number;
}) {
  const read = tracking.opens.length > 0;
  const label = read
    ? tracking.openedAt
      ? `Opened · ${tracking.openedAt}`
      : "Opened"
    : "Delivered";
  return (
    <span
      className={`delivery-ticks${read ? " read" : " delivered"}`}
      title={label}
      aria-label={label}
    >
      <CheckCheck size={size} strokeWidth={2.25} />
    </span>
  );
}

function threadAttachments(tm: {
  attachment?: { name: string; size: string };
  attachments?: { name: string; size: string }[];
}) {
  if (tm.attachments?.length) return tm.attachments;
  if (tm.attachment) return [tm.attachment];
  return [];
}

/** True when you're only on Cc (not on To) for the newest message. */
function isCcOnly(message: Message, own: Set<string> = seedOwnEmails) {
  const tm = message.thread[message.thread.length - 1];
  if (!tm?.cc?.some((r) => isOwnRecipient(r, own))) return false;
  if (tm.to?.some((r) => isOwnRecipient(r, own))) return false;
  return true;
}

function RecipientName({
  recipient,
  onCompose,
}: {
  recipient: Recipient;
  onCompose: (r: Recipient) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const you = isOwnRecipient(recipient);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="recipient-wrap" ref={ref}>
      <button
        type="button"
        className={`recipient${you ? " you" : ""}${open ? " open" : ""}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {you ? "You" : recipient.name}
      </button>
      {open && (
        <div className="recipient-pop" role="dialog">
          {you ? (
            <span className="recipient-email static">{recipient.email}</span>
          ) : (
            <button
              type="button"
              className="recipient-email"
              onClick={(e) => {
                e.stopPropagation();
                onCompose(recipient);
                setOpen(false);
              }}
            >
              {recipient.email}
            </button>
          )}
          {!you && (
            <span className="recipient-pop-hint">Click email to compose</span>
          )}
        </div>
      )}
    </span>
  );
}

function formatRecipients(
  list: Recipient[],
  onCompose: (r: Recipient) => void,
) {
  return list.map((r, i) => (
    <span key={r.email} className="recipient-item">
      {i > 0 && <span className="recipient-sep">, </span>}
      <RecipientName recipient={r} onCompose={onCompose} />
    </span>
  ));
}

const LABEL_COLORS = [
  "#ff5c5c",
  "#f5a524",
  "#f5d042",
  "#3dd68c",
  "#5b8def",
  "#8b7cf6",
  "#46c5e8",
  "#ea4335",
];

function slugLabelId(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `label-${Date.now().toString(36)}`;
}

const CUSTOM_FOLDERS_KEY = "intray.custom-folders.v1";

function loadCustomFolders(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_FOLDERS_KEY);
    if (!raw) return [...seedCustomFolders];
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === "string")
    ) {
      return parsed.map((name) => name.trim()).filter(Boolean);
    }
  } catch {
    /* keep seed */
  }
  return [...seedCustomFolders];
}

function saveCustomFolders(names: string[]) {
  localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(names));
}

type AppNotification = {
  id: string;
  kind: "mail" | "meeting" | "ai" | "sync";
  title: string;
  body: string;
  time: string;
  unread?: boolean;
  messageId?: string;
};

function NotificationsMenu({
  items,
  onClose,
  onOpen,
  onMarkAllRead,
}: {
  items: AppNotification[];
  onClose: () => void;
  onOpen: (n: AppNotification) => void;
  onMarkAllRead: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => n.unread).length;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="notif-menu" ref={ref} role="dialog" aria-label="Notifications">
      <div className="notif-menu-head">
        <div>
          <strong>Notifications</strong>
          <span>
            {unread > 0 ? `${unread} new` : "You're caught up"}
          </span>
        </div>
        {unread > 0 && (
          <button type="button" className="pill-btn" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>
      <div className="notif-menu-list">
        {items.length === 0 ? (
          <div className="notif-empty">No notifications yet</div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif-item${n.unread ? " unread" : ""}`}
              onClick={() => onOpen(n)}
            >
              <span className={`notif-kind ${n.kind}`} aria-hidden>
                {n.kind === "mail" ? (
                  <Mail size={14} strokeWidth={1.75} />
                ) : n.kind === "meeting" ? (
                  <Clock size={14} strokeWidth={1.75} />
                ) : n.kind === "ai" ? (
                  <Sparkles size={14} strokeWidth={1.75} />
                ) : (
                  <RefreshCw size={14} strokeWidth={1.75} />
                )}
              </span>
              <span className="notif-copy">
                <strong>{n.title}</strong>
                <span>{n.body}</span>
              </span>
              <span className="notif-meta">
                <span className="notif-time">{n.time}</span>
                {n.unread && <span className="notif-dot" aria-hidden />}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TitleBar({
  onAsk,
  askOpen,
  searchRef,
  showAi,
  searchTokens,
  onSearchTokens,
  labels,
  notifications,
  onOpenNotification,
  onMarkNotificationsRead,
}: {
  onAsk: () => void;
  askOpen: boolean;
  searchRef?: RefObject<HTMLInputElement | null>;
  showAi: boolean;
  searchTokens: SearchToken[];
  onSearchTokens: (tokens: SearchToken[]) => void;
  labels: Label[];
  notifications: AppNotification[];
  onOpenNotification: (n: AppNotification) => void;
  onMarkNotificationsRead: () => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifications.filter((n) => n.unread).length;

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <IntrayBrandLockup size={16} />
      </div>
      <SearchBar
        inputRef={searchRef}
        tokens={searchTokens}
        onTokensChange={onSearchTokens}
        labels={labels}
      />
      <div className="titlebar-right">
        {showAi && (
          <button
            type="button"
            className={`icon-btn${askOpen ? " active" : ""}`}
            data-ask-trigger="true"
            aria-label="Ask AI across inbox"
            title="Ask AI · all mail"
            onClick={() => {
              setNotifOpen(false);
              onAsk();
            }}
          >
            <Bot size={15} strokeWidth={1.75} />
          </button>
        )}
        <div className="notif-anchor">
          <button
            type="button"
            className={`icon-btn${notifOpen ? " active" : ""}`}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            title="Notifications"
            onClick={() => setNotifOpen((v) => !v)}
          >
            <Bell size={15} strokeWidth={1.75} />
            {unread > 0 && (
              <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>
            )}
          </button>
          {notifOpen && (
            <NotificationsMenu
              items={notifications}
              onClose={() => setNotifOpen(false)}
              onMarkAllRead={() => {
                onMarkNotificationsRead();
              }}
              onOpen={(n) => {
                setNotifOpen(false);
                onOpenNotification(n);
              }}
            />
          )}
        </div>
      </div>
    </header>
  );
}

function AccountRail({
  accounts,
  activeId,
  onSelect,
  onAdd,
  onSettings,
  onPlugins,
}: {
  accounts: Account[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onSettings: () => void;
  onPlugins: () => void;
}) {
  return (
    <aside className="rail">
      <div className="rail-section">
        <span className="rail-label">Mail</span>
        {accounts.map((a) => {
          const loggedOut = Boolean(a.loggedOut);
          const title =
            a.id === UNIFIED_ID
              ? "Unified Inbox"
              : loggedOut
                ? `${a.email} — logged out`
                : a.email;
          return (
            <button
              key={a.id}
              type="button"
              className={`account${activeId === a.id ? " active" : ""}${loggedOut ? " logged-out" : ""}`}
              onClick={() => onSelect(a.id)}
              title={title}
              aria-label={title}
            >
              {a.id !== UNIFIED_ID && a.avatarUrl ? (
                <img
                  className="account-face photo"
                  src={a.avatarUrl}
                  alt=""
                  draggable={false}
                />
              ) : (
                <span className="account-face" style={{ background: a.color }}>
                  {a.id === UNIFIED_ID ? (
                    <Layers size={14} strokeWidth={2.25} color="#0a0a0b" />
                  ) : (
                    a.label.slice(0, 2)
                  )}
                </span>
              )}
              {loggedOut ? (
                <span className="account-status logged-out" aria-hidden>
                  <LogOut size={9} strokeWidth={2.5} />
                </span>
              ) : (
                a.unread > 0 && (
                  <span
                    className="badge"
                    style={
                      a.id !== UNIFIED_ID
                        ? { background: a.color }
                        : undefined
                    }
                  >
                    {a.unread}
                  </span>
                )
              )}
            </button>
          );
        })}
        <button
          type="button"
          className="rail-btn rail-add"
          aria-label="Add account"
          title="Add account"
          onClick={onAdd}
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="rail-spacer" />
      <div className="rail-section">
        <button
          type="button"
          className="rail-btn rail-soon"
          aria-label="Plugins — tester invite"
          title="Plugins"
          onClick={onPlugins}
        >
          <Plug size={16} strokeWidth={1.75} />
          <span className="rail-soon-badge">Soon</span>
        </button>
        <span className="rail-label">Apps</span>
        <button
          type="button"
          className="rail-btn"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}

const SIDEBAR_MAX = 360;
/** Icon-only rail — only width allowed below the expanded floor. */
const SIDEBAR_COMPACT_WIDTH = 56;
/** Narrowest width where folder/label text still fits. */
const SIDEBAR_EXPANDED_MIN = 210;

/** Binary snap: compact rail, or expanded (≥ labels-fit width). No in-between. */
function snapSidebarWidth(width: number) {
  if (width < SIDEBAR_EXPANDED_MIN) return SIDEBAR_COMPACT_WIDTH;
  return Math.min(Math.max(width, SIDEBAR_EXPANDED_MIN), SIDEBAR_MAX);
}

function Sidebar({
  account,
  activeFolder,
  inboxCount,
  folderCounts,
  customFolders,
  labels,
  syncLabel,
  compact = false,
  onFolder,
  onCompose,
  onEmptyFolder,
  onCreateFolder,
  onCreateLabel,
}: {
  account: Account;
  activeFolder: string;
  inboxCount: number;
  folderCounts: Record<string, number>;
  customFolders: string[];
  labels: Label[];
  syncLabel: string;
  compact?: boolean;
  onFolder: (id: string) => void;
  onCompose: () => void;
  onEmptyFolder?: (folderId: "junk" | "trash") => void;
  onCreateFolder: (name: string) => boolean;
  onCreateLabel: (name: string, color: string) => void;
}) {
  const unified = account.id === UNIFIED_ID;
  const [creating, setCreating] = useState<"folder" | "label" | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[4]);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (creating === "folder") folderInputRef.current?.focus();
    if (creating === "label") labelInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (compact) {
      setCreating(null);
      setNewFolderName("");
      setNewLabelName("");
    }
  }, [compact]);

  const startCreate = (kind: "folder" | "label") => {
    if (compact) return;
    setCreating(kind);
    if (kind === "folder") {
      setNewFolderName("");
    } else {
      setNewLabelName("");
      setNewLabelColor(LABEL_COLORS[4]);
    }
  };

  const cancelCreate = () => {
    setCreating(null);
    setNewFolderName("");
    setNewLabelName("");
  };

  const submitFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (onCreateFolder(name)) {
      cancelCreate();
    }
  };

  const submitLabel = () => {
    const name = newLabelName.trim();
    if (!name) return;
    onCreateLabel(name, newLabelColor);
    cancelCreate();
  };

  return (
    <aside className={`sidebar${compact ? " compact" : ""}`}>
      <div className="profile" title={account.name}>
        {unified ? (
          <div className="profile-avatar">
            <Layers size={14} strokeWidth={2.25} />
          </div>
        ) : account.avatarUrl ? (
          <img
            className="profile-avatar photo"
            src={account.avatarUrl}
            alt=""
            draggable={false}
          />
        ) : (
          <div
            className="profile-avatar"
            style={{ background: account.color, color: "#0a0a0b" }}
          >
            {account.label}
          </div>
        )}
        <div className="profile-copy">
          <div className="profile-name">{account.name}</div>
          <div className="profile-email">{account.email}</div>
        </div>
      </div>

      <button
        type="button"
        className="compose"
        onClick={onCompose}
        title="Compose (Ctrl+N)"
        aria-label="Compose"
      >
        <Plus size={15} strokeWidth={2.25} />
        <span className="compose-label">Compose</span>
        <kbd>Ctrl+N</kbd>
      </button>

      <div className="nav-section">
        {folders.map((f) => {
          const Icon = folderIcons[f.icon];
          const label = f.id === "inbox" && unified ? "Unified Inbox" : f.name;
          const count =
            f.id === "inbox"
              ? inboxCount
              : (folderCounts[f.id] ?? f.count ?? 0);
          return (
            <button
              key={f.id}
              type="button"
              className={`nav-item${activeFolder === f.id ? " active" : ""}`}
              onClick={() => onFolder(f.id)}
              title={count > 0 ? `${label} (${count})` : label}
              aria-label={count > 0 ? `${label}, ${count}` : label}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span className="nav-label">{label}</span>
              {count > 0 && <span className="count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div>
        <div className="section-label">
          <span className="section-label-text">Folders</span>
          <button
            type="button"
            className="section-add"
            aria-label="New folder"
            title="New folder"
            disabled={compact}
            onClick={() =>
              creating === "folder" ? cancelCreate() : startCreate("folder")
            }
          >
            <Plus size={12} strokeWidth={2} />
          </button>
        </div>
        {creating === "folder" && !compact && (
          <div className="sidebar-create">
            <input
              ref={folderInputRef}
              className="sidebar-create-input"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitFolder();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
            />
            <div className="sidebar-create-actions">
              <button
                type="button"
                className="sidebar-create-btn ghost"
                onClick={cancelCreate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sidebar-create-btn"
                disabled={!newFolderName.trim()}
                onClick={submitFolder}
              >
                Create
              </button>
            </div>
          </div>
        )}
        <div className="nav-section">
          {customFolders.map((name) => (
            <button
              key={name}
              type="button"
              className={`nav-item${activeFolder === name ? " active" : ""}`}
              onClick={() => onFolder(name)}
              title={name}
              aria-label={name}
            >
              <Folder size={15} strokeWidth={1.75} />
              <span className="nav-label">{name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="section-label">
          <span className="section-label-text">Labels</span>
          <button
            type="button"
            className="section-add"
            aria-label="New label"
            title="New label"
            disabled={compact}
            onClick={() =>
              creating === "label" ? cancelCreate() : startCreate("label")
            }
          >
            <Plus size={12} strokeWidth={2} />
          </button>
        </div>
        {creating === "label" && !compact && (
          <div className="sidebar-create">
            <input
              ref={labelInputRef}
              className="sidebar-create-input"
              placeholder="Label name"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitLabel();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
            />
            <div className="ctx-new-label-colors">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ctx-color-swatch${newLabelColor === c ? " active" : ""}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => setNewLabelColor(c)}
                />
              ))}
            </div>
            <div className="sidebar-create-actions">
              <button
                type="button"
                className="sidebar-create-btn ghost"
                onClick={cancelCreate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sidebar-create-btn"
                disabled={!newLabelName.trim()}
                onClick={submitLabel}
              >
                Create
              </button>
            </div>
          </div>
        )}
        <div className="nav-section">
          {labels.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`nav-item${activeFolder === `label:${l.id}` ? " active" : ""}`}
              onClick={() => onFolder(`label:${l.id}`)}
              title={l.name}
              aria-label={l.name}
            >
              <span className="label-dot" style={{ color: l.color }} />
              <span className="nav-label">{l.name}</span>
            </button>
          ))}
        </div>
      </div>

      {(activeFolder === "junk" || activeFolder === "trash") &&
        onEmptyFolder &&
        (folderCounts[activeFolder] ?? 0) > 0 && (
          <div className="folder-toolbar">
            <button
              type="button"
              className="alert-btn ghost"
              title={activeFolder === "junk" ? "Empty Junk" : "Empty Trash"}
              aria-label={
                activeFolder === "junk" ? "Empty Junk" : "Empty Trash"
              }
              onClick={() =>
                onEmptyFolder(activeFolder === "junk" ? "junk" : "trash")
              }
            >
              <Eraser size={13} strokeWidth={1.75} />
              <span className="nav-label">
                {activeFolder === "junk" ? "Empty Junk" : "Empty Trash"}
              </span>
            </button>
          </div>
        )}

      <div className="sidebar-footer">
        <span className="sync-pill" title={syncLabel}>
          <span className="sync-dot" />
          <span className="sync-label">{syncLabel}</span>
        </span>
      </div>
    </aside>
  );
}

type MenuState = {
  messageId: string;
  x: number;
  y: number;
};

function MessageActionMenu({
  message,
  x,
  y,
  labels,
  customFolders,
  onAction,
  onClose,
  onCreateLabel,
  onCreateFolder,
  initialPanel,
  showAi = false,
}: {
  message: Message;
  x: number;
  y: number;
  labels: Label[];
  customFolders: string[];
  onAction: (action: MailAction, detail?: string) => void;
  onClose: () => void;
  onCreateLabel: (name: string, color: string) => void;
  onCreateFolder?: (name: string) => boolean;
  /** Open a submenu immediately (toolbar Label / Snooze / Move). */
  initialPanel?: "snooze" | "label" | "move";
  showAi?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const [panel, setPanel] = useState<"snooze" | "label" | "move" | null>(
    initialPanel ?? null,
  );
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[4]);
  const newLabelInputRef = useRef<HTMLInputElement | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = Math.min(0, window.innerWidth - 8 - rect.right);
    const dy = Math.min(0, window.innerHeight - 8 - rect.bottom);
    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }, [x, y, panel, creatingLabel, creatingFolder]);

  useEffect(() => {
    if (creatingLabel) newLabelInputRef.current?.focus();
  }, [creatingLabel]);

  useEffect(() => {
    if (creatingFolder) newFolderInputRef.current?.focus();
  }, [creatingFolder]);

  const openPanel = (next: "snooze" | "label" | "move") => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setPanel(next);
    if (next !== "label") setCreatingLabel(false);
    if (next !== "move") setCreatingFolder(false);
  };

  const submitNewLabel = () => {
    const name = newLabelName.trim();
    if (!name) return;
    onCreateLabel(name, newLabelColor);
    setCreatingLabel(false);
    setNewLabelName("");
  };

  const submitNewFolder = () => {
    const name = newFolderName.trim();
    if (!name || !onCreateFolder) return;
    if (onCreateFolder(name)) {
      onAction("move", name);
      setCreatingFolder(false);
      setNewFolderName("");
    }
  };

  const scheduleClosePanel = () => {
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setPanel(null), 120);
  };

  const clearPanel = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setPanel(null);
  };

  const item = (
    action: MailAction,
    label: string,
    Icon: typeof Archive,
    opts?: { danger?: boolean; detail?: string },
  ) => (
    <button
      key={label}
      type="button"
      className={`ctx-item${opts?.danger ? " danger" : ""}`}
      onMouseEnter={clearPanel}
      onClick={() => onAction(action, opts?.detail)}
    >
      <Icon size={14} strokeWidth={1.75} />
      {label}
    </button>
  );

  const submenu = (
    id: "snooze" | "label" | "move",
    label: string,
    Icon: typeof Archive,
    flyout: ReactNode,
    flyoutClass?: string,
  ) => (
    <div
      className="ctx-submenu"
      onMouseEnter={() => openPanel(id)}
      onMouseLeave={scheduleClosePanel}
    >
      <button
        type="button"
        className={`ctx-item${panel === id ? " active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={panel === id}
        onClick={() => openPanel(id)}
      >
        <Icon size={14} strokeWidth={1.75} />
        {label}
        <ChevronRight size={14} strokeWidth={1.75} className="ctx-chevron" />
      </button>
      {panel === id && (
        <div className={`ctx-flyout${flyoutClass ? ` ${flyoutClass}` : ""}`}>
          {flyout}
        </div>
      )}
    </div>
  );

  return (
    <div className="ctx-root" style={{ left: x, top: y }} ref={ref}>
      <div className="ctx-menu">
        {item("reply", "Reply", Reply)}
        {item("reply-all", "Reply all", ReplyAll)}
        {item("forward", "Forward", Forward)}
        <div className="ctx-sep" />
        {item(
          "toggle-read",
          message.unread ? "Mark as read" : "Mark as unread",
          message.unread ? MailOpen : Mail,
        )}
        {item(
          "star",
          message.starred ? "Unstar" : "Star",
          Star,
        )}
        <div className="ctx-sep" />
        {submenu(
          "snooze",
          "Snooze",
          Clock,
          ["Later today", "Tomorrow", "This weekend", "Next week"].map(
            (label) => (
              <button
                key={label}
                type="button"
                className="ctx-item"
                onClick={() => onAction("snooze", label)}
              >
                {label}
              </button>
            ),
          ),
        )}
        {item("archive", "Archive", Archive)}
        {submenu(
          "move",
          "Add to Folder",
          Folder,
          <>
            {folders.map((f) => {
              const Icon = folderIcons[f.icon];
              const active = message.folder === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`ctx-item${active ? " active" : ""}`}
                  onClick={() => onAction("move", f.id)}
                >
                  <Icon size={14} strokeWidth={1.75} />
                  {f.name}
                  {active && (
                    <Check
                      size={14}
                      strokeWidth={2.25}
                      className="ctx-check"
                    />
                  )}
                </button>
              );
            })}
            <div className="ctx-sep" />
            {customFolders.map((name) => {
              const active = message.folder === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`ctx-item${active ? " active" : ""}`}
                  onClick={() => onAction("move", name)}
                >
                  <Folder size={14} strokeWidth={1.75} />
                  {name}
                  {active && (
                    <Check
                      size={14}
                      strokeWidth={2.25}
                      className="ctx-check"
                    />
                  )}
                </button>
              );
            })}
            {onCreateFolder && (
              <>
                <div className="ctx-sep" />
                {creatingFolder ? (
                  <div
                    className="ctx-new-label"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={newFolderInputRef}
                      className="ctx-new-label-input"
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitNewFolder();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setCreatingFolder(false);
                          setNewFolderName("");
                        }
                      }}
                    />
                    <div className="ctx-new-label-actions">
                      <button
                        type="button"
                        className="ctx-item"
                        onClick={() => {
                          setCreatingFolder(false);
                          setNewFolderName("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ctx-item ctx-new-label-create"
                        disabled={!newFolderName.trim()}
                        onClick={submitNewFolder}
                      >
                        <Plus size={14} strokeWidth={2} />
                        Create
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={() => setCreatingFolder(true)}
                  >
                    <Plus size={14} strokeWidth={2} />
                    New folder…
                  </button>
                )}
              </>
            )}
          </>,
          "ctx-folder-flyout",
        )}
        {submenu(
          "label",
          "Label",
          Tag,
          <>
            {showAi && (
              <>
                <button
                  type="button"
                  className="ctx-item"
                  onClick={() => onAction("auto-label")}
                >
                  <Sparkles size={14} strokeWidth={1.75} />
                  Auto-label with AI
                </button>
                <div className="ctx-sep" />
              </>
            )}
            {labels.map((l) => {
              const active = message.tag?.label === l.name;
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`ctx-item${active ? " active" : ""}`}
                  onClick={() =>
                    onAction(active ? "clear-label" : "label", l.id)
                  }
                >
                  <span className="label-dot" style={{ color: l.color }} />
                  {l.name}
                  {active && (
                    <Check
                      size={14}
                      strokeWidth={2.25}
                      className="ctx-check"
                    />
                  )}
                </button>
              );
            })}
            <div className="ctx-sep" />
            {creatingLabel ? (
              <div
                className="ctx-new-label"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  ref={newLabelInputRef}
                  className="ctx-new-label-input"
                  placeholder="Label name"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitNewLabel();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setCreatingLabel(false);
                      setNewLabelName("");
                    }
                  }}
                />
                <div className="ctx-new-label-colors">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`ctx-color-swatch${newLabelColor === c ? " active" : ""}`}
                      style={{ background: c }}
                      aria-label={`Color ${c}`}
                      onClick={() => setNewLabelColor(c)}
                    />
                  ))}
                </div>
                <div className="ctx-new-label-actions">
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={() => {
                      setCreatingLabel(false);
                      setNewLabelName("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="ctx-item ctx-new-label-create"
                    disabled={!newLabelName.trim()}
                    onClick={submitNewLabel}
                  >
                    <Plus size={14} strokeWidth={2} />
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="ctx-item"
                onClick={() => setCreatingLabel(true)}
              >
                <Plus size={14} strokeWidth={2} />
                New label…
              </button>
            )}
          </>,
          "ctx-label-flyout",
        )}
        <div className="ctx-sep" />
        {message.folder === "junk" ? (
          <>
            {item("not-spam", "Not spam", Inbox)}
            {item("trash", "Move to Trash", Trash2)}
            {item("delete-forever", "Delete forever", Eraser, { danger: true })}
          </>
        ) : message.folder === "trash" ? (
          <>
            {item("move", "Move to Inbox", Inbox, { detail: "inbox" })}
            {item("delete-forever", "Delete forever", Eraser, { danger: true })}
          </>
        ) : (
          <>
            {item("spam", "Mark as spam", ShieldAlert, { danger: true })}
            {item("trash", "Delete", Trash2, { danger: true })}
          </>
        )}
      </div>
    </div>
  );
}

function MessageList({
  items,
  accounts,
  selectedId,
  checkedIds,
  filter,
  unified,
  title,
  showSplit,
  showAvatars,
  showPreviewLines,
  showUnreadBadge,
  hoverActions,
  reduceMotion,
  labels,
  customFolders,
  showAi,
  catchMeUp,
  syncing,
  fullScreen,
  onFilter,
  onSelect,
  onToggleCheck,
  onSelectAll,
  onClearChecks,
  onBulkAction,
  onRefresh,
  onCompose,
  onAction,
  onCreateLabel,
  onCreateFolder,
}: {
  items: Message[];
  accounts: Account[];
  selectedId: string;
  checkedIds: Set<string>;
  filter: Filter;
  unified: boolean;
  title: string;
  showSplit: boolean;
  showAvatars: boolean;
  showPreviewLines: boolean;
  showUnreadBadge: boolean;
  hoverActions: boolean;
  reduceMotion: boolean;
  labels: Label[];
  customFolders: string[];
  showAi: boolean;
  catchMeUp?: {
    enabled: boolean;
    busy: boolean;
    text: string | null;
    error: string | null;
    onRun: () => void;
  };
  syncing?: boolean;
  fullScreen?: boolean;
  onFilter: (f: Filter) => void;
  onSelect: (id: string) => void;
  onToggleCheck: (
    id: string,
    opts: { shiftKey: boolean; additive: boolean },
  ) => void;
  onSelectAll: () => void;
  onClearChecks: () => void;
  onBulkAction: (action: MailAction, detail?: string) => void;
  onRefresh: () => void;
  onCompose?: () => void;
  onAction: (messageId: string, action: MailAction, snoozeLabel?: string) => void;
  onCreateLabel: (messageId: string, name: string, color: string) => void;
  onCreateFolder: (name: string) => boolean;
}) {
  const otherCount = items.filter((m) => !m.important && m.unread).length;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const checkedCount = checkedIds.size;
  const allChecked = items.length > 0 && items.every((m) => checkedIds.has(m.id));
  const someChecked = checkedCount > 0 && !allChecked;
  const checkedMessages = items.filter((m) => checkedIds.has(m.id));
  const anyUnread = checkedMessages.some((m) => m.unread);
  const anyUnstarred = checkedMessages.some((m) => !m.starred);
  const ownEmails = useMemo(() => ownEmailSet(accounts), [accounts]);

  const menuMessage = menu
    ? items.find((m) => m.id === menu.messageId) ?? null
    : null;

  const openMenu = (messageId: string, x: number, y: number) => {
    setMenu({ messageId, x, y });
  };

  return (
    <section
      className={`list${fullScreen ? " list-fullscreen" : ""}${checkedCount > 0 ? " list-selecting" : ""}`}
    >
      <div className="list-header">
        {checkedCount > 0 ? (
          <div className="bulk-bar" role="toolbar" aria-label="Bulk selection">
            <button
              type="button"
              className={`message-check${allChecked ? " on" : someChecked ? " mixed" : ""}`}
              aria-label={allChecked ? "Deselect all" : "Select all"}
              title={allChecked ? "Deselect all" : "Select all"}
              aria-checked={allChecked ? true : someChecked ? "mixed" : false}
              role="checkbox"
              onClick={() => (allChecked ? onClearChecks() : onSelectAll())}
            >
              {allChecked ? (
                <CheckSquare size={15} strokeWidth={1.75} />
              ) : someChecked ? (
                <MinusSquare size={15} strokeWidth={1.75} />
              ) : (
                <Square size={15} strokeWidth={1.75} />
              )}
            </button>
            <span className="bulk-count">{checkedCount}&nbsp;selected</span>
            <span className="bulk-sep" aria-hidden />
            <button
              type="button"
              className="icon-btn"
              aria-label="Archive selected"
              title="Archive"
              onClick={() => onBulkAction("archive")}
            >
              <Archive size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={anyUnread ? "Mark as read" : "Mark as unread"}
              title={anyUnread ? "Mark as read" : "Mark as unread"}
              onClick={() => onBulkAction("toggle-read")}
            >
              {anyUnread ? (
                <MailOpen size={14} strokeWidth={1.75} />
              ) : (
                <Mail size={14} strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={anyUnstarred ? "Star" : "Unstar"}
              title={anyUnstarred ? "Star" : "Unstar"}
              onClick={() => onBulkAction("star")}
            >
              <Star
                size={14}
                strokeWidth={1.75}
                fill={anyUnstarred ? "none" : "currentColor"}
              />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Snooze selected"
              title="Snooze"
              onClick={() => onBulkAction("snooze", "Tomorrow")}
            >
              <Clock size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Mark selected as spam"
              title="Mark as spam"
              onClick={() => onBulkAction("spam")}
            >
              <ShieldAlert size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              aria-label="Delete selected"
              title="Delete"
              onClick={() => onBulkAction("trash")}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              aria-label="Delete selected forever"
              title="Delete forever"
              onClick={() => onBulkAction("delete-forever")}
            >
              <Eraser size={14} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <>
            <div className="list-title">
              {title}
              {fullScreen && (
                <span className="list-count">{items.length}</span>
              )}
            </div>
            <div className="list-actions">
              {fullScreen && onCompose && (
                <button
                  type="button"
                  className="compose list-compose"
                  onClick={onCompose}
                >
                  <Plus size={15} strokeWidth={2.25} />
                  Compose
                </button>
              )}
              {catchMeUp?.enabled && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Catch me up"
                  title="Catch me up"
                  onClick={catchMeUp.onRun}
                  disabled={catchMeUp.busy}
                >
                  <Sparkles
                    size={14}
                    strokeWidth={1.75}
                    className={catchMeUp.busy ? "spin" : undefined}
                  />
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label="Refresh"
                onClick={onRefresh}
                disabled={syncing}
              >
                <RefreshCw
                  size={14}
                  strokeWidth={1.75}
                  className={syncing ? "spin" : undefined}
                />
              </button>
              <button type="button" className="icon-btn" aria-label="Sweep">
                <Eraser size={14} strokeWidth={1.75} />
              </button>
            </div>
          </>
        )}
      </div>

      {showSplit && (
        <div className="list-tabs">
          {(
            [
              ["all", "All"],
              ["important", "Important"],
              ["other", `Other${otherCount ? ` (${otherCount})` : ""}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`tab${filter === id ? " active" : ""}`}
              onClick={() => onFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {catchMeUp?.enabled && (catchMeUp.busy || catchMeUp.text || catchMeUp.error) && (
        <div className="catchup" role="status">
          <p className={catchMeUp.error ? "catchup-error" : undefined}>
            {catchMeUp.busy
              ? "Catching you up from this inbox…"
              : catchMeUp.error || catchMeUp.text}
          </p>
        </div>
      )}

      <div className="message-scroll">
        {items.length === 0 ? (
          <div className="empty-list">
            <Inbox size={22} strokeWidth={1.5} />
            <p>Nothing here</p>
            <span>Try another filter or account.</span>
          </div>
        ) : (
          items.map((m, i) => {
            const acct = accountFor(m.accountId, accounts);
            const selected = m.id === selectedId;
            const checked = checkedIds.has(m.id);
            const badges = listBadgeCounts(m);
            const links = extractMessageLinks(m);
            const starred = Boolean(m.starred);
            return (
              <div
                key={m.id}
                className={`message-row${reduceMotion ? "" : " fade-up"}${selected ? " selected" : ""}${checked ? " checked" : ""}${menu?.messageId === m.id ? " menu-target" : ""}${m.unread ? " unread" : ""}${starred ? " starred" : ""}${hoverActions ? " hover-actions" : ""}${showAvatars ? "" : " no-avatar"}`}
                style={
                  reduceMotion ? undefined : { animationDelay: `${i * 0.03}s` }
                }
                onClick={(e) => {
                  if (e.shiftKey || e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    onToggleCheck(m.id, {
                      shiftKey: e.shiftKey,
                      additive: e.metaKey || e.ctrlKey,
                    });
                    return;
                  }
                  onSelect(m.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(m.id, e.clientX, e.clientY);
                }}
              >
                <div className="message-select">
                  {showAvatars && (
                    <PersonAvatar
                      name={m.from}
                      initials={m.initials}
                      color={m.avatarColor}
                      avatarUrl={m.avatarUrl}
                    />
                  )}
                  <button
                    type="button"
                    className={`message-check${checked ? " on" : ""}`}
                    aria-label={checked ? "Deselect message" : "Select message"}
                    aria-checked={checked}
                    role="checkbox"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCheck(m.id, {
                        shiftKey: e.shiftKey,
                        additive: true,
                      });
                    }}
                  >
                    {checked ? (
                      <CheckSquare size={12} strokeWidth={2} />
                    ) : (
                      <Square size={12} strokeWidth={2} />
                    )}
                  </button>
                </div>
                <div className="message-main">
                  <div className="from-row">
                    <span className="from">{m.from}</span>
                    <span className="message-time-inline">· {m.time}</span>
                    {m.openTracking && (
                      <DeliveryTicks tracking={m.openTracking} size={13} />
                    )}
                    {unified && (
                      <span
                        className="account-chip"
                        style={{
                          background: "transparent",
                          color:
                            acct.color === "#ededed" ? "#c5c8ce" : acct.color,
                          borderColor: acct.color,
                        }}
                      >
                        {acct.label}
                      </span>
                    )}
                    {isCcOnly(m, ownEmails) && (
                      <span className="cc-chip">Cc</span>
                    )}
                    {m.tag && (
                      <span
                        className="tag"
                        style={{ background: m.tag.color }}
                        title={m.tag.label}
                      >
                        {m.tag.label}
                      </span>
                    )}
                    <div className="message-row-actions">
                      <button
                        type="button"
                        className={`message-star${starred ? " on" : ""}`}
                        aria-label={starred ? "Unstar" : "Star"}
                        aria-pressed={starred}
                        title={starred ? "Unstar" : "Star"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(m.id, "star");
                        }}
                      >
                        <Star
                          size={13}
                          strokeWidth={1.75}
                          fill={starred ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        type="button"
                        className="message-more"
                        aria-label="Message actions"
                        title="More actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (
                            e.currentTarget as HTMLButtonElement
                          ).getBoundingClientRect();
                          openMenu(m.id, rect.right, rect.bottom + 4);
                        }}
                      >
                        <MoreHorizontal size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <div className="subject-row">
                    {showUnreadBadge && m.unread && (
                      <span className="unread-dot" aria-label="Unread" />
                    )}
                    <div className="subject">{m.subject}</div>
                  </div>
                  {showPreviewLines && (
                    <div className="preview">{m.preview}</div>
                  )}
                  {(fullScreen ||
                    badges.attachmentCount > 0 ||
                    badges.mediaCount > 0 ||
                    m.meeting ||
                    links.length > 0) && (
                    <div className="message-foot">
                      {(badges.attachmentCount > 0 ||
                        badges.mediaCount > 0 ||
                        m.meeting ||
                        links.length > 0) && (
                        <div className="message-badges">
                          {badges.attachmentCount > 0 && (
                            <span
                              className="meta-pill files"
                              title={`${badges.attachmentCount} attachment${badges.attachmentCount === 1 ? "" : "s"}`}
                            >
                              <Paperclip size={12} strokeWidth={1.75} />
                              {badges.attachmentCount}
                            </span>
                          )}
                          {(badges.mediaCount > 0 || m.meeting) && (
                            <span
                              className="meta-pill media"
                              title={
                                m.meeting
                                  ? m.meeting.title
                                  : `${badges.mediaCount} meeting${badges.mediaCount === 1 ? "" : "s"}`
                              }
                            >
                              <Calendar size={12} strokeWidth={1.75} />
                              {m.meeting ? "Meet" : badges.mediaCount}
                            </span>
                          )}
                          {links.slice(0, 2).map((link) => (
                            <a
                              key={link.href}
                              className="meta-link"
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              title={link.href}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link2 size={11} strokeWidth={1.75} />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                      {fullScreen && (
                        <span className="message-time-end">
                          {m.openTracking && (
                            <DeliveryTicks tracking={m.openTracking} size={13} />
                          )}
                          {m.time}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {menu && menuMessage && (
        <MessageActionMenu
          message={menuMessage}
          x={menu.x}
          y={menu.y}
          labels={labels}
          customFolders={customFolders}
          showAi={showAi}
          onClose={() => setMenu(null)}
          onCreateLabel={(name, color) => {
            onCreateLabel(menu.messageId, name, color);
            setMenu(null);
          }}
          onCreateFolder={onCreateFolder}
          onAction={(action, snoozeLabel) => {
            onAction(menu.messageId, action, snoozeLabel);
            setMenu(null);
          }}
        />
      )}
    </section>
  );
}

/** True when HTML references remote http(s) or protocol-relative images. */
function htmlHasRemoteImages(html: string): boolean {
  if (!html) return false;
  // src / srcset / background / url(...) with http(s) or //host
  return /(?:src|srcset|background)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(
    html,
  ) || /url\(\s*['"]?(?:https?:)?\/\//i.test(html);
}

function isRemoteImageUrl(src: string): boolean {
  return /^(?:https?:)?\/\//i.test(src.trim());
}

/** about:blank iframes resolve //host poorly — pin to https when loading. */
function promoteProtocolRelativeUrls(html: string): string {
  return html
    .replace(/(\s(?:src|srcset|href|background)\s*=\s*["'])\/\//gi, "$1https://")
    .replace(/(url\(\s*['"]?)\/\//gi, "$1https://");
}

function HtmlBody({
  html,
  forceDark,
  allowRemote,
  senderEmail,
  onTrustSender,
}: {
  html: string;
  forceDark?: boolean;
  /** When true, remote images load without a per-message opt-in. */
  allowRemote: boolean;
  senderEmail?: string;
  /** Offer to add this sender to the trusted list (Settings → Privacy). */
  onTrustSender?: (email: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hasRemote = useMemo(() => htmlHasRemoteImages(html), [html]);
  const [showImages, setShowImages] = useState(allowRemote);
  /** blocked | loading | ready — banner stays visible through load. */
  const [imagePhase, setImagePhase] = useState<
    "blocked" | "loading" | "ready" | "hidden"
  >(allowRemote || !hasRemote ? "hidden" : "blocked");
  const [userHeight, setUserHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const naturalHeight = useRef(160);
  const loadGeneration = useRef(0);

  useEffect(() => {
    setUserHeight(null);
    setShowImages(allowRemote);
    // Auto-allowed messages skip the banner; blocked ones always show it.
    setImagePhase(hasRemote && !allowRemote ? "blocked" : "hidden");
  }, [html, allowRemote, hasRemote]);

  const startLoadingImages = (trustSender?: boolean) => {
    if (trustSender && senderEmail) onTrustSender?.(senderEmail);
    loadGeneration.current += 1;
    setImagePhase("loading");
    setShowImages(true);
  };

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    const dark = forceDark
      ? `html, body { margin: 0; padding: 0; overflow: hidden; background: #141416; color: #e8e8ea; }
         body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; }
         img { max-width: 100%; height: auto; }
         a { color: #7eb0ff; }
         table, td, div { background-color: transparent !important; color: inherit !important; }`
      : `html, body { margin: 0; padding: 0; overflow: hidden; background: #fff; color: #1a1a1a; }
         body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; }
         img { max-width: 100%; height: auto; }
         a { color: #2563eb; }`;
    // Block every remote fetch (tracking pixels, CSS imports, media) unless the
    // policy allows them or the user loads images for this message.
    const csp = showImages
      ? "default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; font-src data:; media-src https: http: data: blob:; base-uri 'none'; form-action 'none';"
      : "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none';";
    const bodyHtml = showImages ? promoteProtocolRelativeUrls(html) : html;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8" />
      <meta http-equiv="Content-Security-Policy" content="${csp}" />
      <style>${dark}</style>
    </head><body>${bodyHtml}</body></html>`);
    doc.close();

    // Links inside the sandbox cannot navigate; route them through the main
    // process, which re-validates the protocol.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      const href = anchor?.getAttribute("href") ?? "";
      if (!href) return;
      event.preventDefault();
      if (/^(https?:|mailto:)/i.test(href)) {
        void window.intray?.openExternal?.(href);
      }
    };
    doc.addEventListener("click", onClick);

    const measureHeight = () => {
      const body = doc.body;
      const root = doc.documentElement;
      if (!body) return 120;
      // body.scrollHeight often under-counts collapsed margins; take the max of
      // root/body metrics and the furthest child bottom edge.
      const bodyTop = body.getBoundingClientRect().top;
      let childBottom = 0;
      for (const child of Array.from(body.children)) {
        childBottom = Math.max(
          childBottom,
          child.getBoundingClientRect().bottom - bodyTop,
        );
      }
      return Math.max(
        body.scrollHeight,
        body.offsetHeight,
        root?.scrollHeight ?? 0,
        root?.offsetHeight ?? 0,
        childBottom,
      );
    };

    const resize = () => {
      const h = measureHeight();
      naturalHeight.current = Math.min(Math.max(h + 12, 80), 2400);
      if (userHeight == null) {
        // Fit content so short mail doesn't scroll while the reading pane is empty.
        frame.style.height = `${Math.min(naturalHeight.current, 900)}px`;
      } else {
        // Keep full content height; the shell max-height + overflow scrolls when shrunk.
        frame.style.height = `${Math.max(naturalHeight.current, userHeight)}px`;
      }
    };
    resize();
    // Second pass after layout/fonts settle — first paint often under-measures.
    const raf = window.requestAnimationFrame(() => resize());
    const ob = new ResizeObserver(resize);
    if (doc.body) ob.observe(doc.body);
    if (doc.documentElement) ob.observe(doc.documentElement);

    let cancelled = false;
    const timers: number[] = [];
    if (showImages && hasRemote) {
      const gen = loadGeneration.current;
      const remoteImgs = Array.from(doc.images ?? []).filter((img) =>
        isRemoteImageUrl(img.getAttribute("src") ?? img.currentSrc ?? ""),
      );
      const finish = () => {
        if (cancelled || loadGeneration.current !== gen) return;
        setImagePhase((phase) => (phase === "loading" ? "ready" : phase));
      };
      if (remoteImgs.length === 0) {
        // CSS backgrounds only — short beat so the Loading state is visible.
        timers.push(window.setTimeout(finish, 450));
      } else {
        let pending = remoteImgs.length;
        const settle = () => {
          pending -= 1;
          if (pending <= 0) finish();
        };
        for (const img of remoteImgs) {
          if (img.complete) settle();
          else {
            img.addEventListener("load", settle, { once: true });
            img.addEventListener("error", settle, { once: true });
          }
        }
        // Cap wait so a hung host doesn't leave the banner spinning forever.
        timers.push(window.setTimeout(finish, 8000));
      }
    }

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      window.cancelAnimationFrame(raf);
      ob.disconnect();
      doc.removeEventListener("click", onClick);
    };
  }, [html, forceDark, showImages, userHeight, hasRemote]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
      const top = shell.getBoundingClientRect().top;
      const next = Math.min(Math.max(e.clientY - top, 120), 1200);
      setUserHeight(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  const canTrust =
    Boolean(onTrustSender && senderEmail?.includes("@")) && !allowRemote;
  const showBanner =
    hasRemote &&
    (imagePhase === "blocked" ||
      imagePhase === "loading" ||
      imagePhase === "ready");

  return (
    <div className="html-frame-wrap">
      {showBanner && (
        <div
          className={`html-images-banner phase-${imagePhase}`}
          role="status"
          aria-live="polite"
        >
          <div className="html-images-banner-copy">
            {imagePhase === "loading" ? (
              <Loader2 size={16} strokeWidth={2} className="spin" />
            ) : (
              <ImageOff size={16} strokeWidth={1.75} />
            )}
            <div>
              <strong>
                {imagePhase === "blocked"
                  ? "Remote images are blocked"
                  : imagePhase === "loading"
                    ? "Loading remote images…"
                    : "Remote images loaded"}
              </strong>
              <span>
                {imagePhase === "blocked"
                  ? "Blocked to stop trackers from knowing you opened this message."
                  : imagePhase === "loading"
                    ? "Fetching images from the sender’s servers."
                    : "You can hide them again anytime for this message."}
              </span>
            </div>
          </div>
          <div className="html-images-banner-actions">
            {imagePhase === "blocked" && (
              <>
                <button
                  type="button"
                  className="html-images-primary"
                  onClick={() => startLoadingImages(false)}
                >
                  Load images
                </button>
                {canTrust && (
                  <button
                    type="button"
                    className="html-images-secondary"
                    onClick={() => startLoadingImages(true)}
                  >
                    Always from this sender
                  </button>
                )}
              </>
            )}
            {imagePhase === "loading" && (
              <button type="button" className="html-images-primary" disabled>
                Loading…
              </button>
            )}
            {imagePhase === "ready" && (
              <>
                <button
                  type="button"
                  className="html-images-secondary"
                  onClick={() => {
                    loadGeneration.current += 1;
                    setShowImages(false);
                    setImagePhase("blocked");
                  }}
                >
                  Hide images
                </button>
                <button
                  type="button"
                  className="html-images-ghost"
                  onClick={() => setImagePhase("hidden")}
                  aria-label="Dismiss image banner"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div
        ref={shellRef}
        className={`html-shell${userHeight != null ? " resized" : ""}`}
        style={
          userHeight != null
            ? ({ ["--html-shell-height" as string]: `${userHeight}px` } as CSSProperties)
            : undefined
        }
      >
        <iframe
          ref={ref}
          className="html-frame"
          title="Email HTML"
          // allow-same-origin so we can write/measure the doc; no allow-scripts.
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
        />
      </div>
      <button
        type="button"
        className={`html-resize-handle${dragging ? " dragging" : ""}`}
        aria-label="Drag to resize message height"
        title="Drag to resize"
        onPointerDown={(e) => {
          e.preventDefault();
          const shell = shellRef.current;
          const start =
            userHeight ??
            shell?.getBoundingClientRect().height ??
            Math.min(naturalHeight.current, 900);
          setUserHeight(start);
          setDragging(true);
        }}
      />
    </div>
  );
}

function ThreadMessageView({
  message,
  defaultExpanded,
  forceDarkHtml,
  showAi,
  remoteImagePolicy,
  trustedImageSenders,
  onTrustImageSender,
  onComposeTo,
  onSummarize,
  onTranslate,
}: {
  message: ThreadMessage;
  defaultExpanded: boolean;
  forceDarkHtml?: boolean;
  showAi: boolean;
  remoteImagePolicy: Preferences["remoteImagePolicy"];
  trustedImageSenders: string[];
  onTrustImageSender: (email: string) => void;
  onComposeTo: (r: Recipient) => void;
  onSummarize?: () => void;
  onTranslate?: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasRecipients =
    (message.to && message.to.length > 0) ||
    (message.cc && message.cc.length > 0);

  const showTools = Boolean(message.noTrackers) || showAi;
  const sender: Recipient = { name: message.from, email: message.email };
  const toggleExpanded = () => setExpanded((v) => !v);

  return (
    <article className={`thread-msg${expanded ? " expanded" : ""}`}>
      <div className="thread-msg-top">
        <div className="thread-msg-head">
          <div className="msg-from">
            <button
              type="button"
              className="msg-from-toggle"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse message" : "Expand message"}
            >
              <PersonAvatar
                name={message.from}
                initials={message.initials}
                color={message.avatarColor}
                avatarUrl={message.avatarUrl}
              />
            </button>
            <div className="msg-from-text">
              <strong>
                <RecipientName recipient={sender} onCompose={onComposeTo} />
              </strong>
              <span className="msg-from-meta">
                <button
                  type="button"
                  className="msg-sender-email"
                  title={`Compose to ${message.email}`}
                  onClick={() => onComposeTo(sender)}
                >
                  {message.email}
                </button>
                <span className="msg-from-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="msg-from-time"
                  onClick={toggleExpanded}
                >
                  {message.time}
                </button>
              </span>
            </div>
          </div>
          {!expanded && message.body?.[0] && (
            <button
              type="button"
              className="thread-collapse-preview"
              onClick={toggleExpanded}
            >
              {message.body[0]}
            </button>
          )}
        </div>

        {expanded && showTools && (
          <div className="msg-tools">
            {message.noTrackers && (
              <span
                className="tracker"
                title="No trackers found"
                aria-label="No trackers found"
              >
                <ShieldCheck size={14} strokeWidth={1.75} />
              </span>
            )}
            {showAi && (
              <>
                <button
                  type="button"
                  className="msg-tool-btn"
                  title="Translate"
                  aria-label="Translate"
                  onClick={() => onTranslate?.()}
                >
                  <Languages size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="msg-tool-btn"
                  title="Summarize"
                  aria-label="Summarize"
                  onClick={() => onSummarize?.()}
                >
                  <Sparkles size={14} strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="thread-msg-body">
          {hasRecipients && (
            <div className="msg-recipients">
              {message.to && message.to.length > 0 && (
                <div className="recipient-row">
                  <span className="recipient-label">To</span>
                  <span className="recipient-list">
                    {formatRecipients(message.to, onComposeTo)}
                  </span>
                </div>
              )}
              {message.cc && message.cc.length > 0 && (
                <div className="recipient-row">
                  <span className="recipient-label">Cc</span>
                  <span className="recipient-list">
                    {formatRecipients(message.cc, onComposeTo)}
                  </span>
                </div>
              )}
            </div>
          )}

          {message.bodyHtml ? (
            <HtmlBody
              html={message.bodyHtml}
              forceDark={forceDarkHtml}
              allowRemote={allowRemoteImagesForSender(
                remoteImagePolicy,
                message.email,
                trustedImageSenders,
              )}
              senderEmail={message.email}
              onTrustSender={
                remoteImagePolicy === "always"
                  ? undefined
                  : onTrustImageSender
              }
            />
          ) : (
            <div className="body-copy">
              {(message.body ?? []).map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}

          {message.meeting && (
            <div className="meeting-card">
              <div className="meeting-card-icon" aria-hidden>
                <Calendar size={15} strokeWidth={1.75} />
              </div>
              <div className="meeting-card-meta">
                <strong>{message.meeting.title}</strong>
                <span className="meeting-card-sep" aria-hidden>
                  ·
                </span>
                <span>{message.meeting.when}</span>
              </div>
              {message.meeting.url && (
                <a
                  className="meeting-card-join"
                  href={message.meeting.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Join
                </a>
              )}
            </div>
          )}

          {threadAttachments(message).length > 0 && (
            <div className="attachment-list">
              {threadAttachments(message).map((file) => (
                <div key={`${file.name}-${file.size}`} className="attachment">
                  <div className="attachment-icon">
                    <FileText size={15} strokeWidth={1.75} />
                  </div>
                  <div className="attachment-meta">
                    <strong>{file.name}</strong>
                    <span className="attachment-sep" aria-hidden>
                      ·
                    </span>
                    <span>{file.size}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ReadingPane({
  message,
  stickySubject,
  forceDarkHtml,
  conversationView,
  showAi,
  labels,
  customFolders,
  prefs,
  live,
  account,
  accounts,
  onBack,
  onAsk,
  onAction,
  onCreateLabel,
  onCreateFolder,
  onComposeTo,
  onToast,
  onReplySent,
  onUpdatePrefs,
  replyIntent = { key: 0, mode: "reply" as ReplyMode },
}: {
  message: Message | null;
  stickySubject: boolean;
  forceDarkHtml: boolean;
  conversationView: boolean;
  showAi: boolean;
  labels: Label[];
  customFolders: string[];
  prefs: Preferences;
  live: boolean;
  account: Account;
  accounts: Account[];
  onBack?: () => void;
  onAsk: () => void;
  onAction: (action: MailAction, snoozeLabel?: string) => void;
  onCreateLabel: (name: string, color: string) => void;
  onCreateFolder: (name: string) => boolean;
  onComposeTo: (r: Recipient) => void;
  onToast: (text: string) => void;
  onReplySent?: (message: Message) => void;
  onUpdatePrefs: (next: Preferences) => void;
  /** Bumped by parent to focus/seed the reply box (Reply vs Reply all). */
  replyIntent?: { key: number; mode: ReplyMode };
}) {
  const sendable = useMemo(
    () => accounts.filter((a) => a.id !== UNIFIED_ID),
    [accounts],
  );
  const ownEmails = useMemo(() => ownEmailSet(accounts), [accounts]);
  const defaultReplyFromId = useMemo(() => {
    const signedIn = sendable.filter((a) => !a.loggedOut);
    const pick = (id: string | undefined) => {
      if (!id) return undefined;
      const hit = sendable.find((a) => a.id === id);
      if (!hit) return undefined;
      if (!hit.loggedOut) return hit.id;
      return signedIn[0]?.id ?? hit.id;
    };
    return (
      pick(message?.accountId) ??
      pick(account.id !== UNIFIED_ID ? account.id : undefined) ??
      signedIn[0]?.id ??
      sendable[0]?.id ??
      account.id
    );
  }, [message?.accountId, account.id, sendable]);

  const [draft, setDraft] = useState("");
  const [fromId, setFromId] = useState(defaultReplyFromId);
  const [toMentions, setToMentions] = useState<Recipient[]>([]);
  const [ccMentions, setCcMentions] = useState<Recipient[]>([]);
  const [bccMentions, setBccMentions] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  /** From/To/Cc bar — collapsed while reading; opens on reply focus or Reply/Reply all. */
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [replySendPhase, setReplySendPhase] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");
  const replyFrom =
    sendable.find((a) => a.id === fromId) ??
    sendable.find((a) => a.id === defaultReplyFromId) ??
    sendable[0] ??
    account;
  const replyFromLoggedOut = Boolean(replyFrom.loggedOut);
  const [aiReplies, setAiReplies] = useState<string[]>([]);
  const [replyNote, setReplyNote] = useState<string | null>(null);
  const [unsubState, setUnsubState] = useState<
    "idle" | "scanning" | "done" | "missing"
  >("idle");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    panel?: "snooze" | "label" | "move";
  } | null>(null);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  const replyStateRef = useRef({ draft, toMentions, ccMentions, bccMentions });
  replyStateRef.current = { draft, toMentions, ccMentions, bccMentions };
  const replyHistory = useUndoStack(() => replyStateRef.current);

  const replies = aiReplies;

  const predictions = useMemo(() => {
    if (!showAi || !prefs.aiWriteEnabled || !replies.length) return [];
    const q = draft.toLowerCase();
    const pool = q.trim()
      ? replies.filter((r) => {
          const t = r.toLowerCase();
          return t.startsWith(q) && t !== q;
        })
      : replies;
    return pool.slice(0, 2);
  }, [showAi, prefs.aiWriteEnabled, replies, draft]);

  const prediction = predictions[0] ?? null;
  const ghostSuffix = (() => {
    if (!prediction) return null;
    if (!prediction.toLowerCase().startsWith(draft.toLowerCase())) return null;
    const rest = prediction.slice(draft.length);
    return rest.length > 0 ? rest : null;
  })();

  const applyReplyState = (next: {
    draft: string;
    toMentions: Recipient[];
    ccMentions: Recipient[];
    bccMentions: Recipient[];
  }) => {
    setDraft(next.draft);
    setToMentions(next.toMentions);
    setCcMentions(next.ccMentions);
    setBccMentions(next.bccMentions);
    replyHistory.finishApply();
  };

  const setDraftTracked = (next: string) => {
    if (next === draft) return;
    replyHistory.push();
    setDraft(next);
  };

  const setToTracked = (next: Recipient[]) => {
    replyHistory.push();
    setToMentions(next);
  };

  const setCcTracked = (next: Recipient[]) => {
    replyHistory.push();
    setCcMentions(next);
  };

  const setBccTracked = (next: Recipient[]) => {
    replyHistory.push();
    setBccMentions(next);
  };

  const undoReply = () => {
    const prev = replyHistory.undo();
    if (!prev) return false;
    applyReplyState(prev);
    return true;
  };

  const redoReply = () => {
    const next = replyHistory.redo();
    if (!next) return false;
    applyReplyState(next);
    return true;
  };

  const acceptPrediction = (index: number) => {
    const text = predictions[index];
    if (!text) return;
    setDraftTracked(text);
  };

  useEffect(() => {
    setAiReplies([]);
    setReplyNote(null);
    if (!message || !showAi || !prefs.aiWriteEnabled) return;
    if (prefs.aiBridge === "none") {
      setReplyNote("Pick a provider in Settings to suggest replies.");
      return;
    }
    let cancelled = false;
    setReplyNote("Asking your provider for replies…");
    void aiSuggestReplies(prefs, message)
      .then((list) => {
        if (cancelled) return;
        setAiReplies(list);
        setReplyNote(list.length ? null : "The provider returned no replies.");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReplyNote(
          error instanceof Error ? error.message : "Couldn’t load replies.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    message?.id,
    showAi,
    prefs.aiWriteEnabled,
    prefs.aiBridge,
    prefs.aiBridgePath,
    prefs.aiModelHint,
  ]);

  const replyExcludeEmails = [
    replyFrom.email,
    ...toMentions.map((p) => p.email),
    ...ccMentions.map((p) => p.email),
    ...bccMentions.map((p) => p.email),
  ].filter(Boolean);

  const addCcMention = (contact: Contact) => {
    const email = contact.email.toLowerCase();
    if (
      toMentions.some((p) => p.email.toLowerCase() === email) ||
      ccMentions.some((p) => p.email.toLowerCase() === email) ||
      bccMentions.some((p) => p.email.toLowerCase() === email)
    ) {
      return;
    }
    setCcTracked([
      ...ccMentions,
      { name: contact.name, email: contact.email },
    ]);
    setShowCc(true);
  };

  const seedReplyRecipients = (mode: ReplyMode) => {
    if (!message) {
      setToMentions([]);
      setCcMentions([]);
      setShowCc(false);
      return;
    }
    const seeded = buildReplyRecipients(message, mode, ownEmails);
    setToMentions(seeded.to);
    setCcMentions(seeded.cc);
    setShowCc(seeded.cc.length > 0);
  };

  useEffect(() => {
    setDraft("");
    setFromId(defaultReplyFromId);
    setBccMentions([]);
    setShowBcc(false);
    setRecipientsOpen(false);
    seedReplyRecipients("reply");
    replyHistory.clear();
    setMenu(null);
    setUnsubState("idle");
    setReplySendPhase("idle");
    // Re-seed only when the open message / From account changes — not when the
    // accounts list refreshes mid-draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, defaultReplyFromId]);

  useEffect(() => {
    if (ccMentions.length) setShowCc(true);
  }, [ccMentions.length]);

  useEffect(() => {
    if (bccMentions.length) setShowBcc(true);
  }, [bccMentions.length]);

  useEffect(() => {
    if (!replyIntent.key || !message) return;
    seedReplyRecipients(replyIntent.mode);
    setRecipientsOpen(true);
    const id = window.requestAnimationFrame(() => {
      replyRef.current?.focus();
      replyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyIntent.key, replyIntent.mode, message?.id]);

  const sendReply = async () => {
    if (!message || !draft.trim() || replySendPhase === "sending") return;
    if (toMentions.length === 0) {
      setRecipientsOpen(true);
      onToast("Add at least one To recipient");
      return;
    }
    if (replyFromLoggedOut) {
      setReplySendPhase("failed");
      onToast("This account is logged out — reconnect in Settings");
      return;
    }
    setReplySendPhase("sending");
    try {
      if (live) {
        const dto = await bridgeSendMail({
          accountId: replyFrom.id,
          to: toMentions.map((c) => c.email),
          cc: ccMentions.map((c) => c.email),
          bcc: bccMentions.map((c) => c.email),
          subject: message.subject.startsWith("Re:")
            ? message.subject
            : `Re: ${message.subject}`,
          bodyText: draft,
          replyToMessageId: message.id,
        });
        onReplySent?.(messageDtoToUi(dto));
      } else {
        // Demo mode: brief delay so the Sending → Sent transition is visible.
        await new Promise((r) => setTimeout(r, 450));
      }
      setReplySendPhase("sent");
      setDraft("");
      seedReplyRecipients("reply");
      setBccMentions([]);
      setShowBcc(false);
      setRecipientsOpen(false);
      replyHistory.clear();
      onToast("Reply sent");
      window.setTimeout(() => setReplySendPhase("idle"), 1200);
    } catch (e) {
      setReplySendPhase("failed");
      onToast(e instanceof Error ? e.message : "Failed to send");
    }
  };

  const runSummarize = async () => {
    if (!message || prefs.aiBridge === "none") {
      onToast("Pick an AI provider in Settings");
      return;
    }
    onToast("Summarizing…");
    try {
      const text = await aiSummarizeMessage(prefs, message);
      onToast(text.slice(0, 180) + (text.length > 180 ? "…" : ""));
      if (!draft.trim()) setDraftTracked(text);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Summarize failed");
    }
  };

  const runTranslate = async () => {
    if (!message || prefs.aiBridge === "none") {
      onToast("Pick an AI provider in Settings");
      return;
    }
    onToast("Translating…");
    try {
      const text = await aiTranslateMessage(prefs, message);
      setDraftTracked(text);
      onToast("Translation ready in reply box");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Translate failed");
    }
  };

  const runAiWrite = async () => {
    if (!message || prefs.aiBridge === "none") {
      onToast("Pick an AI provider in Settings");
      return;
    }
    onToast("Writing reply…");
    try {
      const text = await aiWriteReply(prefs, message);
      setDraftTracked(text);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "AI write failed");
    }
  };

  if (!message) {
    return (
      <section className="reader empty-reader">
        <Layers size={28} strokeWidth={1.5} />
        <h2>Unified Inbox</h2>
        <p>Select a message from any account — they all live here together.</p>
      </section>
    );
  }

  const links = extractMessageLinks(message);
  const marketing = looksLikeNewsletter(message);
  const showUnsubscribe = showAi && marketing && unsubState !== "done";
  const openTrack = message.openTracking;
  const openSummary = openTrack ? trackingSummary(openTrack) : null;

  const runUnsubscribe = async () => {
    if (unsubState === "scanning") return;
    setUnsubState("scanning");
    onToast(`AI is finding an unsubscribe path for ${message.from}…`);
    const target = await aiFindUnsubscribe(message, prefs);
    if (!target) {
      setUnsubState("missing");
      onToast("AI couldn’t find an unsubscribe link in this mail");
      return;
    }
    openUnsubscribeTarget(target);
    setUnsubState("done");
    onToast(
      target.kind === "mailto"
        ? `Opening unsubscribe email for ${message.from}`
        : `Opened unsubscribe for ${message.from}`,
    );
    onAction("archive");
  };

  const unsubscribeBtn = showUnsubscribe ? (
    <button
      type="button"
      className="unsub-btn"
      disabled={unsubState === "scanning"}
      onClick={() => void runUnsubscribe()}
    >
      {unsubState === "scanning" ? (
        <Loader2 size={13} strokeWidth={2} className="spin" />
      ) : (
        <UserMinus size={13} strokeWidth={1.75} />
      )}
      {unsubState === "scanning"
        ? "Finding…"
        : unsubState === "missing"
          ? "Try again"
          : "Unsubscribe"}
    </button>
  ) : null;

  const toolbar: Array<{
    Icon: typeof Archive;
    label: string;
    action?: MailAction;
  }> = [
    { Icon: Reply, label: "Reply", action: "reply" },
    { Icon: ReplyAll, label: "Reply all", action: "reply-all" },
    { Icon: Forward, label: "Forward", action: "forward" },
    ...(message.folder === "junk"
      ? [
          { Icon: Inbox, label: "Not spam", action: "not-spam" as MailAction },
          {
            Icon: Eraser,
            label: "Delete forever",
            action: "delete-forever" as MailAction,
          },
        ]
      : message.folder === "trash"
        ? [
            {
              Icon: Eraser,
              label: "Delete forever",
              action: "delete-forever" as MailAction,
            },
          ]
        : [
            {
              Icon: ShieldAlert,
              label: "Mark as spam",
              action: "spam" as MailAction,
            },
            { Icon: Trash2, label: "Delete", action: "trash" as MailAction },
          ]),
    { Icon: Clock, label: "Snooze", action: "snooze" },
    { Icon: Archive, label: "Archive", action: "archive" },
    { Icon: Folder, label: "Move", action: "move" },
    { Icon: Tag, label: "Label", action: "label" },
    { Icon: Star, label: "Star", action: "star" },
    {
      Icon: message.unread ? MailOpen : Mail,
      label: message.unread ? "Mark as read" : "Mark as unread",
      action: "toggle-read",
    },
  ];

  return (
    <section className="reader">
      <div className="reader-toolbar">
        {onBack && (
          <button
            type="button"
            className="reader-back"
            onClick={onBack}
            aria-label="Back to inbox"
          >
            <ArrowLeft size={15} strokeWidth={1.75} />
            Inbox
          </button>
        )}
        {toolbar.map(({ Icon, label, action }) => (
          <button
            key={label}
            type="button"
            className="icon-btn"
            aria-label={label}
            title={label}
            onClick={(e) => {
              if (
                action === "snooze" ||
                action === "label" ||
                action === "move"
              ) {
                const rect = (
                  e.currentTarget as HTMLButtonElement
                ).getBoundingClientRect();
                setMenu({
                  x: rect.left,
                  y: rect.bottom + 4,
                  panel: action,
                });
                return;
              }
              if (action) onAction(action);
            }}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        ))}
        <button
          type="button"
          className="icon-btn"
          aria-label="More"
          title="More"
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLButtonElement
            ).getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
        {showAi && (
          <>
            <div className="toolbar-spacer" />
            <button
              type="button"
              className="pill-btn"
              data-ask-trigger="true"
              onClick={onAsk}
              title="Ask AI about this mail"
            >
              <Sparkles size={13} strokeWidth={1.75} />
              Ask AI
            </button>
          </>
        )}
      </div>

      {menu && (
        <MessageActionMenu
          message={message}
          x={menu.x}
          y={menu.y}
          initialPanel={menu.panel}
          labels={labels}
          customFolders={customFolders}
          showAi={showAi}
          onClose={() => setMenu(null)}
          onCreateLabel={(name, color) => {
            onCreateLabel(name, color);
            setMenu(null);
          }}
          onCreateFolder={onCreateFolder}
          onAction={(action, detail) => {
            onAction(action, detail);
            setMenu(null);
          }}
        />
      )}

      {/* Pin outside the scrollport so HTML iframes cannot paint through sticky. */}
      {stickySubject && (
        <div className="reader-subject-row pinned">
          <h1 className="reader-subject">{message.subject}</h1>
          {unsubscribeBtn}
        </div>
      )}

      <div className="reader-scroll fade-up-delay" key={message.id}>
        <div className="reader-meta-row">
          <span className="thread-count">
            {message.thread.length}{" "}
            {message.thread.length === 1 ? "message" : "messages"}
          </span>
        </div>
        {!stickySubject && (
          <div className="reader-subject-row">
            <h1 className="reader-subject">{message.subject}</h1>
            {unsubscribeBtn}
          </div>
        )}

        {openTrack && openSummary && (
          <div className="open-track-banner" role="status">
            <div className="open-track-copy">
              <DeliveryTicks tracking={openTrack} size={16} />
              <div>
                <strong>{openSummary.title}</strong>
                <span>{openSummary.detail}</span>
              </div>
            </div>
          </div>
        )}

        <div className="thread">
          {(conversationView
            ? message.thread
            : message.thread.slice(-1)
          ).map((tm, idx, arr) => (
            <ThreadMessageView
              key={tm.id}
              message={tm}
              defaultExpanded={idx === arr.length - 1}
              forceDarkHtml={forceDarkHtml}
              showAi={showAi}
              remoteImagePolicy={prefs.remoteImagePolicy}
              trustedImageSenders={prefs.trustedImageSenders}
              onTrustImageSender={(email) => {
                const normalized = email.trim().toLowerCase();
                if (!normalized.includes("@")) return;
                if (
                  prefs.trustedImageSenders.some(
                    (s) => s.trim().toLowerCase() === normalized,
                  )
                ) {
                  return;
                }
                onUpdatePrefs({
                  ...prefs,
                  remoteImagePolicy: "trusted",
                  trustedImageSenders: [
                    ...prefs.trustedImageSenders,
                    normalized,
                  ],
                });
                onToast(`Images will load from ${normalized}`);
              }}
              onComposeTo={onComposeTo}
              onSummarize={() => void runSummarize()}
              onTranslate={() => void runTranslate()}
            />
          ))}
        </div>

        {links.length > 0 && (
          <div className="reader-links" aria-label="Links in this thread">
            <span className="reader-links-label">Links</span>
            {links.map((link) => (
              <a
                key={link.href}
                className="reader-link-row"
                href={link.href}
                target="_blank"
                rel="noreferrer"
                title={link.href}
              >
                <Link2 size={14} strokeWidth={1.75} />
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="reply-dock">
        <div
          className={`reply-box${recipientsOpen ? " recipients-open" : ""}`}
          onFocusCapture={() => setRecipientsOpen(true)}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            if (!draft.trim()) setRecipientsOpen(false);
          }}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            if (key === "z" && !e.shiftKey) {
              if (undoReply()) {
                e.preventDefault();
                e.stopPropagation();
              }
              return;
            }
            if ((key === "z" && e.shiftKey) || key === "y") {
              if (redoReply()) {
                e.preventDefault();
                e.stopPropagation();
              }
            }
          }}
        >
          {recipientsOpen ? (
            <div className="reply-recipients">
              <div className="reply-meta-bar">
                <div className="reply-from-compact">
                  <span className="reply-from-prefix">From</span>
                  <AppSelect
                    compact
                    ariaLabel="Send reply from account"
                    value={replyFrom.id}
                    onChange={(id) => {
                      setFromId(id);
                      setReplySendPhase("idle");
                    }}
                    options={sendable.map((a) => ({
                      id: a.id,
                      label: a.name,
                      detail: a.loggedOut ? `${a.email} · Logged out` : a.email,
                      leading: (
                        <span
                          className="account-chip"
                          style={{
                            background: "transparent",
                            color: a.color,
                            borderColor: a.color,
                            opacity: a.loggedOut ? 0.55 : 1,
                          }}
                        >
                          {a.label}
                        </span>
                      ),
                    }))}
                  />
                </div>
                <div className="reply-meta-toggles">
                  <button
                    type="button"
                    className={`reply-meta-toggle${showCc ? " active" : ""}`}
                    aria-pressed={showCc}
                    onClick={() => setShowCc((v) => !v)}
                  >
                    Cc
                    {ccMentions.length > 0 ? (
                      <span className="reply-meta-count">{ccMentions.length}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`reply-meta-toggle${showBcc ? " active" : ""}`}
                    aria-pressed={showBcc}
                    onClick={() => setShowBcc((v) => !v)}
                  >
                    Bcc
                    {bccMentions.length > 0 ? (
                      <span className="reply-meta-count">{bccMentions.length}</span>
                    ) : null}
                  </button>
                </div>
              </div>
              <RecipientChips
                label="To"
                people={toMentions}
                excludeEmails={replyExcludeEmails}
                onRemove={(email) =>
                  setToTracked(
                    toMentions.filter(
                      (p) => p.email.toLowerCase() !== email.toLowerCase(),
                    ),
                  )
                }
                onAdd={(r) => {
                  if (
                    replyExcludeEmails.some(
                      (e) => e.toLowerCase() === r.email.toLowerCase(),
                    )
                  ) {
                    return;
                  }
                  setToTracked([...toMentions, r]);
                }}
                placeholder="To email…"
              />
              {showCc && (
                <RecipientChips
                  label="Cc"
                  people={ccMentions}
                  excludeEmails={replyExcludeEmails}
                  onRemove={(email) =>
                    setCcTracked(
                      ccMentions.filter(
                        (p) => p.email.toLowerCase() !== email.toLowerCase(),
                      ),
                    )
                  }
                  onAdd={(r) => {
                    if (
                      replyExcludeEmails.some(
                        (e) => e.toLowerCase() === r.email.toLowerCase(),
                      )
                    ) {
                      return;
                    }
                    setCcTracked([...ccMentions, r]);
                  }}
                  placeholder="Cc email…"
                />
              )}
              {showBcc && (
                <RecipientChips
                  label="Bcc"
                  people={bccMentions}
                  excludeEmails={replyExcludeEmails}
                  onRemove={(email) =>
                    setBccTracked(
                      bccMentions.filter(
                        (p) => p.email.toLowerCase() !== email.toLowerCase(),
                      ),
                    )
                  }
                  onAdd={(r) => {
                    if (
                      replyExcludeEmails.some(
                        (e) => e.toLowerCase() === r.email.toLowerCase(),
                      )
                    ) {
                      return;
                    }
                    setBccTracked([...bccMentions, r]);
                  }}
                  placeholder="Bcc email…"
                />
              )}
            </div>
          ) : null}
          <div className="reply-input-stack">
            {ghostSuffix != null && prediction && (
              <div className="reply-ghost" aria-hidden>
                <span className="reply-ghost-typed">{draft}</span>
                <span className="reply-ghost-rest">{ghostSuffix}</span>
              </div>
            )}
            <MentionTextarea
              textareaRef={replyRef}
              placeholder={
                ghostSuffix != null
                  ? ""
                  : toMentions.length > 1 || ccMentions.length > 0
                    ? "Reply all… Type @ to Cc someone"
                    : `Reply to ${toMentions[0]?.name || message.from}… Type @ to Cc someone`
              }
              value={draft}
              onChange={setDraftTracked}
              onMention={addCcMention}
              excludeEmails={replyExcludeEmails}
              aria-autocomplete={predictions.length ? "both" : undefined}
              aria-description={
                predictions.length
                  ? "Press Tab or 1–2 to accept a suggested reply. Ctrl+Z to undo."
                  : undefined
              }
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.shiftKey && ghostSuffix != null) {
                  e.preventDefault();
                  acceptPrediction(0);
                  return;
                }
                if (
                  !e.ctrlKey &&
                  !e.metaKey &&
                  !e.altKey &&
                  (e.key === "1" || e.key === "2")
                ) {
                  const idx = Number(e.key) - 1;
                  const text = predictions[idx];
                  if (!text) return;
                  const q = draft.toLowerCase();
                  if (q && !text.toLowerCase().startsWith(q)) return;
                  e.preventDefault();
                  acceptPrediction(idx);
                }
              }}
            />
          </div>
          {replyNote && predictions.length === 0 && (
            <p className="reply-ai-note">{replyNote}</p>
          )}
          {predictions.length > 0 && (
            <div className="reply-suggests" role="listbox" aria-label="Reply suggestions">
              {predictions.map((text, i) => (
                <button
                  key={text}
                  type="button"
                  className="reply-suggest"
                  role="option"
                  onClick={() => acceptPrediction(i)}
                >
                  <kbd className="reply-suggest-key">Tab {i + 1}</kbd>
                  <span className="reply-suggest-text">{text}</span>
                </button>
              ))}
            </div>
          )}
          <div className="reply-actions">
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" className="icon-btn" aria-label="Attach">
                <Paperclip size={15} strokeWidth={1.75} />
              </button>
              {showAi && prefs.aiWriteEnabled && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="AI write"
                  onClick={() => void runAiWrite()}
                >
                  <Sparkles size={15} strokeWidth={1.75} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`send send-${replyFromLoggedOut && replySendPhase === "idle" ? "logged-out" : replySendPhase}`}
              disabled={
                replySendPhase === "sending" ||
                replySendPhase === "sent" ||
                replyFromLoggedOut ||
                (!draft.trim() && replySendPhase === "idle") ||
                (toMentions.length === 0 && replySendPhase === "idle")
              }
              title={
                replyFromLoggedOut
                  ? "This account is logged out — reconnect in Settings"
                  : undefined
              }
              onClick={() => void sendReply()}
            >
              {replySendPhase === "sending" ? (
                <Loader2 size={14} strokeWidth={2.25} className="spin" />
              ) : replySendPhase === "sent" ? (
                <Check size={14} strokeWidth={2.25} />
              ) : replySendPhase === "failed" || replyFromLoggedOut ? (
                <AlertCircle size={14} strokeWidth={2.25} />
              ) : null}
              {replyFromLoggedOut && replySendPhase === "idle"
                ? "Logged out"
                : replySendPhase === "sending"
                  ? "Sending…"
                  : replySendPhase === "sent"
                    ? "Sent"
                    : replySendPhase === "failed"
                      ? "Failed to Send"
                      : "Send"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
  size,
  compose,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  size?: "settings";
  compose?: boolean;
}) {
  const sizeClass =
    size === "settings"
      ? " modal-settings"
      : compose
        ? " modal-wide modal-compose"
        : wide
          ? " modal-wide"
          : "";
  return (
    <div className="modal-root" role="presentation" onClick={onClose}>
      <div
        className={`modal${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ShortcutsCheatSheet({
  pack,
  overrides,
  onClose,
}: {
  pack: ShortcutPackId;
  overrides: Preferences["shortcutOverrides"];
  onClose: () => void;
}) {
  const rows = listShortcuts(pack, overrides ?? {});
  const groups = ["Navigate", "Actions", "Compose", "Jump", "Help"] as const;
  return (
    <div className="modal-root" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide cheat-sheet"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Keyboard shortcuts · {packMeta[pack].name}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="cheat-grid">
          {groups.map((group) => {
            const g = rows.filter((r) => r.group === group);
            if (!g.length) return null;
            return (
              <div key={group}>
                <div className="section-label">{group}</div>
                {g.map((s) => (
                  <div key={s.action} className="settings-row">
                    <strong>{s.label}</strong>
                    <kbd className={`keycap${s.customized ? " custom" : ""}`}>
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p className="modal-note">
          Change packs or remap keys in Settings → Shortcuts. Muscle memory from
          Gmail or Superhuman transfers here.
        </p>
      </div>
    </div>
  );
}

function signatureForAccount(prefs: Preferences, accountId: string) {
  const per = prefs.signaturesByAccount[accountId];
  if (per != null && per.length > 0) return per;
  return prefs.signature;
}

type PendingAttachment = {
  id: string;
  file: File;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function ComposeModal({
  account,
  accounts,
  prefs,
  showAi,
  live,
  initialTo,
  initialSubject = "",
  initialBody = "",
  title = "New message",
  onClose,
  onSent,
  onQueued,
}: {
  account: Account;
  accounts: Account[];
  prefs: Preferences;
  showAi: boolean;
  live: boolean;
  initialTo?: Recipient[];
  initialSubject?: string;
  initialBody?: string;
  title?: string;
  onClose: () => void;
  onSent?: (message: Message) => void;
  onQueued?: (queueId: string, seconds: number) => void;
}) {
  const sendable = accounts.filter((a) => a.id !== UNIFIED_ID);
  const signedIn = sendable.filter((a) => !a.loggedOut);
  const defaultFrom =
    account.id !== UNIFIED_ID && !account.loggedOut
      ? account
      : (signedIn.find((a) => a.id === account.id) ??
        signedIn.find((a) => a.id === "work") ??
        signedIn[0] ??
        sendable[0] ??
        account);
  const [fromId, setFromId] = useState(defaultFrom.id);
  const from = sendable.find((a) => a.id === fromId) ?? defaultFrom;
  const fromLoggedOut = Boolean(from.loggedOut);
  const [to, setTo] = useState<Recipient[]>(() => initialTo ?? []);
  const [cc, setCc] = useState<Recipient[]>([]);
  const [bcc, setBcc] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [sendPhase, setSendPhase] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const composeStateRef = useRef({ to, cc, bcc, subject, body });
  composeStateRef.current = { to, cc, bcc, subject, body };
  const composeHistory = useUndoStack(() => composeStateRef.current);

  const applyComposeState = (next: {
    to: Recipient[];
    cc: Recipient[];
    bcc: Recipient[];
    subject: string;
    body: string;
  }) => {
    setTo(next.to);
    setCc(next.cc);
    setBcc(next.bcc);
    setSubject(next.subject);
    setBody(next.body);
    composeHistory.finishApply();
  };

  const setToTracked = (next: Recipient[]) => {
    composeHistory.push();
    setTo(next);
  };

  const setCcTracked = (next: Recipient[]) => {
    composeHistory.push();
    setCc(next);
    if (next.length) setShowCc(true);
  };

  const setBccTracked = (next: Recipient[]) => {
    composeHistory.push();
    setBcc(next);
    if (next.length) setShowBcc(true);
  };

  const setSubjectTracked = (next: string) => {
    if (next === subject) return;
    composeHistory.push();
    setSubject(next);
  };

  const setBodyTracked = (next: string) => {
    if (next === body) return;
    composeHistory.push();
    setBody(next);
  };

  const composeExclude = [
    from.email,
    ...to.map((p) => p.email),
    ...cc.map((p) => p.email),
    ...bcc.map((p) => p.email),
  ];

  const undoCompose = () => {
    const prev = composeHistory.undo();
    if (!prev) return false;
    applyComposeState(prev);
    return true;
  };

  const redoCompose = () => {
    const next = composeHistory.redo();
    if (!next) return false;
    applyComposeState(next);
    return true;
  };

  const signature = signatureForAccount(prefs, from.id);
  const signatureHtml = looksLikeHtml(signature);
  const sigLines = signatureHtml
    ? []
    : signature.split("\n").map((l) => l.trim()).filter(Boolean);
  const sigTitle = sigLines[0] ?? from.name;
  const sigDetail = sigLines.slice(1);

  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.size > 0);
    if (!files.length) return;
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        const id = `${file.name}:${file.size}:${file.lastModified}`;
        if (next.some((a) => a.id === id)) continue;
        next.push({ id, file });
      }
      return next;
    });
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (![...e.dataTransfer.types].includes("Files")) return;
    dragDepth.current += 1;
    setDraggingFiles(true);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if ([...e.dataTransfer.types].includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDraggingFiles(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDraggingFiles(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleSend = async () => {
    if (sendPhase === "sending" || sendPhase === "sent") return;
    if (fromLoggedOut) {
      setSendPhase("failed");
      setSendError("This account is logged out — reconnect in Settings.");
      return;
    }
    if (!to.length) {
      setSendPhase("failed");
      setSendError("Add at least one recipient.");
      return;
    }
    setSendPhase("sending");
    setSendError(null);
    try {
      const bodyText = signature.trim()
        ? `${body.replace(/\s+$/, "")}${body.trim() ? "\n\n" : ""}--\n${signature}`
        : body;
      const track = prefs.trackOpens;
      let message: Message;

      if (live) {
        const encoded =
          attachments.length > 0
            ? await Promise.all(
                attachments.map(async (a) => ({
                  filename: a.file.name,
                  contentType: a.file.type || "application/octet-stream",
                  contentBase64: await fileToBase64(a.file),
                  size: a.file.size,
                })),
              )
            : undefined;
        const draftPayload = {
          accountId: from.id,
          to: to.map((r) => r.email),
          cc: cc.length ? cc.map((r) => r.email) : undefined,
          bcc: bcc.length ? bcc.map((r) => r.email) : undefined,
          subject,
          bodyText,
          attachments: encoded,
        };
        const delay = prefs.undoSendSeconds;
        if (delay > 0) {
          const queued = await bridgeSendLater(draftPayload, delay);
          setSendPhase("sent");
          onQueued?.(queued.queueId, delay);
          window.setTimeout(() => onClose(), 700);
          return;
        }
        const dto = await bridgeSendMail(draftPayload);
        message = messageDtoToUi(dto);
      } else {
        // Demo mode: brief delay so Sending → Sent is visible.
        await new Promise((r) => setTimeout(r, 450));
        const id = `local-sent:${Date.now()}`;
        const preview = body.trim().slice(0, 120) || "(no subject)";
        message = {
          id,
          accountId: from.id,
          from: to[0]!.name || to[0]!.email,
          initials: (to[0]!.name || to[0]!.email).slice(0, 2).toUpperCase(),
          avatarColor: from.color,
          email: to[0]!.email,
          subject: subject || "(no subject)",
          preview,
          time: "Just now",
          unread: false,
          important: false,
          folder: "sent",
          hasAttachment: attachments.length > 0,
          attachmentCount: attachments.length || undefined,
          thread: [
            {
              id: `${id}:a`,
              from: from.name,
              initials: from.label.slice(0, 2),
              avatarColor: from.color,
              email: from.email,
              time: "Just now",
              to: [...to],
              body: bodyText.split(/\n+/).filter(Boolean),
            },
          ],
        };
      }

      if (track) {
        message = {
          ...message,
          openTracking: registerTrackedSend({
            messageId: message.id,
            subject: message.subject,
            to: to.map((r) => r.email),
          }),
        };
      }

      setSendPhase("sent");
      onSent?.(message);
      window.setTimeout(() => onClose(), 700);
    } catch (e) {
      setSendPhase("failed");
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };

  const addRecipient = (r: Recipient) => {
    if (
      composeExclude.some((e) => e.toLowerCase() === r.email.toLowerCase())
    ) {
      return;
    }
    setToTracked([...to, r]);
  };

  const addCc = (r: Recipient) => {
    if (
      composeExclude.some((e) => e.toLowerCase() === r.email.toLowerCase())
    ) {
      return;
    }
    setCcTracked([...cc, r]);
  };

  const addBcc = (r: Recipient) => {
    if (
      composeExclude.some((e) => e.toLowerCase() === r.email.toLowerCase())
    ) {
      return;
    }
    setBccTracked([...bcc, r]);
  };

  const addTo = (contact: Contact) => {
    addRecipient({ name: contact.name, email: contact.email });
  };

  return (
    <ModalShell title={title} onClose={onClose} compose>
      <div
        className={`compose-form${draggingFiles ? " drag-over" : ""}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          const key = e.key.toLowerCase();
          if (key === "z" && !e.shiftKey) {
            if (undoCompose()) {
              e.preventDefault();
              e.stopPropagation();
            }
            return;
          }
          if ((key === "z" && e.shiftKey) || key === "y") {
            if (redoCompose()) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
        }}
      >
        {draggingFiles && (
          <div className="compose-drop-overlay" aria-hidden>
            <Paperclip size={22} strokeWidth={1.75} />
            <strong>Drop files to attach</strong>
            <span>Release to add them to this message</span>
          </div>
        )}

        <div className="compose-meta">
          <div className="reply-meta-bar">
            <div className="reply-from-compact">
              <span className="reply-from-prefix">From</span>
              <AppSelect
                compact
                ariaLabel="Send from account"
                value={from.id}
                onChange={(id) => {
                  setFromId(id);
                  setSendPhase("idle");
                  setSendError(null);
                }}
                options={sendable.map((a) => ({
                  id: a.id,
                  label: a.name,
                  detail: a.loggedOut ? `${a.email} · Logged out` : a.email,
                  leading: (
                    <span
                      className="account-chip"
                      style={{
                        background: "transparent",
                        color: a.color,
                        borderColor: a.color,
                        opacity: a.loggedOut ? 0.55 : 1,
                      }}
                    >
                      {a.label}
                    </span>
                  ),
                }))}
              />
            </div>
            <div className="reply-meta-toggles">
              <button
                type="button"
                className={`reply-meta-toggle${showCc ? " active" : ""}`}
                aria-pressed={showCc}
                onClick={() => setShowCc((v) => !v)}
              >
                Cc
                {cc.length > 0 ? (
                  <span className="reply-meta-count">{cc.length}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={`reply-meta-toggle${showBcc ? " active" : ""}`}
                aria-pressed={showBcc}
                onClick={() => setShowBcc((v) => !v)}
              >
                Bcc
                {bcc.length > 0 ? (
                  <span className="reply-meta-count">{bcc.length}</span>
                ) : null}
              </button>
            </div>
          </div>

          <RecipientChips
            label="To"
            people={to}
            excludeEmails={composeExclude}
            onRemove={(email) =>
              setToTracked(
                to.filter(
                  (p) => p.email.toLowerCase() !== email.toLowerCase(),
                ),
              )
            }
            onAdd={addRecipient}
            placeholder="Name or email"
          />
          {showCc && (
            <RecipientChips
              label="Cc"
              people={cc}
              excludeEmails={composeExclude}
              onRemove={(email) =>
                setCcTracked(
                  cc.filter(
                    (p) => p.email.toLowerCase() !== email.toLowerCase(),
                  ),
                )
              }
              onAdd={addCc}
              placeholder="Cc email…"
            />
          )}
          {showBcc && (
            <RecipientChips
              label="Bcc"
              people={bcc}
              excludeEmails={composeExclude}
              onRemove={(email) =>
                setBccTracked(
                  bcc.filter(
                    (p) => p.email.toLowerCase() !== email.toLowerCase(),
                  ),
                )
              }
              onAdd={addBcc}
              placeholder="Bcc email…"
            />
          )}

          <div className="compose-field">
            <span className="compose-field-label">Subject</span>
            <input
              className="compose-subject"
              placeholder="What’s this about?"
              value={subject}
              onChange={(e) => setSubjectTracked(e.target.value)}
            />
          </div>
        </div>

        <div className="compose-editor">
          <MentionTextarea
            className="compose-body"
            rows={9}
            autoFocus
            placeholder="Write your message… Type @ to add someone — or drop files to attach"
            value={body}
            onChange={setBodyTracked}
            onMention={addTo}
            excludeEmails={composeExclude}
          />
          {signature.trim() && (
            <aside
              className={`compose-signature${signatureHtml ? " html" : ""}`}
            >
              {!signatureHtml && (
                <div
                  className="compose-signature-rail"
                  style={{ background: from.color }}
                  aria-hidden
                />
              )}
              <div className="compose-signature-body">
                <span className="compose-signature-kicker">
                  Intray signature · {from.email}
                </span>
                {signatureHtml ? (
                  <div
                    className="signature-html"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeSignatureHtml(signature),
                    }}
                  />
                ) : (
                  <>
                    <strong>{sigTitle}</strong>
                    {sigDetail.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </>
                )}
              </div>
              {!signatureHtml && (
                <span
                  className="account-chip compose-signature-chip"
                  style={{
                    background: "transparent",
                    color: from.color,
                    borderColor: from.color,
                  }}
                >
                  {from.label}
                </span>
              )}
            </aside>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="compose-attachments" aria-label="Attachments">
            {attachments.map((a) => (
              <div key={a.id} className="compose-attach-chip">
                <span className="compose-attach-icon" aria-hidden>
                  <Paperclip size={13} strokeWidth={2} />
                </span>
                <div className="compose-attach-meta">
                  <strong title={a.file.name}>{a.file.name}</strong>
                  <span>{formatFileSize(a.file.size)}</span>
                </div>
                <button
                  type="button"
                  className="compose-attach-remove"
                  aria-label={`Remove ${a.file.name}`}
                  onClick={() =>
                    setAttachments((prev) =>
                      prev.filter((item) => item.id !== a.id),
                    )
                  }
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="compose-actions">
          <div className="compose-actions-left">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} strokeWidth={1.75} />
            </button>
            {showAi && (
              <button type="button" className="icon-btn" aria-label="AI write">
                <Sparkles size={15} strokeWidth={1.75} />
              </button>
            )}
            {attachments.length > 0 && (
              <span className="compose-attach-count">
                {attachments.length} file{attachments.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="compose-actions-right">
            {prefs.trackOpens && (
              <span className="compose-track-hint" title="Open tracking on">
                <CheckCheck size={13} strokeWidth={2.25} />
                Track opens
              </span>
            )}
            {sendError && (
              <span className="add-account-error" style={{ marginRight: 8 }}>
                {sendError}
              </span>
            )}
            <button type="button" className="pill-btn" onClick={onClose}>
              Discard
            </button>
            <button
              type="button"
              className={`send send-${fromLoggedOut && sendPhase === "idle" ? "logged-out" : sendPhase}`}
              onClick={() => void handleSend()}
              disabled={
                sendPhase === "sending" ||
                sendPhase === "sent" ||
                fromLoggedOut
              }
              title={
                fromLoggedOut
                  ? "This account is logged out — reconnect in Settings"
                  : undefined
              }
            >
              {sendPhase === "sending" ? (
                <Loader2 size={14} strokeWidth={2.25} className="spin" />
              ) : sendPhase === "sent" ? (
                <Check size={14} strokeWidth={2.25} />
              ) : sendPhase === "failed" || fromLoggedOut ? (
                <AlertCircle size={14} strokeWidth={2.25} />
              ) : (
                <Check size={14} strokeWidth={2.25} />
              )}
              {fromLoggedOut && sendPhase === "idle"
                ? "Logged out"
                : sendPhase === "sending"
                  ? "Sending…"
                  : sendPhase === "sent"
                    ? "Sent"
                    : sendPhase === "failed"
                      ? "Failed to Send"
                      : "Send"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

const PANE_KEY = "intray.pane-widths.v1";

function loadPaneWidths(): { sidebar: number; list: number } {
  try {
    const raw = localStorage.getItem(PANE_KEY);
    if (!raw) return { sidebar: 232, list: 340 };
    const parsed = JSON.parse(raw) as { sidebar?: number; list?: number };
    return {
      sidebar: snapSidebarWidth(parsed.sidebar ?? 232),
      list: Math.min(Math.max(parsed.list ?? 340, 240), 560),
    };
  } catch {
    return { sidebar: 232, list: 340 };
  }
}

export default function App() {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    resolvedTheme(loadPreferences().theme),
  );
  const [paneWidths, setPaneWidths] = useState(loadPaneWidths);
  const paneDrag = useRef<{
    key: "sidebar" | "list";
    startX: number;
    startW: number;
  } | null>(null);
  const [live, setLive] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>(() =>
    seedAccounts.map((a) => ({ ...a })),
  );
  const [labels, setLabels] = useState<Label[]>(() =>
    seedLabels.map((l) => ({ ...l })),
  );
  const [customFolders, setCustomFolders] = useState<string[]>(() =>
    loadCustomFolders(),
  );
  const [mail, setMail] = useState<Message[]>(() =>
    seedMessages.map((m) => ({ ...m })),
  );
  const [accountId, setAccountId] = useState(UNIFIED_ID);
  const [folderId, setFolderId] = useState("inbox");
  const [filter, setFilter] = useState<Filter>("all");
  const [stackView, setStackView] = useState<"list" | "reader">("list");
  const [selectedId, setSelectedId] = useState(seedMessages[0].id);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const checkAnchorRef = useRef<number | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [catchUp, setCatchUp] = useState<{
    busy: boolean;
    text: string | null;
    error: string | null;
  }>({ busy: false, text: null, error: null });
  const [askFocusThread, setAskFocusThread] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const unreadMail = seedMessages
      .filter((m) => m.unread && m.folder === "inbox")
      .slice(0, 4)
      .map((m) => ({
        id: `mail-${m.id}`,
        kind: "mail" as const,
        title: m.from,
        body: m.subject,
        time: m.time,
        unread: true,
        messageId: m.id,
      }));
    return [
      {
        id: "meeting-1",
        kind: "meeting",
        title: meeting.title,
        body: "Starting now — join from the tray or calendar",
        time: "now",
        unread: true,
      },
      ...unreadMail,
    ];
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pluginInviteOpen, setPluginInviteOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<{
    to?: Recipient[];
    subject?: string;
    body?: string;
    title?: string;
  }>({});
  const [replyIntent, setReplyIntent] = useState<{
    key: number;
    mode: ReplyMode;
  }>({ key: 0, mode: "reply" });
  const [searchTokens, setSearchTokens] = useState<SearchToken[]>([]);
  const searchQuery = useMemo(
    () => serializeSearch(searchTokens),
    [searchTokens],
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const openCompose = (opts?: {
    to?: Recipient[];
    subject?: string;
    body?: string;
    title?: string;
  }) => {
    setComposeDraft({
      to: opts?.to?.length ? opts.to : undefined,
      subject: opts?.subject,
      body: opts?.body,
      title: opts?.title,
    });
    setComposeOpen(true);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setComposeDraft({});
  };
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [reauthAccount, setReauthAccount] = useState<Account | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !isOnboardingComplete(),
  );
  const [onboardingAccountLinked, setOnboardingAccountLinked] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [alert, setAlert] = useState<AlertRequest | null>(null);
  const alertResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [chord, setChord] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const lastActionRef = useRef<
    { id: string; snapshot: Message }[] | null
  >(null);
  const searchTimer = useRef<number | null>(null);
  const notifiedMeetingRef = useRef(false);

  const clearChecks = () => {
    setCheckedIds(new Set());
    checkAnchorRef.current = null;
  };

  const askConfirm = (req: Omit<AlertRequest, "id">): Promise<boolean> =>
    new Promise((resolve) => {
      alertResolveRef.current = resolve;
      setAlert({ ...req, id: nextAlertId() });
    });

  const closeAlert = (ok: boolean) => {
    setAlert(null);
    const resolve = alertResolveRef.current;
    alertResolveRef.current = null;
    resolve?.(ok);
  };

  const refreshLiveMail = async (opts?: {
    accountId?: string;
    folder?: string;
    filter?: Filter;
    q?: string;
  }) => {
    const aid = opts?.accountId ?? accountId;
    const requested = opts?.folder ?? folderId;
    const folder = requested.startsWith("label:") ? "inbox" : requested;
    const f = opts?.filter ?? filter;
    const q = opts?.q ?? searchQuery;
    const result = await bridgeListMail({
      accountId: aid === UNIFIED_ID ? "all" : aid,
      folder,
      filter: f,
      limit: 80,
      q: q.trim() || undefined,
    });
    const messages = result.messages.map(messageDtoToUi);
    // listMail returns metadata only — keep hydrated bodies and renderer tags.
    setMail((prev) => {
      const prevById = new Map(prev.map((m) => [m.id, m]));
      return messages.map((m) => {
        const old = prevById.get(m.id);
        if (!old) return m;
        const withTag = { ...m, tag: m.tag ?? old.tag };
        const listHasBody = withTag.thread.some(
          (t) =>
            Boolean(t.bodyHtml) ||
            Boolean(t.body?.some((line) => line && line !== "(No body yet)")),
        );
        if (listHasBody) return withTag;
        const oldHasBody = old.thread.some(
          (t) =>
            Boolean(t.bodyHtml) ||
            Boolean(t.body?.some((line) => line && line !== "(No body yet)")),
        );
        if (!oldHasBody) return withTag;
        return {
          ...withTag,
          thread: old.thread,
          linkCount: old.linkCount,
          attachmentCount: old.attachmentCount,
        };
      });
    });
    setSelectedId((prev) =>
      messages.some((m) => m.id === prev) ? prev : (messages[0]?.id ?? ""),
    );
  };

  const loadLiveWorkspace = async (selectAccountId?: string) => {
    const real = await bridgeAccounts();
    if (!real.length) {
      setLive(false);
      setAccounts(seedAccounts.map((a) => ({ ...a })));
      setMail(seedMessages.map((m) => ({ ...m })));
      setSelectedId(seedMessages[0].id);
      return;
    }
    const uiAccounts: Account[] = [
      {
        id: UNIFIED_ID,
        label: "All",
        name: "Unified Inbox",
        email: "All accounts",
        color: "#ededed",
        unread: real.reduce((n, a) => n + a.unread, 0),
      },
      ...real.map(accountDtoToUi),
    ];
    setLive(true);
    setAccounts(uiAccounts);
    const nextId = selectAccountId ?? UNIFIED_ID;
    setAccountId(nextId);
    setFolderId("inbox");
    setFilter("all");
    setStackView("list");
    try {
      const remoteLabels = await bridgeListLabels();
      if (remoteLabels.length) {
        setLabels(
          remoteLabels.map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
          })),
        );
      }
    } catch {
      /* keep seed labels */
    }
    await refreshLiveMail({
      accountId: nextId,
      folder: "inbox",
      filter: "all",
      q: "",
    });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const has = await bridgeHasRealAccounts();
      if (cancelled) return;
      if (has) {
        // Returning user with accounts — skip first-run even if the flag was cleared.
        if (!isOnboardingComplete()) completeOnboarding();
        setOnboardingOpen(false);
        await loadLiveWorkspace();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return bridgeOnSyncProgress((status) => {
      setSyncStatus(status);
      setSyncing(status.state === "syncing");
      if (
        status.state === "error" &&
        isAuthFailureMessage(status.error) &&
        status.accountId
      ) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === status.accountId ? { ...a, loggedOut: true } : a,
          ),
        );
      }
      if (status.state === "idle" && live) {
        void refreshLiveMail();
        void bridgeAccounts().then((real) => {
          setAccounts((prev) => {
            const mapped = real.map(accountDtoToUi);
            return [
              {
                id: UNIFIED_ID,
                label: "All",
                name: "Unified Inbox",
                email: "All accounts",
                color: "#ededed",
                unread: mapped.reduce((n, a) => n + a.unread, 0),
              },
              ...mapped,
            ];
          });
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, accountId, folderId, filter, searchQuery]);

  useEffect(() => {
    const offFlush = bridgeOnSendFlushed(({ message }) => {
      const ui = messageDtoToUi(message);
      setMail((prev) => {
        const idx = prev.findIndex((m) => m.id === ui.id);
        if (idx === -1) return [ui, ...prev];
        const next = [...prev];
        next[idx] = ui;
        return next;
      });
      showToast("Sent");
    });
    const offSnooze = bridgeOnUnsnoozed(() => {
      if (live) void refreshLiveMail();
      showToast("Snoozed mail returned to inbox");
    });
    const offUpdated = bridgeOnMailUpdated(({ message }) => {
      const ui = messageDtoToUi(message);
      setMail((prev) =>
        prev.map((m) => {
          if (m.id !== ui.id) return m;
          // Keep renderer-assigned tags when the DTO has none yet.
          return { ...ui, tag: ui.tag ?? m.tag };
        }),
      );
    });
    return () => {
      offFlush();
      offSnooze();
      offUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Hydrate bodies when selection changes (click or keyboard). getMail returns
  // as soon as the newest message body is ready; older replies arrive via
  // mail:updated.
  useEffect(() => {
    if (!live || !selectedId) return;
    let cancelled = false;
    void bridgeGetMail(selectedId).then((dto) => {
      if (cancelled || !dto) return;
      const updated = messageDtoToUi(dto);
      setMail((prev) =>
        prev.map((m) => {
          if (m.id !== selectedId) return m;
          return { ...updated, tag: updated.tag ?? m.tag };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [live, selectedId]);

  useEffect(() => {
    if (!live) return;
    void refreshLiveMail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, accountId, folderId, filter]);

  const account = accountFor(accountId, accounts);
  const showAi = prefs.aiBridge !== "none";

  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    savePreferences(next);
    setTheme(resolvedTheme(next.theme));
    if (next.aiBridge === "none") setAskOpen(false);
  };

  useEffect(() => {
    if (!showAi) setAskOpen(false);
  }, [showAi]);

  useEffect(() => {
    if (prefs.layout !== "stack") setStackView("list");
  }, [prefs.layout]);

  useEffect(() => {
    setTheme(resolvedTheme(prefs.theme));
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setTheme(resolvedTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.theme]);

  useEffect(() => {
    // Keep <html data-theme> in sync so portaled menus/popovers inherit tokens.
    document.documentElement.setAttribute("data-theme", theme);
    void bridgeSetChromeTheme(theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [theme]);

  useEffect(() => {
    const accent = accentColors[prefs.accent];
    document.documentElement.style.setProperty("--blue", accent);
    document.documentElement.style.setProperty("--blue-soft", `${accent}33`);
  }, [prefs.accent]);

  useEffect(() => {
    if (!prefs.unifiedInbox && accountId === UNIFIED_ID) {
      setAccountId("work");
    }
  }, [prefs.unifiedInbox, accountId]);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  };

  const mutateLocalMessage = (
    m: Message,
    action: MailAction,
    detail: string | undefined,
    picked: Label | null,
    aiLabel: Label | null,
    forceRead?: boolean | null,
    forceStar?: boolean | null,
  ): Message => {
    switch (action) {
      case "toggle-read": {
        const unread =
          forceRead == null ? !m.unread : !forceRead;
        return { ...m, unread };
      }
      case "star": {
        const next = forceStar == null ? !(m.starred ?? false) : forceStar;
        return { ...m, starred: next, important: next || m.important };
      }
      case "snooze":
        return {
          ...m,
          folder: "snoozed",
          unread: false,
          time: detail ?? "Snoozed",
        };
      case "archive":
        return { ...m, folder: "archive", unread: false };
      case "trash":
        return { ...m, folder: "trash", unread: false };
      case "spam":
        return { ...m, folder: "junk", unread: false };
      case "not-spam":
        return { ...m, folder: "inbox", unread: true };
      case "delete-forever":
        return m;
      case "move":
        if (!detail) return m;
        return { ...m, folder: detail };
      case "label":
        if (!picked) return m;
        return {
          ...m,
          tag: { label: picked.name, color: picked.color },
        };
      case "clear-label":
        return { ...m, tag: undefined };
      case "auto-label":
        if (!aiLabel) return m;
        return {
          ...m,
          tag: { label: aiLabel.name, color: aiLabel.color },
        };
      default:
        return m;
    }
  };

  const selectNeighborAfterLeave = (messageId: string) => {
    const idx = filtered.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const next = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
    setSelectedId(next?.id ?? "");
  };

  const applyAction = (
    messageId: string,
    action: MailAction,
    detail?: string,
  ) => {
    const target = mail.find((m) => m.id === messageId);
    if (!target) return;

    // Reply / forward are real compose flows — not toast-only stubs.
    if (action === "reply" || action === "reply-all") {
      setAskOpen(false);
      setAskFocusThread(false);
      setSelectedId(messageId);
      if (prefs.layout === "stack") setStackView("reader");
      setReplyIntent((prev) => ({
        key: prev.key + 1,
        mode: action === "reply-all" ? "reply-all" : "reply",
      }));
      return;
    }
    if (action === "forward") {
      setAskOpen(false);
      setAskFocusThread(false);
      setSelectedId(messageId);
      if (prefs.layout === "stack") setStackView("reader");
      const draft = forwardDraft(target);
      openCompose({
        subject: draft.subject,
        body: draft.body,
        title: "Forward",
      });
      return;
    }

    if (action === "auto-label") {
      if (prefs.aiBridge === "none") {
        showToast("Pick an AI provider in Settings");
        return;
      }
      showToast("Asking your provider for a label…");
      void aiLabelMessages(prefs, [target], labels)
        .then((assigned) => {
          const lab = assigned[0];
          if (!lab) {
            showToast("No matching label for this email");
            return;
          }
          lastActionRef.current = [{ id: messageId, snapshot: { ...target } }];
          setMail((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, tag: { label: lab.name, color: lab.color } }
                : m,
            ),
          );
          if (live) {
            void bridgeMutateMail(messageId, "label", { detail: lab.id });
          }
          showToast(`Labeled “${lab.name}”`);
        })
        .catch((error: unknown) => {
          showToast(error instanceof Error ? error.message : "Auto-label failed");
        });
      return;
    }

    lastActionRef.current = [{ id: messageId, snapshot: { ...target } }];

    const picked =
      action === "label" && detail
        ? labels.find((l) => l.id === detail) ?? null
        : null;

    if (live) {
      const remote =
        action === "archive"
          ? "archive"
          : action === "trash"
            ? "trash"
            : action === "spam"
              ? "spam"
              : action === "not-spam"
                ? "not-spam"
                : action === "delete-forever"
                  ? "delete-forever"
                  : action === "toggle-read"
                    ? target.unread
                      ? "read"
                      : "unread"
                    : action === "star"
                      ? target.starred
                        ? "unstar"
                        : "star"
                      : action === "snooze"
                        ? "snooze"
                        : action === "label"
                          ? "label"
                          : action === "clear-label"
                            ? "clear-label"
                            : action === "move"
                              ? "move"
                              : null;
      if (remote) {
        void bridgeMutateMail(messageId, remote, {
          detail:
            action === "snooze" || action === "label" || action === "move"
              ? detail
              : undefined,
        }).then((dto) => {
          if (action === "delete-forever") {
            setMail((prev) => prev.filter((m) => m.id !== messageId));
            return;
          }
          if (!dto) return;
          const updated = messageDtoToUi(dto);
          setMail((prev) =>
            prev.map((m) => (m.id === messageId ? updated : m)),
          );
        });
      }
    }

    if (leavesCurrentFolder(action)) {
      selectNeighborAfterLeave(messageId);
    }

    if (action === "delete-forever") {
      setMail((prev) => prev.filter((m) => m.id !== messageId));
    } else {
      setMail((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? mutateLocalMessage(m, action, detail, picked, null)
            : m,
        ),
      );
    }

    const toastFor = (): string => {
      switch (action) {
        case "toggle-read":
          return target.unread ? "Marked as read" : "Marked as unread";
        case "star":
          return target.starred
            ? `Unstarred “${target.subject}”`
            : `Starred “${target.subject}”`;
        case "snooze":
          return `Snoozed until ${detail ?? "later"}`;
        case "archive":
          return "Archived";
        case "trash":
          return "Moved to Trash";
        case "spam":
          return "Marked as spam · moved to Junk";
        case "not-spam":
          return "Marked as not spam · moved to Inbox";
        case "delete-forever":
          return "Deleted forever";
        case "move": {
          if (!detail) return "Pick a folder";
          const system = folders.find((f) => f.id === detail);
          return `Moved to ${system?.name ?? detail}`;
        }
        case "label":
          return picked
            ? `Labeled “${picked.name}”`
            : "Pick a label";
        case "clear-label":
          return "Label removed";
        default:
          return "";
      }
    };
    const toast = toastFor();
    if (toast) showToast(toast);
  };

  const applyBulkAction = (action: MailAction, detail?: string) => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;

    const targets = mail.filter((m) => checkedIds.has(m.id));
    if (targets.length === 0) return;

    lastActionRef.current = targets.map((m) => ({
      id: m.id,
      snapshot: { ...m },
    }));

    const picked =
      action === "label" && detail
        ? labels.find((l) => l.id === detail) ?? null
        : null;

    // Align toggles across the set: any unread → mark all read; any unstarred → star all.
    const forceRead =
      action === "toggle-read"
        ? targets.some((m) => m.unread)
          ? true
          : false
        : null;
    const forceStar =
      action === "star"
        ? targets.some((m) => !m.starred)
          ? true
          : false
        : null;

    if (live) {
      for (const target of targets) {
        const remote =
          action === "archive"
            ? "archive"
            : action === "trash"
              ? "trash"
              : action === "spam"
                ? "spam"
                : action === "not-spam"
                  ? "not-spam"
                  : action === "delete-forever"
                    ? "delete-forever"
                    : action === "toggle-read"
                      ? forceRead
                        ? "read"
                        : "unread"
                      : action === "star"
                        ? forceStar
                          ? "star"
                          : "unstar"
                        : action === "move"
                          ? "move"
                          : action === "label"
                            ? "label"
                            : action === "clear-label"
                              ? "clear-label"
                              : action === "snooze"
                                ? "snooze"
                                : null;
        if (!remote) continue;
        void bridgeMutateMail(target.id, remote, {
          detail:
            action === "snooze" || action === "label" || action === "move"
              ? detail
              : undefined,
        }).then((dto) => {
          if (action === "delete-forever") {
            setMail((prev) => prev.filter((m) => m.id !== target.id));
            return;
          }
          if (!dto) return;
          const updated = messageDtoToUi(dto);
          setMail((prev) =>
            prev.map((m) => (m.id === target.id ? updated : m)),
          );
        });
      }
    }

    const idSet = new Set(ids);
    if (action === "delete-forever") {
      setMail((prev) => prev.filter((m) => !idSet.has(m.id)));
      if (idSet.has(selectedId)) setSelectedId("");
    } else {
      setMail((prev) =>
        prev.map((m) =>
          idSet.has(m.id)
            ? mutateLocalMessage(
                m,
                action,
                detail,
                picked,
                null,
                forceRead,
                forceStar,
              )
            : m,
        ),
      );
    }

    const n = targets.length;
    const plural = n === 1 ? "" : "s";
    const toastFor = (): string => {
      switch (action) {
        case "toggle-read":
          return forceRead
            ? `Marked ${n} as read`
            : `Marked ${n} as unread`;
        case "star":
          return forceStar ? `Starred ${n}` : `Unstarred ${n}`;
        case "snooze":
          return `Snoozed ${n} until ${detail ?? "later"}`;
        case "archive":
          return `Archived ${n} message${plural}`;
        case "trash":
          return `Moved ${n} to Trash`;
        case "spam":
          return `Marked ${n} as spam · Junk`;
        case "not-spam":
          return `Moved ${n} out of Junk`;
        case "delete-forever":
          return `Deleted ${n} forever`;
        case "move": {
          if (!detail) return "Pick a folder";
          const system = folders.find((f) => f.id === detail);
          return `Moved ${n} to ${system?.name ?? detail}`;
        }
        case "label":
          return picked
            ? `Labeled ${n} “${picked.name}”`
            : "Pick a label";
        case "clear-label":
          return `Removed labels from ${n}`;
        default:
          return `Updated ${n} message${plural}`;
      }
    };
    showToast(toastFor());
    clearChecks();
  };

  const confirmDeleteForever = async (count: number, subjects: string[]) => {
    const preview =
      count === 1
        ? `“${subjects[0] || "this message"}”`
        : `${count} messages`;
    return askConfirm({
      title: count === 1 ? "Delete forever?" : `Delete ${count} forever?`,
      tone: "danger",
      confirmLabel: "Delete forever",
      body: (
        <>
          <p>
            Permanently remove {preview}. This cannot be undone.
          </p>
          <ul>
            <li>It will not stay in Junk or Trash</li>
            <li>Connected accounts delete it on the provider too</li>
          </ul>
        </>
      ),
    });
  };

  const requestMailAction = async (
    messageId: string,
    action: MailAction,
    detail?: string,
  ) => {
    if (action === "delete-forever") {
      const target = mail.find((m) => m.id === messageId);
      const ok = await confirmDeleteForever(1, [target?.subject ?? ""]);
      if (!ok) return;
    }
    applyAction(messageId, action, detail);
  };

  const requestBulkAction = async (action: MailAction, detail?: string) => {
    if (action === "delete-forever") {
      const targets = mail.filter((m) => checkedIds.has(m.id));
      if (targets.length === 0) return;
      const ok = await confirmDeleteForever(
        targets.length,
        targets.map((m) => m.subject),
      );
      if (!ok) return;
    }
    applyBulkAction(action, detail);
  };

  const emptyFolder = async (folder: "junk" | "trash") => {
    const targets = mail.filter((m) => {
      if (m.folder !== folder) return false;
      if (accountId !== UNIFIED_ID && m.accountId !== accountId) return false;
      return true;
    });
    if (targets.length === 0) return;
    const label = folder === "junk" ? "Junk" : "Trash";
    const ok = await askConfirm({
      title: `Empty ${label}?`,
      tone: "danger",
      confirmLabel: `Empty ${label}`,
      body: (
        <>
          <p>
            Permanently delete {targets.length} message
            {targets.length === 1 ? "" : "s"} in {label}.
          </p>
          <ul>
            <li>This cannot be undone</li>
            <li>Provider copies are removed when an account is connected</li>
          </ul>
        </>
      ),
    });
    if (!ok) return;
    const ids = new Set(targets.map((t) => t.id));
    lastActionRef.current = targets.map((m) => ({
      id: m.id,
      snapshot: { ...m },
    }));
    if (live) {
      for (const t of targets) {
        void bridgeMutateMail(t.id, "delete-forever");
      }
    }
    setMail((prev) => prev.filter((m) => !ids.has(m.id)));
    if (ids.has(selectedId)) setSelectedId("");
    clearChecks();
    showToast(`Emptied ${label}`);
  };

  const ensureLabel = (
    name: string,
    color: string,
  ): Promise<{ label: Label; created: boolean } | null> => {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve(null);

    const existing = labels.find(
      (l) => l.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return Promise.resolve({ label: existing, created: false });

    const localLabel = (): Label => {
      let id = slugLabelId(trimmed);
      let n = 2;
      while (labels.some((l) => l.id === id)) {
        id = `${slugLabelId(trimmed)}-${n++}`;
      }
      return { id, name: trimmed, color };
    };

    if (live) {
      return bridgeCreateLabel({ name: trimmed, color })
        .then((dto) => ({
          label: { id: dto.id, name: dto.name, color: dto.color },
          created: true,
        }))
        .catch(() => ({ label: localLabel(), created: true }));
    }

    return Promise.resolve({ label: localLabel(), created: true });
  };

  const createFolder = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const systemIds = new Set(folders.map((f) => f.id));
    if (systemIds.has(trimmed.toLowerCase())) {
      showToast(`“${trimmed}” is a system folder`);
      return false;
    }
    if (
      customFolders.some((f) => f.toLowerCase() === trimmed.toLowerCase())
    ) {
      showToast(`Folder “${trimmed}” already exists`);
      return false;
    }

    setCustomFolders((prev) => {
      const next = [...prev, trimmed];
      saveCustomFolders(next);
      return next;
    });
    setFolderId(trimmed);
    setFilter("all");
    setStackView("list");
    clearChecks();
    showToast(`Created folder “${trimmed}”`);
    return true;
  };

  const createLabel = (name: string, color: string) => {
    void ensureLabel(name, color).then((result) => {
      if (!result) return;
      const { label, created } = result;
      if (created) {
        setLabels((prev) =>
          prev.some((l) => l.id === label.id) ? prev : [...prev, label],
        );
      }
      setFolderId(`label:${label.id}`);
      setFilter("all");
      setStackView("list");
      clearChecks();
      showToast(
        created
          ? `Created label “${label.name}”`
          : `Label “${label.name}” already exists`,
      );
    });
  };

  const createLabelForMessage = (
    messageId: string,
    name: string,
    color: string,
  ) => {
    void ensureLabel(name, color).then((result) => {
      if (!result) return;
      const { label, created } = result;
      if (created) {
        setLabels((prev) =>
          prev.some((l) => l.id === label.id) ? prev : [...prev, label],
        );
      }
      const target = mail.find((m) => m.id === messageId);
      if (target) {
        lastActionRef.current = [{ id: messageId, snapshot: { ...target } }];
      }
      setMail((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, tag: { label: label.name, color: label.color } }
            : m,
        ),
      );
      if (live) {
        void bridgeMutateMail(messageId, "label", { detail: label.id });
      }
      showToast(
        created
          ? `Created label “${label.name}”`
          : `Labeled “${label.name}”`,
      );
    });
  };

  const autoLabeledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!prefs.aiAutoLabel || prefs.aiBridge === "none") {
      autoLabeledRef.current = new Set();
      return;
    }
    const pending = mail
      .filter(
        (m) =>
          m.folder === "inbox" && !m.tag && !autoLabeledRef.current.has(m.id),
      )
      .slice(0, 8);
    if (!pending.length) return;
    const inFlight = pending.map((message) => message.id);
    for (const id of inFlight) autoLabeledRef.current.add(id);
    let cancelled = false;
    void aiLabelMessages(prefs, pending, labels)
      .then((assigned) => {
        if (cancelled || !assigned.length) return;
        const byId = new Map(assigned.map((item) => [item.messageId, item]));
        setMail((prev) =>
          prev.map((m) => {
            const lab = byId.get(m.id);
            if (!lab || m.tag) return m;
            return { ...m, tag: { label: lab.name, color: lab.color } };
          }),
        );
        showToast(
          `AI labeled ${assigned.length} email${assigned.length === 1 ? "" : "s"}`,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Allow a later effect pass to retry failed IDs.
        for (const id of inFlight) autoLabeledRef.current.delete(id);
        showToast(
          error instanceof Error ? error.message : "Auto-label failed",
        );
      });
    return () => {
      cancelled = true;
      // Body hydration can re-run this effect; release so labels can retry.
      for (const id of inFlight) autoLabeledRef.current.delete(id);
    };
  }, [
    prefs.aiAutoLabel,
    prefs.aiBridge,
    prefs.aiBridgePath,
    prefs.aiModelHint,
    mail,
    labels,
  ]);

  const undoLast = () => {
    const cancelSend = (
      window as unknown as { __intrayCancelSend?: () => void }
    ).__intrayCancelSend;
    if (cancelSend) {
      cancelSend();
      delete (window as unknown as { __intrayCancelSend?: () => void })
        .__intrayCancelSend;
      return;
    }
    const last = lastActionRef.current;
    if (!last?.length) {
      showToast("Nothing to undo");
      return;
    }
    const byId = new Map(last.map((entry) => [entry.id, entry.snapshot]));
    setMail((prev) =>
      prev.map((m) => byId.get(m.id) ?? m),
    );
    lastActionRef.current = null;
    showToast(last.length > 1 ? `Undone ${last.length} changes` : "Undone");
  };

  const scoped = useMemo(() => {
    return mail.filter((m) => {
      if (accountId !== UNIFIED_ID && m.accountId !== accountId) return false;
      if (folderId.startsWith("label:")) {
        const labelId = folderId.slice("label:".length);
        const label = labels.find((l) => l.id === labelId);
        if (!label) return false;
        return m.tag?.label === label.name;
      }
      if (folderId === "inbox") return m.folder === "inbox";
      return m.folder === folderId;
    });
  }, [mail, accountId, folderId, labels]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of mail) {
      if (accountId !== UNIFIED_ID && m.accountId !== accountId) continue;
      counts[m.folder] = (counts[m.folder] ?? 0) + 1;
    }
    return counts;
  }, [mail, accountId]);

  useEffect(() => {
    void syncTaskbarBadge(prefs, mail);
  }, [prefs, mail]);

  useEffect(() => {
    return bridgeOnNotifyOpen(({ messageId }) => {
      setSelectedId(messageId);
      setFolderId("inbox");
      setStackView("reader");
    });
  }, []);

  useEffect(() => {
    if (notifiedMeetingRef.current) return;
    if (!prefs.notifyDesktop || !prefs.notifyMeetings) return;
    notifiedMeetingRef.current = true;
    const timer = window.setTimeout(() => {
      void notifyMeeting(
        prefs,
        meeting.title,
        "Starting now — join from the tray or calendar",
      );
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [prefs]);

  const filtered = useMemo(() => {
    let list = scoped;
    if (prefs.importantSplit) {
      if (filter === "important") list = list.filter((m) => m.important);
      else if (filter === "other") list = list.filter((m) => !m.important);
    }
    if (searchTokens.length) {
      list = list.filter((m) => messageMatchesSearch(m, searchTokens));
    }
    return list;
  }, [scoped, filter, prefs.importantSplit, searchTokens]);

  const runCatchMeUp = () => {
    if (prefs.aiBridge === "none") {
      showToast("Pick an AI provider in Settings");
      return;
    }
    setCatchUp({ busy: true, text: null, error: null });
    const source = filtered.filter((message) => message.folder === "inbox");
    void aiCatchMeUp(prefs, source.length ? source : filtered)
      .then((text) => setCatchUp({ busy: false, text, error: null }))
      .catch((error: unknown) => {
        setCatchUp({
          busy: false,
          text: null,
          error: error instanceof Error ? error.message : "Catch me up failed",
        });
      });
  };

  const selected =
    filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected && selectedId) setSelectedId("");
  }, [filtered, selected, selectedId]);

  useEffect(() => {
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((m) => m.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of Array.from(prev)) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  useEffect(() => {
    clearChecks();
  }, [accountId, folderId, filter]);

  const toggleCheck = (
    id: string,
    opts: { shiftKey: boolean; additive: boolean },
  ) => {
    const idx = filtered.findIndex((m) => m.id === id);
    if (idx < 0) return;

    if (opts.shiftKey && checkAnchorRef.current != null) {
      const a = Math.min(checkAnchorRef.current, idx);
      const b = Math.max(checkAnchorRef.current, idx);
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (let i = a; i <= b; i++) next.add(filtered[i].id);
        return next;
      });
      return;
    }

    setCheckedIds((prev) => {
      const next = new Set(opts.additive ? prev : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    checkAnchorRef.current = idx;
  };

  const selectAllVisible = () => {
    setCheckedIds(new Set(filtered.map((m) => m.id)));
    checkAnchorRef.current = filtered.length ? 0 : null;
  };

  const runShortcut = (action: ShortcutAction) => {
    const idx = filtered.findIndex((m) => m.id === selected?.id);
    const hasChecks = checkedIds.size > 0;
    switch (action) {
      case "compose":
        openCompose();
        break;
      case "search":
        searchRef.current?.focus();
        break;
      case "askAi":
        if (!showAi) break;
        if (askOpen && !askFocusThread) {
          setAskOpen(false);
          setAskFocusThread(false);
          window.setTimeout(() => {
            document
              .querySelector<HTMLElement>("[data-ask-trigger]")
              ?.focus();
          }, 0);
        } else {
          setAskFocusThread(false);
          setAskOpen(true);
          if (prefs.layout === "stack") setStackView("reader");
        }
        break;
      case "help":
        setCheatOpen(true);
        break;
      case "next":
        if (idx >= 0 && idx < filtered.length - 1) {
          setSelectedId(filtered[idx + 1].id);
          if (prefs.layout === "stack") setStackView("reader");
        }
        break;
      case "prev":
        if (idx > 0) {
          setSelectedId(filtered[idx - 1].id);
          if (prefs.layout === "stack") setStackView("reader");
        }
        break;
      case "open":
        if (selected) {
          if (prefs.layout === "stack") setStackView("reader");
        }
        break;
      case "archive":
        if (hasChecks) applyBulkAction("archive");
        else if (selected) applyAction(selected.id, "archive");
        break;
      case "snooze":
        if (hasChecks) applyBulkAction("snooze", "Tomorrow");
        else if (selected) applyAction(selected.id, "snooze", "Tomorrow");
        break;
      case "trash":
        if (folderId === "junk" || folderId === "trash") {
          if (hasChecks) void requestBulkAction("delete-forever");
          else if (selected) void requestMailAction(selected.id, "delete-forever");
        } else if (hasChecks) applyBulkAction("trash");
        else if (selected) applyAction(selected.id, "trash");
        break;
      case "star":
        if (hasChecks) applyBulkAction("star");
        else if (selected) applyAction(selected.id, "star");
        break;
      case "toggleRead":
        if (hasChecks) applyBulkAction("toggle-read");
        else if (selected) applyAction(selected.id, "toggle-read");
        break;
      case "reply":
        if (selected) applyAction(selected.id, "reply");
        break;
      case "replyAll":
        if (selected) applyAction(selected.id, "reply-all");
        break;
      case "forward":
        if (selected) applyAction(selected.id, "forward");
        break;
      case "undo":
        undoLast();
        break;
      case "goInbox":
        setFolderId("inbox");
        break;
      case "goSnoozed":
        setFolderId("snoozed");
        break;
      case "goSent":
        setFolderId("sent");
        break;
      case "goDrafts":
        setFolderId("drafts");
        break;
      case "select":
        if (selected) {
          toggleCheck(selected.id, { shiftKey: false, additive: true });
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (alert) {
          closeAlert(false);
          return;
        }
        if (onboardingOpen) {
          // Allow closing the nested add-account modal; keep onboarding open.
          if (addAccountOpen) setAddAccountOpen(false);
          return;
        }
        if (checkedIds.size > 0) {
          clearChecks();
          return;
        }
        if (prefs.layout === "stack" && stackView === "reader") {
          setStackView("list");
          return;
        }
        // FloatingAsk owns Escape while open (picker dismiss → close + focus).
        if (askOpen) return;
        setSettingsOpen(false);
        setPluginInviteOpen(false);
        closeCompose();
        setAddAccountOpen(false);
        setCheatOpen(false);
        setChord(null);
        return;
      }

      if (
        alert ||
        onboardingOpen ||
        settingsOpen ||
        pluginInviteOpen ||
        composeOpen ||
        addAccountOpen ||
        cheatOpen
      )
        return;

      const result = resolveShortcut(
        prefs.shortcutPack,
        e,
        chord,
        prefs.shortcutOverrides ?? {},
      );
      if (result.type === "none") {
        if (chord) setChord(null);
        return;
      }
      // While Ask is open, only allow toggling it closed (with focus restore).
      if (askOpen && !(result.type === "action" && result.action === "askAi")) {
        return;
      }
      e.preventDefault();
      if (result.type === "chord") {
        setChord(result.chord);
        window.setTimeout(() => setChord(null), 1200);
        return;
      }
      setChord(null);
      runShortcut(result.action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const listTitle = (() => {
    if (folderId === "inbox") {
      return accountId === UNIFIED_ID ? "Unified Inbox" : "Inbox";
    }
    if (folderId.startsWith("label:")) {
      const labelId = folderId.slice("label:".length);
      return labels.find((l) => l.id === labelId)?.name ?? "Label";
    }
    return (
      folders.find((f) => f.id === folderId)?.name ??
      (customFolders.includes(folderId) ? folderId : "Mail")
    );
  })();

  const showUnifiedChrome = accountId === UNIFIED_ID;

  const accent = accentColors[prefs.accent];
  const readingMax =
    prefs.readingWidth === "narrow"
      ? "560px"
      : prefs.readingWidth === "wide"
        ? "920px"
        : "720px";

  return (
    <div
      className={`app density-${prefs.density} layout-${prefs.layout}${prefs.layout === "stack" ? ` stack-${stackView}` : ""}${prefs.reduceMotion ? " reduce-motion" : ""}`}
      data-theme={theme}
      style={
        {
          "--blue": accent,
          "--blue-soft": `${accent}33`,
          "--font-scale": `${prefs.fontScale / 100}`,
          "--reader-max": readingMax,
          fontSize: `calc(13px * ${prefs.fontScale / 100})`,
        } as CSSProperties
      }
    >
      <TitleBar
        showAi={showAi}
        askOpen={showAi && askOpen && !askFocusThread}
        onAsk={() => {
          if (askOpen && !askFocusThread) {
            setAskOpen(false);
            return;
          }
          setAskFocusThread(false);
          setAskOpen(true);
          if (prefs.layout === "stack") setStackView("reader");
        }}
        searchRef={searchRef}
        searchTokens={searchTokens}
        labels={labels}
        onSearchTokens={(tokens) => {
          setSearchTokens(tokens);
          if (!live) return;
          if (searchTimer.current) window.clearTimeout(searchTimer.current);
          // Bridge gets free-text only; structured chips filter client-side.
          const q = serializeSearch(tokens.filter((t) => t.field === "text"));
          searchTimer.current = window.setTimeout(() => {
            void refreshLiveMail({ q });
          }, 280);
        }}
        notifications={notifications}
        onMarkNotificationsRead={() =>
          setNotifications((prev) =>
            prev.map((n) => ({ ...n, unread: false })),
          )
        }
        onOpenNotification={(n) => {
          if (n.messageId) {
            setSelectedId(n.messageId);
            setFolderId("inbox");
          } else if (n.kind === "ai") {
            setAskFocusThread(false);
            setAskOpen(true);
          }
          setNotifications((prev) =>
            prev.map((item) =>
              item.id === n.id ? { ...item, unread: false } : item,
            ),
          );
        }}
      />
      <div
        className="shell"
        style={
          {
            ["--sidebar" as string]: `${paneWidths.sidebar}px`,
            ["--list" as string]: `${paneWidths.list}px`,
          } as CSSProperties
        }
      >
        <AccountRail
          accounts={accounts}
          activeId={accountId}
          onSelect={(id) => {
            if (!prefs.unifiedInbox && id === UNIFIED_ID) {
              showToast("Enable Unified Inbox in Settings → Inbox");
              return;
            }
            const target = accounts.find((a) => a.id === id);
            if (target?.loggedOut) {
              setReauthAccount(target);
              return;
            }
            setAccountId(id);
            setFolderId("inbox");
            setFilter("all");
            setStackView("list");
            clearChecks();
          }}
          onAdd={() => setAddAccountOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onPlugins={() => setPluginInviteOpen(true)}
        />
        <Sidebar
          account={account}
          activeFolder={folderId}
          customFolders={customFolders}
          labels={labels}
          compact={paneWidths.sidebar < SIDEBAR_EXPANDED_MIN}
          syncLabel={
            syncing
              ? syncStatus?.progress || "Syncing…"
              : syncStatus?.error
                ? "Sync error"
                : live
                  ? syncStatus?.lastSyncAt
                    ? "Synced"
                    : "Live inbox"
                  : "Demo data"
          }
          inboxCount={
            mail.filter(
              (m) =>
                m.folder === "inbox" &&
                (accountId === UNIFIED_ID || m.accountId === accountId),
            ).length
          }
          folderCounts={folderCounts}
          onFolder={setFolderId}
          onCompose={() => openCompose()}
          onEmptyFolder={(folder) => {
            void emptyFolder(folder);
          }}
          onCreateFolder={createFolder}
          onCreateLabel={createLabel}
        />
        {prefs.layout !== "stack" && (
          <button
            type="button"
            className="pane-resizer"
            aria-label="Resize folder pane"
            title="Drag to resize"
            onPointerDown={(e) => {
              e.preventDefault();
              paneDrag.current = {
                key: "sidebar",
                startX: e.clientX,
                startW: paneWidths.sidebar,
              };
              const target = e.currentTarget;
              target.classList.add("dragging");
              const onMove = (ev: PointerEvent) => {
                const drag = paneDrag.current;
                if (!drag || drag.key !== "sidebar") return;
                // Snap live: as soon as labels wouldn't fit, jump to the icon rail.
                const next = snapSidebarWidth(
                  drag.startW + (ev.clientX - drag.startX),
                );
                setPaneWidths((prev) =>
                  prev.sidebar === next ? prev : { ...prev, sidebar: next },
                );
              };
              const onUp = () => {
                target.classList.remove("dragging");
                paneDrag.current = null;
                setPaneWidths((prev) => {
                  const next = {
                    ...prev,
                    sidebar: snapSidebarWidth(prev.sidebar),
                  };
                  localStorage.setItem(PANE_KEY, JSON.stringify(next));
                  return next;
                });
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
          />
        )}
        <MessageList
          items={filtered}
          accounts={accounts}
          selectedId={selected?.id ?? ""}
          checkedIds={checkedIds}
          filter={filter}
          unified={showUnifiedChrome}
          title={listTitle}
          showSplit={prefs.importantSplit}
          showAvatars={prefs.showAvatars}
          showPreviewLines={prefs.showPreviewLines}
          showUnreadBadge={prefs.showUnreadBadgeInList}
          hoverActions={prefs.hoverActions}
          reduceMotion={prefs.reduceMotion}
          labels={labels}
          customFolders={customFolders}
          showAi={showAi}
          catchMeUp={{
            enabled: showAi && prefs.aiCatchMeUp,
            busy: catchUp.busy,
            text: catchUp.text,
            error: catchUp.error,
            onRun: runCatchMeUp,
          }}
          syncing={syncing}
          fullScreen={prefs.layout === "stack"}
          onCompose={() => openCompose()}
          onFilter={(f) => setFilter(f)}
          onRefresh={() => {
            if (!live) {
              showToast("Connect Gmail to sync real mail");
              return;
            }
            setSyncing(true);
            void bridgeSync(
              accountId === UNIFIED_ID ? undefined : accountId,
            )
              .then(() => refreshLiveMail())
              .finally(() => setSyncing(false));
          }}
          onSelect={(id) => {
            clearChecks();
            setSelectedId(id);
            setAskOpen(false);
            if (prefs.layout === "stack") setStackView("reader");
            if (prefs.markReadOnOpen) {
              setMail((prev) =>
                prev.map((m) =>
                  m.id === id && m.unread ? { ...m, unread: false } : m,
                ),
              );
              if (live) void bridgeMutateMail(id, "read");
            }
          }}
          onToggleCheck={toggleCheck}
          onSelectAll={selectAllVisible}
          onClearChecks={clearChecks}
          onBulkAction={(action, detail) => {
            void requestBulkAction(action, detail);
          }}
          onAction={(messageId, action, detail) => {
            void requestMailAction(messageId, action, detail);
          }}
          onCreateLabel={createLabelForMessage}
          onCreateFolder={createFolder}
        />
        {prefs.layout !== "stack" && (
          <button
            type="button"
            className="pane-resizer"
            aria-label="Resize message list"
            title="Drag to resize"
            onPointerDown={(e) => {
              e.preventDefault();
              paneDrag.current = {
                key: "list",
                startX: e.clientX,
                startW: paneWidths.list,
              };
              const target = e.currentTarget;
              target.classList.add("dragging");
              const onMove = (ev: PointerEvent) => {
                const drag = paneDrag.current;
                if (!drag || drag.key !== "list") return;
                const next = Math.min(
                  Math.max(drag.startW + (ev.clientX - drag.startX), 240),
                  560,
                );
                setPaneWidths((prev) => ({ ...prev, list: next }));
              };
              const onUp = () => {
                target.classList.remove("dragging");
                paneDrag.current = null;
                setPaneWidths((prev) => {
                  localStorage.setItem(PANE_KEY, JSON.stringify(prev));
                  return prev;
                });
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
          />
        )}
        <ReadingPane
          message={selected}
          stickySubject={prefs.stickySubject}
          forceDarkHtml={prefs.forceDarkHtml && theme === "dark"}
          conversationView={prefs.conversationView}
          showAi={showAi}
          prefs={prefs}
          live={live}
          account={account}
          accounts={accounts}
          onBack={
            prefs.layout === "stack" ? () => setStackView("list") : undefined
          }
          labels={labels}
          customFolders={customFolders}
          onAsk={() => {
            setAskFocusThread(true);
            setAskOpen(true);
            if (prefs.layout === "stack") setStackView("reader");
          }}
          onAction={(action, snoozeLabel) => {
            if (!selected) return;
            void requestMailAction(selected.id, action, snoozeLabel);
          }}
          onCreateLabel={(name, color) => {
            if (!selected) return;
            createLabelForMessage(selected.id, name, color);
          }}
          onCreateFolder={createFolder}
          onComposeTo={(r) => openCompose({ to: [r] })}
          onToast={showToast}
          onUpdatePrefs={updatePrefs}
          replyIntent={replyIntent}
          onReplySent={(message) => {
            setMail((prev) => {
              const idx = prev.findIndex((m) => m.id === message.id);
              if (idx === -1) return [message, ...prev];
              const next = [...prev];
              next[idx] = message;
              return next;
            });
          }}
        />
      </div>

      {showAi && (
        <FloatingAsk
          open={askOpen}
          onOpenChange={(open, meta) => {
            setAskOpen(open);
            if (!open) {
              setAskFocusThread(false);
              if (meta?.restoreFocus) {
                window.setTimeout(() => {
                  const trigger = document.querySelector<HTMLElement>(
                    "[data-ask-trigger]",
                  );
                  trigger?.focus();
                }, 0);
              }
            }
          }}
          mail={mail}
          labels={labels}
          focusMessage={askFocusThread ? selected : null}
          bridgeName={aiBridgeMeta[prefs.aiBridge]?.name ?? "Local"}
          userName={account.name}
          prefs={prefs}
          onOpenMessage={(id) => {
            setSelectedId(id);
            setFolderId("inbox");
            setAskOpen(false);
            setAskFocusThread(false);
            if (prefs.layout === "stack") setStackView("reader");
          }}
          onOpenSettings={() => {
            setAskOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          prefs={prefs}
          accounts={accounts}
          onChange={updatePrefs}
          onAddAccount={() => {
            setSettingsOpen(false);
            setAddAccountOpen(true);
          }}
          onReconnectAccount={(account) => {
            setSettingsOpen(false);
            setReauthAccount(account);
          }}
          onRemoveAccount={(id) => {
            setAccounts((prev) => prev.filter((a) => a.id !== id));
            setAccountId((cur) => (cur === id ? UNIFIED_ID : cur));
            if (live) {
              void loadLiveWorkspace().then(() => undefined);
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pluginInviteOpen && (
        <PluginInviteModal
          onClose={() => setPluginInviteOpen(false)}
          onAccepted={() =>
            showToast("Invite noted — email hello@intray.app if you need access")
          }
        />
      )}
      {composeOpen && (
        <ComposeModal
          account={account}
          accounts={accounts}
          prefs={prefs}
          showAi={showAi}
          live={live}
          initialTo={composeDraft.to}
          initialSubject={composeDraft.subject}
          initialBody={composeDraft.body}
          title={composeDraft.title}
          onClose={closeCompose}
          onQueued={(queueId, seconds) => {
            showToast(`Sending in ${seconds}s — press Z to undo`);
            const prevUndo = lastActionRef.current;
            lastActionRef.current = [];
            const handle = window.setTimeout(() => undefined, seconds * 1000);
            // Stash cancel on a one-shot undo via toast action pattern
            void handle;
            const cancel = () => {
              void bridgeCancelSend(queueId).then((ok) => {
                showToast(ok ? "Send cancelled" : "Already sent");
              });
            };
            // Reuse undo shortcut: store a synthetic restore that cancels the queue
            lastActionRef.current = prevUndo;
            (
              window as unknown as { __intrayCancelSend?: () => void }
            ).__intrayCancelSend = cancel;
            window.setTimeout(() => {
              const w = window as unknown as {
                __intrayCancelSend?: () => void;
              };
              if (w.__intrayCancelSend === cancel) {
                delete w.__intrayCancelSend;
              }
            }, seconds * 1000 + 500);
          }}
          onSent={(message) => {
            setMail((prev) => {
              const idx = prev.findIndex((m) => m.id === message.id);
              if (idx === -1) return [message, ...prev];
              const next = [...prev];
              next[idx] = message;
              return next;
            });
            setSelectedId(message.id);
            showToast(
              message.openTracking ? "Sent · tracking recorded locally" : "Sent",
            );
          }}
        />
      )}
      {onboardingOpen && (
        <Onboarding
          prefs={prefs}
          onUpdatePrefs={updatePrefs}
          accountLinked={onboardingAccountLinked}
          onRequestAddAccount={() => setAddAccountOpen(true)}
          onComplete={() => setOnboardingOpen(false)}
        />
      )}
      {addAccountOpen && (
        <AddAccountModal
          onClose={() => setAddAccountOpen(false)}
          onAdded={(account, opts) => {
            if (onboardingOpen) setOnboardingAccountLinked(true);
            if (opts?.live) {
              void loadLiveWorkspace(account.id).then(() =>
                showToast(`Added ${account.email}`),
              );
              return;
            }
            setAccounts((prev) => [...prev, account]);
            setAccountId(account.id);
            setFolderId("inbox");
            setFilter("all");
            setStackView("list");
            showToast(`Added ${account.email}`);
          }}
        />
      )}
      {reauthAccount && (
        <ReauthModal
          account={reauthAccount}
          onClose={() => {
            const id = reauthAccount.id;
            setReauthAccount(null);
            setAccountId(id);
            setFolderId("inbox");
            setFilter("all");
            setStackView("list");
            clearChecks();
          }}
          onReconnected={(account) => {
            setReauthAccount(null);
            setAccounts((prev) =>
              prev.map((a) =>
                a.id === account.id
                  ? { ...a, ...account, loggedOut: false }
                  : a,
              ),
            );
            setAccountId(account.id);
            setFolderId("inbox");
            setFilter("all");
            setStackView("list");
            clearChecks();
            if (live) {
              void loadLiveWorkspace(account.id).then(() =>
                showToast(`Reconnected ${account.email}`),
              );
            } else {
              showToast(`Reconnected ${account.email}`);
            }
          }}
        />
      )}
      {cheatOpen && (
        <ShortcutsCheatSheet
          pack={prefs.shortcutPack}
          overrides={prefs.shortcutOverrides}
          onClose={() => setCheatOpen(false)}
        />
      )}

      {chord && <div className="chord-hint">Chord: {chord.toUpperCase()}…</div>}
      <AlertDialog
        alert={alert}
        onConfirm={() => closeAlert(true)}
        onCancel={() => closeAlert(false)}
      />
      {toast && <div className="toast fade-up">{toast}</div>}
    </div>
  );
}
