import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Check, Eye, Mail, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import "./FloatingAsk.css";
import { buildDayBrief, type BriefKind } from "./agentBrief";
import { DayBoard, DayFocus } from "./DayBoard";
import { parseDayScene, presentDay, type DayPiece } from "./dayScene";
import { mailCites } from "./answerCites";
import { readyBridgeIds } from "./agentModelMenu";
import { aiAskAboutMail, aiCatchMeUp, aiDayRundown, catchUpSource } from "./aiClient";
import { BridgeLogo, bridgePickerOrder } from "./bridgeLogos";
import { bridgeAiDetect, bridgeAiModels, bridgeGetMail, messageDtoToUi } from "./mailApi";
import { usageLimitMessage } from "../shared/aiError";
import { turnPlainText } from "./mailText";
import { useContacts, type Contact } from "./contacts";
import type { Label, Message } from "./data/mock";
import {
  aiBridgeMeta,
  type AiBridgeId,
  type Preferences,
} from "./preferences";
import type { AiModelChoice, AiProviderStatus } from "../shared/types";

export type AskPull = {
  id: string;
  messageId: string;
  at?: string;
  from?: string;
  subject: string;
  text: string;
};

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  contextLabel?: string;
  pulls?: AskPull[];
};

type MentionKind = "person" | "label" | "skill" | "thread";
type MentionTrigger = "@" | "#" | "/" | "$";

type MentionItem = {
  kind: MentionKind;
  id: string;
  label: string;
  detail: string;
  trigger: MentionTrigger;
};

type AskTags = {
  people: string[];
  labelIds: string[];
  skillIds: string[];
  threadIds: string[];
};

type ActiveMention = {
  kind: MentionKind;
  trigger: MentionTrigger;
  query: string;
  start: number;
  end: number;
};

const MENTION_META: Record<
  MentionKind,
  { trigger: MentionTrigger; menu: string; title: string; text: string }
> = {
  person: {
    trigger: "@",
    menu: "People",
    title: "Person",
    text: "Someone in your mail. Answers stay on threads they appear in.",
  },
  label: {
    trigger: "#",
    menu: "Labels",
    title: "Label",
    text: "A label or folder. Answers prefer mail tagged there.",
  },
  skill: {
    trigger: "/",
    menu: "Skills",
    title: "Skill",
    text: "How to answer: summarize, draft, deadlines, or unanswered.",
  },
  thread: {
    trigger: "$",
    menu: "Threads",
    title: "Thread",
    text: "One conversation. Same pin as +, typed instead of searched.",
  },
};

const BRIEF_PROMPTS = [
  "Give me a rundown of today",
  "What should I follow up on?",
  "Which meetings are coming up or missed?",
  "Summarize unread mail from the past day",
];

const SKILLS: { id: string; name: string; detail: string }[] = [
  { id: "summarize", name: "Summarize", detail: "Catch me up in a few lines" },
  { id: "draft", name: "Draft reply", detail: "Suggest a reply in my voice" },
  { id: "deadlines", name: "Deadlines", detail: "Dates and commitments" },
  { id: "unanswered", name: "Unanswered", detail: "Who is waiting on me" },
  { id: "decisions", name: "Decisions", detail: "What was agreed" },
];

function emptyTags(): AskTags {
  return { people: [], labelIds: [], skillIds: [], threadIds: [] };
}

type AgentSession = {
  id: string;
  title: string;
  messages: ChatTurn[];
  tags: AskTags;
  draft: string;
  updatedAt: number;
};

type AgentStore = {
  sessions: AgentSession[];
  activeId: string;
};

const AGENT_SESSIONS_KEY = "intray.agent-sessions.v1";
const AGENT_BOARD_KEY = "intray.agent-board-open";
const MAX_AGENT_SESSIONS = 12;

export type AgentThreadRequest = {
  nonce: number;
  messageId: string;
};

/** Opens a new agent chat and catches the user up on one mailbox view. */
export type AgentCatchUpRequest = {
  nonce: number;
  view: string;
  messageIds: string[];
};

function clipTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "New chat";
  return line.length > 36 ? `${line.slice(0, 36).trimEnd()}…` : line;
}

function sessionAge(updatedAt: number, now: number): string {
  const delta = Math.max(0, now - updatedAt);
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function sessionPreview(session: AgentSession): string {
  for (let i = session.messages.length - 1; i >= 0; i -= 1) {
    const turn = session.messages[i];
    if (turn?.role === "user" && turn.text.trim()) {
      return turn.text.replace(/\s+/g, " ").trim();
    }
  }
  return "Today’s mail";
}

function blankSession(): AgentSession {
  return {
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: "New chat",
    messages: [],
    tags: emptyTags(),
    draft: "",
    updatedAt: Date.now(),
  };
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asTags(value: unknown): AskTags {
  if (!value || typeof value !== "object") return emptyTags();
  const row = value as AskTags;
  return {
    people: asStringList(row.people),
    labelIds: asStringList(row.labelIds),
    skillIds: asStringList(row.skillIds),
    threadIds: asStringList(row.threadIds),
  };
}

function asTurn(value: unknown): ChatTurn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ChatTurn;
  if (row.role !== "user" && row.role !== "assistant") return null;
  if (typeof row.id !== "string" || typeof row.text !== "string") return null;
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    contextLabel:
      typeof row.contextLabel === "string" ? row.contextLabel : undefined,
    pulls: Array.isArray(row.pulls) ? row.pulls : undefined,
  };
}

