import {
  useEffect,
  useLayoutEffect,
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
  Download,
  Eraser,
  FileText,
  Folder,
  Forward,
  Inbox,
  Calendar,
  Clapperboard,
  Image as ImageIcon,
  ImageOff,
  Languages,
  Layers,
  Link2,
  ListFilter as ListFilterIcon,
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
  RotateCw,
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
import { AttachmentBar } from "./AttachmentBar";
import { AddAccountModal } from "./AddAccountModal";
import {
  AlertDialog,
  nextAlertId,
  type AlertRequest,
} from "./AlertDialog";
import { PluginModal } from "./PluginModal";
import { PluginSurface } from "./PluginSurface";
import { GoogleCalendarBrand, pluginBrandIcons, SimpleBrandIcon } from "./BrandIcon";
import { PluginInfoPin, PluginReaderActions } from "./PluginMailActions";
import { ReauthModal } from "./ReauthModal";
import {
  FloatingAsk,
  type AgentCatchUpRequest,
  type AgentThreadRequest,
} from "./FloatingAsk";
import { IntrayBrandLockup } from "./IntrayBrand";
import { Onboarding } from "./Onboarding";
import {
  completeOnboarding,
  isOnboardingComplete,
} from "./onboardingStorage";
import {
  buildContacts,
  setContactDirectory,
  type Contact,
} from "./contacts";
import {
  aiFindUnsubscribe,
  looksLikeNewsletter,
  openUnsubscribeTarget,
} from "./newsletter";
import {
  EMPTY_LIST_FILTER,
  listFilterActive,
  listFilterCount,
  messageMatchesListFilter,
  type ListFilter,
  type StatusCounts,
} from "./listFilter";
import { SearchBar, type RecentOpen, type SearchHit } from "./SearchBar";
import { MatchText } from "./SearchHighlight";
import {
  makeToken,
  markQuery,
  messageMatchesSearch,
  parseSearchInput,
  type SearchToken,
} from "./searchQuery";
import {
  UNIFIED_ID,
  accounts as seedAccounts,
  customFolders as seedCustomFolders,
  folders,
  labels as seedLabels,
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
import { BlurredEmails, blurClass, CreatorBlurProvider, useCreatorBlur } from "./creatorBlur";
import { blurEmailsInHtml, looksLikeEmail } from "./creatorMode";
import { useUndoStack } from "./useUndoStack";
import {
  buildSignedBodies,
  looksLikeHtml,
  sanitizeSignatureHtml,
} from "./signatures";
import {
  aiLabelMessages,
  aiSuggestReplies,
  aiSummarizeMessage,
  aiTranslateMessage,
  aiWriteReply,
} from "./aiClient";
import {
  formatMailSummary,
  latestReplyBodyKey,
  threadHasReadableText,
  turnPlainText,
} from "./mailText";
import {
  getTrackingForMessage,
  registerTrackedSend,
  scheduleDemoOpen,
  trackingSummary,
} from "./openTracking";
import {
  accentColors,
  aiBridgeMeta,
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
  shouldShowUpdateProgressCard,
  UpdateProgressCard,
} from "./UpdateProgressCard";
import { updateControl } from "./updateControl";
import { downloadUpdateAsk, restartUpdateAsk } from "../shared/updateAsk";
import {
  accountDtoToUi,
  bridgeAccounts,
  bridgeCancelSend,
  bridgeClaimMailto,
  bridgeCreateLabel,
  bridgeDownloadUpdate,
  bridgeFolderCounts,
  bridgeGetMail,
  bridgeHasRealAccounts,
  bridgeInstallUpdate,
  bridgeOnUpdateAsk,
  bridgeListContacts,
  bridgeListLabels,
  bridgeListMail,
  bridgeLoadOlder,
  bridgeMutateMail,
  bridgeOnAvatarUpdated,
  bridgeOnMailtoOpen,
  bridgeOnNotifyOpen,
  bridgeOnSendFlushed,
  bridgeOnSyncProgress,
  bridgeOnUpdateStatus,
  bridgeOnMailUpdated,
  bridgeOnSearchReady,
  bridgeOnUnsnoozed,
  bridgePluginStatuses,
  bridgeSaveDraft,
  bridgeSendLater,
  bridgeSendMail,
  bridgeSetChromeTheme,
  bridgeSetMailtoHandler,
  bridgeSync,
  bridgeUpdateStatus,
  isAuthFailureMessage,
  messageDtoToUi,
  warmCursorAgent,
} from "./mailApi";
import {
  composeHasContent,
  composeTabLabel,
  localDraftMessage,
  type ComposeSnapshot,
} from "./composeDraft";
import { parseMailto } from "../shared/mailto";
import { mergeSentIntoList, unionThreads } from "./threadMerge";
import {
  badgeCountForMode,
  notifySnoozeReturn,
  syncTaskbarBadge,
} from "./notify";
import {
  PLUGIN_CATALOG,
  type PluginId,
  type PluginStatus,
} from "../shared/plugins";
import type {
  AppUpdateStatus,
  MailFolderCounts,
  SyncStatus,
} from "../shared/types";

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
  const content = (latest ? turnPlainText(latest) : "") || message.preview || "";
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
    for (const identity of a.identities ?? []) {
      const linked = identity.email?.trim().toLowerCase();
      if (linked) set.add(linked);
    }
  }
  // Keep seed addresses so mock / offline still marks "You" correctly.
  for (const email of seedOwnEmails) set.add(email);
  return set;
}

/** One selectable From row per linked address (same mailbox may appear twice). */
type SendIdentityOption = {
  key: string;
  accountId: string;
  email: string;
  name: string;
  label: string;
  color: string;
  loggedOut?: boolean;
};

function sendIdentityKey(accountId: string, email: string): string {
  return `${accountId}::${email.trim().toLowerCase()}`;
}

function sendIdentitiesForAccounts(accounts: Account[]): SendIdentityOption[] {
  const out: SendIdentityOption[] = [];
  for (const a of accounts) {
    if (a.id === UNIFIED_ID) continue;
    const list =
      a.identities && a.identities.length > 0
        ? a.identities
        : [{ id: "primary", email: a.email, name: a.name, primary: true }];
    for (const identity of list) {
      const email = identity.email.trim();
      if (!email) continue;
      out.push({
        key: sendIdentityKey(a.id, email),
        accountId: a.id,
        email,
        name: identity.name?.trim() || a.name,
        label: a.label,
        color: a.color,
        loggedOut: a.loggedOut,
      });
    }
  }
  return out;
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
  const rawEmail = (latest?.email ?? message.email).trim();
  const rawName = (latest?.from ?? message.from).trim();
  // Some payloads only put the address in `from`; still seed a usable To.
  const senderEmail =
    rawEmail ||
    (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawName) ? rawName : "");
  const sender: Recipient = {
    name: rawName || senderEmail.split("@")[0] || "Unknown",
    email: senderEmail,
  };
  const isOwn = (email: string) => own.has(email.trim().toLowerCase());
  const fromSelf = Boolean(sender.email) && isOwn(sender.email);
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
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [avatarUrl]);

  if (avatarUrl && !broken) {
    return (
      <img
        className={`${className} photo`}
        src={avatarUrl}
        alt=""
        title={name}
        draggable={false}
        onError={() => setBroken(true)}
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
  nameBlur,
  addressBlur,
}: {
  recipient: Recipient;
  onCompose: (r: Recipient) => void;
  /** Set when the caller already classified this person (thread sender). */
  nameBlur?: boolean;
  addressBlur?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const blur = useCreatorBlur();
  const kind = blur.kindForEmail(recipient.email);
  const you = isOwnRecipient(recipient);
  const hideName = (nameBlur ?? blur.blurName(kind)) && !you;
  const hideAddress = addressBlur ?? blur.blurAddress(kind);

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
        className={`recipient${you ? " you" : ""}${open ? " open" : ""}${hideName ? " creator-blur" : ""}`}
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
            <span
              className={blurClass("recipient-email static", hideAddress)}
            >
              {recipient.email}
            </span>
          ) : (
            <button
              type="button"
              className={blurClass("recipient-email", hideAddress)}
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
  kind: "snooze" | "opened" | "meeting" | "ai" | "sync" | "update";
  title: string;
  body: string;
  time: string;
  unread?: boolean;
  messageId?: string;
  folderId?: string;
};

const NOTIFICATIONS_KEY = "intray.notifications.v1";
/** Versions whose download question was already answered this session. */
const answeredUpdateDownloads = new Set<string>();
/** Versions already added to the in-app notification list. */
const notedUpdateDownloads = new Set<string>();

function notifTimeLabel(d = new Date()): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function snoozeWhenLabel(time: string): string {
  const trimmed = time.trim().replace(/^Until\s+/i, "");
  return trimmed || "Snoozed";
}

function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is AppNotification =>
          Boolean(item) &&
          typeof item.id === "string" &&
          item.id !== "meeting-1" &&
          (item.kind === "snooze" ||
            item.kind === "opened" ||
            item.kind === "meeting" ||
            item.kind === "ai" ||
            item.kind === "sync" ||
            item.kind === "update"),
      )
      .slice(0, 40);
  } catch {
    return [];
  }
}

