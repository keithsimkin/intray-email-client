import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  Calendar,
  Check,
  Link2,
  Paperclip,
  Search,
  Tag,
  User,
  X,
} from "lucide-react";
import { filterContacts, type Contact } from "./contacts";
import type { Label } from "./data/mock";
import {
  HAS_SUGGESTIONS,
  IS_SUGGESTIONS,
  SEARCH_FIELD_META,
  makeToken,
  parseSearchInput,
  type SearchField,
  type SearchToken,
} from "./searchQuery";

type PendingField = Exclude<SearchField, "text">;

const ADD_FILTERS: {
  field: PendingField;
  icon: typeof User;
  hint: string;
}[] = [
  { field: "from", icon: User, hint: "Sender name or email" },
  { field: "to", icon: User, hint: "Recipient name or email" },
  { field: "subject", icon: Search, hint: "Words in the subject line" },
  { field: "tag", icon: Tag, hint: "Label applied to the thread" },
  { field: "has", icon: Paperclip, hint: "Attachment, link, or meeting" },
  { field: "is", icon: Check, hint: "Unread, starred, or important" },
];

function fieldLabel(field: SearchField) {
  if (field === "text") return "Any";
  return SEARCH_FIELD_META[field].label;
}

function hasIcon(value: string) {
  const v = value.toLowerCase();
  if (v.startsWith("link")) return Link2;
  if (v.startsWith("meet")) return Calendar;
  return Paperclip;
}