function loadAgentStore(): AgentStore {
  const fresh = () => {
    const session = blankSession();
    return { sessions: [session], activeId: session.id };
  };
  try {
    const raw = localStorage.getItem(AGENT_SESSIONS_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as {
      sessions?: unknown;
      activeId?: unknown;
    };
    if (!Array.isArray(parsed.sessions)) return fresh();
    const sessions: AgentSession[] = [];
    for (const item of parsed.sessions) {
      if (!item || typeof item !== "object") continue;
      const row = item as AgentSession;
      if (typeof row.id !== "string") continue;
      const messages = Array.isArray(row.messages)
        ? row.messages
            .map(asTurn)
            .filter((turn): turn is ChatTurn => Boolean(turn))
        : [];
      sessions.push({
        id: row.id,
        title: typeof row.title === "string" && row.title ? row.title : "New chat",
        messages,
        tags: asTags(row.tags),
        draft: typeof row.draft === "string" ? row.draft : "",
        updatedAt:
          typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
      });
    }
    if (!sessions.length) return fresh();
    const trimmed = sessions.slice(-MAX_AGENT_SESSIONS);
    const activeId = trimmed.some((session) => session.id === parsed.activeId)
      ? String(parsed.activeId)
      : trimmed[trimmed.length - 1].id;
    return { sessions: trimmed, activeId };
  } catch {
    return fresh();
  }
}

function kindFromTrigger(ch: string): MentionKind | null {
  if (ch === "@") return "person";
  if (ch === "#") return "label";
  if (ch === "/") return "skill";
  if (ch === "$") return "thread";
  return null;
}

function activeMention(text: string, caret: number): ActiveMention | null {
  const before = text.slice(0, caret);
  const match = /(?:^|[\s([{])([@#/$])([^\s@#/$]*)$/.exec(before);
  if (!match) return null;
  const trigger = match[1] as MentionTrigger;
  const kind = kindFromTrigger(trigger);
  if (!kind) return null;
  const start = before.length - match[1].length - match[2].length;
  return { kind, trigger, query: match[2], start, end: caret };
}

function dropActiveMention(text: string, mention: ActiveMention) {
  const next = `${text.slice(0, mention.start)}${text.slice(mention.end)}`;
  return { text: next, caret: mention.start };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function richLine(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function parseAnswer(text: string) {
  type Block =
    | { kind: "p"; text: string }
    | { kind: "h"; text: string }
    | { kind: "ul"; items: string[] }
    | { kind: "ol"; items: string[] };
  const blocks: Block[] = [];
  let list: Extract<Block, { kind: "ul" | "ol" }> | null = null;
  const flush = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[2]!.replace(/\*\*/g, "") });
      continue;
    }
    const bullet = /^(?:[-•*]|\u2022)\s+(.+)$/.exec(line);
    if (bullet) {
      if (!list || list.kind !== "ul") {
        flush();
        list = { kind: "ul", items: [] };
      }
      list.items.push(bullet[1]!);
      continue;
    }
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (numbered) {
      if (!list || list.kind !== "ol") {
        flush();
        list = { kind: "ol", items: [] };
      }
      list.items.push(numbered[1]!);
      continue;
    }
    flush();
    blocks.push({ kind: "p", text: line });
  }
  flush();
  return blocks.length ? blocks : [{ kind: "p" as const, text }];
}

function AnswerBody({ text }: { text: string }) {
  return (
    <div className="float-ask-prose">
      {parseAnswer(text).map((block, index) => {
        if (block.kind === "h") return <h3 key={index}>{block.text}</h3>;
        if (block.kind === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item) => (
                <li key={item}>{richLine(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={index}>
              {block.items.map((item) => (
                <li key={item}>{richLine(item)}</li>
              ))}
            </ol>
          );
        }
        return <p key={index}>{richLine(block.text)}</p>;
      })}
    </div>
  );
}

function listMentions(opts: {
  kind: MentionKind;
  query: string;
  contacts: Contact[];
  labels: Label[];
  mail: Message[];
  tags: AskTags;
}): MentionItem[] {
  const q = opts.query.trim().toLowerCase();
  if (opts.kind === "person") {
    return opts.contacts
      .filter((c) => !opts.tags.people.includes(c.email))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map((c) => ({
        kind: "person" as const,
        id: c.email,
        label: c.name,
        detail: c.email,
        trigger: "@" as const,
      }));
  }
  if (opts.kind === "label") {
    return opts.labels
      .filter((l) => !opts.tags.labelIds.includes(l.id))
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((l) => ({
        kind: "label" as const,
        id: l.id,
        label: l.name,
        detail: "Label",
        trigger: "#" as const,
      }));
  }
  if (opts.kind === "skill") {
    return SKILLS.filter((s) => !opts.tags.skillIds.includes(s.id))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.detail.toLowerCase().includes(q),
      )
      .map((s) => ({
        kind: "skill" as const,
        id: s.id,
        label: s.name,
        detail: s.detail,
        trigger: "/" as const,
      }));
  }
  return opts.mail
    .filter((m) => !opts.tags.threadIds.includes(m.id))
    .filter(
      (m) =>
        !q ||
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((m) => ({
      kind: "thread" as const,
      id: m.id,
      label: m.subject,
      detail: `${m.from} · ${m.time}`,
      trigger: "$" as const,
    }));
}

function withMention(tags: AskTags, item: MentionItem): AskTags {
  if (item.kind === "person") {
    if (tags.people.includes(item.id)) return tags;
    return { ...tags, people: [item.id, ...tags.people] };
  }
  if (item.kind === "label") {
    if (tags.labelIds.includes(item.id)) return tags;
    return { ...tags, labelIds: [item.id, ...tags.labelIds] };
  }
  if (item.kind === "skill") {
    if (tags.skillIds.includes(item.id)) return tags;
    return { ...tags, skillIds: [item.id, ...tags.skillIds] };
  }
  if (tags.threadIds.includes(item.id)) return tags;
  return { ...tags, threadIds: [item.id, ...tags.threadIds] };
}

function withoutMention(tags: AskTags, kind: MentionKind, id: string): AskTags {
  if (kind === "person") {
    return { ...tags, people: tags.people.filter((x) => x !== id) };
  }
  if (kind === "label") {
    return { ...tags, labelIds: tags.labelIds.filter((x) => x !== id) };
  }
  if (kind === "skill") {
    return { ...tags, skillIds: tags.skillIds.filter((x) => x !== id) };
  }
  return { ...tags, threadIds: tags.threadIds.filter((x) => x !== id) };
}

function threadSeed(message: Message) {
  const latest = message.thread[message.thread.length - 1];
  const snippet =
    (latest ? turnPlainText(latest).slice(0, 140) : "") || message.preview;
  const people = Array.from(
    new Set(message.thread.map((t) => t.from).filter(Boolean)),
  );
  return {
    text: `This thread is with **${people.join(", ") || message.from}** (${message.thread.length} message${message.thread.length === 1 ? "" : "s"}).\n\nLatest from **${latest?.from ?? message.from}**: “${snippet}”`,
    pulls: [
      {
        id: `${message.id}-pull`,
        messageId: message.id,
        at: message.time,
        from: latest?.from ?? message.from,
        subject: message.subject,
        text: snippet,
      },
    ] satisfies AskPull[],
  };
}

function citedPulls(ids: string[], mail: Message[]): AskPull[] {
  return ids.map((id) => {
    const message = mail.find((item) => item.id === id);
    return {
      id: `cite-${id}`,
      messageId: id,
      at: message?.time,
      from: message?.from,
      subject: message?.subject || "Open this email",
      text: message?.preview || "",
    };
  });
}

function relatedPulls(
  question: string,
  mail: Message[],
  tags: AskTags,
  focus: Message | null,
): AskPull[] {
  const pinned =
    tags.threadIds
      .map((id) => mail.find((m) => m.id === id))
      .filter((m): m is Message => Boolean(m))[0] ?? focus;
  if (pinned) return threadSeed(pinned).pulls;

  const waiting =
    /unanswered|waiting|owe/i.test(question) ||
    tags.skillIds.includes("unanswered");
  const hits = (waiting
    ? mail.filter((m) => m.unread || m.important)
    : mail
  ).slice(0, 3);
  return hits.map((m) => ({
    id: `hit-${m.id}`,
    messageId: m.id,
    at: m.time,
    from: m.from,
    subject: m.subject,
    text: m.preview,
  }));
}

export function FloatingAsk({
  open,
  mail,
  labels,
  threadRequest,
  catchUpRequest,
  bridgeName,
  prefs,
  onOpenMessage,
  onOpenSettings,
  onPickAi,
}: {
  open: boolean;
  mail: Message[];
  labels: Label[];
  /** Bumps when the reader asks about one thread. Opens or focuses that chat. */
  threadRequest: AgentThreadRequest | null;
  /** Bumps when the inbox asks to catch up. Starts that chat. */
  catchUpRequest: AgentCatchUpRequest | null;
  bridgeName: string;
  prefs: Preferences;
  onOpenMessage: (id: string) => void;
  onOpenSettings: () => void;
  /** Saves the provider and model used for this chat and the rest of Intray. */
  onPickAi: (patch: { aiBridge: AiBridgeId; aiModelHint: string }) => void;
}) {
  const panelId = useId();
  const inputId = useId();
  const pickerId = useId();
  const mentionListId = useId();
  const modelMenuId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  const [agentStore, setAgentStore] = useState(loadAgentStore);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [mentionHeld, setMentionHeld] = useState(false);
  const [mentionCursor, setMentionCursor] = useState({ key: "", index: 0 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [modelMenu, setModelMenu] = useState(false);
  const [detectedBridges, setDetectedBridges] = useState<
    AiProviderStatus[] | null
  >(null);
  const [modelChoices, setModelChoices] = useState<AiModelChoice[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsNote, setModelsNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [boardOpen, setBoardOpen] = useState(() => {
    try {
      return localStorage.getItem(AGENT_BOARD_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [rundown, setRundown] = useState<{
    key: string;
    text: string;
    note: string;
    busy: boolean;
  }>({ key: "", text: "", note: "", busy: false });
  const [dayLens, setDayLens] = useState<BriefKind | "all">("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [openedMail, setOpenedMail] = useState<{
    id: string;
    message: Message | null;
    busy: boolean;
  }>({ id: "", message: null, busy: false });
  const pendingCaret = useRef<number | null>(null);
  const seededNonce = useRef<number | null>(null);
  const catchUpNonce = useRef<number | null>(null);
  const rundownLoaded = useRef<string | null>(null);

  const sessions = agentStore.sessions;
  const activeId = agentStore.activeId;
  const active =
    sessions.find((session) => session.id === activeId) ?? sessions[0];
  const messages = active?.messages ?? [];
  const tags = active?.tags ?? emptyTags();
  const draft = active?.draft ?? "";
  const busy = Boolean(active && busySessionId === active.id);

  function setDraft(value: string) {
    const id = active?.id;
    if (!id) return;
    setAgentStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.id === id ? { ...session, draft: value } : session,
      ),
    }));
  }

  function setTags(update: AskTags | ((current: AskTags) => AskTags)) {
    const id = active?.id;
    if (!id) return;
    setAgentStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== id) return session;
        const next =
          typeof update === "function" ? update(session.tags) : update;
        return { ...session, tags: next, updatedAt: Date.now() };
      }),
    }));
  }

  function setMessages(
    update: ChatTurn[] | ((current: ChatTurn[]) => ChatTurn[]),
  ) {
    const id = active?.id;
    if (!id) return;
    setAgentStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== id) return session;
        const next =
          typeof update === "function" ? update(session.messages) : update;
        const title =
          session.title === "New chat"
            ? clipTitle(next.find((turn) => turn.role === "user")?.text ?? "")
            : session.title;
        return { ...session, messages: next, title, updatedAt: Date.now() };
      }),
    }));
  }

  const contacts = useContacts();

  const mention =
    pickerOpen || mentionHeld ? null : activeMention(draft, caret);
  const mentionKey = mention ? `${mention.kind}:${mention.query}` : "";
  const mentionItems = mention
    ? listMentions({
        kind: mention.kind,
        query: mention.query,
        contacts,
        labels,
        mail,
        tags,
      })
    : [];
  const safeMentionIndex = mentionItems.length
    ? ((mentionCursor.key === mentionKey ? mentionCursor.index : 0) %
        mentionItems.length +
        mentionItems.length) %
      mentionItems.length
    : 0;

  const chips = useMemo(() => {
    const list: {
      kind: MentionKind;
      id: string;
      label: string;
      message?: Message;
    }[] = [];
    for (const id of tags.skillIds) {
      const skill = SKILLS.find((s) => s.id === id);
      if (skill) list.push({ kind: "skill", id, label: skill.name });
    }
    for (const email of tags.people) {
      const c = contacts.find((x) => x.email === email);
      list.push({ kind: "person", id: email, label: c?.name ?? email });
    }
    for (const id of tags.labelIds) {
      const label = labels.find((l) => l.id === id);
      if (label) list.push({ kind: "label", id, label: label.name });
    }
    for (const id of tags.threadIds) {
      const message = mail.find((m) => m.id === id);
      if (message) {
        list.push({
          kind: "thread",
          id,
          label: message.subject,
          message,
        });
      }
    }
    return list;
  }, [contacts, labels, mail, tags]);

  const pickerRows = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    return mail
      .filter((m) => !tags.threadIds.includes(m.id))
      .filter(
        (m) =>
          !needle ||
          m.subject.toLowerCase().includes(needle) ||
          m.from.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [mail, pickerQuery, tags.threadIds]);

  const draftBody = (
    mention ? dropActiveMention(draft, mention).text : draft
  ).trim();
  const canSend = (Boolean(draftBody) || tags.skillIds.length > 0) && !busy;
  const minute = Math.floor(Date.now() / 60_000);
  const brief = useMemo(
    () => buildDayBrief(mail, new Date(minute * 60_000)),
    [mail, minute],
  );
  const briefKey = [
    brief.headline,
    ...brief.meetings.map((item) => item.id),
    ...brief.missed.map((item) => item.id),
    ...brief.followups.map((item) => item.id),
    ...brief.today.map((item) => item.id),
  ].join("|");
  const day = useMemo(() => {
    const scene =
      rundown.key === briefKey && rundown.text
        ? parseDayScene(rundown.text, new Set(mail.map((row) => row.id)))
        : null;
    return presentDay(brief, scene, mail);
  }, [brief, briefKey, mail, rundown.key, rundown.text]);
  const mailRef = useRef(mail);
  mailRef.current = mail;
  const focusPiece = useMemo(() => {
    const visible = day.groups
      .filter((group) => dayLens === "all" || group.kind === dayLens)
      .flatMap((group) => group.items);
    return visible.find((item) => item.id === pickedId) ?? visible[0] ?? null;
  }, [day, dayLens, pickedId]);
  useEffect(() => {
    const id = focusPiece?.messageId;
    if (!open || !id) return;
    let cancelled = false;
    const local = mailRef.current.find((row) => row.id === id) ?? null;
    setOpenedMail({ id, message: local, busy: true });
    void bridgeGetMail(id)
      .then((dto) => {
        if (cancelled) return;
        setOpenedMail({
          id,
          message: dto ? messageDtoToUi(dto) : local,
          busy: false,
        });
      })
      .catch(() => {
        if (!cancelled) setOpenedMail({ id, message: local, busy: false });
      });
    return () => {
      cancelled = true;
    };
  }, [open, focusPiece?.messageId]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const focusMessage =
    tags.threadIds.length === 1
      ? (mail.find((message) => message.id === tags.threadIds[0]) ?? null)
      : null;
  const contextNow = chips.length
    ? chips.map((c) => `${MENTION_META[c.kind].trigger}${c.label}`).join(" · ")
    : focusMessage
      ? "This thread"
      : "Unified Inbox";

  const storeRef = useRef(agentStore);
  storeRef.current = agentStore;
  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        localStorage.setItem(
          AGENT_SESSIONS_KEY,
          JSON.stringify(storeRef.current),
        );
      } catch {
        // A full disk should not block the chat.
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [agentStore]);
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(
          AGENT_SESSIONS_KEY,
          JSON.stringify(storeRef.current),
        );
      } catch {
        // Ignore quota errors while the pane is leaving.
      }
    };
  }, []);

  useEffect(() => {
    if (sessions.some((session) => session.id === activeId)) return;
    const fallback = sessions[0]?.id;
    if (!fallback || fallback === activeId) return;
    setAgentStore((prev) =>
      prev.sessions.some((session) => session.id === prev.activeId)
        ? prev
        : { ...prev, activeId: prev.sessions[0]?.id ?? prev.activeId },
    );
  }, [activeId, sessions]);

  useEffect(() => {
    if (!threadRequest) return;
    if (seededNonce.current === threadRequest.nonce) return;
    const message = mail.find((item) => item.id === threadRequest.messageId);
    if (!message) return;
    seededNonce.current = threadRequest.nonce;
    const titled = sessions.find(
      (session) =>
        session.tags.threadIds.includes(message.id) &&
        session.messages.length > 0,
    );
    if (titled) {
      setAgentStore((prev) => ({ ...prev, activeId: titled.id }));
      return;
    }
    const blank = sessions.find(
      (session) =>
        session.id === activeId &&
        session.messages.length === 0 &&
        session.title === "New chat" &&
        session.tags.threadIds.length === 0 &&
        !session.draft,
    );
    if (blank) {
      setAgentStore((prev) => ({
        ...prev,
        sessions: prev.sessions.map((session) =>
          session.id === blank.id
            ? {
                ...session,
                title: clipTitle(message.subject),
                tags: { ...emptyTags(), threadIds: [message.id] },
                updatedAt: Date.now(),
              }
            : session,
        ),
      }));
      return;
    }
    const session = blankSession();
    session.title = clipTitle(message.subject);
    session.tags = { ...emptyTags(), threadIds: [message.id] };
    setAgentStore((prev) => {
      const next = [...prev.sessions, session].slice(-MAX_AGENT_SESSIONS);
      return { sessions: next, activeId: session.id };
    });
  }, [threadRequest, mail, sessions, activeId]);

  useEffect(() => {
    if (!catchUpRequest) return;
    if (catchUpNonce.current === catchUpRequest.nonce) return;
    catchUpNonce.current = catchUpRequest.nonce;
    const prompt = `Catch me up on ${catchUpRequest.view}`;
    const user: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      text: prompt,
    };
    const current = storeRef.current;
    const activeSession = current.sessions.find(
      (session) => session.id === current.activeId,
    );
    const reusable = Boolean(
      activeSession &&
        activeSession.messages.length === 0 &&
        activeSession.title === "New chat" &&
        !activeSession.draft &&
        activeSession.tags.threadIds.length === 0,
    );
    const sessionId = reusable && activeSession ? activeSession.id : blankSession().id;
    setAgentStore((prev) => {
      if (reusable) {
        return {
          ...prev,
          activeId: sessionId,
          sessions: prev.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  title: clipTitle(prompt),
                  messages: [user],
                  draft: "",
                  updatedAt: Date.now(),
                }
              : session,
          ),
        };
      }
      const session = blankSession();
      session.id = sessionId;
      session.title = clipTitle(prompt);
      session.messages = [user];
      const next = [...prev.sessions, session].slice(-MAX_AGENT_SESSIONS);
      return { sessions: next, activeId: session.id };
    });
    const messageIds = catchUpRequest.messageIds;
    setBusySessionId(sessionId);
    void (async () => {
      const scoped = messageIds
        .map((id) => mailRef.current.find((item) => item.id === id))
        .filter((item): item is Message => Boolean(item));
      let replyText = "";
      try {
        if (prefsRef.current.aiBridge === "none") {
          replyText =
            "Pick an AI provider in Settings (OpenAI, Grok, Anthropic, Gemini, Ollama, …) to answer from your mail.";
        } else {
          replyText = await aiCatchMeUp(prefsRef.current, scoped);
        }
      } catch (error: unknown) {
        const raw = error instanceof Error ? error.message : "";
        replyText =
          usageLimitMessage(raw) ??
          (raw
            ? `AI error: ${raw}`
            : "AI request failed. Check your key or CLI in Settings.");
      }
      const cites = mailCites(
        replyText,
        scoped.map((item) => item.id),
      );
      replyText = cites.text;
      const pulls = (
        cites.ids.length ? citedPulls(cites.ids, scoped) : catchUpSource(scoped).map((item) => ({
          id: `hit-${item.id}`,
          messageId: item.id,
          at: item.time,
          from: item.from,
          subject: item.subject,
          text: item.preview,
        }))
      );
      const answerId = `a-${Date.now()}`;
      const words = replyText.split(/(\s+)/);
      let built = "";
      for (const word of words) {
        built += word;
        const partial = built;
        setAgentStore((prev) => ({
          ...prev,
          sessions: prev.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            const without = session.messages.filter((turn) => turn.id !== answerId);
            return {
              ...session,
              messages: [
                ...without,
                { id: answerId, role: "assistant" as const, text: partial },
              ],
              updatedAt: Date.now(),
            };
          }),
        }));
        await new Promise((resolve) => window.setTimeout(resolve, 8));
      }
      setAgentStore((prev) => ({
        ...prev,
        sessions: prev.sessions.map((session) => {
          if (session.id !== sessionId) return session;
          const without = session.messages.filter((turn) => turn.id !== answerId);
          return {
            ...session,
            messages: [
              ...without,
              {
                id: answerId,
                role: "assistant" as const,
                text: replyText,
                pulls,
              },
            ],
            updatedAt: Date.now(),
          };
        }),
      }));
      setBusySessionId((currentId) => (currentId === sessionId ? null : currentId));
    })();
  }, [catchUpRequest]);

  useEffect(() => {
    if (!open || messages.length > 0) return;
    if (prefs.aiBridge === "none") {
      setRundown({ key: briefKey, text: "", note: "", busy: false });
      return;
    }
    if (rundownLoaded.current === briefKey) return;
    let cancelled = false;
    setRundown({ key: briefKey, text: "", note: "", busy: true });
    void aiDayRundown(prefsRef.current, mailRef.current)
      .then((text) => {
        if (cancelled) return;
        rundownLoaded.current = briefKey;
        setRundown({ key: briefKey, text, note: "", busy: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        rundownLoaded.current = briefKey;
        const raw = error instanceof Error ? error.message : "";
        setRundown({
          key: briefKey,
          text: "",
          note: usageLimitMessage(raw) ?? "",
          busy: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, messages.length, briefKey, prefs.aiBridge]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!mention && !pickerOpen && !modelMenu) return;
      event.preventDefault();
      event.stopPropagation();
      if (mention) {
        setMentionHeld(true);
        return;
      }
      setPickerOpen(false);
      setPickerQuery("");
      setModelMenu(false);
      setMentionHeld(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pickerOpen, mention, modelMenu]);

  useEffect(() => {
    if (!pickerOpen && !modelMenu) return;
    const onPointer = (event: MouseEvent) => {
      const node = boxRef.current;
      if (!node) return;
      if (event.target instanceof Node && node.contains(event.target)) return;
      setPickerOpen(false);
      setModelMenu(false);
      setMentionHeld(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [pickerOpen, modelMenu]);

  useEffect(() => {
    if (!modelMenu) return;
    let cancelled = false;
    void bridgeAiDetect(prefs.aiBridgePath || undefined)
      .then((rows) => {
        if (!cancelled) setDetectedBridges(rows);
      })
      .catch(() => {
        if (!cancelled) setDetectedBridges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [modelMenu, prefs.aiBridgePath]);

  useEffect(() => {
    if (!modelMenu || prefs.aiBridge === "none") return;
    let cancelled = false;
    setModelsBusy(true);
    void bridgeAiModels(prefs.aiBridge, prefs.aiBridgePath || undefined)
      .then((list) => {
        if (cancelled) return;
        setModelChoices(list.models);
        setModelsNote(
          list.models.length
            ? ""
            : (list.detail ?? "This provider didn’t report any models."),
        );
        setModelsBusy(false);
      })
      .catch(() => {
        if (cancelled) return;
        setModelChoices([]);
        setModelsNote("Couldn’t load models. Check the connection in Settings.");
        setModelsBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelMenu, prefs.aiBridge, prefs.aiBridgePath]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !open) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 22), 88)}px`;
    const pos = pendingCaret.current;
    if (pos == null) return;
    pendingCaret.current = null;
    node.focus();
    node.setSelectionRange(pos, pos);
  }, [draft, open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function focusAskInputIfStillOurs() {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        !active ||
        active === document.body ||
        boxRef.current?.contains(active)
      ) {
        inputRef.current?.focus();
      }
    }, 0);
  }

  function readCaret(node: HTMLTextAreaElement) {
    setCaret(node.selectionStart ?? 0);
  }

  function pickMention(item: MentionItem) {
    const here = inputRef.current?.selectionStart ?? caret;
    const active = activeMention(draft, here);
    if (active) {
      const next = dropActiveMention(draft, active);
      pendingCaret.current = next.caret;
      setDraft(next.text);
      setCaret(next.caret);
    }
    setTags((current) => withMention(current, item));
    setMentionHeld(false);
    setPickerOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function createSession() {
    const empty = sessions.find(
      (session) =>
        session.messages.length === 0 &&
        !session.draft &&
        session.title === "New chat" &&
        session.tags.threadIds.length === 0 &&
        session.tags.people.length === 0 &&
        session.tags.labelIds.length === 0 &&
        session.tags.skillIds.length === 0,
    );
    if (empty) {
      setAgentStore((prev) => ({ ...prev, activeId: empty.id }));
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    const session = blankSession();
    setAgentStore((prev) => {
      const next = [...prev.sessions, session].slice(-MAX_AGENT_SESSIONS);
      return { sessions: next, activeId: session.id };
    });
    setPickerOpen(false);
    setPickerQuery("");
    setMentionHeld(false);
    setCaret(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeSession(id: string) {
    if (sessions.length <= 1) {
      const fresh = blankSession();
      setAgentStore({ sessions: [fresh], activeId: fresh.id });
      setCaret(0);
      setMentionHeld(false);
      return;
    }
    const index = sessions.findIndex((session) => session.id === id);
    const remaining = sessions.filter((session) => session.id !== id);
    const nextSession =
      activeId === id
        ? (remaining[Math.max(0, index - 1)] ?? remaining[0])
        : remaining.find((session) => session.id === activeId);
    setAgentStore({
      sessions: remaining,
      activeId: nextSession?.id ?? remaining[0].id,
    });
    setCaret(nextSession?.draft.length ?? 0);
    setPickerOpen(false);
    setMentionHeld(false);
  }

  function clearThread() {
    const id = active?.id;
    if (!id) return;
    setAgentStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.id === id
          ? {
              ...session,
              messages: [],
              draft: "",
              title: "New chat",
              tags: emptyTags(),
              updatedAt: Date.now(),
            }
          : session,
      ),
    }));
    setCaret(0);
    setMentionHeld(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function copyThread() {
    const text = messages
      .map((m) => `${m.role === "user" ? "You" : "Intray"}: ${m.text}`)
      .join("\n\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  async function send(
    event?: FormEvent<HTMLFormElement>,
    seed?: { text: string; threadId?: string },
  ) {
    event?.preventDefault();
    const skillLead = tags.skillIds
      .map((id) => SKILLS.find((s) => s.id === id)?.name)
      .filter((name): name is string => Boolean(name))
      .join(", ");
    const text = (seed?.text ?? draftBody) || skillLead;
    if (!text || busy) return;
    const sessionId = active?.id ?? null;
    if (!sessionId) return;
    const tagsForSend =
      seed?.threadId && !tags.threadIds.includes(seed.threadId)
        ? { ...tags, threadIds: [seed.threadId, ...tags.threadIds] }
        : tags;
    const focusForSend =
      tagsForSend.threadIds.length === 1
        ? (mail.find((item) => item.id === tagsForSend.threadIds[0]) ?? null)
        : focusMessage;
    setPickerOpen(false);
    setMentionHeld(false);
    const user: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      contextLabel: seed?.threadId
        ? focusForSend?.subject ?? contextNow
        : contextNow,
    };
    setAgentStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const nextMessages = [...session.messages, user];
        return {
          ...session,
          messages: nextMessages,
          tags: tagsForSend,
          draft: "",
          title:
            session.title === "New chat" ? clipTitle(text) : session.title,
          updatedAt: Date.now(),
        };
      }),
    }));
    setCaret(0);
    setBusySessionId(sessionId);

    const answerId = `a-${Date.now()}`;
    let replyText = "";
    let pulls: AskPull[] | undefined;
    try {
      if (prefs.aiBridge === "none") {
        replyText =
          "Pick an AI provider in Settings (OpenAI, Grok, Anthropic, Gemini, Ollama, …) to answer from your mail.";
      } else {
        const scoped = tagsForSend.threadIds.length
          ? mail.filter((m) => tagsForSend.threadIds.includes(m.id))
          : mail;
        replyText = await aiAskAboutMail({
          prefs,
          question: text,
          mail: scoped,
          focus: focusForSend,
        });
        const cites = mailCites(
          replyText,
          mail.map((item) => item.id),
        );
        if (cites.ids.length) {
          replyText = cites.text;
          pulls = citedPulls(cites.ids, mail);
        } else {
          pulls = relatedPulls(text, mail, tagsForSend, focusForSend);
        }
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      replyText =
        usageLimitMessage(raw) ??
        (raw
          ? `AI error: ${raw}`
          : "AI request failed. Check your key or CLI in Settings.");
    }

    const words = replyText.split(/(\s+)/);
    let built = "";
    for (const word of words) {
      built += word;
      const partial = built;
      setMessages((current) => {
        const withoutStream = current.filter((m) => m.id !== answerId);
        return [
          ...withoutStream,
          { id: answerId, role: "assistant", text: partial },
        ];
      });
      await new Promise((r) => window.setTimeout(r, 8));
    }
    setMessages((current) => {
      const withoutStream = current.filter((m) => m.id !== answerId);
      return [
        ...withoutStream,
        {
          id: answerId,
          role: "assistant",
          text: replyText,
          pulls,
        },
      ];
    });

    if (sessionId) {
      setBusySessionId((current) => (current === sessionId ? null : current));
    }
    focusAskInputIfStillOurs();
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionItems.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setMentionCursor({
          key: mentionKey,
          index:
            (safeMentionIndex + delta + mentionItems.length) %
            mentionItems.length,
        });
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        const item = mentionItems[safeMentionIndex];
        if (item) pickMention(item);
        return;
      }
    }
    if (event.key === "Escape" && mention) {
      event.preventDefault();
      event.stopPropagation();
      setMentionHeld(true);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const pickedModel =
    modelChoices.find((model) => model.id === prefs.aiModelHint)?.label ||
    prefs.aiModelHint;
  const modelName = pickedModel || "Default";
  const writerLabel = `${bridgeName} · ${modelName}`;
  const providerChoices = readyBridgeIds(
    bridgePickerOrder,
    detectedBridges,
    prefs.aiBridge,
  );

  const composer = (
    <form
      ref={boxRef}
      className="float-ask-box"
      onSubmit={(e) => void send(e)}
    >
      {chips.length ? (
        <div className="float-ask-chips">
          {chips.map((chip) => (
            <span
              key={`${chip.kind}-${chip.id}`}
              className="float-ask-chip"
              title={chip.label}
            >
              {chip.kind === "thread" && chip.message ? (
                <button
                  type="button"
                  className="float-ask-chip-main"
                  aria-label={`Open ${chip.message.subject}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenMessage(chip.message!.id);
                  }}
                >
                  <span className="float-ask-face" aria-hidden>
                    <Mail size={11} strokeWidth={2} />
                  </span>
                  <span className="float-ask-chip-label">{chip.label}</span>
                </button>
              ) : (
                <span className="float-ask-chip-main static">
                  <span className="float-ask-chip-mark" aria-hidden>
                    {MENTION_META[chip.kind].trigger}
                  </span>
                  <span className="float-ask-chip-label">{chip.label}</span>
                </span>
              )}
              <button
                type="button"
                className="float-ask-chip-x"
                aria-label={`Remove ${chip.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setTags((current) =>
                    withoutMention(current, chip.kind, chip.id),
                  );
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <label className="sr" htmlFor={inputId}>
        Ask about your mail
      </label>
      <textarea
        id={inputId}
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          const nextCaret = event.target.selectionStart ?? value.length;
          setDraft(value);
          setCaret(nextCaret);
          setMentionHeld(false);
          if (activeMention(value, nextCaret)) setPickerOpen(false);
        }}
        onFocus={(event) => {
          readCaret(event.currentTarget);
          setMentionHeld((held) => (held ? false : held));
        }}
        onBlur={() => {
          if (
            activeMention(draft, inputRef.current?.selectionStart ?? caret)
          ) {
            setMentionHeld(true);
          }
        }}
        onKeyDown={onComposerKey}
        onKeyUp={(event) => readCaret(event.currentTarget)}
        onClick={(event) => readCaret(event.currentTarget)}
        onSelect={(event) => readCaret(event.currentTarget)}
        placeholder="Ask about your mail… @ # / $"
        autoComplete="off"
        disabled={busy}
        aria-controls={mention ? mentionListId : panelId}
      />

      <div className="float-ask-tools">
        <div className="float-ask-tools-left">
          <button
            type="button"
            className={`float-ask-plus${pickerOpen ? " active" : ""}`}
            aria-label="Tag a thread"
            aria-expanded={pickerOpen}
            aria-controls={pickerId}
            onClick={(event) => {
              event.stopPropagation();
              setMentionHeld(true);
              setPickerOpen((current) => !current);
            }}
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className={`float-ask-writer${modelMenu ? " active" : ""}`}
            aria-expanded={modelMenu}
            aria-controls={modelMenuId}
            aria-label={writerLabel}
            onClick={(event) => {
              event.stopPropagation();
              setPickerOpen(false);
              setModelMenu((current) => {
                setMentionHeld(!current);
                return !current;
              });
            }}
            title={writerLabel}
          >
            <span className="float-ask-writer-mark" aria-hidden>
              <BridgeLogo id={prefs.aiBridge} size={15} />
            </span>
            <span>{modelName}</span>
          </button>
        </div>
        <button
          type="submit"
          className="float-ask-send"
          disabled={!canSend}
          aria-label="Send"
          onClick={(event) => event.stopPropagation()}
        >
          <ArrowUp size={14} strokeWidth={2} />
        </button>
      </div>

      {modelMenu ? (
        <div
          className="float-ask-model-menu"
          id={modelMenuId}
          role="dialog"
          aria-label="Provider and model"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="float-ask-provider-row" role="listbox" aria-label="Provider">
            {providerChoices.length ? (
              providerChoices.map((id) => {
                const selected = id === prefs.aiBridge;
                const status = detectedBridges?.find((row) => row.id === id);
                const name = aiBridgeMeta[id].name;
                const unavailable =
                  status && !status.available && status.reason
                    ? status.reason
                    : "";
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={unavailable ? `${name}. ${unavailable}` : name}
                    title={unavailable ? `${name} — ${unavailable}` : name}
                    className={`float-ask-provider-cube${selected ? " on" : ""}${unavailable ? " off" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!selected) {
                        onPickAi({ aiBridge: id, aiModelHint: "" });
                      }
                    }}
                  >
                    <BridgeLogo id={id} size={16} />
                  </button>
                );
              })
            ) : (
              <p className="float-ask-model-empty">
                No provider is ready on this PC yet.
              </p>
            )}
          </div>
          {prefs.aiBridge !== "none" ? (
            <>
              <p className="float-ask-model-label">Model</p>
              <div className="float-ask-model-list" role="listbox" aria-label="Model">
                <button
                  type="button"
                  role="option"
                  aria-selected={!prefs.aiModelHint}
                  className={`float-ask-model-row${!prefs.aiModelHint ? " on" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPickAi({
                      aiBridge: prefs.aiBridge,
                      aiModelHint: "",
                    });
                    setModelMenu(false);
                  }}
                >
                  <span>
                    <strong>Default</strong>
                    <small>Whatever this provider picks</small>
                  </span>
                  {!prefs.aiModelHint ? <Check size={13} strokeWidth={2} /> : null}
                </button>
                {modelsBusy ? (
                  <p className="float-ask-model-empty">Checking models…</p>
                ) : (
                  modelChoices.map((model) => {
                    const selected = model.id === prefs.aiModelHint;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`float-ask-model-row${selected ? " on" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPickAi({
                            aiBridge: prefs.aiBridge,
                            aiModelHint: model.id,
                          });
                          setModelMenu(false);
                        }}
                      >
                        <span>
                          <strong>{model.label}</strong>
                        </span>
                        {selected ? <Check size={13} strokeWidth={2} /> : null}
                      </button>
                    );
                  })
                )}
                {!modelsBusy && modelsNote ? (
                  <p className="float-ask-model-empty">{modelsNote}</p>
                ) : null}
                {!modelsBusy &&
                prefs.aiModelHint &&
                !modelChoices.some((model) => model.id === prefs.aiModelHint) ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected
                    className="float-ask-model-row on"
                    onClick={(event) => {
                      event.stopPropagation();
                      setModelMenu(false);
                    }}
                  >
                    <span>
                      <strong>{prefs.aiModelHint}</strong>
                    </span>
                    <Check size={13} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="float-ask-model-settings"
            onClick={(event) => {
              event.stopPropagation();
              setModelMenu(false);
              onOpenSettings();
            }}
          >
            AI settings
          </button>
        </div>
      ) : null}

      {mention ? (
        <div
          className="float-ask-picker"
          id={mentionListId}
          role="listbox"
          aria-label={MENTION_META[mention.kind].menu}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="float-ask-mention-head">
            <span>{MENTION_META[mention.kind].menu}</span>
            <span>{mention.trigger}</span>
          </div>
          <div className="float-ask-picker-list">
            {mentionItems.length ? (
              mentionItems.map((item, index) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === safeMentionIndex}
                  className={
                    index === safeMentionIndex
                      ? "float-ask-picker-row on"
                      : "float-ask-picker-row"
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    pickMention(item);
                  }}
                >
                  <span className="float-ask-mention-key" aria-hidden>
                    {item.trigger}
                  </span>
                  <span className="float-ask-picker-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="float-ask-picker-empty">
                {mention.query
                  ? `No match for “${mention.query}”.`
                  : "Nothing else to tag."}
              </p>
            )}
          </div>
          {mentionItems.length ? (
            <p className="float-ask-mention-hint">
              ↑↓ to move · Enter to tag · Esc to dismiss
            </p>
          ) : null}
        </div>
      ) : pickerOpen ? (
        <div
          className="float-ask-picker"
          id={pickerId}
          role="listbox"
          aria-label="Tag a thread"
        >
          <input
            className="float-ask-picker-search"
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            placeholder="Search threads…"
            autoFocus
          />
          <div className="float-ask-picker-list">
            {pickerRows.length ? (
              pickerRows.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className="float-ask-picker-row"
                  role="option"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTags((current) =>
                      withMention(current, {
                        kind: "thread",
                        id: message.id,
                        label: message.subject,
                        detail: message.from,
                        trigger: "$",
                      }),
                    );
                    setPickerOpen(false);
                    setPickerQuery("");
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  <span className="float-ask-face" aria-hidden>
                    {initials(message.from)}
                  </span>
                  <span className="float-ask-picker-copy">
                    <strong>{message.subject}</strong>
                    <small>
                      {message.from} · {message.time}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className="float-ask-picker-empty">No threads match that.</p>
            )}
          </div>
        </div>
      ) : null}
    </form>
  );

  if (!open) return null;

  const hasThread = messages.length > 0 || busy;
  const nowMs = minute * 60_000;
  const sessionRows = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const picked = focusPiece;
  const opened =
    openedMail.id === picked?.messageId ? openedMail.message : null;
  const faces = Object.fromEntries(
    mail.map((row) => [row.id, { initials: row.initials, color: row.avatarColor }]),
  );
  const askAbout = (item: DayPiece) => {
    setPickedId(item.id);
    void send(undefined, { text: item.ask, threadId: item.messageId });
  };
  const dayBoard = (layout: "stage" | "rail") => (
    <DayBoard
      lede={day.lede}
      busy={rundown.busy && rundown.key === briefKey}
      note={rundown.key === briefKey ? rundown.note : ""}
      groups={day.groups}
      quiet={day.quiet}
      faces={faces}
      lens={dayLens}
      pickedId={picked?.id ?? null}
      layout={layout}
      emptyHeadline={brief.headline}
      onLens={setDayLens}
      onPick={(item) => setPickedId(item.id)}
    />
  );

  const toggleBoard = () => {
    setBoardOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(AGENT_BOARD_KEY, next ? "1" : "0");
      } catch {
        // The panel still toggles if storage is blocked.
      }
      return next;
    });
  };

  return (
    <div className={`agent-page${boardOpen ? "" : " board-collapsed"}`} id={panelId}>
      <nav className="agent-nav" aria-label="Chats">
        <div className="agent-nav-head">
          <div>
            <p className="agent-brief-kicker">Agent</p>
            <h2>Chats</h2>
          </div>
          <button
            type="button"
            className="agent-nav-new"
            onClick={createSession}
          >
            <Plus size={14} strokeWidth={1.75} />
            New chat
          </button>
        </div>
        <div className="agent-nav-list" role="listbox" aria-label="Chats">
          {sessionRows.map((session) => {
            const selected = session.id === active?.id;
            return (
              <div
                key={session.id}
                className={`agent-chat${selected ? " active" : ""}`}
                role="option"
                aria-selected={selected}
              >
                <button
                  type="button"
                  className="agent-chat-main"
                  onClick={() => {
                    setAgentStore((prev) => ({
                      ...prev,
                      activeId: session.id,
                    }));
                    setCaret(session.draft.length);
                    setPickerOpen(false);
                    setMentionHeld(false);
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  <span className="agent-chat-title">{session.title}</span>
                  <span className="agent-chat-preview">
                    {session.messages.length ? sessionPreview(session) : brief.headline}
                  </span>
                </button>
                <div className="agent-chat-side">
                  <time dateTime={new Date(session.updatedAt).toISOString()}>
                    {sessionAge(session.updatedAt, nowMs)}
                  </time>
                  <button
                    type="button"
                    className="agent-chat-x"
                    aria-label={`Close ${session.title}`}
                    title="Close chat"
                    onClick={() => closeSession(session.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="agent-nav-foot">{bridgeName} · On this PC</p>
      </nav>

      <section className="agent-main" aria-label="Conversation">
        <header className="agent-main-head">
          <div className="float-ask-brand">
            <h2 className="float-ask-title">{active?.title ?? "New chat"}</h2>
            <span className="float-ask-private">On this PC</span>
          </div>
          <div className="float-ask-head-actions">
            <button
              type="button"
              className="agent-board-toggle"
              aria-expanded={boardOpen}
              aria-label={boardOpen ? "Hide the side panel" : "Show the side panel"}
              title={boardOpen ? "Hide side panel" : "Show side panel"}
              onClick={toggleBoard}
            >
              {boardOpen ? (
                <PanelRightClose size={15} strokeWidth={1.75} />
              ) : (
                <PanelRightOpen size={15} strokeWidth={1.75} />
              )}
            </button>
            {messages.length ? (
              <button
                type="button"
                className="float-ask-head-btn"
                onClick={clearThread}
              >
                Clear
              </button>
            ) : null}
            {messages.length ? (
              <button
                type="button"
                className="float-ask-head-btn"
                onClick={() => void copyThread()}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>
        </header>
        <div className="agent-stage">
          {hasThread ? (
            <div className="float-ask-thread" ref={scrollerRef}>
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="float-ask-turn user">
                    {message.contextLabel ? (
                      <p className="float-ask-context">
                        <Mail size={11} strokeWidth={1.75} />
                        <span>{message.contextLabel}</span>
                      </p>
                    ) : null}
                    <div className="float-ask-user-row">
                      <div className="float-ask-user-bubble">
                        <p>{message.text}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <article key={message.id} className="float-ask-turn assistant">
                    {(() => {
                      const cites = mailCites(
                        message.text,
                        mail.map((item) => item.id),
                      );
                      const pulls = cites.ids.length
                        ? citedPulls(cites.ids, mail)
                        : (message.pulls ?? []);
                      return (
                        <>
                    <AnswerBody text={cites.text} />
                    {pulls.length ? (
                      <div className="float-ask-pulls">
                        <p>
                          {pulls.length === 1
                            ? "Open this email"
                            : `${pulls.length} mails`}
                        </p>
                        {pulls.map((pull) => (
                          <button
                            key={pull.id}
                            type="button"
                            className="float-ask-pull"
                            onClick={() => onOpenMessage(pull.messageId)}
                          >
                            <time>{pull.at ?? "Mail"}</time>
                            <span>
                              <strong>
                                {pull.from ? `${pull.from} · ` : ""}
                                {pull.subject}
                              </strong>
                              <small>{pull.text}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                        </>
                      );
                    })()}
                  </article>
                ),
              )}
              {busy ? (
                <div className="float-ask-trace" aria-live="polite">
                  {chips[0] ? (
                    <div className="float-ask-trace-row">
                      <Eye size={13} strokeWidth={1.75} />
                      <span>Using</span>
                      <span className="float-ask-trace-chip">
                        {MENTION_META[chips[0].kind].trigger}
                        {chips[0].label}
                      </span>
                    </div>
                  ) : null}
                  <div className="float-ask-trace-row">
                    <span className="float-ask-spin" aria-hidden />
                    <span>Thinking…</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="agent-welcome" ref={scrollerRef}>
              <p className="agent-brief-kicker">Today</p>
              {dayBoard("stage")}
              <div className="agent-prompt-grid">
                {BRIEF_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="agent-brief-prompt"
                    onClick={() => void send(undefined, { text: prompt })}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {composer}
        </div>
      </section>

      {boardOpen ? (
        <aside className="agent-board" aria-label="Today">
          <DayFocus
            item={picked}
            message={opened}
            bodyLoading={openedMail.busy && openedMail.id === picked?.messageId}
            onAsk={askAbout}
            onOpen={onOpenMessage}
          />
        </aside>
      ) : null}
    </div>
  );
}
