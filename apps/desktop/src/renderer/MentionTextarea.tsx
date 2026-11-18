import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";
import { Check } from "lucide-react";
import {
  filterContacts,
  mentionQueryAt,
  useContacts,
  type Contact,
} from "./contacts";
import type { Recipient } from "./data/mock";

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Called when a contact is chosen via @mention. */
  onMention: (contact: Contact) => void;
  /** Emails already on To/Cc — hide from the picker. */
  excludeEmails?: string[];
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

export function MentionTextarea({
  value,
  onChange,
  onMention,
  excludeEmails = [],
  textareaRef,
  className,
  ...rest
}: Props) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef ?? localRef;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(0);
  const [active, setActive] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const contacts = useContacts();
  const exclude = new Set(excludeEmails.map((e) => e.toLowerCase()));
  const matches = open ? filterContacts(query, exclude, 6, contacts) : [];

  const syncMention = (next: string, caret: number) => {
    const hit = mentionQueryAt(next, caret);
    if (!hit) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setQuery(hit.query);
    setStart(hit.start);
    setActive(0);
  };

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: Math.min(rect.bottom + 4, window.innerHeight - 8),
      left: Math.min(rect.left, window.innerWidth - 280),
    });
  }, [open, value, ref]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, ref]);

  const applyMention = (contact: Contact) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const handle = contact.name.split(/\s+/)[0] ?? contact.name;
    const inserted = `@${handle} `;
    const next = `${before}${inserted}${after}`;
    const nextCaret = before.length + inserted.length;
    onChange(next);
    onMention(contact);
    setOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || matches.length === 0) {
      rest.onKeyDown?.(e);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applyMention(matches[active] ?? matches[0]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    rest.onKeyDown?.(e);
  };

  return (
    <>
      <textarea
        {...rest}
        ref={ref}
        className={className}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          syncMention(next, e.target.selectionStart);
        }}
        onClick={(e) => {
          syncMention(value, e.currentTarget.selectionStart);
          rest.onClick?.(e);
        }}
        onKeyUp={(e) => {
          syncMention(value, e.currentTarget.selectionStart);
          rest.onKeyUp?.(e);
        }}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <div
          className="mention-menu"
          role="listbox"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {matches.map((c, i) => (
            <button
              key={c.email}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`mention-item${i === active ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {c.avatarUrl ? (
                <img
                  className="mention-avatar photo"
                  src={c.avatarUrl}
                  alt=""
                  draggable={false}
                />
              ) : (
                <span
                  className="mention-avatar"
                  style={{ background: c.color }}
                >
                  {c.initials}
                </span>
              )}
              <span className="mention-meta">
                <strong>{c.name}</strong>
                <span>{c.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Parse "Name <email>" or bare email into a recipient. */
export function parseRecipientInput(raw: string): Recipient | null {
  const trimmed = raw.trim().replace(/,$/, "");
  if (!trimmed) return null;
  const angled = trimmed.match(/^(.*?)\s*<([^<>@\s]+@[^<>@\s]+)>$/);
  if (angled) {
    const email = angled[2].trim();
    const name = angled[1].trim() || email.split("@")[0];
    return { name, email };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return { name: trimmed.split("@")[0], email: trimmed };
}

export function RecipientChips({
  label,
  people,
  onRemove,
  onAdd,
  placeholder,
  hideLabel,
  excludeEmails = [],
}: {
  label: string;
  people: Recipient[];
  onRemove: (email: string) => void;
  /** When set, shows a field to type an email address */
  /** Return false to keep the typed draft (e.g. duplicate / excluded). */
  onAdd?: (recipient: Recipient) => boolean | void;
  placeholder?: string;
  /** Use an external label (compose From/Subject alignment) */
  hideLabel?: boolean;
  excludeEmails?: string[];
}) {
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(0);
  const blurTimer = useRef<number | null>(null);
  const textUndoRef = useRef<string[]>([]);
  const textRedoRef = useRef<string[]>([]);

  const contacts = useContacts();
  const excluded = useMemo(() => {
    const set = new Set(excludeEmails.map((e) => e.toLowerCase()));
    for (const p of people) set.add(p.email.toLowerCase());
    return set;
  }, [excludeEmails, people]);

  const predictions =
    onAdd && draft.trim().length > 0
      ? filterContacts(draft, excluded, 6, contacts)
      : [];

  useEffect(() => {
    setActive(0);
  }, [draft]);

  useEffect(() => {
    return () => {
      if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    };
  }, []);

  const clearTextHistory = () => {
    textUndoRef.current = [];
    textRedoRef.current = [];
  };

  const pick = (contact: Contact) => {
    if (!onAdd) return;
    if (onAdd({ name: contact.name, email: contact.email }) === false) return;
    clearTextHistory();
    setDraft("");
    setActive(0);
  };

  const commit = () => {
    if (!onAdd) return;
    if (predictions.length > 0) {
      pick(predictions[Math.min(active, predictions.length - 1)]);
      return;
    }
    const parsed = parseRecipientInput(draft);
    if (!parsed) return;
    if (onAdd(parsed) === false) return;
    clearTextHistory();
    setDraft("");
  };

  if (!people.length && !onAdd) return null;

  return (
    <div
      className={`recipient-chips${onAdd ? " editable" : ""}${hideLabel ? " no-label" : ""}`}
    >
      {!hideLabel && (
        <span className="recipient-chips-label">{label}</span>
      )}
      <div className="recipient-chips-list">
        {people.map((p) => (
          <button
            key={p.email}
            type="button"
            className="recipient-chip"
            title={`Remove ${p.email}`}
            onClick={() => onRemove(p.email)}
          >
            {p.name}
            <span aria-hidden>×</span>
          </button>
        ))}
        {onAdd && (
          <div className="recipient-input-wrap">
            <input
              className="recipient-input"
              value={draft}
              placeholder={
                placeholder ??
                (people.length ? "Add another…" : "Name or email")
              }
              aria-label={`Add ${label} recipient`}
              aria-autocomplete="list"
              aria-expanded={predictions.length > 0}
              onChange={(e) => {
                textUndoRef.current.push(draft);
                if (textUndoRef.current.length > 80) textUndoRef.current.shift();
                textRedoRef.current = [];
                setDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                  if (e.shiftKey) {
                    const next = textRedoRef.current.pop();
                    if (next === undefined) return;
                    e.preventDefault();
                    e.stopPropagation();
                    textUndoRef.current.push(draft);
                    setDraft(next);
                    return;
                  }
                  const prev = textUndoRef.current.pop();
                  if (prev === undefined) {
                    // Empty field text history → let parent undo chip / compose state.
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  textRedoRef.current.push(draft);
                  setDraft(prev);
                  return;
                }
                if (
                  (e.ctrlKey || e.metaKey) &&
                  e.key.toLowerCase() === "y"
                ) {
                  const next = textRedoRef.current.pop();
                  if (next === undefined) return;
                  e.preventDefault();
                  e.stopPropagation();
                  textUndoRef.current.push(draft);
                  setDraft(next);
                  return;
                }
                if (predictions.length > 0 && e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => (i + 1) % predictions.length);
                  return;
                }
                if (predictions.length > 0 && e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive(
                    (i) => (i - 1 + predictions.length) % predictions.length,
                  );
                  return;
                }
                if (e.key === "Escape" && predictions.length > 0) {
                  e.preventDefault();
                  setDraft("");
                  return;
                }
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Backspace" && !draft && people.length) {
                  onRemove(people[people.length - 1].email);
                }
              }}
              onBlur={() => {
                blurTimer.current = window.setTimeout(() => {
                  if (draft.trim()) commit();
                }, 140);
              }}
              onFocus={() => {
                if (blurTimer.current != null) {
                  window.clearTimeout(blurTimer.current);
                  blurTimer.current = null;
                }
              }}
            />
            {predictions.length > 0 && (
              <div className="recipient-predict" role="listbox">
                <div className="recipient-predict-head">
                  <span>People</span>
                  <span className="recipient-predict-count">
                    {predictions.length}
                  </span>
                </div>
                <div className="recipient-predict-list">
                  {predictions.map((c, i) => (
                    <button
                      key={c.email}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={`recipient-predict-item${i === active ? " active" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(c);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      {c.avatarUrl ? (
                        <img
                          className="recipient-predict-avatar photo"
                          src={c.avatarUrl}
                          alt=""
                          draggable={false}
                        />
                      ) : (
                        <span
                          className="recipient-predict-avatar"
                          style={{ background: c.color }}
                        >
                          {c.initials}
                        </span>
                      )}
                      <span className="recipient-predict-meta">
                        <strong>{c.name}</strong>
                        <span>{c.email}</span>
                      </span>
                      {i === active && (
                        <Check
                          size={14}
                          strokeWidth={2.25}
                          className="recipient-predict-check"
                          aria-hidden
                        />
                      )}
                    </button>
                  ))}
                </div>
                <div className="recipient-predict-foot">
                  ↑↓ to move · Enter to add
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