export function SearchBar({
  tokens,
  onTokensChange,
  labels,
  inputRef,
  placeholder = "Search mail — or add From, Subject, Tag…",
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  labels: Label[];
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingField | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const setInputRef = (node: HTMLInputElement | null) => {
    localInputRef.current = node;
    if (inputRef) {
      (inputRef as { current: HTMLInputElement | null }).current = node;
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const contactHits = useMemo(() => {
    if (pending !== "from" && pending !== "to" && !draft) return [];
    if (pending && pending !== "from" && pending !== "to") return [];
    return filterContacts(draft, new Set(), 6);
  }, [draft, pending]);

  const labelHits = useMemo(() => {
    if (pending && pending !== "tag") return [];
    const q = draft.trim().toLowerCase();
    return labels
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [draft, labels, pending]);

  const valueSuggestions = useMemo(() => {
    if (pending === "has") {
      const q = draft.trim().toLowerCase();
      return HAS_SUGGESTIONS.filter((s) => !q || s.includes(q));
    }
    if (pending === "is") {
      const q = draft.trim().toLowerCase();
      return IS_SUGGESTIONS.filter((s) => !q || s.includes(q));
    }
    return [] as string[];
  }, [draft, pending]);

  type Suggestion =
    | { kind: "filter"; field: PendingField }
    | { kind: "contact"; contact: Contact }
    | { kind: "label"; label: Label }
    | { kind: "value"; value: string }
    | { kind: "commit"; field: SearchField; value: string };

  const suggestions = useMemo(() => {
    const list: Suggestion[] = [];

    if (pending === "from" || pending === "to") {
      for (const c of contactHits) list.push({ kind: "contact", contact: c });
      if (draft.trim()) {
        list.push({ kind: "commit", field: pending, value: draft.trim() });
      }
      return list;
    }

    if (pending === "tag") {
      for (const l of labelHits) list.push({ kind: "label", label: l });
      if (draft.trim()) {
        list.push({ kind: "commit", field: "tag", value: draft.trim() });
      }
      return list;
    }

    if (pending === "has" || pending === "is") {
      for (const value of valueSuggestions) list.push({ kind: "value", value });
      return list;
    }

    if (pending === "subject") {
      if (draft.trim()) {
        list.push({ kind: "commit", field: "subject", value: draft.trim() });
      }
      return list;
    }

    // No pending field — offer filters + free-text commit + operator parse hints
    for (const f of ADD_FILTERS) list.push({ kind: "filter", field: f.field });
    if (draft.trim()) {
      list.push({ kind: "commit", field: "text", value: draft.trim() });
    }
    return list;
  }, [pending, contactHits, labelHits, valueSuggestions, draft]);

  useEffect(() => {
    setActiveIdx(0);
  }, [suggestions.length, pending, draft]);

  const addToken = (field: SearchField, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onTokensChange([...tokens, makeToken(field, trimmed)]);
    setDraft("");
    setPending(null);
    localInputRef.current?.focus();
  };

  const removeToken = (id: string) => {
    onTokensChange(tokens.filter((t) => t.id !== id));
  };

  const clearAll = () => {
    onTokensChange([]);
    setDraft("");
    setPending(null);
    localInputRef.current?.focus();
  };

  const commitDraft = () => {
    const raw = draft.trim();
    if (!raw) return;

    if (pending) {
      addToken(pending, raw);
      return;
    }

    const parsed = parseSearchInput(raw);
    if (parsed.tokens.length) {
      const next = [...tokens, ...parsed.tokens];
      if (parsed.rest) next.push(makeToken("text", parsed.rest));
      onTokensChange(next);
      setDraft("");
      return;
    }

    addToken("text", raw);
  };

  const applySuggestion = (s: Suggestion) => {
    switch (s.kind) {
      case "filter":
        setPending(s.field);
        setDraft("");
        localInputRef.current?.focus();
        break;
      case "contact":
        addToken(pending ?? "from", s.contact.name);
        break;
      case "label":
        addToken("tag", s.label.name);
        break;
      case "value":
        addToken(pending ?? "has", s.value);
        break;
      case "commit":
        addToken(s.field, s.value);
        break;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (pending) {
        e.preventDefault();
        setPending(null);
        return;
      }
      if (draft) {
        e.preventDefault();
        setDraft("");
        return;
      }
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }

    if (e.key === "Backspace" && !draft && tokens.length) {
      e.preventDefault();
      if (pending) {
        setPending(null);
        return;
      }
      onTokensChange(tokens.slice(0, -1));
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      if (open && suggestions[activeIdx]) {
        e.preventDefault();
        applySuggestion(suggestions[activeIdx]);
        return;
      }
      if (draft.trim()) {
        e.preventDefault();
        commitDraft();
      }
    }
  };

  const inputPlaceholder = pending
    ? SEARCH_FIELD_META[pending].placeholder
    : tokens.length
      ? "Add another filter…"
      : placeholder;

  return (
    <div className={`search-bar${open ? " open" : ""}`} ref={rootRef}>
      <div
        className="search-bar-field"
        onClick={() => {
          setOpen(true);
          localInputRef.current?.focus();
        }}
      >
        <Search size={14} strokeWidth={1.75} className="search-bar-icon" />
        <div className="search-chips">
          {tokens.map((t) => {
            const Icon =
              t.field === "tag"
                ? Tag
                : t.field === "has"
                  ? hasIcon(t.value)
                  : t.field === "from" || t.field === "to"
                    ? User
                    : null;
            return (
              <span key={t.id} className={`search-chip field-${t.field}`}>
                {Icon && <Icon size={11} strokeWidth={2} />}
                <em>{fieldLabel(t.field)}</em>
                <span>{t.value}</span>
                <button
                  type="button"
                  className="search-chip-x"
                  aria-label={`Remove ${fieldLabel(t.field)} ${t.value}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeToken(t.id);
                  }}
                >
                  <X size={11} strokeWidth={2.25} />
                </button>
              </span>
            );
          })}
          {pending && (
            <span className={`search-chip pending field-${pending}`}>
              <em>{SEARCH_FIELD_META[pending].label}</em>
            </span>
          )}
          <input
            ref={setInputRef}
            className="search-bar-input"
            value={draft}
            placeholder={inputPlaceholder}
            aria-label="Search mail"
            aria-expanded={open}
            aria-controls={panelId}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </div>
        {(tokens.length > 0 || draft || pending) && (
          <button
            type="button"
            className="search-bar-clear"
            aria-label="Clear search"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {open && (
        <div className="search-panel" id={panelId} role="listbox">
          {!pending && (
            <div className="search-panel-section">
              <div className="search-panel-label">Add filter</div>
              <div className="search-filter-grid">
                {ADD_FILTERS.map((f, i) => {
                  const Icon = f.icon;
                  const idx = suggestions.findIndex(
                    (s) => s.kind === "filter" && s.field === f.field,
                  );
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={f.field}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`search-filter-card${active ? " active" : ""}`}
                      onMouseEnter={() => setActiveIdx(idx >= 0 ? idx : i)}
                      onClick={() =>
                        applySuggestion({ kind: "filter", field: f.field })
                      }
                    >
                      <Icon size={14} strokeWidth={1.75} />
                      <span>
                        <strong>{SEARCH_FIELD_META[f.field].label}</strong>
                        <small>{f.hint}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {pending && (
            <div className="search-panel-section">
              <div className="search-panel-label">
                {SEARCH_FIELD_META[pending].label}
                <button
                  type="button"
                  className="search-panel-cancel"
                  onClick={() => setPending(null)}
                >
                  Cancel
                </button>
              </div>
              <div className="search-suggest-list">
                {suggestions.map((s, i) => {
                  const active = i === activeIdx;
                  if (s.kind === "contact") {
                    return (
                      <button
                        key={s.contact.email}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`search-suggest${active ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(s)}
                      >
                        {s.contact.avatarUrl ? (
                          <img
                            className="search-suggest-avatar photo"
                            src={s.contact.avatarUrl}
                            alt=""
                          />
                        ) : (
                          <span
                            className="search-suggest-avatar"
                            style={{ background: s.contact.color }}
                          >
                            {s.contact.initials}
                          </span>
                        )}
                        <span className="search-suggest-meta">
                          <strong>{s.contact.name}</strong>
                          <small>{s.contact.email}</small>
                        </span>
                      </button>
                    );
                  }
                  if (s.kind === "label") {
                    return (
                      <button
                        key={s.label.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`search-suggest${active ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(s)}
                      >
                        <span
                          className="label-dot"
                          style={{ color: s.label.color }}
                        />
                        <span className="search-suggest-meta">
                          <strong>{s.label.name}</strong>
                          <small>Tag</small>
                        </span>
                      </button>
                    );
                  }
                  if (s.kind === "value") {
                    const Icon = hasIcon(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`search-suggest${active ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(s)}
                      >
                        <Icon size={14} strokeWidth={1.75} />
                        <span className="search-suggest-meta">
                          <strong>{s.value}</strong>
                        </span>
                      </button>
                    );
                  }
                  if (s.kind === "commit") {
                    return (
                      <button
                        key={`commit-${s.value}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`search-suggest${active ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(s)}
                      >
                        <Search size={14} strokeWidth={1.75} />
                        <span className="search-suggest-meta">
                          <strong>
                            {s.field === "text"
                              ? `Search “${s.value}”`
                              : `${fieldLabel(s.field)}: ${s.value}`}
                          </strong>
                          <small>Press Enter</small>
                        </span>
                      </button>
                    );
                  }
                  return null;
                })}
                {suggestions.length === 0 && (
                  <div className="search-suggest-empty">
                    Type a value, then press Enter
                  </div>
                )}
              </div>
            </div>
          )}

          {!pending && draft.trim() && (
            <div className="search-panel-section">
              <div className="search-panel-label">Search</div>
              <div className="search-suggest-list">
                {suggestions
                  .filter((s) => s.kind === "commit")
                  .map((s) => {
                    if (s.kind !== "commit") return null;
                    const i = suggestions.indexOf(s);
                    return (
                      <button
                        key={`text-${s.value}`}
                        type="button"
                        role="option"
                        aria-selected={i === activeIdx}
                        className={`search-suggest${i === activeIdx ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(s)}
                      >
                        <Search size={14} strokeWidth={1.75} />
                        <span className="search-suggest-meta">
                          <strong>Search “{s.value}”</strong>
                          <small>
                            Tip: from:name subject:words tag:label
                          </small>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {!pending && !draft.trim() && (
            <p className="search-panel-hint">
              Tip: type <code>from:Ava</code>, <code>subject:roadmap</code>, or{" "}
              <code>is:unread</code> — or pick a filter above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