/** Keep scheduled follow-ups aligned with messages that are still snoozed. */
function mergeFollowUps(
  prev: AppNotification[],
  snoozed: Message[],
): AppNotification[] {
  const byId = new Map(snoozed.map((message) => [message.id, message]));
  let changed = false;
  const kept = prev.filter((item) => {
    if (item.kind !== "snooze" || item.folderId !== "snoozed" || !item.messageId) {
      return true;
    }
    if (item.unread || byId.has(item.messageId)) return true;
    changed = true;
    return false;
  });
  const known = new Set(kept.map((item) => item.messageId).filter(Boolean));
  const added: AppNotification[] = [];
  for (const message of snoozed) {
    if (known.has(message.id)) continue;
    changed = true;
    added.push({
      id: `followup-${message.id}`,
      kind: "snooze",
      title: "Follow up",
      body: message.subject || "Snoozed message",
      time: snoozeWhenLabel(message.time),
      unread: false,
      messageId: message.id,
      folderId: "snoozed",
    });
  }
  if (!changed) return prev;
  return [...added, ...kept].slice(0, 40);
}

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
            {unread > 0
              ? `${unread} new`
              : items.length > 0
                ? "Snoozes and follow-ups"
                : "You're caught up"}
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
          <div className="notif-empty">
            No follow-ups yet. Snooze a message and it will show up here.
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif-item${n.unread ? " unread" : ""}`}
              onClick={() => onOpen(n)}
            >
              <span className={`notif-kind ${n.kind}`} aria-hidden>
                {n.kind === "snooze" ? (
                  <Clock size={14} strokeWidth={1.75} />
                ) : n.kind === "opened" ? (
                  <MailOpen size={14} strokeWidth={1.75} />
                ) : n.kind === "meeting" ? (
                  <Calendar size={14} strokeWidth={1.75} />
                ) : n.kind === "ai" ? (
                  <Sparkles size={14} strokeWidth={1.75} />
                ) : n.kind === "update" ? (
                  <Download size={14} strokeWidth={1.75} />
                ) : (
                  <RefreshCw size={14} strokeWidth={1.75} />
                )}
              </span>
              <span className="notif-copy">
                <strong>
                  <BlurredEmails text={n.title} />
                </strong>
                <span>
                  <BlurredEmails text={n.body} />
                </span>
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
  searchRef,
  searchTokens,
  onSearchTokens,
  labels,
  notifications,
  onOpenNotification,
  onMarkNotificationsRead,
  onToggleCreator,
  searchHits,
  searchBusy,
  recentSearches,
  recentOpens,
  onOpenHit,
  onQueryChange,
  onPickRecent,
}: {
  searchRef?: RefObject<HTMLInputElement | null>;
  searchTokens: SearchToken[];
  onSearchTokens: (tokens: SearchToken[]) => void;
  labels: Label[];
  notifications: AppNotification[];
  onOpenNotification: (n: AppNotification) => void;
  onMarkNotificationsRead: () => void;
  onToggleCreator: () => void;
  searchHits: SearchHit[];
  searchBusy: boolean;
  recentSearches: string[];
  recentOpens: RecentOpen[];
  onOpenHit: (id: string) => void;
  onQueryChange: (query: string) => void;
  onPickRecent: (query: string) => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const blur = useCreatorBlur();
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
        hits={searchHits}
        hitsLoading={searchBusy}
        recentSearches={recentSearches}
        recentOpens={recentOpens}
        onOpenHit={onOpenHit}
        onQueryChange={onQueryChange}
        onPickRecent={onPickRecent}
      />
      <div className="titlebar-right">
        <button
          type="button"
          className={`icon-btn creator-toggle${blur.enabled ? " active" : ""}`}
          aria-pressed={blur.enabled}
          aria-label={
            blur.enabled
              ? "Creator mode is on. Click to show addresses."
              : "Creator mode. Blur addresses while you record."
          }
          onClick={onToggleCreator}
        >
          <Clapperboard size={15} strokeWidth={1.75} />
        </button>
        <div className="notif-anchor">
          <button
            type="button"
            className={`icon-btn${notifOpen ? " active" : ""}`}
            aria-label="Notifications"
            aria-expanded={notifOpen}
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
  showAgent,
  agentOpen,
  snoozeOpen,
  snoozeCount,
  highlightAccounts,
  onAgent,
  onSnooze,
  onSelect,
  onAdd,
  onSettings,
  onPlugins,
  updateStatus,
  onDownloadUpdate,
  onRestartUpdate,
  plugins,
  activePluginId,
  onOpenPlugin,
}: {
  accounts: Account[];
  activeId: string;
  showAgent: boolean;
  agentOpen: boolean;
  snoozeOpen: boolean;
  snoozeCount: number;
  /** Mailbox highlight stays off while Agent or Snooze is the open section. */
  highlightAccounts: boolean;
  onAgent: () => void;
  onSnooze: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onSettings: () => void;
  onPlugins: () => void;
  updateStatus: AppUpdateStatus;
  onDownloadUpdate: () => void;
  onRestartUpdate: () => void;
  plugins: Array<{ id: PluginId; name: string }>;
  activePluginId: PluginId | null;
  onOpenPlugin: (id: PluginId) => void;
}) {
  const blur = useCreatorBlur();
  const update = updateControl(updateStatus);
  const snoozeLabel =
    snoozeCount > 0 ? `Snoozed, ${snoozeCount}` : "Snoozed";
  return (
    <aside className="rail">
      <div className="rail-section rail-tools">
        {showAgent && (
          <button
            type="button"
            className={`account rail-agent${agentOpen ? " active" : ""}`}
            data-ask-trigger="true"
            aria-label="Agent"
            title="Agent"
            aria-pressed={agentOpen}
            onClick={onAgent}
          >
            <span className="account-face rail-agent-face">
              <Bot size={15} strokeWidth={1.75} />
            </span>
          </button>
        )}
        <button
          type="button"
          className={`account rail-agent rail-snooze${snoozeOpen ? " active" : ""}`}
          aria-label={snoozeLabel}
          title="Snoozed — every account"
          aria-pressed={snoozeOpen}
          onClick={onSnooze}
        >
          <span className="account-face rail-agent-face">
            <Clock size={15} strokeWidth={1.75} />
          </span>
          {snoozeCount > 0 && (
            <span className="badge">{snoozeCount}</span>
          )}
        </button>
      </div>
      <div className="rail-section">
        <span className="rail-label">Mail</span>
        {accounts.map((a) => {
          const loggedOut = Boolean(a.loggedOut);
          const hideAddress =
            looksLikeEmail(a.email) &&
            blur.blurAddress(blur.kindForEmail(a.email));
          const title =
            a.id === UNIFIED_ID
              ? "Unified Inbox"
              : hideAddress
                ? loggedOut
                  ? "Logged out mailbox"
                  : "Mailbox"
                : loggedOut
                  ? `${a.email} — logged out`
                  : a.email;
          return (
            <button
              key={a.id}
              type="button"
              className={`account${highlightAccounts && activeId === a.id ? " active" : ""}${loggedOut ? " logged-out" : ""}`}
              onClick={() => onSelect(a.id)}
              title={title}
              aria-label={title}
            >
              {a.id === UNIFIED_ID ? (
                <span className="account-face" style={{ background: a.color }}>
                  <Layers size={14} strokeWidth={2.25} color="#0a0a0b" />
                </span>
              ) : (
                <PersonAvatar
                  name={a.name}
                  initials={a.label.slice(0, 2)}
                  color={a.color}
                  avatarUrl={a.avatarUrl}
                  className="account-face"
                />
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
        <span className="rail-label">Apps</span>
        {plugins.map((plugin) => {
          const open = activePluginId === plugin.id;
          return (
            <button
              key={plugin.id}
              type="button"
              className={`rail-btn rail-plugin${open ? " active" : ""}`}
              aria-label={plugin.name}
              title={plugin.name}
              aria-pressed={open}
              onClick={() => onOpenPlugin(plugin.id)}
            >
              {plugin.id === "google-calendar" ? (
                <GoogleCalendarBrand size={22} />
              ) : plugin.id === "notion" ? (
                <SimpleBrandIcon
                  icon={pluginBrandIcons.notion}
                  size={18}
                  color="currentColor"
                />
              ) : (
                <Plug size={16} strokeWidth={1.75} />
              )}
            </button>
          );
        })}
        <button
          type="button"
          className="rail-btn"
          aria-label="Add plugin"
          title="Add plugin"
          onClick={onPlugins}
        >
          <Plug size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="rail-btn"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>
        {update.visible && (
          <button
            type="button"
            className={`rail-btn rail-update${update.action === "restart" ? " ready" : ""}`}
            aria-label={update.label}
            title={update.label}
            disabled={update.action === "busy"}
            onClick={
              update.action === "restart" ? onRestartUpdate : onDownloadUpdate
            }
          >
            {update.action === "restart" ? (
              <RotateCw size={16} strokeWidth={1.75} />
            ) : update.action === "busy" ? (
              <Loader2 size={16} strokeWidth={1.75} className="spin" />
            ) : (
              <Download size={16} strokeWidth={1.75} />
            )}
            {typeof update.percent === "number" && (
              <span className="badge">{update.percent}%</span>
            )}
          </button>
        )}
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
  folderTotals,
  customFolders,
  labels,
  syncLabel,
  snoozeCount = 0,
  inboxAsInbox = false,
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
  /** Nav badges: unread conversation counts per folder. */
  folderCounts: Record<string, number>;
  /** Total message counts — Empty Junk/Trash eligibility only. */
  folderTotals: Record<string, number>;
  customFolders: string[];
  labels: Label[];
  syncLabel: string;
  /** Global snoozed total. The row opens every account, so the badge is not per mailbox. */
  snoozeCount?: number;
  /** Inbox returns to the selected mailbox, so don't label it Unified Inbox. */
  inboxAsInbox?: boolean;
  compact?: boolean;
  onFolder: (id: string) => void;
  onCompose: () => void;
  onEmptyFolder?: (folderId: "junk" | "trash") => void;
  onCreateFolder: (name: string) => boolean;
  onCreateLabel: (name: string, color: string) => void;
}) {
  const unified = account.id === UNIFIED_ID;
  const blur = useCreatorBlur();
  const accountKind = blur.kindForEmail(account.email);
  const hideAccountAddress =
    looksLikeEmail(account.email) && blur.blurAddress(accountKind);
  const hideAccountName =
    looksLikeEmail(account.email) && blur.blurName(accountKind);
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
        ) : (
          <PersonAvatar
            name={account.name}
            initials={account.label}
            color={account.color}
            avatarUrl={account.avatarUrl}
            className="profile-avatar"
          />
        )}
        <div className="profile-copy">
          <div className={blurClass("profile-name", hideAccountName)}>
            {account.name}
          </div>
          <div className={blurClass("profile-email", hideAccountAddress)}>
            {account.email}
          </div>
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
          const label =
            f.id === "inbox" && unified && !inboxAsInbox
              ? "Unified Inbox"
              : f.name;
          const count =
            f.id === "snoozed"
              ? snoozeCount
              : f.id === "inbox"
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
        (folderTotals[activeFolder] ?? 0) > 0 && (
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

function ListFilterControl({
  value,
  counts,
  onChange,
}: {
  value: ListFilter;
  counts: StatusCounts;
  onChange: (next: ListFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = listFilterActive(value);
  const count = listFilterCount(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const statuses = [
    ["all", "All", counts.all],
    ["unread", "Unread", counts.unread],
    ["read", "Read", counts.read],
  ] as const;

  return (
    <div className="list-filter" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn${open || active ? " active" : ""}`}
        aria-label="Filter by unread, star, or file"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((next) => !next)}
      >
        <ListFilterIcon size={14} strokeWidth={1.75} />
        {count > 0 && <span className="list-filter-badge">{count}</span>}
      </button>
      {open && (
        <div
          className="list-filter-panel"
          role="dialog"
          aria-label="Filter messages"
        >
          <div className="search-panel-label">Status</div>
          <div className="list-filter-seg" role="radiogroup" aria-label="Read status">
            {statuses.map(([id, label, total]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={value.read === id}
                className={value.read === id ? "active" : undefined}
                onClick={() => onChange({ ...value, read: id })}
              >
                <span>{label}</span>
                <small>{total}</small>
              </button>
            ))}
          </div>
          <div className="search-panel-label">Narrow further</div>
          <button
            type="button"
            className={`list-filter-toggle${value.starred ? " on" : ""}`}
            role="switch"
            aria-checked={value.starred}
            onClick={() => onChange({ ...value, starred: !value.starred })}
          >
            <span className="list-filter-check" aria-hidden>
              <Check size={11} strokeWidth={2.5} />
            </span>
            Starred
          </button>
          <button
            type="button"
            className={`list-filter-toggle${value.attachment ? " on" : ""}`}
            role="switch"
            aria-checked={value.attachment}
            onClick={() =>
              onChange({ ...value, attachment: !value.attachment })
            }
          >
            <span className="list-filter-check" aria-hidden>
              <Check size={11} strokeWidth={2.5} />
            </span>
            Has attachment
          </button>
          {active && (
            <button
              type="button"
              className="list-filter-clear"
              onClick={() => onChange(EMPTY_LIST_FILTER)}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChips({
  value,
  onChange,
}: {
  value: ListFilter;
  onChange: (next: ListFilter) => void;
}) {
  if (!listFilterActive(value)) return null;
  const chip = (label: string, next: ListFilter) => (
    <button
      key={label}
      type="button"
      className="filter-chip"
      aria-label={`Remove ${label} filter`}
      onClick={() => onChange(next)}
    >
      {label}
      <X size={11} strokeWidth={2.25} />
    </button>
  );
  return (
    <div className="list-filter-chips">
      {value.read === "unread" &&
        chip("Unread", { ...value, read: "all" })}
      {value.read === "read" && chip("Read", { ...value, read: "all" })}
      {value.starred && chip("Starred", { ...value, starred: false })}
      {value.attachment &&
        chip("Has attachment", { ...value, attachment: false })}
    </div>
  );
}

/** The box that actually scrolls the rows. Prefer the list itself. */
function listScroller(preferred: HTMLElement): HTMLElement {
  if (preferred.scrollHeight > preferred.clientHeight + 1) return preferred;
  let current = preferred.parentElement;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return preferred;
}

function MessageList({
  items,
  accounts,
  selectedId,
  checkedIds,
  filter,
  refine,
  statusCounts,
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
  onRefine,
  hasMore,
  loadingMore,
  onNearEnd,
  scrollEpoch,
}: {
  items: Message[];
  accounts: Account[];
  selectedId: string;
  checkedIds: Set<string>;
  filter: Filter;
  refine: ListFilter;
  statusCounts: StatusCounts;
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
    onRun: () => void;
  };
  syncing?: boolean;
  fullScreen?: boolean;
  onFilter: (f: Filter) => void;
  onRefine: (next: ListFilter) => void;
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
  hasMore?: boolean;
  loadingMore?: boolean;
  onNearEnd?: () => void;
  scrollEpoch?: number;
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
  const blur = useCreatorBlur();
  const scrollRef = useRef<HTMLDivElement>(null);
  const onNearEndRef = useRef(onNearEnd);
  onNearEndRef.current = onNearEnd;
  const pauseAutoRef = useRef(false);
  const armedRef = useRef(false);
  const loadSnapRef = useRef({ count: items.length, loading: false });

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = 0;
  }, [scrollEpoch]);

  useEffect(() => {
    const snap = loadSnapRef.current;
    if (snap.loading && !loadingMore && items.length === snap.count) {
      // A finished pass added nothing. Wait until the end leaves the screen.
      pauseAutoRef.current = true;
    }
    if (items.length > snap.count) pauseAutoRef.current = false;
    snap.count = items.length;
    snap.loading = Boolean(loadingMore);
  }, [items.length, loadingMore]);

  useEffect(() => {
    if (!loadingMore) armedRef.current = false;
  }, [loadingMore]);

  useEffect(() => {
    const preferred = scrollRef.current;
    if (!preferred || !hasMore) return;
    let scroller = listScroller(preferred);
    const nearEnd = () =>
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
      160;
    const kick = () => {
      if (!nearEnd()) {
        pauseAutoRef.current = false;
        armedRef.current = false;
        return;
      }
      if (pauseAutoRef.current || armedRef.current) return;
      armedRef.current = true;
      onNearEndRef.current?.();
    };
    const onScroll = () => kick();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(() => {
      const next = listScroller(preferred);
      if (next !== scroller) {
        scroller.removeEventListener("scroll", onScroll);
        scroller = next;
        scroller.addEventListener("scroll", onScroll, { passive: true });
      }
      kick();
    });
    resize.observe(preferred);
    kick();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [hasMore, loadingMore, items.length]);

  // Replay the fade-up only for rows that just arrived. Re-rendering the list
  // on every sync tick used to restart the staggered animation for all rows.
  const seenIds = useRef<Set<string>>(new Set());
  const freshIds = useMemo(() => {
    const fresh = new Set<string>();
    for (const m of items) {
      if (!seenIds.current.has(m.id)) fresh.add(m.id);
    }
    return fresh;
  }, [items]);
  useEffect(() => {
    for (const m of items) seenIds.current.add(m.id);
  }, [items]);
  const animateRow = (id: string) => !reduceMotion && freshIds.has(id);

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
      <div className="list-mail">
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
              onClick={() => onBulkAction("archive")}
            >
              <Archive size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={anyUnread ? "Mark as read" : "Mark as unread"}
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
              aria-label={anyUnstarred ? "Star selected" : "Unstar selected"}
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
              aria-label="Snooze selected until tomorrow"
              onClick={() => onBulkAction("snooze", "Tomorrow")}
            >
              <Clock size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Mark selected as spam"
              onClick={() => onBulkAction("spam")}
            >
              <ShieldAlert size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              aria-label="Delete selected"
              onClick={() => onBulkAction("trash")}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              aria-label="Delete selected forever"
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
                  aria-label="Catch me up on this list"
                  onClick={catchMeUp.onRun}
                >
                  <Sparkles size={14} strokeWidth={1.75} />
                </button>
              )}
              <ListFilterControl
                value={refine}
                counts={statusCounts}
                onChange={onRefine}
              />
              <span className="icon-tip-wrap">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={
                    syncing ? "Checking for new mail" : "Check for new mail"
                  }
                  onClick={onRefresh}
                  disabled={syncing}
                >
                  <RefreshCw
                    size={14}
                    strokeWidth={1.75}
                    className={syncing ? "spin" : undefined}
                  />
                </button>
              </span>
              <button type="button" className="icon-btn" aria-label="Sweep">
                <Eraser size={14} strokeWidth={1.75} />
              </button>
            </div>
          </>
        )}
      </div>

      <FilterChips value={refine} onChange={onRefine} />

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

      <div className="message-scroll" ref={scrollRef}>
        {items.length === 0 ? (
          <div className="empty-list">
            <Inbox size={22} strokeWidth={1.5} />
            <p>{listFilterActive(refine) ? "No messages match" : "Nothing here"}</p>
            <span>
              {listFilterActive(refine)
                ? "Clear a filter to see more of this folder."
                : title === "Snoozed"
                  ? "Snoozed mail from every account shows up here."
                  : "Try another filter or account."}
            </span>
            {listFilterActive(refine) && (
              <button
                type="button"
                className="empty-list-clear"
                onClick={() => onRefine(EMPTY_LIST_FILTER)}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          items.map((m, i) => {
            const acct = accountFor(m.accountId, accounts);
            const selected = m.id === selectedId;
            const checked = checkedIds.has(m.id);
            const badges = listBadgeCounts(m);
            const links = extractMessageLinks(m);
            const starred = Boolean(m.starred);
            const kind = blur.kindForMessage({
              email: m.email,
              name: m.from,
              subject: m.subject,
              preview: m.preview,
              tag: m.tag?.label,
            });
            const nameBlur = blur.blurName(kind);
            const subjectBlur = blur.blurSubject(kind);
            const previewBlur = blur.blurPreview(kind);
            return (
              <div
                key={m.id}
                className={`message-row${animateRow(m.id) ? " fade-up" : ""}${selected ? " selected" : ""}${checked ? " checked" : ""}${menu?.messageId === m.id ? " menu-target" : ""}${m.unread ? " unread" : ""}${starred ? " starred" : ""}${hoverActions ? " hover-actions" : ""}${showAvatars ? "" : " no-avatar"}`}
                style={
                  animateRow(m.id)
                    ? { animationDelay: `${Math.min(i, 12) * 0.03}s` }
                    : undefined
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
                    <span className={blurClass("from", nameBlur)}>{m.from}</span>
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
                    <div className={blurClass("subject", subjectBlur)}>
                      {subjectBlur ? (
                        m.subject
                      ) : (
                        <BlurredEmails text={m.subject} />
                      )}
                    </div>
                  </div>
                  {showPreviewLines && (
                    <div className={blurClass("preview", previewBlur)}>
                      {previewBlur ? (
                        m.preview
                      ) : m.matchPreview ? (
                        <MatchText text={m.matchPreview} />
                      ) : (
                        <BlurredEmails text={m.preview} />
                      )}
                    </div>
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
      {loadingMore && (
        <div className="list-more">
          <span className="list-more-status" role="status">
            <Loader2 size={14} className="spin" />
            Loading older mail…
          </span>
        </div>
      )}

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
      </div>
    </section>
  );
}

/** True when HTML references remote http(s) or protocol-relative images. */
function htmlHasRemoteImages(html: string): boolean {
  if (!html) return false;
  return /(?:src|srcset|background)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(
    html,
  ) || /url\(\s*['"]?(?:https?:)?\/\//i.test(html);
}

/** about:blank iframes resolve //host poorly — pin to https when loading. */
function promoteProtocolRelativeUrls(html: string): string {
  return html
    .replace(/(\s(?:src|srcset|href|background)\s*=\s*["'])\/\//gi, "$1https://")
    .replace(/(url\(\s*['"]?)\/\//gi, "$1https://");
}

/** Shared resets so newsletters cannot invent a tall viewport inside the iframe. */
const EMAIL_FRAME_RESET = `
  html, body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
  }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; }
  img { max-width: 100%; height: auto; }
  /* Newsletter shells are authored around 600px. Let them use the pane. */
  table[width="480"], table[width="500"], table[width="520"], table[width="540"],
  table[width="560"], table[width="580"], table[width="600"], table[width="620"],
  table[width="640"], table[width="650"], table[width="660"], table[width="680"],
  table[width="700"], table[width="720"], table[width="760"], table[width="800"],
  table[style*="width:600px"], table[style*="width: 600px"],
  table[style*="width:640px"], table[style*="width: 640px"],
  table[style*="max-width:600px"], table[style*="max-width: 600px"],
  table[style*="max-width:640px"], table[style*="max-width: 640px"],
  div[style*="width:600px"], div[style*="width: 600px"],
  div[style*="max-width:600px"], div[style*="max-width: 600px"],
  div[style*="width:640px"], div[style*="width: 640px"],
  div[style*="max-width:640px"], div[style*="max-width: 640px"] {
    width: 100% !important;
    max-width: 100% !important;
  }
  td[width="480"], td[width="500"], td[width="520"], td[width="540"],
  td[width="560"], td[width="580"], td[width="600"], td[width="620"],
  td[width="640"], td[width="650"], td[width="660"], td[width="680"],
  td[width="700"], td[width="720"], td[width="760"], td[width="800"] {
    width: auto !important;
  }
  /* Full-viewport wrappers (100vh / height=100%) leave a gap above centered mail. */
  body > table[height="100%"],
  body > table[style*="height:100%"],
  body > table[style*="height: 100%"],
  body > div[style*="min-height:100vh"],
  body > div[style*="min-height: 100vh"],
  body > div[style*="height:100vh"],
  body > div[style*="height: 100vh"] {
    height: auto !important;
    min-height: 0 !important;
  }
  .intray-creator-blur {
    filter: blur(5px);
    -webkit-filter: blur(5px);
    display: inline-block;
    user-select: none;
    color: inherit;
  }
`;

function HtmlBody({
  html,
  forceDark,
  allowRemote,
  onLayout,
}: {
  html: string;
  forceDark?: boolean;
  /** Settings default or per-message Load images override. */
  allowRemote: boolean;
  /** Fired after the iframe height is applied (lazy hydrate / image load). */
  onLayout?: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const blur = useCreatorBlur();

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    const dark = forceDark
      ? `${EMAIL_FRAME_RESET}
         html, body { background: #141416; color: #e8e8ea; }
         a { color: #7eb0ff; }
         table, td, div { background-color: transparent !important; color: inherit !important; }`
      : `${EMAIL_FRAME_RESET}
         html, body { background: #fff; color: #1a1a1a; }
         a { color: #2563eb; }`;
    // Parent index.html must allow https/http img-src: about:blank +
    // allow-same-origin inherits the creator CSP, which intersects with this.
    const csp = allowRemote
      ? "default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; font-src data:; media-src https: http: data: blob:; base-uri 'none'; form-action 'none';"
      : "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none';";
    const source = allowRemote ? promoteProtocolRelativeUrls(html) : html;
    const bodyHtml = blur.enabled
      ? blurEmailsInHtml(source, (email) =>
          blur.blurAddress(blur.kindForEmail(email)),
        )
      : source;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8" />
      <meta http-equiv="Content-Security-Policy" content="${csp}" />
      <style>${dark}</style>
    </head><body>${bodyHtml}</body></html>`);
    doc.close();

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
      // Prefer the content bounding box. scrollHeight follows min-height:100vh
      // / height:100% wrappers and invents a tall empty frame.
      const bodyTop = body.getBoundingClientRect().top;
      let contentBottom = 0;
      for (const child of Array.from(body.children)) {
        contentBottom = Math.max(
          contentBottom,
          child.getBoundingClientRect().bottom - bodyTop,
        );
      }
      if (contentBottom > 0) return contentBottom;
      return Math.max(
        body.scrollHeight,
        body.offsetHeight,
        root?.scrollHeight ?? 0,
        root?.offsetHeight ?? 0,
        80,
      );
    };

    const resize = () => {
      // Always size to full content so the reader pane scrolls instead of
      // clipping the message behind a manual resize handle.
      const next = Math.max(measureHeight() + 12, 80);
      if (frame.style.height !== `${next}px`) {
        frame.style.height = `${next}px`;
        onLayoutRef.current?.();
      }
    };
    resize();
    const raf = window.requestAnimationFrame(() => resize());
    const ob = new ResizeObserver(resize);
    if (doc.body) ob.observe(doc.body);
    if (doc.documentElement) ob.observe(doc.documentElement);
    // Late-loading images also change height without always resizing body.
    const imgs = Array.from(doc.images ?? []);
    for (const img of imgs) {
      if (!img.complete) img.addEventListener("load", resize);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      ob.disconnect();
      doc.removeEventListener("click", onClick);
      for (const img of imgs) {
        img.removeEventListener("load", resize);
      }
    };
  }, [html, forceDark, allowRemote, blur]);

  return (
    <div className="html-frame-wrap">
      <div className="html-shell">
        <iframe
          ref={ref}
          className="html-frame"
          title="Email HTML"
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}

function threadHasRealBody(message: ThreadMessage): boolean {
  if (message.bodyHtml) return true;
  return Boolean(
    message.body?.some((line) => line && line !== "(No body yet)"),
  );
}

function ThreadMessageView({
  message,
  defaultExpanded,
  forceDarkHtml,
  showAi,
  downloadRemoteImages,
  bodyLoading,
  onComposeTo,
  onSummarize,
  onTranslate,
  onHtmlLayout,
}: {
  message: ThreadMessage;
  defaultExpanded: boolean;
  forceDarkHtml?: boolean;
  showAi: boolean;
  /** Settings → Privacy default. */
  downloadRemoteImages: boolean;
  /** True while the main process is still fetching this message body. */
  bodyLoading?: boolean;
  onComposeTo: (r: Recipient) => void;
  onSummarize?: () => void;
  onTranslate?: () => void;
  /** Keep the reader pinned while the HTML iframe sizes itself. */
  onHtmlLayout?: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded, message.id]);
  const blur = useCreatorBlur();
  const kind = blur.kindForMessage({
    email: message.email,
    name: message.from,
    preview: message.body?.[0],
  });
  const nameBlur = blur.blurName(kind);
  const addressBlur = blur.blurAddress(kind);
  const previewBlur = blur.blurPreview(kind);
  const hasRemoteImages = useMemo(
    () => htmlHasRemoteImages(message.bodyHtml ?? ""),
    [message.bodyHtml],
  );
  const [showImages, setShowImages] = useState(downloadRemoteImages);
  useEffect(() => {
    setShowImages(downloadRemoteImages);
  }, [message.id, message.bodyHtml, downloadRemoteImages]);

  const hasRecipients =
    (message.to && message.to.length > 0) ||
    (message.cc && message.cc.length > 0) ||
    (message.bcc && message.bcc.length > 0);

  const showImageTool = hasRemoteImages && Boolean(message.bodyHtml);
  const showTools = Boolean(message.noTrackers) || showAi || showImageTool;
  const sender: Recipient = { name: message.from, email: message.email };
  const toggleExpanded = () => setExpanded((v) => !v);
  const onToggleClick = (
    e: { stopPropagation: () => void },
  ) => {
    e.stopPropagation();
    toggleExpanded();
  };

  return (
    <article
      className={`thread-msg${expanded ? " expanded" : " collapsed"}`}
      data-thread-msg={message.id}
      onClick={expanded ? undefined : toggleExpanded}
    >
      <div className="thread-msg-top">
        <div className="thread-msg-head">
          <div className="msg-from">
            <button
              type="button"
              className="msg-from-toggle"
              onClick={onToggleClick}
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
                <RecipientName
                  recipient={sender}
                  onCompose={onComposeTo}
                  nameBlur={nameBlur}
                  addressBlur={addressBlur}
                />
              </strong>
              <span className="msg-from-meta">
                <button
                  type="button"
                  className={blurClass("msg-sender-email", addressBlur)}
                  title={
                    addressBlur ? "Compose" : `Compose to ${message.email}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onComposeTo(sender);
                  }}
                >
                  {message.email}
                </button>
                <span className="msg-from-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="msg-from-time"
                  onClick={onToggleClick}
                >
                  {message.time}
                </button>
              </span>
            </div>
          </div>
          {!expanded && message.body?.[0] && (
            <button
              type="button"
              className={blurClass("thread-collapse-preview", previewBlur)}
              onClick={onToggleClick}
            >
              {previewBlur ? (
                message.body[0]
              ) : (
                <BlurredEmails text={message.body[0]} />
              )}
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
            {showImageTool && (
              <button
                type="button"
                className={`msg-tool-btn${showImages ? " active" : ""}`}
                title={showImages ? "Hide images" : "Load images"}
                aria-label={showImages ? "Hide images" : "Load images"}
                aria-pressed={showImages}
                onClick={() => setShowImages((v) => !v)}
              >
                {showImages ? (
                  <ImageIcon size={14} strokeWidth={1.75} />
                ) : (
                  <ImageOff size={14} strokeWidth={1.75} />
                )}
              </button>
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
              {message.bcc && message.bcc.length > 0 && (
                <div className="recipient-row">
                  <span className="recipient-label">Bcc</span>
                  <span className="recipient-list">
                    {formatRecipients(message.bcc, onComposeTo)}
                  </span>
                </div>
              )}
            </div>
          )}

          {message.bodyHtml ? (
            <HtmlBody
              html={message.bodyHtml}
              forceDark={forceDarkHtml}
              allowRemote={showImages}
              onLayout={onHtmlLayout}
            />
          ) : bodyLoading && !threadHasRealBody(message) ? (
            <div className="body-copy body-loading" role="status">
              <Loader2 size={14} strokeWidth={2} className="spin" />
              <span>Loading message…</span>
            </div>
          ) : (
            <div className="body-copy">
              {(message.body ?? []).map((p) => (
                <p key={p}>
                  <BlurredEmails text={p} />
                </p>
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
            <AttachmentBar
              messageId={message.id}
              files={threadAttachments(message)}
            />
          )}
        </div>
      )}
    </article>
  );
}

function SummaryText({ text }: { text: string }) {
  const summary = formatMailSummary(text);
  if (!summary.lead && summary.bullets.length === 0) return null;
  return (
    <div className="thread-summary-body">
      {summary.lead ? <p>{summary.lead}</p> : null}
      {summary.bullets.length > 0 && (
        <ul>
          {summary.bullets.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
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
  bodyLoading,
  onBack,
  onAsk,
  onAction,
  onCreateLabel,
  onCreateFolder,
  onComposeTo,
  onToast,
  onReplySent,
  pluginStatuses,
  onOpenPlugins,
  onPluginDialogChange,
  replyIntent = { key: 0, mode: "reply" as ReplyMode },
  focusMessageId = null,
  emptyTitle = "Mail",
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
  bodyLoading?: boolean;
  onBack?: () => void;
  onAsk: () => void;
  onAction: (action: MailAction, snoozeLabel?: string) => void;
  onCreateLabel: (name: string, color: string) => void;
  onCreateFolder: (name: string) => boolean;
  onComposeTo: (r: Recipient) => void;
  onToast: (text: string) => void;
  onReplySent?: (message: Message) => void;
  pluginStatuses: PluginStatus[];
  onOpenPlugins: () => void;
  onPluginDialogChange?: (open: boolean) => void;
  /** Bumped by parent to focus/seed the reply box (Reply vs Reply all). */
  replyIntent?: { key: number; mode: ReplyMode };
  /** Scroll this thread message into view after a search hit. */
  focusMessageId?: string | null;
  /** Folder or account name shown when nothing is open. */
  emptyTitle?: string;
}) {
  const blur = useCreatorBlur();
  const readerScrollRef = useRef<HTMLDivElement>(null);
  /**
   * Keep the open scroll position stable while lazy HTML bodies size:
   * "top" for single-message threads, "latest" to stay on the newest turn
   * with a peek of prior messages above.
   */
  const pinReaderRef = useRef<"top" | "latest" | null>("top");
  /** How much of the previous message to leave visible above the latest. */
  const LATEST_PEEK_PX = 56;
  const openedKind = message
    ? blur.kindForMessage({
        email: message.email,
        name: message.from,
        subject: message.subject,
        preview: message.preview,
        tag: message.tag?.label,
      })
    : "personal";
  const subjectBlur = Boolean(message) && blur.blurSubject(openedKind);

  const latestScrollTop = (node: HTMLElement) => {
    const last = node.querySelector("article.thread-msg:last-of-type");
    if (!(last instanceof HTMLElement)) return 0;
    const count = node.querySelectorAll("article.thread-msg").length;
    if (count <= 1) return 0;
    const offset =
      last.getBoundingClientRect().top -
      node.getBoundingClientRect().top +
      node.scrollTop;
    return Math.max(0, offset - LATEST_PEEK_PX);
  };

  const applyReaderPin = () => {
    const mode = pinReaderRef.current;
    const node = readerScrollRef.current;
    if (!mode || !node) return;
    if (mode === "top") {
      if (node.scrollTop !== 0) node.scrollTop = 0;
      return;
    }
    const target = latestScrollTop(node);
    if (Math.abs(node.scrollTop - target) > 1) node.scrollTop = target;
  };

  useLayoutEffect(() => {
    const node = readerScrollRef.current;
    if (!node) return;
    if (focusMessageId) {
      const target = node.querySelector(
        `[data-thread-msg="${CSS.escape(focusMessageId)}"]`,
      );
      if (target) {
        pinReaderRef.current = null;
        target.scrollIntoView({ block: "center" });
        return;
      }
    }
    const visibleCount =
      conversationView || focusMessageId
        ? (message?.thread.length ?? 0)
        : Math.min(message?.thread.length ?? 0, 1);
    if (visibleCount > 1) {
      pinReaderRef.current = "latest";
      applyReaderPin();
      return;
    }
    pinReaderRef.current = "top";
    node.scrollTop = 0;
  }, [message?.id, focusMessageId, conversationView]);

  const threadCount = message?.thread.length ?? 0;
  const threadWatch = useRef({ id: message?.id, count: threadCount });
  useEffect(() => {
    if (!message) return;
    const prev = threadWatch.current;
    threadWatch.current = { id: message.id, count: threadCount };
    if (prev.id !== message.id || threadCount <= prev.count) return;
    pinReaderRef.current = null;
    const node = readerScrollRef.current;
    const last = node?.querySelector("article.thread-msg:last-of-type");
    if (!node || !(last instanceof HTMLElement)) return;
    const delta =
      last.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom;
    if (delta > 0) node.scrollTop += delta + 16;
  }, [message, threadCount]);

  useEffect(() => {
    const node = readerScrollRef.current;
    if (!node) return;
    const onScroll = () => {
      const mode = pinReaderRef.current;
      if (mode === "top") {
        if (node.scrollTop >= 12) pinReaderRef.current = null;
        return;
      }
      if (mode === "latest") {
        if (Math.abs(node.scrollTop - latestScrollTop(node)) > 24) {
          pinReaderRef.current = null;
        }
      }
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [message?.id]);

  const keepReaderPinned = () => {
    applyReaderPin();
  };

  // Lazy body hydrate replaces the short loading stub with tall HTML; re-pin.
  useEffect(() => {
    if (bodyLoading) return;
    keepReaderPinned();
    const id = window.requestAnimationFrame(keepReaderPinned);
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyLoading, message?.id]);

  const sendable = useMemo(
    () => sendIdentitiesForAccounts(accounts),
    [accounts],
  );
  const ownEmails = useMemo(() => ownEmailSet(accounts), [accounts]);
  const defaultReplyFromKey = useMemo(() => {
    const signedIn = sendable.filter((s) => !s.loggedOut);
    const scopeFor = (accountId: string | undefined) => {
      if (!accountId) return signedIn;
      const scoped = signedIn.filter((s) => s.accountId === accountId);
      return scoped.length ? scoped : signedIn;
    };
    const mailboxId =
      message?.accountId ??
      (account.id !== UNIFIED_ID ? account.id : undefined);
    const scoped = scopeFor(mailboxId);

    // Prefer the linked address this message was delivered to (custom domain).
    if (message) {
      const latest = message.thread[message.thread.length - 1] ?? message;
      const deliveredTo = new Set(
        [...(latest.to ?? []), ...(latest.cc ?? [])]
          .map((r) => r.email.trim().toLowerCase())
          .filter(Boolean),
      );
      const match = scoped.find((s) =>
        deliveredTo.has(s.email.trim().toLowerCase()),
      );
      if (match) return match.key;
    }

    const primary =
      scoped.find((s) => {
        const acct = accounts.find((a) => a.id === s.accountId);
        return (
          acct &&
          s.email.trim().toLowerCase() === acct.email.trim().toLowerCase()
        );
      }) ?? scoped[0];
    return (
      primary?.key ??
      signedIn[0]?.key ??
      sendable[0]?.key ??
      sendIdentityKey(account.id, account.email)
    );
  }, [
    message,
    account.id,
    account.email,
    accounts,
    sendable,
  ]);

  const [draft, setDraft] = useState("");
  const [fromKey, setFromKey] = useState(defaultReplyFromKey);
  const replyFromTouchedRef = useRef(false);
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
    sendable.find((s) => s.key === fromKey) ??
    sendable.find((s) => s.key === defaultReplyFromKey) ??
    sendable[0] ?? {
      key: sendIdentityKey(account.id, account.email),
      accountId: account.id,
      email: account.email,
      name: account.name,
      label: account.label,
      color: account.color,
      loggedOut: account.loggedOut,
    };
  const replyFromLoggedOut = Boolean(replyFrom.loggedOut);
  const replyHasMultipleFrom =
    sendable.filter((s) => s.accountId === replyFrom.accountId).length > 1;
  const [aiReplies, setAiReplies] = useState<string[]>([]);
  const [replyNote, setReplyNote] = useState<string | null>(null);
  const [unsubState, setUnsubState] = useState<
    "idle" | "scanning" | "done" | "missing"
  >("idle");
  const [threadSummary, setThreadSummary] = useState<{
    messageId: string;
    status: "loading" | "ready" | "error";
    text: string;
  } | null>(null);
  const summaryReq = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    summaryReq.current += 1;
    setThreadSummary(null);
  }, [message?.id]);

  useEffect(() => {
    const card = summaryRef.current;
    const scroller = readerScrollRef.current;
    if (!threadSummary || !card || !scroller) return;
    const delta =
      card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (delta < 0) scroller.scrollTop += delta - 8;
  }, [threadSummary]);

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

  const replyBodyKey = message ? latestReplyBodyKey(message) : "";

  useEffect(() => {
    setAiReplies([]);
    if (!message || !showAi || !prefs.aiWriteEnabled || !replyBodyKey) return;
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
    // `message` is read from the render that produced replyBodyKey. Depending
    // on the object would resend the prompt on every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    message?.id,
    replyBodyKey,
    showAi,
    prefs.aiWriteEnabled,
    prefs.aiBridge,
    prefs.aiBridgePath,
    prefs.aiModelHint,
  ]);

  useEffect(() => {
    if (!showAi || !prefs.aiWriteEnabled || !message) return;
    if (prefs.aiBridge === "none") {
      setReplyNote("Pick a provider in Settings to suggest replies.");
      return;
    }
    if (!replyBodyKey) {
      setReplyNote(bodyLoading ? "Reading the message…" : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    message?.id,
    replyBodyKey,
    bodyLoading,
    showAi,
    prefs.aiWriteEnabled,
    prefs.aiBridge,
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
    replyFromTouchedRef.current = false;
    setDraft("");
    setFromKey(defaultReplyFromKey);
    setBccMentions([]);
    setShowBcc(false);
    setRecipientsOpen(false);
    seedReplyRecipients("reply");
    replyHistory.clear();
    setMenu(null);
    setUnsubState("idle");
    setReplySendPhase("idle");
    // Re-seed only when the open message changes — not when accounts refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id]);

  // Keep From in sync with linked addresses / delivered-to match until the user picks one.
  useEffect(() => {
    if (replyFromTouchedRef.current) return;
    setFromKey(defaultReplyFromKey);
  }, [defaultReplyFromKey]);

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
    if (
      !replyFrom.accountId ||
      replyFrom.accountId === UNIFIED_ID ||
      !replyFrom.email?.includes("@")
    ) {
      setRecipientsOpen(true);
      setReplySendPhase("failed");
      onToast("Pick a From address before sending");
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
          accountId: replyFrom.accountId,
          fromEmail: replyFrom.email,
          to: toMentions.map((c) => c.email),
          cc: ccMentions.map((c) => c.email),
          bcc: bccMentions.map((c) => c.email),
          subject: message.subject.startsWith("Re:")
            ? message.subject
            : `Re: ${message.subject}`,
          bodyText: draft,
          replyToMessageId:
            message.thread[message.thread.length - 1]?.id ?? message.id,
        });
        onReplySent?.(messageDtoToUi(dto));
      } else {
        // Demo mode: brief delay so the Sending → Sent transition is visible.
        await new Promise((r) => setTimeout(r, 450));
        const replyId = `demo-sent-${Date.now()}`;
        const preview = draft.trim().replace(/\s+/g, " ").slice(0, 160);
        onReplySent?.({
          ...message,
          preview: `You: ${preview}`,
          time: "Just now",
          unread: false,
          thread: [
            ...message.thread,
            {
              id: replyId,
              from: replyFrom.name,
              initials: replyFrom.label.slice(0, 2).toUpperCase(),
              avatarColor: replyFrom.color,
              email: replyFrom.email,
              time: "Just now",
              to: toMentions.map((person) => ({
                name: person.name,
                email: person.email,
              })),
              cc: ccMentions.map((person) => ({
                name: person.name,
                email: person.email,
              })),
              body: draft.split(/\n+/).filter(Boolean),
            },
          ],
        });
      }
      setReplySendPhase("sent");
      setDraft("");
      seedReplyRecipients("reply");
      setBccMentions([]);
      setShowBcc(false);
      setRecipientsOpen(false);
      replyHistory.clear();
      onToast(`Reply sent as ${replyFrom.email}`);
      window.setTimeout(() => setReplySendPhase("idle"), 1200);
    } catch (e) {
      setReplySendPhase("failed");
      setRecipientsOpen(true);
      onToast(e instanceof Error ? e.message : "Failed to send");
    }
  };

  const runSummarize = async () => {
    if (!message || prefs.aiBridge === "none") {
      onToast("Pick an AI provider in Settings");
      return;
    }
    if (!threadHasReadableText(message)) {
      onToast(bodyLoading ? "Still reading this message…" : "This message has no text to summarize");
      return;
    }
    if (
      threadSummary?.messageId === message.id &&
      threadSummary.status === "loading"
    ) {
      return;
    }
    const messageId = message.id;
    const req = ++summaryReq.current;
    setThreadSummary({ messageId, status: "loading", text: "" });
    try {
      const text = (await aiSummarizeMessage(prefs, message)).trim();
      if (summaryReq.current !== req) return;
      if (!text) {
        setThreadSummary({
          messageId,
          status: "error",
          text: "No summary came back.",
        });
        return;
      }
      setThreadSummary({ messageId, status: "ready", text });
    } catch (e) {
      if (summaryReq.current !== req) return;
      setThreadSummary({
        messageId,
        status: "error",
        text: e instanceof Error ? e.message : "Summarize failed",
      });
    }
  };

  const dismissSummary = () => {
    summaryReq.current += 1;
    setThreadSummary(null);
  };

  const runTranslate = async () => {
    if (!message || prefs.aiBridge === "none") {
      onToast("Pick an AI provider in Settings");
      return;
    }
    if (!threadHasReadableText(message)) {
      onToast(bodyLoading ? "Still reading this message…" : "This message has no text to translate");
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
    if (!threadHasReadableText(message)) {
      onToast(bodyLoading ? "Still reading this message…" : "This message has no text to reply to");
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
        <h2>{emptyTitle}</h2>
        <p>Nothing open. Select a message when you want to read it.</p>
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
            aria-expanded={
              action === "snooze" || action === "label" || action === "move"
                ? menu?.panel === action
                : undefined
            }
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
        <PluginReaderActions
          message={message}
          statuses={pluginStatuses}
          onToast={onToast}
          onOpenPlugins={onOpenPlugins}
          onDialogChange={onPluginDialogChange}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label="More actions"
          aria-expanded={menu != null && menu.panel == null}
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
          <h1 className={blurClass("reader-subject", subjectBlur)}>
            {subjectBlur ? (
              message.subject
            ) : (
              <BlurredEmails text={message.subject} />
            )}
          </h1>
          {unsubscribeBtn}
        </div>
      )}

      <div
        className="reader-scroll fade-up-delay"
        key={message.id}
        ref={readerScrollRef}
      >
        <div className="reader-meta-row">
          <span className="thread-count">
            {message.thread.length}{" "}
            {message.thread.length === 1 ? "message" : "messages"}
          </span>
        </div>
        {!stickySubject && (
          <div className="reader-subject-row">
            <h1 className={blurClass("reader-subject", subjectBlur)}>
              {subjectBlur ? (
                message.subject
              ) : (
                <BlurredEmails text={message.subject} />
              )}
            </h1>
            {unsubscribeBtn}
          </div>
        )}

        <PluginInfoPin
          message={message}
          statuses={pluginStatuses}
          onToast={onToast}
          onOpenPlugins={onOpenPlugins}
          onDialogChange={onPluginDialogChange}
        />

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

        {threadSummary && threadSummary.messageId === message.id && (
          <div
            className="thread-summary"
            role="status"
            aria-live="polite"
            ref={summaryRef}
          >
            <div className="thread-summary-head">
              <Sparkles size={13} strokeWidth={1.75} />
              <span>Summary</span>
              <button
                type="button"
                className="thread-summary-dismiss"
                aria-label="Dismiss summary"
                onClick={dismissSummary}
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
            {threadSummary.status === "loading" ? (
              <p className="thread-summary-loading">
                <Loader2 size={13} strokeWidth={2} className="spin" />
                Summarizing this thread…
              </p>
            ) : threadSummary.status === "error" ? (
              <p className="thread-summary-body is-error">{threadSummary.text}</p>
            ) : (
              <SummaryText text={threadSummary.text} />
            )}
          </div>
        )}

        <div className="thread">
          {(() => {
            const focusInThread = Boolean(
              focusMessageId &&
                message.thread.some((turn) => turn.id === focusMessageId),
            );
            const visible =
              conversationView || focusInThread
                ? message.thread
                : message.thread.slice(-1);
            return visible;
          })().map((tm, idx, arr) => (
            <ThreadMessageView
              key={tm.id}
              message={tm}
              defaultExpanded={
                idx === arr.length - 1 || tm.id === focusMessageId
              }
              forceDarkHtml={forceDarkHtml}
              showAi={showAi}
              downloadRemoteImages={Boolean(prefs.downloadRemoteImages)}
              bodyLoading={Boolean(bodyLoading) && idx === arr.length - 1}
              onComposeTo={onComposeTo}
              onSummarize={() => void runSummarize()}
              onTranslate={() => void runTranslate()}
              onHtmlLayout={keepReaderPinned}
            />
          ))}
        </div>

        {links.length > 0 && (
          <div className="reader-links" aria-label="Links in this thread">
            <span className="reader-links-label">Links</span>
            {links.map((link) => {
              const mailHref = link.href.replace(/^mailto:/i, "").split("?")[0];
              const hideHref =
                looksLikeEmail(mailHref) &&
                blur.blurAddress(blur.kindForEmail(mailHref));
              return (
                <a
                  key={link.href}
                  className="reader-link-row"
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  title={hideHref ? "Link" : link.href}
                >
                  <Link2 size={14} strokeWidth={1.75} />
                  <span>
                    <BlurredEmails text={link.label} />
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="reply-dock">
        <div
          className={`reply-box${recipientsOpen ? " recipients-open" : ""}`}
          onFocusCapture={() => setRecipientsOpen(true)}
          onBlur={(e) => {
            const box = e.currentTarget;
            const related = e.relatedTarget as Node | null;
            // AppSelect menus portal to document.body; treating that blur as
            // "left the reply box" was collapsing From/To before you could use them.
            const focusStaysInReplyUi = (node: Node | null) => {
              if (!node) return false;
              if (box.contains(node)) return true;
              return (
                node instanceof Element &&
                Boolean(node.closest(".app-select-menu-portal"))
              );
            };
            if (focusStaysInReplyUi(related)) return;
            window.requestAnimationFrame(() => {
              if (focusStaysInReplyUi(document.activeElement)) return;
              // Keep the bar open when To is empty — user still needs to address it.
              if (toMentions.length === 0) return;
              if (!draft.trim()) setRecipientsOpen(false);
            });
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
          {recipientsOpen || replyHasMultipleFrom ? (
            <div className="reply-recipients">
              <div className="reply-meta-bar">
                <div className="reply-from-compact">
                  <span className="reply-from-prefix">From</span>
                  <AppSelect
                    compact
                    ariaLabel="Send reply from address"
                    detailBlurred={blur.blurAddress(
                      blur.kindForEmail(replyFrom.email),
                    )}
                    labelBlurred={blur.blurName(
                      blur.kindForEmail(replyFrom.email),
                    )}
                    value={replyFrom.key}
                    onChange={(key) => {
                      replyFromTouchedRef.current = true;
                      setFromKey(key);
                      setReplySendPhase("idle");
                    }}
                    options={sendable.map((s) => ({
                      id: s.key,
                      label: s.name,
                      detail: s.loggedOut
                        ? `${s.email} · Logged out`
                        : s.email,
                      leading: (
                        <span
                          className="account-chip"
                          style={{
                            background: "transparent",
                            color: s.color,
                            borderColor: s.color,
                            opacity: s.loggedOut ? 0.55 : 1,
                          }}
                        >
                          {s.label}
                        </span>
                      ),
                    }))}
                  />
                </div>
                {recipientsOpen ? (
                  <div className="reply-meta-toggles">
                    <button
                      type="button"
                      className={`reply-meta-toggle${showCc ? " active" : ""}`}
                      aria-pressed={showCc}
                      onClick={() => setShowCc((v) => !v)}
                    >
                      Cc
                      {ccMentions.length > 0 ? (
                        <span className="reply-meta-count">
                          {ccMentions.length}
                        </span>
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
                        <span className="reply-meta-count">
                          {bccMentions.length}
                        </span>
                      ) : null}
                    </button>
                  </div>
                ) : null}
              </div>
              {recipientsOpen ? (
                <>
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
                        return false;
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
                            (p) =>
                              p.email.toLowerCase() !== email.toLowerCase(),
                          ),
                        )
                      }
                      onAdd={(r) => {
                        if (
                          replyExcludeEmails.some(
                            (e) => e.toLowerCase() === r.email.toLowerCase(),
                          )
                        ) {
                          return false;
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
                            (p) =>
                              p.email.toLowerCase() !== email.toLowerCase(),
                          ),
                        )
                      }
                      onAdd={(r) => {
                        if (
                          replyExcludeEmails.some(
                            (e) => e.toLowerCase() === r.email.toLowerCase(),
                          )
                        ) {
                          return false;
                        }
                        setBccTracked([...bccMentions, r]);
                      }}
                      placeholder="Bcc email…"
                    />
                  )}
                </>
              ) : null}
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
              <button type="button" className="icon-btn" aria-label="Attach a file">
                <Paperclip size={15} strokeWidth={1.75} />
              </button>
              {showAi && prefs.aiWriteEnabled && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Write this reply with AI"
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
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
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

function ComposePane({
  account,
  accounts,
  prefs,
  showAi,
  live,
  initialTo,
  initialCc,
  initialBcc,
  initialSubject = "",
  initialBody = "",
  title = "New message",
  onSaveClose,
  onDismiss,
  onSnapshot,
  onLabel,
  onSent,
  onQueued,
}: {
  account: Account;
  accounts: Account[];
  prefs: Preferences;
  showAi: boolean;
  live: boolean;
  initialTo?: Recipient[];
  initialCc?: Recipient[];
  initialBcc?: Recipient[];
  initialSubject?: string;
  initialBody?: string;
  title?: string;
  /** Close the tab and keep the message in Drafts when it has anything in it. */
  onSaveClose: () => void;
  /** Close without saving. Used for Discard and after a successful send. */
  onDismiss: () => void;
  onSnapshot: (snapshot: ComposeSnapshot) => void;
  onLabel: (label: string) => void;
  onSent?: (message: Message) => void;
  onQueued?: (queueId: string, seconds: number) => void;
}) {
  const sendable = sendIdentitiesForAccounts(accounts);
  const signedIn = sendable.filter((s) => !s.loggedOut);
  const defaultFrom =
    account.id !== UNIFIED_ID && !account.loggedOut
      ? (sendable.find((s) => s.accountId === account.id) ??
        signedIn[0] ??
        sendable[0])
      : (signedIn.find((s) => s.accountId === account.id) ??
        signedIn.find((s) => s.accountId === "work") ??
        signedIn[0] ??
        sendable[0]);
  const fallbackFrom: SendIdentityOption = defaultFrom ?? {
    key: sendIdentityKey(account.id, account.email),
    accountId: account.id,
    email: account.email,
    name: account.name,
    label: account.label,
    color: account.color,
    loggedOut: account.loggedOut,
  };
  const blur = useCreatorBlur();
  const [fromKey, setFromKey] = useState(fallbackFrom.key);
  const from = sendable.find((s) => s.key === fromKey) ?? fallbackFrom;
  const fromLoggedOut = Boolean(from.loggedOut);
  const [to, setTo] = useState<Recipient[]>(() => initialTo ?? []);
  const [cc, setCc] = useState<Recipient[]>(() => initialCc ?? []);
  const [bcc, setBcc] = useState<Recipient[]>(() => initialBcc ?? []);
  const [showCc, setShowCc] = useState(() => (initialCc?.length ?? 0) > 0);
  const [showBcc, setShowBcc] = useState(() => (initialBcc?.length ?? 0) > 0);
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

  const signature = signatureForAccount(prefs, from.accountId);
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
      const { bodyText, bodyHtml } = buildSignedBodies(body, signature);
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
          accountId: from.accountId,
          fromEmail: from.email,
          to: to.map((r) => r.email),
          cc: cc.length ? cc.map((r) => r.email) : undefined,
          bcc: bcc.length ? bcc.map((r) => r.email) : undefined,
          subject,
          bodyText,
          bodyHtml,
          attachments: encoded,
        };
        const delay = prefs.undoSendSeconds;
        if (delay > 0) {
          const queued = await bridgeSendLater(draftPayload, delay);
          setSendPhase("sent");
          onQueued?.(queued.queueId, delay);
          window.setTimeout(() => onDismiss(), 700);
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
          accountId: from.accountId,
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
              bodyHtml,
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
      window.setTimeout(() => onDismiss(), 700);
    } catch (e) {
      setSendPhase("failed");
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };

  const addRecipient = (r: Recipient) => {
    if (
      composeExclude.some((e) => e.toLowerCase() === r.email.toLowerCase())
    ) {
      return false;
    }
    setToTracked([...to, r]);
  };

  const addCc = (r: Recipient) => {
    if (
      composeExclude.some((e) => e.toLowerCase() === r.email.toLowerCase())
    ) {
      return false;
    }
    setCcTracked([...cc, r]);
  };

  const addBcc = (r: Recipient) => {
    if (
      composeExclude.some((e) => e.toLowerCase() === r.email.toLowerCase())
    ) {
      return false;
    }
    setBccTracked([...bcc, r]);
  };

  const addTo = (contact: Contact) => {
    addRecipient({ name: contact.name, email: contact.email });
  };

  const onSnapshotRef = useRef(onSnapshot);
  const onLabelRef = useRef(onLabel);
  onSnapshotRef.current = onSnapshot;
  onLabelRef.current = onLabel;

  useEffect(() => {
    onSnapshotRef.current({
      accountId: from.accountId,
      fromName: from.name,
      fromEmail: from.email,
      fromLabel: from.label,
      fromColor: from.color,
      to,
      cc,
      bcc,
      subject,
      body,
      files: attachments,
    });
  });

  useEffect(() => {
    onLabelRef.current(composeTabLabel(subject, title));
  }, [subject, title]);

  return (
    <section className="compose-pane" aria-label={title}>
      <div className="compose-pane-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={onSaveClose}
          aria-label="Close and save draft"
          title="Close and save draft"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
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
                ariaLabel="Send from address"
                detailBlurred={blur.blurAddress(blur.kindForEmail(from.email))}
                labelBlurred={blur.blurName(blur.kindForEmail(from.email))}
                value={from.key}
                onChange={(key) => {
                  setFromKey(key);
                  setSendPhase("idle");
                  setSendError(null);
                }}
                options={sendable.map((s) => ({
                  id: s.key,
                  label: s.name,
                  detail: s.loggedOut ? `${s.email} · Logged out` : s.email,
                  leading: (
                    <span
                      className="account-chip"
                      style={{
                        background: "transparent",
                        color: s.color,
                        borderColor: s.color,
                        opacity: s.loggedOut ? 0.55 : 1,
                      }}
                    >
                      {s.label}
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
                  Intray signature
                  {from.email ? (
                    <>
                      {" · "}
                      <span
                        className={
                          blur.blurAddress(blur.kindForEmail(from.email))
                            ? "creator-blur"
                            : undefined
                        }
                      >
                        {from.email}
                      </span>
                    </>
                  ) : null}
                </span>
                {signatureHtml ? (
                  <div
                    className="signature-html"
                    dangerouslySetInnerHTML={{
                      __html: blurEmailsInHtml(
                        sanitizeSignatureHtml(signature),
                        (email) => blur.blurAddress(blur.kindForEmail(email)),
                      ),
                    }}
                  />
                ) : (
                  <>
                    <strong
                      className={
                        blur.blurName(blur.kindForEmail(from.email))
                          ? "creator-blur"
                          : undefined
                      }
                    >
                      {sigTitle}
                    </strong>
                    {sigDetail.map((line) => (
                      <span key={line}>
                        <BlurredEmails text={line} />
                      </span>
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
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} strokeWidth={1.75} />
            </button>
            {showAi && (
              <button type="button" className="icon-btn" aria-label="Write with AI">
                <Sparkles size={15} strokeWidth={1.75} />
              </button>
            )}
            {attachments.length > 0 && (
              <span className="compose-attach-count">
                {attachments.length} file{attachments.length === 1 ? "" : "s"}
              </span>
            )}
            <span className="compose-save-hint">Close saves to Drafts</span>
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
            <button type="button" className="pill-btn" onClick={onDismiss}>
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
    </section>
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

const RECENT_SEARCH_KEY = "intray.recentSearches";
const RECENT_OPEN_KEY = "intray.recentOpens";

function loadRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((item) => typeof item === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function loadRecentOpens(): RecentOpen[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_OPEN_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.subject === "string",
      )
      .slice(0, 6);
  } catch {
    return [];
  }
}

const LIST_PAGE_SIZE = 80;
const LIST_KEEP_CAP = 400;

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
  /** Real linked mailboxes exist in the local DB (even while demo is showing). */
  const [hasRealAccounts, setHasRealAccounts] = useState(false);
  /** Snapshot of real accounts for Settings while the shell shows demo seed data. */
  const [liveAccountSnapshot, setLiveAccountSnapshot] = useState<Account[]>(
    [],
  );
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
  /** DB-backed sidebar badges — not derived from the paged folder list. */
  const [liveFolderCounts, setLiveFolderCounts] =
    useState<MailFolderCounts | null>(null);
  const [accountId, setAccountId] = useState(UNIFIED_ID);
  const [folderId, setFolderId] = useState("inbox");
  const [filter, setFilter] = useState<Filter>("all");
  const [listFilter, setListFilter] = useState<ListFilter>(EMPTY_LIST_FILTER);
  const [stackView, setStackView] = useState<"list" | "reader">("list");
  const [selectedId, setSelectedId] = useState("");
  const [bodyLoadingId, setBodyLoadingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const checkAnchorRef = useRef<number | null>(null);
  const [workspace, setWorkspace] = useState<
    "mail" | "agent" | "snooze" | "plugin"
  >("mail");
  const [openPluginId, setOpenPluginId] = useState<PluginId | null>(null);
  /** Snoozed messages across every account. Null until the live count arrives. */
  const [globalSnoozeTotal, setGlobalSnoozeTotal] = useState<number | null>(
    null,
  );
  const [threadRequest, setThreadRequest] = useState<AgentThreadRequest | null>(
    null,
  );
  const [catchUpRequest, setCatchUpRequest] =
    useState<AgentCatchUpRequest | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>(
    loadNotifications,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [pluginStatuses, setPluginStatuses] = useState<PluginStatus[]>([]);
  const [pluginDialogOpen, setPluginDialogOpen] = useState(false);
  const [composeTabs, setComposeTabs] = useState<
    {
      id: string;
      label: string;
      to?: Recipient[];
      cc?: Recipient[];
      bcc?: Recipient[];
      subject?: string;
      body?: string;
      title?: string;
    }[]
  >([]);
  const [activePane, setActivePane] = useState("mail");
  const composeSnaps = useRef(new Map<string, ComposeSnapshot>());
  const activePaneRef = useRef("mail");
  activePaneRef.current = activePane;
  const closingCompose = useRef(new Set<string>());
  const [replyIntent, setReplyIntent] = useState<{
    key: number;
    mode: ReplyMode;
  }>({ key: 0, mode: "reply" });
  const [searchTokens, setSearchTokens] = useState<SearchToken[]>([]);
  const [searchText, setSearchText] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches);
  const [recentOpens, setRecentOpens] = useState(loadRecentOpens);
  const listGen = useRef(0);
  const olderNoticeRef = useRef(false);
  const listPagingRef = useRef({
    viewKey: "",
    cursor: null as string | null,
    localMore: false,
    serverMore: false,
    loading: false,
    holdAppend: false,
    wantMore: false,
    wantRefresh: false,
  });
  const [listHasMore, setListHasMore] = useState(false);
  const [listLoadingOlder, setListLoadingOlder] = useState(false);
  const [listScrollEpoch, setListScrollEpoch] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const openCompose = (opts?: {
    to?: Recipient[];
    cc?: Recipient[];
    bcc?: Recipient[];
    subject?: string;
    body?: string;
    title?: string;
  }) => {
    const hasSeed =
      Boolean(opts?.to?.length) ||
      Boolean(opts?.cc?.length) ||
      Boolean(opts?.bcc?.length) ||
      Boolean(opts?.subject?.trim()) ||
      Boolean(opts?.body?.trim()) ||
      Boolean(opts?.title);
    if (!hasSeed) {
      const existing = composeTabs.find((tab) => {
        const snap = composeSnaps.current.get(tab.id);
        if (!snap) {
          return !tab.to?.length && !tab.subject && !tab.body;
        }
        return !composeHasContent({
          to: snap.to,
          cc: snap.cc,
          bcc: snap.bcc,
          subject: snap.subject,
          body: snap.body,
          attachmentCount: snap.files.length,
        });
      });
      if (existing) {
        setWorkspace("mail");
        setActivePane(existing.id);
        setStackView("reader");
        return;
      }
    }
    const id = `compose-${crypto.randomUUID()}`;
    const subject = opts?.subject ?? "";
    setWorkspace("mail");
    setComposeTabs((prev) => [
      ...prev,
      {
        id,
        label: composeTabLabel(subject, opts?.title),
        to: opts?.to?.length ? opts.to : undefined,
        cc: opts?.cc?.length ? opts.cc : undefined,
        bcc: opts?.bcc?.length ? opts.bcc : undefined,
        subject: opts?.subject,
        body: opts?.body,
        title: opts?.title,
      },
    ]);
    setActivePane(id);
    setStackView("reader");
  };

  const showMailPane = () => {
    setActivePane("mail");
  };

  const openComposeRef = useRef(openCompose);
  openComposeRef.current = openCompose;

  useEffect(() => {
    const recent = { url: "", at: 0 };
    const openUrl = (raw: string) => {
      const draft = parseMailto(raw);
      if (!draft) return;
      const now = Date.now();
      if (recent.url === raw && now - recent.at < 800) return;
      recent.url = raw;
      recent.at = now;
      openComposeRef.current({
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
      });
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      const href = anchor?.getAttribute("href") ?? "";
      if (!anchor || !/^mailto:/i.test(href.trim())) return;
      event.preventDefault();
      event.stopPropagation();
      // The signature's own address sits inside the draft. Opening another
      // compose would throw away what they're writing.
      if (anchor.closest(".compose-form")) return;
      openUrl(href);
    };
    document.addEventListener("click", onClick, true);
    const off = bridgeOnMailtoOpen(openUrl);
    void bridgeClaimMailto().then((url) => {
      if (url) openUrl(url);
    });
    void bridgeSetMailtoHandler(prefs.handleMailto);
    return () => {
      document.removeEventListener("click", onClick, true);
      off();
    };
    // Saved preference wins over the startup default. The toggle writes both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [reauthAccount, setReauthAccount] = useState<Account | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !isOnboardingComplete(),
  );
  const [onboardingAccountLinked, setOnboardingAccountLinked] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({
    state: "idle",
    currentVersion: "",
    packaged: false,
  });
  /** User hid the progress card while an update is still ready / failed. */
  const [updateCardDismissed, setUpdateCardDismissed] = useState(false);
  const [alert, setAlert] = useState<AlertRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bridgeUpdateStatus().then((status) => {
      if (!cancelled) setUpdateStatus(status);
    });
    const stop = bridgeOnUpdateStatus((status) => {
      if (cancelled) return;
      setUpdateStatus(status);
      // Re-show the card when download/install progress resumes.
      if (
        status.state === "downloading" ||
        status.state === "installing" ||
        status.state === "ready"
      ) {
        setUpdateCardDismissed(false);
      }
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const alertResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [chord, setChord] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const lastActionRef = useRef<
    { id: string; snapshot: Message }[] | null
  >(null);
  const searchTimer = useRef<number | null>(null);
  const prefsRef = useRef(prefs);
  const mailRef = useRef(mail);
  const workspaceRef = useRef(workspace);
  prefsRef.current = prefs;
  mailRef.current = mail;
  workspaceRef.current = workspace;

  const pushAppNotification = (
    item: Omit<AppNotification, "id" | "time" | "unread"> & {
      id?: string;
      time?: string;
      unread?: boolean;
    },
  ) => {
    const next: AppNotification = {
      id: item.id ?? `${item.kind}-${item.messageId ?? Date.now()}`,
      kind: item.kind,
      title: item.title,
      body: item.body,
      time: item.time ?? notifTimeLabel(),
      unread: item.unread ?? true,
      messageId: item.messageId,
      folderId: item.folderId,
    };
    setNotifications((prev) =>
      [next, ...prev.filter((n) => n.id !== next.id)].slice(0, 40),
    );
  };

  const noteSnoozed = (
    items: { id: string; subject: string }[],
    when: string,
  ) => {
    const label = when.trim() || "later";
    for (const item of items) {
      pushAppNotification({
        id: `followup-${item.id}`,
        kind: "snooze",
        title: "Snoozed",
        body: item.subject || "Snoozed message",
        time: label,
        messageId: item.id,
        folderId: "snoozed",
      });
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        NOTIFICATIONS_KEY,
        JSON.stringify(notifications.slice(0, 40)),
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [notifications]);

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

  const refreshFolderCounts = async (aid?: string) => {
    const scopeId =
      aid ?? (workspaceRef.current === "snooze" ? UNIFIED_ID : accountId);
    const scope = scopeId === UNIFIED_ID ? "all" : scopeId;
    try {
      const [counts, real] = await Promise.all([
        bridgeFolderCounts(scope),
        bridgeAccounts().catch(() => null),
      ]);
      setLiveFolderCounts(counts);
      // Rail badges use accounts.unread — keep them aligned with inbox unread.
      if (real?.length) {
        const mapped = real.map(accountDtoToUi);
        const byId = new Map(mapped.map((a) => [a.id, a]));
        const mergeUnread = (list: Account[]) =>
          list.map((a) => {
            if (a.id === UNIFIED_ID) {
              return {
                ...a,
                unread: mapped.reduce((n, x) => n + x.unread, 0),
              };
            }
            const next = byId.get(a.id);
            return next ? { ...a, unread: next.unread } : a;
          });
        setAccounts(mergeUnread);
        setLiveAccountSnapshot(mergeUnread);
      }
    } catch {
      /* keep previous badges */
    }
  };

  const refreshSnoozeTotal = async () => {
    try {
      const counts = await bridgeFolderCounts("all");
      setGlobalSnoozeTotal(counts.folders.snoozed?.total ?? 0);
    } catch {
      /* keep the last global count */
    }
  };

  const publishPaging = (next: {
    cursor: string | null;
    localMore: boolean;
    serverMore: boolean;
  }) => {
    listPagingRef.current.cursor = next.cursor;
    listPagingRef.current.localMore = next.localMore;
    listPagingRef.current.serverMore = next.serverMore;
    setListHasMore(next.localMore || next.serverMore);
  };

  const hydrateListed = (incoming: Message[], prev: Message[]): Message[] => {
    const prevById = new Map(prev.map((m) => [m.id, m]));
    return incoming.map((m) => {
      const old = prevById.get(m.id);
      if (!old) return m;
      return {
        ...m,
        tag: m.tag ?? old.tag,
        thread: unionThreads(old.thread, m.thread),
        linkCount: m.linkCount || old.linkCount,
        attachmentCount: m.attachmentCount || old.attachmentCount,
        openTracking: old.openTracking ?? m.openTracking,
      };
    });
  };

  const refreshLiveMail = async (opts?: {
    accountId?: string;
    folder?: string;
    filter?: Filter;
    q?: string;
    quiet?: boolean;
    append?: boolean;
  }): Promise<Message[]> => {
    const append = Boolean(opts?.append);
    // Explicit account/folder wins. A bare refresh while Snooze is open stays
    // on every account's snoozed mail, including search and visibility refreshes.
    const pinned = opts?.accountId == null && opts?.folder == null;
    const inSnooze = pinned && workspaceRef.current === "snooze";
    const aid = opts?.accountId ?? (inSnooze ? UNIFIED_ID : accountId);
    const scope = aid === UNIFIED_ID ? "all" : aid;
    const requested = opts?.folder ?? (inSnooze ? "snoozed" : folderId);
    const folder = requested.startsWith("label:") ? "inbox" : requested;
    const f = opts?.filter ?? filter;
    const q = opts?.q ?? searchText;
    const searching = Boolean(q.trim());
    const viewKey = `${scope}|${searching ? "search:" + q.trim() : folder}|${searching ? "all" : f}`;
    const paging = listPagingRef.current;
    const sameView = paging.viewKey === viewKey;

    if (append) {
      if (!sameView) return mailRef.current;
      // A list refresh is in flight. Keep the loading row up and run after it.
      if (paging.loading || paging.holdAppend) {
        paging.wantMore = true;
        setListLoadingOlder(true);
        return mailRef.current;
      }
      if (!paging.localMore && !paging.serverMore) {
        setListLoadingOlder(false);
        return mailRef.current;
      }
    } else if (sameView && paging.loading) {
      // Don't drop the older-mail fetch the user is waiting on.
      paging.wantRefresh = true;
      return mailRef.current;
    }

    const gen = ++listGen.current;
    if (append) {
      paging.loading = true;
      setListLoadingOlder(true);
    } else {
      paging.holdAppend = true;
      paging.loading = false;
      if (!paging.wantMore) setListLoadingOlder(false);
      if (!sameView) {
        paging.viewKey = viewKey;
        paging.cursor = null;
        paging.localMore = false;
        paging.serverMore = false;
        paging.wantMore = false;
        paging.wantRefresh = false;
        setListHasMore(false);
        setListScrollEpoch((epoch) => epoch + 1);
      } else {
        paging.viewKey = viewKey;
      }
    }

    const countsPromise =
      append || opts?.quiet
        ? Promise.resolve()
        : refreshFolderCounts(inSnooze ? UNIFIED_ID : aid);
    const canBackfill = !searching && folder !== "snoozed";

    const pullPage = (cursor: string | null) =>
      bridgeListMail({
        accountId: scope,
        folder: searching ? undefined : folder,
        filter: searching ? "all" : f,
        limit: searching ? 250 : LIST_PAGE_SIZE,
        cursor,
        q: q.trim() || undefined,
      });

    try {
      if (searching) {
        const result = await pullPage(null);
        if (gen !== listGen.current) return [];
        setAppliedQuery(q.trim());
        const messages = hydrateListed(
          result.messages.map(messageDtoToUi),
          mailRef.current,
        );
        publishPaging({ cursor: null, localMore: false, serverMore: false });
        setMail(messages);
        setSelectedId((prev) =>
          prev && messages.some((m) => m.id === prev) ? prev : "",
        );
        await countsPromise;
        return messages;
      }

      if (append) {
        let cursor = paging.cursor;
        let localMore = paging.localMore;
        let serverMore = paging.serverMore;
        let fresh: Message[] = [];
        let serverTries = 0;
        for (let round = 0; round < 6 && fresh.length === 0; round += 1) {
          if (gen !== listGen.current) return [];
          if (localMore && cursor) {
            const result = await pullPage(cursor);
            if (gen !== listGen.current) return [];
            const batch = hydrateListed(
              result.messages.map(messageDtoToUi),
              mailRef.current,
            );
            const seen = new Set(mailRef.current.map((m) => m.id));
            fresh = batch.filter((m) => !seen.has(m.id));
            const nextCursor = result.endCursor ?? result.nextCursor ?? cursor;
            const advanced = nextCursor !== cursor;
            cursor = nextCursor;
            localMore = Boolean(result.nextCursor);
            if (fresh.length) break;
            // The same page came back. Stop spinning on it and ask the server.
            if (!advanced) localMore = false;
            if (localMore) continue;
          }
          if (!serverMore || !canBackfill) {
            serverMore = false;
            break;
          }
          serverTries += 1;
          if (serverTries > 2) break;
          if (typeof window.intray?.mail?.loadOlder !== "function") {
            if (!olderNoticeRef.current) {
              olderNoticeRef.current = true;
              showToast("Restart Intray to load older mail");
            }
            break;
          }
          let older: { added: number; exhausted: boolean };
          try {
            older = await bridgeLoadOlder({ accountId: scope, folder });
          } catch (err) {
            const missing =
              err instanceof Error &&
              /No handler registered/i.test(err.message);
            if (missing && !olderNoticeRef.current) {
              olderNoticeRef.current = true;
              showToast("Restart Intray to load older mail");
            }
            break;
          }
          if (gen !== listGen.current) return [];
          serverMore = !older.exhausted || localMore;
          if (older.added > 0) void refreshFolderCounts(aid);
          const result = await pullPage(cursor);
          if (gen !== listGen.current) return [];
          const batch = hydrateListed(
            result.messages.map(messageDtoToUi),
            mailRef.current,
          );
          const seen = new Set(mailRef.current.map((m) => m.id));
          fresh = batch.filter((m) => !seen.has(m.id));
          cursor = result.endCursor ?? cursor;
          localMore = Boolean(result.nextCursor);
          if (!localMore && older.exhausted && fresh.length === 0) {
            serverMore = false;
          }
        }
        if (gen !== listGen.current) return [];
        publishPaging({ cursor, localMore, serverMore: canBackfill && serverMore });
        if (fresh.length) {
          setMail((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...fresh.filter((m) => !seen.has(m.id))];
          });
        }
        return mailRef.current;
      }

      const keep = Math.min(
        LIST_KEEP_CAP,
        Math.max(LIST_PAGE_SIZE, sameView ? mailRef.current.length : LIST_PAGE_SIZE),
      );
      const acc: Message[] = [];
      let cursor: string | null = null;
      let localMore = false;
      let total = 0;
      for (let round = 0; round < 12 && acc.length < keep; round += 1) {
        const result = await pullPage(cursor);
        if (gen !== listGen.current) return [];
        if (round === 0) total = result.total;
        const batch = result.messages.map(messageDtoToUi);
        const seen = new Set(acc.map((m) => m.id));
        let added = 0;
        for (const message of batch) {
          if (seen.has(message.id)) continue;
          seen.add(message.id);
          acc.push(message);
          added += 1;
        }
        cursor = result.endCursor;
        localMore = Boolean(result.nextCursor);
        if (!added || !result.nextCursor) break;
      }
      if (gen !== listGen.current) return [];
      setAppliedQuery(q.trim());
      const messages = hydrateListed(acc, mailRef.current);
      publishPaging({
        cursor,
        localMore,
        serverMore: canBackfill,
      });
      setMail(messages);
      setSelectedId((prev) =>
        prev && messages.some((m) => m.id === prev) ? prev : "",
      );
      if (inSnooze && !q.trim()) setGlobalSnoozeTotal(total);
      await countsPromise;
      return messages;
    } catch {
      if (gen === listGen.current) setAppliedQuery(q.trim());
      return [];
    } finally {
      if (listGen.current === gen) {
        const pagingNow = listPagingRef.current;
        const moreWanted =
          pagingNow.wantMore && (pagingNow.localMore || pagingNow.serverMore);
        const refreshWanted = pagingNow.wantRefresh;
        if (append) pagingNow.loading = false;
        else pagingNow.holdAppend = false;
        pagingNow.wantMore = false;
        if (moreWanted) {
          void refreshLiveMail({ append: true });
        } else {
          pagingNow.wantRefresh = false;
          if (refreshWanted) void refreshLiveMail();
          else setListLoadingOlder(false);
        }
      }
    }
  };

  const loadLiveWorkspace = async (selectAccountId?: string) => {
    const real = await bridgeAccounts();
    if (!real.length) {
      setLive(false);
      setHasRealAccounts(false);
      setLiveAccountSnapshot([]);
      setLiveFolderCounts(null);
      setAccounts(seedAccounts.map((a) => ({ ...a })));
      setLabels(seedLabels.map((l) => ({ ...l })));
      setMail(seedMessages.map((m) => ({ ...m })));
      setSelectedId("");
      setAccountId(UNIFIED_ID);
      setWorkspace("mail");
      setFolderId("inbox");
      setFilter("all");
      setListFilter(EMPTY_LIST_FILTER);
      setStackView("list");
      setContactDirectory(null);
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
    setHasRealAccounts(true);
    setLiveAccountSnapshot(uiAccounts);
    setAccounts(uiAccounts);
    const nextId = selectAccountId ?? UNIFIED_ID;
    setAccountId(nextId);
    setWorkspace("mail");
    setFolderId("inbox");
    setSelectedId("");
    setFilter("all");
    setListFilter(EMPTY_LIST_FILTER);
    setStackView("list");
    clearChecks();
    setSearchTokens([]);
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
    let remoteContacts: Awaited<ReturnType<typeof bridgeListContacts>> = [];
    try {
      remoteContacts = await bridgeListContacts();
    } catch {
      /* directory falls back to live mail participants */
    }
    const liveMessages = await refreshLiveMail({
      accountId: nextId,
      folder: "inbox",
      filter: "all",
      q: "",
    });
    // Replace demo people in search / @mentions with real contacts + synced mail.
    setContactDirectory(
      buildContacts({
        accounts: uiAccounts,
        messages: liveMessages,
        remote: remoteContacts,
        includeDemoExtras: false,
      }),
    );
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const has = await bridgeHasRealAccounts();
      if (cancelled) return;
      setHasRealAccounts(has);
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
    let cancelled = false;
    void bridgePluginStatuses()
      .then((rows) => {
        if (!cancelled) setPluginStatuses(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const idleRefreshTimer = useRef<number | null>(null);
  useEffect(() => {
    const off = bridgeOnSyncProgress((status) => {
      setSyncStatus(status);
      setSyncing(status.state === "syncing");
      if (status.state === "error" || status.state === "offline") {
        const id = `sync-${status.accountId || "mail"}`;
        const title = status.state === "offline" ? "Offline" : "Sync problem";
        const body =
          status.error || "Intray will retry when the connection is back.";
        setNotifications((prev) => {
          const existing = prev.find((item) => item.id === id);
          if (existing && existing.title === title && existing.body === body) {
            return prev;
          }
          const next: AppNotification = {
            id,
            kind: "sync",
            title,
            body,
            time: notifTimeLabel(),
            unread: true,
          };
          return [next, ...prev.filter((item) => item.id !== id)].slice(0, 40);
        });
      } else if (status.state === "idle") {
        const id = `sync-${status.accountId || "mail"}`;
        setNotifications((prev) =>
          prev.some((item) => item.id === id)
            ? prev.filter((item) => item.id !== id)
            : prev,
        );
      }
      if (
        status.state === "error" &&
        isAuthFailureMessage(status.error) &&
        status.accountId
      ) {
        const markLoggedOut = (list: Account[]) =>
          list.map((a) =>
            a.id === status.accountId ? { ...a, loggedOut: true } : a,
          );
        if (live) {
          setAccounts(markLoggedOut);
          setLiveAccountSnapshot(markLoggedOut);
        } else {
          setLiveAccountSnapshot(markLoggedOut);
        }
      }
      if (status.state === "idle" && live) {
        // One list refresh for a burst of per-account idle events, and none
        // while the window is hidden. Opening the window catches up below.
        if (idleRefreshTimer.current != null) {
          window.clearTimeout(idleRefreshTimer.current);
        }
        idleRefreshTimer.current = window.setTimeout(() => {
          idleRefreshTimer.current = null;
          if (document.visibilityState === "hidden") return;
          void (async () => {
            const [liveMessages, real, remote] = await Promise.all([
              refreshLiveMail(),
              bridgeAccounts(),
              bridgeListContacts().catch(() => []),
            ]);
            const mapped = real.map(accountDtoToUi);
            const uiAccounts: Account[] = [
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
            setAccounts(uiAccounts);
            setLiveAccountSnapshot(uiAccounts);
            setHasRealAccounts(mapped.length > 0);
            setContactDirectory(
              buildContacts({
                accounts: uiAccounts,
                messages: liveMessages,
                remote,
                includeDemoExtras: false,
              }),
            );
          })();
        }, 1200);
      }
    });
    return () => {
      off();
      if (idleRefreshTimer.current != null) {
        window.clearTimeout(idleRefreshTimer.current);
        idleRefreshTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, accountId, folderId, filter, searchText, workspace]);

  useEffect(() => {
    if (!live) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshLiveMail();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, accountId, folderId, filter, searchText, workspace]);

  useEffect(() => {
    if (!live) return;
    return bridgeOnSearchReady(({ q }) => {
      if (q.trim() !== searchText.trim()) return;
      void refreshLiveMail({ q, quiet: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, searchText]);

  useEffect(() => {
    const offFlush = bridgeOnSendFlushed(({ message }) => {
      const ui = messageDtoToUi(message);
      setMail((prev) => mergeSentIntoList(prev, ui));
      showToast("Sent");
    });
    const offSnooze = bridgeOnUnsnoozed(({ messageId }) => {
      const local = mailRef.current.find((m) => m.id === messageId);
      const subject = local?.subject ?? "Snoozed mail";
      const from = local?.from ?? "Reminder";
      pushAppNotification({
        id: `followup-${messageId}`,
        kind: "snooze",
        title: "Follow up",
        body: subject,
        time: "now",
        messageId,
        folderId: "inbox",
      });
      void notifySnoozeReturn(prefsRef.current, {
        id: messageId,
        from,
        subject,
      });
      if (live) {
        void refreshLiveMail();
        void refreshSnoozeTotal();
      }
      showToast("Snoozed mail returned to inbox");
    });
    const offUpdated = bridgeOnMailUpdated(({ message }) => {
      if (!live) return;
      const ui = messageDtoToUi(message);
      const prev = mailRef.current.find((m) => m.id === ui.id);
      if (
        prev &&
        (prev.folder !== ui.folder || prev.unread !== ui.unread)
      ) {
        void refreshFolderCounts();
        void refreshSnoozeTotal();
      }
      setMail((cur) =>
        cur.map((m) => {
          if (m.id !== ui.id) return m;
          const thread = unionThreads(m.thread, ui.thread);
          // Keep renderer-assigned tags when the DTO has none yet.
          // Keep the list identity so a sent reply does not open a second row.
          return {
            ...m,
            ...ui,
            id: m.id,
            folder: m.folder,
            from: m.from,
            email: m.email,
            initials: m.initials,
            avatarColor: m.avatarColor,
            subject: m.subject,
            tag: ui.tag ?? m.tag,
            thread,
            unread: m.unread === false && ui.unread ? false : ui.unread,
          };
        }),
      );
    });
    const offAvatar = bridgeOnAvatarUpdated(({ email, avatarUrl }) => {
      if (!live) return;
      const key = email.trim().toLowerCase();
      setAccounts((prev) =>
        prev.map((a) =>
          a.email.toLowerCase() === key ? { ...a, avatarUrl } : a,
        ),
      );
      setLiveAccountSnapshot((prev) =>
        prev.map((a) =>
          a.email.toLowerCase() === key ? { ...a, avatarUrl } : a,
        ),
      );
      setMail((prev) =>
        prev.map((m) => {
          let touched = m.email.toLowerCase() === key;
          const nextThread = m.thread.map((t) => {
            if (t.email.toLowerCase() !== key) return t;
            touched = true;
            return { ...t, avatarUrl };
          });
          if (!touched) return m;
          return m.email.toLowerCase() === key
            ? { ...m, avatarUrl, thread: nextThread }
            : { ...m, thread: nextThread };
        }),
      );
    });
    return () => {
      offFlush();
      offSnooze();
      offUpdated();
      offAvatar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void bridgeListMail({
      accountId: "all",
      folder: "snoozed",
      filter: "all",
      limit: 40,
    })
      .then((result) => {
        if (cancelled) return;
        const snoozed = result.messages.map(messageDtoToUi);
        setNotifications((prev) => mergeFollowUps(prev, snoozed));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [live]);

  // Hydrate bodies when selection changes (click or keyboard). getMail returns
  // as soon as the newest message body is ready; older replies arrive via
  // mail:updated.
  useEffect(() => {
    if (!live || !selectedId) return;
    let cancelled = false;
    const current = mailRef.current.find((m) => m.id === selectedId);
    const needsBody = Boolean(
      current &&
        !current.thread.some(
          (t) =>
            Boolean(t.bodyHtml) ||
            Boolean(t.body?.some((line) => line && line !== "(No body yet)")),
        ),
    );
    if (needsBody) setBodyLoadingId(selectedId);
    void bridgeGetMail(selectedId)
      .then((dto) => {
        if (cancelled || !dto) return;
        const updated = messageDtoToUi(dto);
        setMail((prev) =>
          prev.map((m) => {
            if (m.id !== selectedId) return m;
            // Body hydrate can race mark-as-read; don't let a stale unread
            // snapshot undo a read the user (or mark-on-open) just applied.
            const unread =
              m.unread === false && updated.unread ? false : updated.unread;
            return { ...updated, tag: updated.tag ?? m.tag, unread };
          }),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setBodyLoadingId((id) => (id === selectedId ? null : id));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [live, selectedId]);

  useEffect(() => {
    if (!live) {
      setGlobalSnoozeTotal(null);
      return;
    }
    void refreshSnoozeTotal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (!live) return;
    // Agent keeps the loaded mailbox. Entering or leaving Snooze refetches.
    if (workspace === "agent" || workspace === "plugin") return;
    void refreshLiveMail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, accountId, folderId, filter, workspace]);

  const account = accountFor(accountId, accounts);
  const showAi = prefs.aiBridge !== "none";

  useEffect(() => {
    if (!showAi) return;
    warmCursorAgent(prefs);
  }, [showAi, prefs.aiBridge, prefs.aiBridgePath, prefs.aiModelHint]);

  const openPlugin = (id: PluginId) => {
    setOpenPluginId(id);
    setWorkspace("plugin");
    if (prefs.layout === "stack") setStackView("list");
  };

  const openAgent = (messageId?: string) => {
    if (messageId) {
      setThreadRequest((prev) => ({
        nonce: (prev?.nonce ?? 0) + 1,
        messageId,
      }));
    }
    setWorkspace("agent");
    if (prefs.layout === "stack") setStackView("list");
  };

  const openSnooze = () => {
    clearChecks();
    setFilter("all");
    setListFilter(EMPTY_LIST_FILTER);
    if (prefs.layout === "stack") setStackView("list");
    if (workspaceRef.current === "snooze") {
      if (live) void refreshLiveMail();
      return;
    }
    setSelectedId("");
    setFocusMessageId(null);
    setWorkspace("snooze");
  };

  const selectFolder = (id: string) => {
    if (id === "snoozed") {
      openSnooze();
      return;
    }
    clearChecks();
    const changed = workspace !== "mail" || folderId !== id;
    setWorkspace("mail");
    setFolderId(id);
    showMailPane();
    if (!changed) return;
    setSelectedId("");
    setFocusMessageId(null);
    if (prefs.layout === "stack") setStackView("list");
  };

  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    savePreferences(next);
    setTheme(resolvedTheme(next.theme));
    if (next.aiBridge === "none") {
      setWorkspace((cur) => (cur === "agent" ? "mail" : cur));
    }
  };

  useEffect(() => {
    if (!showAi) setWorkspace((cur) => (cur === "agent" ? "mail" : cur));
  }, [showAi]);

  useEffect(() => {
    if (workspace !== "plugin" || !openPluginId) return;
    const status = pluginStatuses.find((item) => item.id === openPluginId);
    if (!status?.connected || !status.enabled) {
      setOpenPluginId(null);
      setWorkspace("mail");
    }
  }, [pluginStatuses, workspace, openPluginId]);

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

  const closeComposeTab = async (id: string, mode: "save" | "discard") => {
    if (closingCompose.current.has(id)) return;
    closingCompose.current.add(id);
    try {
      const snap = composeSnaps.current.get(id);
      const hasContent = snap
        ? composeHasContent({
            to: snap.to,
            cc: snap.cc,
            bcc: snap.bcc,
            subject: snap.subject,
            body: snap.body,
            attachmentCount: snap.files.length,
          })
        : false;
      if (mode === "save" && snap && hasContent) {
        try {
          const message = live
            ? messageDtoToUi(
                await bridgeSaveDraft({
                  accountId: snap.accountId,
                  fromEmail: snap.fromEmail,
                  to: snap.to.map((person) => person.email),
                  cc: snap.cc.length
                    ? snap.cc.map((person) => person.email)
                    : undefined,
                  bcc: snap.bcc.length
                    ? snap.bcc.map((person) => person.email)
                    : undefined,
                  subject: snap.subject,
                  bodyText: snap.body,
                  attachments: snap.files.length
                    ? await Promise.all(
                        snap.files.map(async (item) => ({
                          filename: item.file.name,
                          contentType:
                            item.file.type || "application/octet-stream",
                          contentBase64: await fileToBase64(item.file),
                          size: item.file.size,
                        })),
                      )
                    : undefined,
                }),
              )
            : localDraftMessage(snap);
          setMail((prev) => [
            message,
            ...prev.filter((item) => item.id !== message.id),
          ]);
          showToast("Saved to Drafts");
          if (live) void refreshFolderCounts();
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : "Could not save draft",
          );
          return;
        }
      } else if (mode === "discard" && hasContent) {
        showToast("Draft discarded");
      }
      composeSnaps.current.delete(id);
      setComposeTabs((prev) => prev.filter((tab) => tab.id !== id));
      setActivePane((cur) => (cur === id ? "mail" : cur));
    } finally {
      closingCompose.current.delete(id);
    }
  };

  const downloadAppUpdate = async () => {
    setUpdateCardDismissed(false);
    try {
      setUpdateStatus(await bridgeDownloadUpdate());
    } catch {
      showToast("Could not start the update download");
    }
  };

  const updateAskOpen = useRef(false);
  const updateStatusRef = useRef(updateStatus);
  updateStatusRef.current = updateStatus;
  const askToDownloadUpdateRef = useRef<
    (version: string, force?: boolean) => Promise<void>
  >(async () => undefined);

  const askToDownloadUpdate = async (version: string, force = false) => {
    const trimmed = version.trim();
    if (!trimmed || updateAskOpen.current) return;
    if (!force && answeredUpdateDownloads.has(trimmed)) return;
    updateAskOpen.current = true;
    try {
      const ok = await askConfirm({
        tone: "info",
        ...downloadUpdateAsk(trimmed),
      });
      answeredUpdateDownloads.add(trimmed);
      if (ok) await downloadAppUpdate();
    } finally {
      updateAskOpen.current = false;
    }
  };
  askToDownloadUpdateRef.current = askToDownloadUpdate;

  useEffect(() => {
    if (updateStatus.state !== "available") return;
    const version = updateStatus.availableVersion?.trim();
    if (!version || answeredUpdateDownloads.has(version) || updateAskOpen.current) {
      return;
    }
    if (!notedUpdateDownloads.has(version)) {
      notedUpdateDownloads.add(version);
      const ask = downloadUpdateAsk(version);
      pushAppNotification({
        id: `update-${version}`,
        kind: "update",
        title: ask.title,
        body: ask.body,
      });
    }
    void askToDownloadUpdate(version);
  }, [updateStatus.state, updateStatus.availableVersion]);

  useEffect(() => {
    return bridgeOnUpdateAsk(() => {
      const status = updateStatusRef.current;
      if (status.state !== "available") return;
      void askToDownloadUpdateRef.current(status.availableVersion ?? "", true);
    });
  }, []);

  const restartForUpdate = async () => {
    if (updateStatus.state !== "ready") return;
    const ok = await askConfirm({
      tone: "info",
      ...restartUpdateAsk(updateStatus.availableVersion),
    });
    if (!ok) return;

    setUpdateCardDismissed(false);
    try {
      const started = await bridgeInstallUpdate();
      if (!started) {
        showToast("Could not restart to install the update");
      }
    } catch {
      showToast("Could not restart to install the update");
    }
  };

  const loadDemoWorkspace = () => {
    if (!live) {
      showToast("Demo data is already loaded");
      return;
    }
    setLive(false);
    setLiveFolderCounts(null);
    setAccounts(seedAccounts.map((a) => ({ ...a })));
    setLabels(seedLabels.map((l) => ({ ...l })));
    setMail(seedMessages.map((m) => ({ ...m })));
    setSelectedId("");
    setAccountId(UNIFIED_ID);
    setWorkspace("mail");
    setFolderId("inbox");
    setFilter("all");
    setListFilter(EMPTY_LIST_FILTER);
    setStackView("list");
    clearChecks();
    setSearchTokens([]);
    setContactDirectory(null);
    showToast("Demo data loaded");
  };

  const unloadDemoWorkspace = async () => {
    if (live) {
      showToast("Already on your inbox");
      return;
    }
    const has = await bridgeHasRealAccounts();
    if (!has) {
      setHasRealAccounts(false);
      showToast("Add an account to leave demo");
      return;
    }
    await loadLiveWorkspace();
    showToast("Back to your inbox");
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
      if (workspace === "agent") setWorkspace("mail");
      setSelectedId(messageId);
      if (prefs.layout === "stack") setStackView("reader");
      setReplyIntent((prev) => ({
        key: prev.key + 1,
        mode: action === "reply-all" ? "reply-all" : "reply",
      }));
      return;
    }
    if (action === "forward") {
      if (workspace === "agent") setWorkspace("mail");
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
        .then((result) => {
          const lab = result.assigned[0];
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
          void refreshFolderCounts();
          void refreshSnoozeTotal();
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
          noteSnoozed(
            [{ id: target.id, subject: target.subject }],
            detail ?? "later",
          );
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
          void refreshFolderCounts();
          void refreshSnoozeTotal();
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
          noteSnoozed(
            targets.map((message) => ({
              id: message.id,
              subject: message.subject,
            })),
            detail ?? "later",
          );
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
      void refreshFolderCounts();
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
  const autoLabelBusy = useRef(false);
  const [autoLabelPass, setAutoLabelPass] = useState(0);
  const unlabeledKey = mail
    .filter(
      (m) =>
        m.folder === "inbox" && !m.tag && !autoLabeledRef.current.has(m.id),
    )
    .map((m) => m.id)
    .sort()
    .slice(0, 8)
    .join("\n");
  const labelKey = labels.map((l) => `${l.id}:${l.name}`).join("|");
  useEffect(() => {
    if (!prefs.aiAutoLabel || prefs.aiBridge === "none") {
      autoLabeledRef.current = new Set();
      return;
    }
    if (!labels.length || autoLabelBusy.current) return;
    const pending = mail
      .filter(
        (m) =>
          m.folder === "inbox" && !m.tag && !autoLabeledRef.current.has(m.id),
      )
      .slice(0, 8);
    if (!pending.length) return;
    const inFlight = pending.map((message) => message.id);
    for (const id of inFlight) autoLabeledRef.current.add(id);
    autoLabelBusy.current = true;
    let advance = false;
    void aiLabelMessages(prefs, pending, labels)
      .then((result) => {
        // NONE and unparsed ids stay marked so a bad reply cannot spin.
        advance = true;
        if (result.assigned.length) {
          const byId = new Map(
            result.assigned.map((item) => [item.messageId, item]),
          );
          setMail((prev) =>
            prev.map((m) => {
              const lab = byId.get(m.id);
              if (!lab || m.tag) return m;
              return { ...m, tag: { label: lab.name, color: lab.color } };
            }),
          );
          if (live) {
            for (const lab of result.assigned) {
              void bridgeMutateMail(lab.messageId, "label", { detail: lab.id });
            }
          }
          showToast(
            `AI labeled ${result.assigned.length} email${result.assigned.length === 1 ? "" : "s"}`,
          );
        }
      })
      .catch((error: unknown) => {
        for (const id of inFlight) autoLabeledRef.current.delete(id);
        showToast(
          error instanceof Error ? error.message : "Auto-label failed",
        );
      })
      .finally(() => {
        autoLabelBusy.current = false;
        if (advance) setAutoLabelPass((n) => n + 1);
      });
  }, [
    prefs.aiAutoLabel,
    prefs.aiBridge,
    prefs.aiBridgePath,
    prefs.aiModelHint,
    unlabeledKey,
    labelKey,
    autoLabelPass,
    live,
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
    setNotifications((prev) =>
      prev.filter((item) => {
        if (item.kind !== "snooze" || item.folderId !== "snoozed" || !item.messageId) {
          return true;
        }
        const snapshot = byId.get(item.messageId);
        if (!snapshot) return true;
        return snapshot.folder === "snoozed";
      }),
    );
    lastActionRef.current = null;
    showToast(last.length > 1 ? `Undone ${last.length} changes` : "Undone");
  };

  const scoped = useMemo(() => {
    const searching = searchText.trim().length > 0;
    const globalSnooze = workspace === "snooze";
    return mail.filter((m) => {
      if (
        !globalSnooze &&
        accountId !== UNIFIED_ID &&
        m.accountId !== accountId
      ) {
        return false;
      }
      // Active search is cross-folder. Snooze search stays across every account.
      if (searching) return true;
      if (globalSnooze) return m.folder === "snoozed";
      if (folderId.startsWith("label:")) {
        const labelId = folderId.slice("label:".length);
        const label = labels.find((l) => l.id === labelId);
        if (!label) return false;
        return m.tag?.label === label.name;
      }
      if (folderId === "inbox") return m.folder === "inbox";
      return m.folder === folderId;
    });
  }, [mail, accountId, folderId, labels, searchText, workspace]);

  /** Demo / offline fallback — total messages per folder (Empty Junk/Trash). */
  const localFolderTotals = useMemo(() => {
    const counts: Record<string, number> = {};
    const allAccounts = workspace === "snooze" || accountId === UNIFIED_ID;
    for (const m of mail) {
      if (!allAccounts && m.accountId !== accountId) continue;
      counts[m.folder] = (counts[m.folder] ?? 0) + 1;
    }
    return counts;
  }, [mail, accountId, workspace]);

  /** Sidebar badges: unread conversations only (never raw folder totals). */
  const folderCounts = useMemo(() => {
    if (live && liveFolderCounts) {
      const out: Record<string, number> = {};
      for (const [id, entry] of Object.entries(liveFolderCounts.folders)) {
        out[id] = entry.unread;
      }
      return out;
    }
    const out: Record<string, number> = {};
    const allAccounts = workspace === "snooze" || accountId === UNIFIED_ID;
    for (const m of mail) {
      if (!allAccounts && m.accountId !== accountId) continue;
      if (!m.unread) continue;
      out[m.folder] = (out[m.folder] ?? 0) + 1;
    }
    return out;
  }, [live, liveFolderCounts, mail, accountId, workspace]);

  const folderTotals = useMemo(() => {
    if (live && liveFolderCounts) {
      const out: Record<string, number> = {};
      for (const [id, entry] of Object.entries(liveFolderCounts.folders)) {
        out[id] = entry.total;
      }
      return out;
    }
    return localFolderTotals;
  }, [live, liveFolderCounts, localFolderTotals]);

  const inboxBadgeCount =
    live && liveFolderCounts
      ? liveFolderCounts.inboxUnread
      : (folderCounts.inbox ?? 0);
  const taskbarCount = badgeCountForMode(prefs.taskbarBadge, mail);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void syncTaskbarBadge(prefs, mail);
    }, 500);
    return () => window.clearTimeout(handle);
    // Body hydration changes `mail` constantly. The icon only cares about the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskbarCount, prefs.taskbarBadge]);

  useEffect(() => {
    return bridgeOnNotifyOpen(({ messageId, folderId: nextFolder }) => {
      setWorkspace("mail");
      setSelectedId(messageId);
      setFolderId(nextFolder ?? "inbox");
      setStackView("reader");
    });
  }, []);

  const applyOpenTracking = (messageId: string, tracking: OpenTracking) => {
    setMail((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, openTracking: tracking } : m)),
    );
  };

  // Demo / local open-tracking: simulate a first open for unopened tracked sends.
  useEffect(() => {
    const pending = mailRef.current.filter(
      (m) =>
        m.folder === "sent" &&
        m.openTracking?.enabled &&
        (m.openTracking.opens?.length ?? 0) === 0,
    );
    if (!pending.length) return;

    const cleanups = pending.map((m, i) => {
      const to =
        m.thread[0]?.to?.map((r) => r.email).filter(Boolean) ?? [];
      if (!getTrackingForMessage(m.id)) {
        registerTrackedSend({
          messageId: m.id,
          subject: m.subject,
          to,
          token: m.openTracking?.token,
        });
      }
      return scheduleDemoOpen(m.id, 9_000 + i * 4_000, (tracking) => {
        applyOpenTracking(m.id, tracking);
      });
    });
    return () => {
      for (const stop of cleanups) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const { filtered, statusCounts } = useMemo(() => {
    let list = scoped;
    if (prefs.importantSplit) {
      if (filter === "important") list = list.filter((m) => m.important);
      else if (filter === "other") list = list.filter((m) => !m.important);
    }
    if (searchText.trim() && !live) {
      const parsed = parseSearchInput(searchText);
      const tokens = [...parsed.tokens];
      if (parsed.rest) tokens.push(makeToken("text", parsed.rest));
      if (tokens.length) {
        list = list.filter((m) => messageMatchesSearch(m, tokens));
      }
    }
    if (listFilter.starred || listFilter.attachment) {
      const narrowed = { ...listFilter, read: "all" as const };
      list = list.filter((message) =>
        messageMatchesListFilter(message, narrowed),
      );
    }
    let unread = 0;
    for (const message of list) {
      if (message.unread) unread += 1;
    }
    const counts: StatusCounts = {
      all: list.length,
      unread,
      read: list.length - unread,
    };
    if (listFilter.read !== "all") {
      list = list.filter((message) =>
        messageMatchesListFilter(message, listFilter),
      );
    }
    return { filtered: list, statusCounts: counts };
  }, [scoped, filter, prefs.importantSplit, searchText, live, listFilter]);

  const searchHits = useMemo((): SearchHit[] => {
    const q = searchText.trim();
    if (!q) return [];
    if (live && appliedQuery !== q) return [];
    return filtered.slice(0, 8).map((message) => ({
      id: message.id,
      from: message.from,
      email: message.email,
      subject: markQuery(message.subject, q),
      snippet: message.matchPreview || markQuery(message.preview, q),
      time: message.time,
      folder: message.folder,
    }));
  }, [filtered, searchText, live, appliedQuery]);

  const rememberSearch = (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 8);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  };

  const rememberOpen = (message: { id: string; from: string; subject: string; time: string }) => {
    const entry: RecentOpen = {
      id: message.id,
      from: message.from,
      subject: message.subject,
      time: message.time,
    };
    setRecentOpens((prev) => {
      const next = [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 6);
      localStorage.setItem(RECENT_OPEN_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openSearchHit = (id: string) => {
    showMailPane();
    setFocusMessageId(id);
    setSelectedId(id);
    setStackView("reader");
    rememberSearch(searchText);
    const known = mailRef.current.find((message) => message.id === id);
    if (known) {
      rememberOpen(known);
      return;
    }
    if (!live) return;
    void bridgeGetMail(id).then((dto) => {
      if (!dto) return;
      const ui = messageDtoToUi(dto);
      setMail((prev) => [ui, ...prev.filter((message) => message.id !== ui.id)]);
      rememberOpen(ui);
    });
  };

  const runCatchMeUp = () => {
    if (prefs.aiBridge === "none") {
      showToast("Pick an AI provider in Settings");
      return;
    }
    const source = filtered.filter((message) => message.folder === "inbox");
    const rows = source.length ? source : filtered;
    setCatchUpRequest({
      nonce: Date.now(),
      view: listTitle,
      messageIds: rows.slice(0, 40).map((message) => message.id),
    });
    openAgent();
  };

  // Only a message the user opened. Switching account or folder leaves this empty.
  const selected = filtered.find((m) => m.id === selectedId) ?? null;

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
        if (workspace === "agent") {
          setWorkspace("mail");
          window.setTimeout(() => {
            document.querySelector<HTMLElement>(".rail .account.active")?.focus();
          }, 0);
        } else {
          openAgent();
        }
        break;
      case "help":
        setCheatOpen(true);
        break;
      case "next":
        showMailPane();
        if (idx < 0 && filtered.length > 0) {
          setSelectedId(filtered[0].id);
          if (prefs.layout === "stack") setStackView("reader");
        } else if (idx >= 0 && idx < filtered.length - 1) {
          setSelectedId(filtered[idx + 1].id);
          if (prefs.layout === "stack") setStackView("reader");
        }
        break;
      case "prev":
        showMailPane();
        if (idx < 0 && filtered.length > 0) {
          setSelectedId(filtered[filtered.length - 1].id);
          if (prefs.layout === "stack") setStackView("reader");
        } else if (idx > 0) {
          setSelectedId(filtered[idx - 1].id);
          if (prefs.layout === "stack") setStackView("reader");
        }
        break;
      case "open":
        showMailPane();
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
        showMailPane();
        if (selected) applyAction(selected.id, "reply");
        break;
      case "replyAll":
        showMailPane();
        if (selected) applyAction(selected.id, "reply-all");
        break;
      case "forward":
        if (selected) applyAction(selected.id, "forward");
        break;
      case "undo":
        undoLast();
        break;
      case "goInbox":
        showMailPane();
        setWorkspace("mail");
        if (workspace !== "mail" || folderId !== "inbox") {
          setSelectedId("");
          setFocusMessageId(null);
          if (prefs.layout === "stack") setStackView("list");
        }
        setFolderId("inbox");
        break;
      case "goSnoozed":
        openSnooze();
        break;
      case "goSent":
        showMailPane();
        setWorkspace("mail");
        if (workspace !== "mail" || folderId !== "sent") {
          setSelectedId("");
          setFocusMessageId(null);
          if (prefs.layout === "stack") setStackView("list");
        }
        setFolderId("sent");
        break;
      case "goDrafts":
        showMailPane();
        setWorkspace("mail");
        if (workspace !== "mail" || folderId !== "drafts") {
          setSelectedId("");
          setFocusMessageId(null);
          if (prefs.layout === "stack") setStackView("list");
        }
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
      if (document.body.hasAttribute("data-attachment-preview")) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
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
        if (pluginDialogOpen) return;
        // Leave the draft open so they can come back to it.
        if (activePaneRef.current !== "mail") {
          setActivePane("mail");
          if (prefs.layout === "stack") setStackView("list");
          return;
        }
        if (prefs.layout === "stack" && stackView === "reader") {
          setStackView("list");
          return;
        }
        setSettingsOpen(false);
        setPluginsOpen(false);
        setAddAccountOpen(false);
        setCheatOpen(false);
        setChord(null);
        return;
      }

      if (
        alert ||
        onboardingOpen ||
        settingsOpen ||
        pluginsOpen ||
        pluginDialogOpen ||
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
    if (workspace === "snooze") return "Snoozed";
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

  const showUnifiedChrome =
    workspace === "snooze" || accountId === UNIFIED_ID;
  const snoozeCount = live
    ? (globalSnoozeTotal ?? 0)
    : mail.filter((m) => m.folder === "snoozed").length;
  const sidebarAccount =
    workspace === "snooze"
      ? (accounts.find((a) => a.id === UNIFIED_ID) ?? account)
      : account;
  const readingAccount =
    workspace === "snooze" && selected
      ? accountFor(selected.accountId, accounts)
      : account;
  const creatorOwnEmails = useMemo(() => ownEmailSet(accounts), [accounts]);

  const accent = accentColors[prefs.accent];
  // Narrow keeps a short measure. Medium and Wide fill the reading pane so
  // a maximized or full-screen window does not leave a blank column beside the mail.
  const readingMax = prefs.readingWidth === "narrow" ? "560px" : "100%";

  const toggleCreatorMode = () => {
    const turningOn = !prefs.creatorMode;
    updatePrefs({
      ...prefs,
      creatorMode: turningOn,
      creatorBlur:
        turningOn && prefs.creatorBlur.length === 0
          ? ["addresses"]
          : prefs.creatorBlur,
    });
  };

  return (
    <CreatorBlurProvider prefs={prefs} ownEmails={creatorOwnEmails}>
    <div
      className={`app density-${prefs.density} layout-${prefs.layout}${prefs.layout === "stack" ? ` stack-${stackView}` : ""}${showAi && workspace === "agent" ? " workspace-agent" : ""}${prefs.reduceMotion ? " reduce-motion" : ""}`}
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
        searchRef={searchRef}
        searchTokens={searchTokens}
        labels={labels}
        onSearchTokens={setSearchTokens}
        searchHits={searchHits}
        searchBusy={live && searchText.trim() !== appliedQuery && searchText.trim().length > 0}
        recentSearches={recentSearches}
        recentOpens={recentOpens}
        onOpenHit={openSearchHit}
        onQueryChange={(q) => {
          setSearchText(q);
          if (!live) return;
          if (searchTimer.current) window.clearTimeout(searchTimer.current);
          searchTimer.current = window.setTimeout(() => {
            void refreshLiveMail({ q, quiet: true });
          }, 90);
        }}
        onPickRecent={(q) => {
          const parsed = parseSearchInput(q);
          const tokens = [...parsed.tokens];
          if (parsed.rest) tokens.push(makeToken("text", parsed.rest));
          setSearchTokens(tokens);
          rememberSearch(q);
        }}
        notifications={notifications}
        onMarkNotificationsRead={() =>
          setNotifications((prev) =>
            prev.map((n) => ({ ...n, unread: false })),
          )
        }
        onToggleCreator={toggleCreatorMode}
        onOpenNotification={(n) => {
          if (n.messageId) {
            showMailPane();
            setWorkspace("mail");
            setSelectedId(n.messageId);
            setFolderId(
              n.folderId ??
                (n.kind === "opened"
                  ? "sent"
                  : n.kind === "snooze"
                    ? "inbox"
                    : "inbox"),
            );
            setStackView("reader");
          } else if (n.kind === "ai") {
            openAgent();
          } else if (n.kind === "update") {
            const version = updateStatusRef.current.availableVersion ?? "";
            if (updateStatusRef.current.state === "available") {
              void askToDownloadUpdateRef.current(version, true);
            }
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
          showAgent={showAi}
          agentOpen={showAi && workspace === "agent"}
          snoozeOpen={workspace === "snooze"}
          snoozeCount={snoozeCount}
          highlightAccounts={workspace === "mail"}
          onAgent={() => openAgent()}
          onSnooze={openSnooze}
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
            const sameMailbox =
              workspace === "mail" &&
              accountId === id &&
              folderId === "inbox" &&
              filter === "all";
            setWorkspace("mail");
            setAccountId(id);
            setFolderId("inbox");
            setFilter("all");
            setStackView("list");
            showMailPane();
            clearChecks();
            if (!sameMailbox) {
              setSelectedId("");
              setFocusMessageId(null);
            }
          }}
          onAdd={() => setAddAccountOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onPlugins={() => setPluginsOpen(true)}
          updateStatus={updateStatus}
          onDownloadUpdate={() => void downloadAppUpdate()}
          onRestartUpdate={() => void restartForUpdate()}
          plugins={PLUGIN_CATALOG.filter((entry) =>
            pluginStatuses.some(
              (status) =>
                status.id === entry.id && status.connected && status.enabled,
            ),
          ).map((entry) => ({ id: entry.id, name: entry.name }))}
          activePluginId={workspace === "plugin" ? openPluginId : null}
          onOpenPlugin={openPlugin}
        />
        <div
          className={`mail-workspace${composeTabs.length > 0 ? " has-compose" : ""}`}
          hidden={(showAi && workspace === "agent") || workspace === "plugin"}
        >
        {composeTabs.length > 0 && (
          <div className="pane-tabs" role="tablist" aria-label="Mail and drafts">
            <button
              type="button"
              role="tab"
              aria-selected={activePane === "mail"}
              className={`pane-tab${activePane === "mail" ? " active" : ""}`}
              onClick={() => {
                const leavingCompose = activePane !== "mail";
                showMailPane();
                if (leavingCompose && prefs.layout === "stack") {
                  setStackView(selectedId ? "reader" : "list");
                }
              }}
            >
              <Mail size={13} strokeWidth={1.75} />
              <span>{selected?.subject?.trim() || "Mail"}</span>
            </button>
            {composeTabs.map((tab) => (
              <div
                key={tab.id}
                className={`pane-tab compose-tab${activePane === tab.id ? " active" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePane === tab.id}
                  className="pane-tab-main"
                  onClick={() => {
                    setWorkspace("mail");
                    setActivePane(tab.id);
                    setStackView("reader");
                  }}
                >
                  <FileText size={13} strokeWidth={1.75} />
                  <span>{tab.label}</span>
                </button>
                <button
                  type="button"
                  className="pane-tab-close"
                  aria-label={`Close ${tab.label}`}
                  title="Close and save draft"
                  onClick={() => void closeComposeTab(tab.id, "save")}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        <Sidebar
          account={sidebarAccount}
          activeFolder={workspace === "snooze" ? "snoozed" : folderId}
          customFolders={customFolders}
          labels={labels}
          snoozeCount={snoozeCount}
          inboxAsInbox={workspace === "snooze"}
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
          inboxCount={inboxBadgeCount}
          folderCounts={folderCounts}
          folderTotals={folderTotals}
          onFolder={selectFolder}
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
          refine={listFilter}
          statusCounts={statusCounts}
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
            onRun: runCatchMeUp,
          }}
          syncing={syncing}
          fullScreen={prefs.layout === "stack"}
          onCompose={() => openCompose()}
          onFilter={(f) => setFilter(f)}
          onRefine={setListFilter}
          onRefresh={() => {
            if (!live) {
              showToast("Connect Gmail to sync real mail");
              return;
            }
            setSyncing(true);
            void bridgeSync(
              workspace === "snooze" || accountId === UNIFIED_ID
                ? undefined
                : accountId,
            )
              .then(() => refreshLiveMail())
              .finally(() => setSyncing(false));
          }}
          onSelect={(id) => {
            showMailPane();
            clearChecks();
            setFocusMessageId(null);
            setSelectedId(id);
            if (prefs.layout === "stack") setStackView("reader");
            if (prefs.markReadOnOpen) {
              setMail((prev) =>
                prev.map((m) =>
                  m.id === id && m.unread ? { ...m, unread: false } : m,
                ),
              );
              if (live) {
                void bridgeMutateMail(id, "read").then(() =>
                  refreshFolderCounts(),
                );
              }
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
          hasMore={live && listHasMore}
          loadingMore={listLoadingOlder}
          scrollEpoch={listScrollEpoch}
          onNearEnd={() => {
            if (!live) return;
            void refreshLiveMail({ append: true });
          }}
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
        <div className="reader-column">
          <div className="reader-stage">
            <div className="reader-stage-pane" hidden={activePane !== "mail"}>
        <ReadingPane
          message={selected}
          focusMessageId={focusMessageId}
          stickySubject={prefs.stickySubject}
          forceDarkHtml={prefs.forceDarkHtml && theme === "dark"}
          conversationView={prefs.conversationView}
          showAi={showAi}
          prefs={prefs}
          live={live}
          account={readingAccount}
          accounts={accounts}
          emptyTitle={listTitle}
          bodyLoading={Boolean(
            selected && bodyLoadingId === selected.id,
          )}
          onBack={
            prefs.layout === "stack" ? () => setStackView("list") : undefined
          }
          labels={labels}
          customFolders={customFolders}
          onAsk={() => {
            if (selected) openAgent(selected.id);
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
          pluginStatuses={pluginStatuses}
          onOpenPlugins={() => setPluginsOpen(true)}
          onPluginDialogChange={setPluginDialogOpen}
          replyIntent={replyIntent}
          onReplySent={(message) => {
            setMail((prev) => mergeSentIntoList(prev, message));
          }}
        />
            </div>
            {composeTabs.map((tab) => (
              <div
                key={tab.id}
                className="reader-stage-pane"
                hidden={activePane !== tab.id}
              >
                <ComposePane
                  account={account}
                  accounts={accounts}
                  prefs={prefs}
                  showAi={showAi}
                  live={live}
                  initialTo={tab.to}
                  initialCc={tab.cc}
                  initialBcc={tab.bcc}
                  initialSubject={tab.subject}
                  initialBody={tab.body}
                  title={tab.title}
                  onSaveClose={() => void closeComposeTab(tab.id, "save")}
                  onDismiss={() => void closeComposeTab(tab.id, "discard")}
                  onSnapshot={(snap) => {
                    composeSnaps.current.set(tab.id, snap);
                  }}
                  onLabel={(label) => {
                    setComposeTabs((prev) => {
                      const current = prev.find((item) => item.id === tab.id);
                      if (!current || current.label === label) return prev;
                      return prev.map((item) =>
                        item.id === tab.id ? { ...item, label } : item,
                      );
                    });
                  }}
                  onQueued={(queueId, seconds) => {
                    showToast(`Sending in ${seconds}s — press Z to undo`);
                    const prevUndo = lastActionRef.current;
                    lastActionRef.current = [];
                    const handle = window.setTimeout(() => undefined, seconds * 1000);
                    void handle;
                    const cancel = () => {
                      void bridgeCancelSend(queueId).then((ok) => {
                        showToast(ok ? "Send cancelled" : "Already sent");
                      });
                    };
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
                    showMailPane();
                    showToast(
                      message.openTracking
                        ? "Sent · tracking recorded locally"
                        : "Sent",
                    );
                    if (
                      message.openTracking?.enabled &&
                      (message.openTracking.opens?.length ?? 0) === 0
                    ) {
                      scheduleDemoOpen(message.id, 12_000, (tracking) => {
                        applyOpenTracking(message.id, tracking);
                      });
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        </div>
        {workspace === "plugin" && openPluginId ? (
          <PluginSurface
            id={openPluginId}
            statuses={pluginStatuses}
            onStatuses={setPluginStatuses}
            onOpenSettings={() => setPluginsOpen(true)}
            onToast={showToast}
          />
        ) : null}
        {showAi ? (
          <FloatingAsk
            open={workspace === "agent"}
            mail={mail}
            labels={labels}
            threadRequest={threadRequest}
            catchUpRequest={catchUpRequest}
            bridgeName={aiBridgeMeta[prefs.aiBridge]?.name ?? "Local"}
            prefs={prefs}
            onOpenMessage={(id) => {
              showMailPane();
              const message = mail.find((item) => item.id === id);
              setFilter("all");
              setListFilter(EMPTY_LIST_FILTER);
              setFocusMessageId(id);
              if (message?.folder === "snoozed") {
                openSnooze();
              } else {
                setWorkspace("mail");
                setFolderId(message?.folder || "inbox");
              }
              setSelectedId(id);
              if (prefs.layout === "stack") setStackView("reader");
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onPickAi={(patch) => updatePrefs({ ...prefs, ...patch })}
          />
        ) : null}
      </div>

      {settingsOpen && (
        <SettingsModal
          prefs={prefs}
          accounts={
            !live && hasRealAccounts && liveAccountSnapshot.length
              ? liveAccountSnapshot
              : accounts
          }
          demoActive={!live}
          canUnloadDemo={hasRealAccounts}
          onLoadDemo={loadDemoWorkspace}
          onUnloadDemo={() => {
            void unloadDemoWorkspace();
          }}
          onDownloadUpdate={downloadAppUpdate}
          onInstallUpdate={restartForUpdate}
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
            if (live) {
              setAccounts((prev) => prev.filter((a) => a.id !== id));
              setAccountId((cur) => (cur === id ? UNIFIED_ID : cur));
              void loadLiveWorkspace().then(() => undefined);
              return;
            }
            // Demo shell — only update the real-account snapshot used by Settings.
            setLiveAccountSnapshot((prev) =>
              prev.filter((a) => a.id !== id),
            );
            void bridgeHasRealAccounts().then((has) => {
              setHasRealAccounts(has);
              if (!has) setLiveAccountSnapshot([]);
            });
          }}
          onUpdateAccount={(account) => {
            const merge = (list: Account[]) =>
              list.map((a) =>
                a.id === account.id
                  ? {
                      ...a,
                      ...account,
                      // Keep rail unread from the live sync tally.
                      unread: a.unread,
                    }
                  : a,
              );
            if (live) {
              setAccounts(merge);
              setLiveAccountSnapshot(merge);
            } else if (hasRealAccounts) {
              setLiveAccountSnapshot(merge);
            } else {
              setAccounts(merge);
            }
          }}
          onInstallUpdate={() => {
            void restartForUpdate();
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pluginsOpen && (
        <PluginModal
          statuses={pluginStatuses}
          onStatuses={setPluginStatuses}
          onClose={() => setPluginsOpen(false)}
          onToast={showToast}
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
            setSelectedId("");
            setFocusMessageId(null);
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
            setSelectedId("");
            setFocusMessageId(null);
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
            setSelectedId("");
            setFocusMessageId(null);
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
      {!updateCardDismissed && shouldShowUpdateProgressCard(updateStatus) && (
        <UpdateProgressCard
          status={updateStatus}
          onRestart={() => void restartForUpdate()}
          onRetry={() => void downloadAppUpdate()}
          onDismiss={() => setUpdateCardDismissed(true)}
        />
      )}
      <AlertDialog
        alert={alert}
        onConfirm={() => closeAlert(true)}
        onCancel={() => closeAlert(false)}
      />
      {toast && (
        <div className="toast fade-up">
          <BlurredEmails text={toast} />
        </div>
      )}
    </div>
    </CreatorBlurProvider>
  );
}
