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
import { ArrowUp, Eye, Mail, Plus, Sparkles, X } from "lucide-react";
import "./FloatingAsk.css";
import { aiAskAboutMail } from "./aiClient";
import { useContacts, type Contact } from "./contacts";
import type { Label, Message } from "./data/mock";
import type { Preferences } from "./preferences";

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
    latest?.body?.[0] ??
    latest?.bodyHtml
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140) ??
    message.preview;
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
  onOpenChange,
  mail,
  labels,
  focusMessage,
  bridgeName,
  prefs,
  onOpenMessage,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (
    open: boolean,
    meta?: { restoreFocus?: boolean },
  ) => void;
  mail: Message[];
  labels: Label[];
  focusMessage: Message | null;
  bridgeName: string;
  userName: string;
  prefs: Preferences;
  onOpenMessage: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const panelId = useId();
  const inputId = useId();
  const pickerId = useId();
  const mentionListId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [tags, setTags] = useState<AskTags>(emptyTags);
  const [caret, setCaret] = useState(0);
  const [mentionHeld, setMentionHeld] = useState(false);
  const [mentionCursor, setMentionCursor] = useState({ key: "", index: 0 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [pinnedFocusId, setPinnedFocusId] = useState<string | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const contacts = useContacts();

  const focusId = focusMessage?.id ?? null;
  if (focusId && focusId !== pinnedFocusId) {
    setPinnedFocusId(focusId);
    setTags((current) =>
      current.threadIds.includes(focusId)
        ? current
        : { ...current, threadIds: [focusId, ...current.threadIds] },
    );
  }

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
  const contextNow = chips.length
    ? chips.map((c) => `${MENTION_META[c.kind].trigger}${c.label}`).join(" · ")
    : focusMessage
      ? "This thread"
      : "Unified Inbox";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (mention) {
        setMentionHeld(true);
        return;
      }
      if (pickerOpen) {
        setPickerOpen(false);
        setPickerQuery("");
        return;
      }
      onOpenChange(false, { restoreFocus: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pickerOpen, mention, onOpenChange]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointer = (event: MouseEvent) => {
      const node = boxRef.current;
      if (!node) return;
      if (event.target instanceof Node && node.contains(event.target)) return;
      setPickerOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [pickerOpen]);

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

  function collapse(opts?: { restoreFocus?: boolean }) {
    onOpenChange(false, { restoreFocus: opts?.restoreFocus ?? true });
    setPickerOpen(false);
    setPickerQuery("");
  }

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

  function clearThread() {
    setMessages([]);
    setDraft("");
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

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const skillLead = tags.skillIds
      .map((id) => SKILLS.find((s) => s.id === id)?.name)
      .filter((name): name is string => Boolean(name))
      .join(", ");
    const text = draftBody || skillLead;
    if (!text || busy) return;
    setPickerOpen(false);
    setMentionHeld(false);
    const user: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      contextLabel: contextNow,
    };
    setMessages((current) => [...current, user]);
    setDraft("");
    setCaret(0);
    setBusy(true);

    const answerId = `a-${Date.now()}`;
    let replyText = "";
    let pulls: AskPull[] | undefined;
    try {
      if (prefs.aiBridge === "none") {
        replyText =
          "Pick an AI provider in Settings (OpenAI, Grok, Anthropic, Gemini, Ollama, …) to answer from your mail.";
      } else {
        const scoped = tags.threadIds.length
          ? mail.filter((m) => tags.threadIds.includes(m.id))
          : mail;
        replyText = await aiAskAboutMail({
          prefs,
          question: text,
          mail: scoped,
          focus: focusMessage,
        });
        pulls = relatedPulls(text, mail, tags, focusMessage);
      }
    } catch (e) {
      replyText =
        e instanceof Error
          ? `AI error: ${e.message}`
          : "AI request failed. Check your key or CLI in Settings.";
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

    setBusy(false);
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
                    collapse({ restoreFocus: false });
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
            className="float-ask-writer"
            onClick={(event) => {
              event.stopPropagation();
              collapse({ restoreFocus: false });
              onOpenSettings();
            }}
            title="AI provider"
          >
            <Sparkles size={11} strokeWidth={1.75} />
            <span>{bridgeName}</span>
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
  const idle = !hasThread;

  return (
    <div className="float-ask-root fade-up" role="presentation">
      <section
        className={`float-ask-pane${idle ? " idle" : ""}`}
        id={panelId}
        aria-label="Ask Intray"
      >
        <header className="float-ask-head">
          <div className="float-ask-brand">
            <h2 className="float-ask-title">Ask</h2>
            <span
              className="float-ask-private"
              title="Answers from mail on this PC"
            >
              On this PC
            </span>
          </div>
          <div className="float-ask-head-actions">
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
            <button
              type="button"
              className="float-ask-icon"
              onClick={() => collapse({ restoreFocus: true })}
              aria-label="Close"
              title="Close · Esc"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </header>

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
                  <AnswerBody text={message.text} />
                  {message.pulls?.length ? (
                    <div className="float-ask-pulls">
                      <p>
                        {message.pulls.length}{" "}
                        {message.pulls.length === 1 ? "mail" : "mails"}
                      </p>
                      {message.pulls.map((pull) => (
                        <button
                          key={pull.id}
                          type="button"
                          className="float-ask-pull"
                          onClick={() => {
                            onOpenMessage(pull.messageId);
                            collapse({ restoreFocus: false });
                          }}
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
        ) : null}

        {composer}
      </section>
    </div>
  );
}
