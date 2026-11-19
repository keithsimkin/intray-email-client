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
import { BlurredEmails, useCreatorBlur } from "./creatorBlur";
import { filterContacts, useContacts, type Contact } from "./contacts";
import type { Label } from "./data/mock";
import { MatchText } from "./SearchHighlight";
import {
  HAS_SUGGESTIONS,
  IS_SUGGESTIONS,
  SEARCH_FIELD_META,
  makeToken,
  parseSearchInput,
  parseSlashDraft,
  serializeSearch,
  slashFieldChoices,
  type SearchField,
  type SearchToken,
} from "./searchQuery";

export type SearchHit = {
  id: string;
  from: string;
  email: string;
  subject: string;
  snippet: string;
  time: string;
  folder: string;
};

export type RecentOpen = {
  id: string;
  from: string;
  subject: string;
  time: string;
};

type PendingField = Exclude<SearchField, "text">;

const ADD_FILTERS: {
  field: PendingField;
  icon: typeof User;
  hint: string;
  slash: string;
}[] = [
  { field: "from", icon: User, hint: "Sender name or email", slash: "/from" },
  { field: "to", icon: User, hint: "Recipient name or email", slash: "/to" },
  {
    field: "subject",
    icon: Search,
    hint: "Words in the subject line",
    slash: "/subject",
  },
  { field: "tag", icon: Tag, hint: "Label applied to the thread", slash: "/tag" },
  {
    field: "has",
    icon: Paperclip,
    hint: "Attachment, link, or meeting",
    slash: "/has",
  },
  { field: "is", icon: Check, hint: "Unread, starred, or important", slash: "/is" },
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

function filterIcon(field: PendingField) {
  return ADD_FILTERS.find((f) => f.field === field)?.icon ?? Search;
}

/** Prefer email for from:/to: chips so SQL matching hits the address. */
function contactTokenValue(contact: Contact) {
  return contact.email?.trim() || contact.name;
}

function folderLabel(folder: string) {
  if (!folder) return "Mail";
  return folder.slice(0, 1).toUpperCase() + folder.slice(1);
}

export function SearchBar({
  tokens,
  onTokensChange,
  labels,
  inputRef,
  placeholder = "Search mail — /from, /subject, or pick a person…",
  hits = [],
  hitsLoading = false,
  recentSearches = [],
  recentOpens = [],
  onOpenHit,
  onQueryChange,
  onPickRecent,
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  labels: Label[];
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  hits?: SearchHit[];
  hitsLoading?: boolean;
  recentSearches?: string[];
  recentOpens?: RecentOpen[];
  onOpenHit?: (id: string) => void;
  onQueryChange?: (query: string) => void;
  onPickRecent?: (query: string) => void;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingField | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const contacts = useContacts();

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

  const slash = useMemo(
    () => (pending ? null : parseSlashDraft(draft)),
    [draft, pending],
  );
  const slashChoosing = Boolean(slash?.choosing);
  const slashChoices = useMemo(
    () => (slashChoosing ? slashFieldChoices(slash?.prefix ?? "") : []),
    [slashChoosing, slash?.prefix],
  );

  const contactQuery = useMemo(() => {
    if (pending === "from" || pending === "to") return draft;
    if (slash?.field === "from" || slash?.field === "to") {
      return slash.rest;
    }
    if (!pending && !slashChoosing && draft.trim() && !draft.trimStart().startsWith("/")) {
      return draft;
    }
    return "";
  }, [pending, draft, slash, slashChoosing]);

  const contactHits = useMemo(() => {
    if (!contactQuery && pending !== "from" && pending !== "to") return [];
    if (pending && pending !== "from" && pending !== "to") return [];
    if (slash?.field && slash.field !== "from" && slash.field !== "to") {
      return [];
    }
    return filterContacts(contactQuery, new Set(), 6, contacts);
  }, [contactQuery, pending, slash?.field, contacts]);

  const labelHits = useMemo(() => {
    const q =
      pending === "tag"
        ? draft.trim().toLowerCase()
        : slash?.field === "tag"
          ? slash.rest.trim().toLowerCase()
          : "";
    if (pending && pending !== "tag") return [];
    if (!pending && slash?.field !== "tag") return [];
    return labels
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [draft, labels, pending, slash]);

  const valueSuggestions = useMemo(() => {
    const field =
      pending === "has" || pending === "is"
        ? pending
        : slash?.field === "has" || slash?.field === "is"
          ? slash.field
          : null;
    if (!field) return [] as string[];
    const q = (
      pending === field ? draft : (slash?.rest ?? "")
    )
      .trim()
      .toLowerCase();
    const source = field === "has" ? HAS_SUGGESTIONS : IS_SUGGESTIONS;
    return source.filter((s) => !q || s.includes(q));
  }, [draft, pending, slash]);

  type Suggestion =
    | { kind: "filter"; field: PendingField }
    | { kind: "slash"; field: PendingField; slash: string }
    | { kind: "contact"; contact: Contact }
    | { kind: "label"; label: Label }
    | { kind: "value"; value: string }
    | { kind: "commit"; field: SearchField; value: string };

  const suggestions = useMemo(() => {
    const list: Suggestion[] = [];

    if (slashChoosing) {
      for (const row of slashChoices) {
        list.push({ kind: "slash", field: row.field, slash: row.slash });
      }
      return list;
    }

    // `/from ada` — treat as pending field with rest as the draft value.
    const effectivePending: PendingField | null =
      pending ??
      (slash && !slash.choosing && slash.field ? slash.field : null);
    const valueDraft = pending
      ? draft.trim()
      : slash && !slash.choosing
        ? slash.rest.trim()
        : draft.trim();

    if (effectivePending === "from" || effectivePending === "to") {
      for (const c of contactHits) list.push({ kind: "contact", contact: c });
      if (valueDraft) {
        list.push({
          kind: "commit",
          field: effectivePending,
          value: valueDraft,
        });
      }
      return list;
    }

    if (effectivePending === "tag") {
      for (const l of labelHits) list.push({ kind: "label", label: l });
      if (valueDraft) {
        list.push({ kind: "commit", field: "tag", value: valueDraft });
      }
      return list;
    }

    if (effectivePending === "has" || effectivePending === "is") {
      for (const value of valueSuggestions) list.push({ kind: "value", value });
      if (valueDraft && !valueSuggestions.includes(valueDraft as never)) {
        list.push({
          kind: "commit",
          field: effectivePending,
          value: valueDraft,
        });
      }
      return list;
    }

    if (effectivePending === "subject") {
      if (valueDraft) {
        list.push({ kind: "commit", field: "subject", value: valueDraft });
      }
      return list;
    }

    // No pending field — filters, people (as From), free-text
    for (const f of ADD_FILTERS) list.push({ kind: "filter", field: f.field });
    for (const c of contactHits) list.push({ kind: "contact", contact: c });
    if (draft.trim() && !draft.trimStart().startsWith("/")) {
      list.push({ kind: "commit", field: "text", value: draft.trim() });
    }
    return list;
  }, [
    pending,
    contactHits,
    labelHits,
    valueSuggestions,
    draft,
    slash,
    slashChoosing,
    slashChoices,
  ]);

  const effectivePending: PendingField | null =
    pending ?? (slash && !slash.choosing && slash.field ? slash.field : null);

  const liveSearchText = useMemo(() => {
    const base = serializeSearch(tokens);
    if (pending) return base;
    if (draft.trimStart().startsWith("/")) {
      const slashParsed = parseSlashDraft(draft);
      if (slashParsed.field && slashParsed.rest && !slashParsed.choosing) {
        return [base, `${slashParsed.field}:${slashParsed.rest}`]
          .filter(Boolean)
          .join(" ");
      }
      return base;
    }
    const extra = draft.trim();
    return [base, extra].filter(Boolean).join(" ");
  }, [tokens, draft, pending]);

  const sentQuery = useRef<string | null>(null);
  useEffect(() => {
    if (sentQuery.current === liveSearchText) return;
    sentQuery.current = liveSearchText;
    onQueryChange?.(liveSearchText);
  }, [liveSearchText, onQueryChange]);

  type PaletteRow =
    | { kind: "hit"; id: string; hit: SearchHit }
    | { kind: "recent"; query: string }
    | { kind: "open"; open: RecentOpen }
    | { kind: "suggestion"; suggestion: Suggestion };

  const showMailHits =
    !pending && !slashChoosing && !effectivePending && liveSearchText.trim().length > 0;

  const palette = useMemo(() => {
    const rows: PaletteRow[] = [];
    if (slashChoosing || effectivePending) {
      for (const suggestion of suggestions) {
        rows.push({ kind: "suggestion", suggestion });
      }
      return rows;
    }
    if (!liveSearchText.trim()) {
      for (const query of recentSearches) rows.push({ kind: "recent", query });
      for (const open of recentOpens) rows.push({ kind: "open", open });
      for (const suggestion of suggestions) {
        rows.push({ kind: "suggestion", suggestion });
      }
      return rows;
    }
    for (const hit of hits) rows.push({ kind: "hit", id: hit.id, hit });
    for (const suggestion of suggestions) {
      if (suggestion.kind === "contact" || suggestion.kind === "commit") {
        rows.push({ kind: "suggestion", suggestion });
      }
    }
    return rows;
  }, [
    suggestions,
    slashChoosing,
    effectivePending,
    liveSearchText,
    recentSearches,
    recentOpens,
    hits,
  ]);

  useEffect(() => {
    setActiveIdx(0);
  }, [suggestions.length, pending, draft, hits.length, liveSearchText]);

  const resolvePersonValue = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.includes("@")) return trimmed;
    const hit = filterContacts(trimmed, new Set(), 1, contacts)[0];
    if (!hit) return trimmed;
    const name = hit.name.toLowerCase();
    const q = trimmed.toLowerCase();
    if (
      name === q ||
      name.includes(q) ||
      q.split(/\s+/).every((t) => t.length < 2 || name.includes(t))
    ) {
      return hit.email?.trim() || trimmed;
    }
    return trimmed;
  };

  const addToken = (field: SearchField, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const resolved =
      field === "from" || field === "to"
        ? resolvePersonValue(trimmed)
        : trimmed;
    onTokensChange([...tokens, makeToken(field, resolved)]);
    setDraft("");
    setPending(null);
    localInputRef.current?.focus();
  };

  const startField = (field: PendingField) => {
    setPending(field);
    setDraft("");
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

    const slashParsed = parseSlashDraft(raw);
    if (slashParsed.choosing && slashParsed.field) {
      startField(slashParsed.field);
      return;
    }
    if (slashParsed.field && slashParsed.rest) {
      addToken(slashParsed.field, slashParsed.rest);
      return;
    }
    if (slashParsed.field && !slashParsed.rest) {
      startField(slashParsed.field);
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

    // Bare email → From filter
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      addToken("from", raw);
      return;
    }

    addToken("text", raw);
  };

  const applySuggestion = (s: Suggestion) => {
    switch (s.kind) {
      case "filter":
      case "slash":
        startField(s.field);
        break;
      case "contact":
        addToken(pending ?? "from", contactTokenValue(s.contact));
        break;
      case "label":
        addToken("tag", s.label.name);
        break;
      case "value":
        addToken(pending ?? slash?.field ?? "has", s.value);
        break;
      case "commit":
        addToken(s.field, s.value);
        break;
    }
  };

  const pickRecent = (query: string) => {
    setDraft("");
    setPending(null);
    onPickRecent?.(query);
    localInputRef.current?.focus();
  };

  const openHit = (id: string) => {
    onOpenHit?.(id);
    setOpen(false);
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
      if (tokens.length) {
        e.preventDefault();
        onTokensChange([]);
        setOpen(false);
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

    // Space after `/from` locks the field chip.
    if (e.key === " " && !pending) {
      const slashParsed = parseSlashDraft(draft);
      if (
        slashParsed.choosing &&
        slashParsed.field &&
        draft.trim().startsWith("/") &&
        !/\s/.test(draft.trim())
      ) {
        e.preventDefault();
        startField(slashParsed.field);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(palette.length - 1, 0)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      const row = open ? palette[activeIdx] : undefined;
      if (row) {
        e.preventDefault();
        if (row.kind === "hit") {
          openHit(row.hit.id);
          return;
        }
        if (row.kind === "open") {
          openHit(row.open.id);
          return;
        }
        if (row.kind === "recent") {
          pickRecent(row.query);
          return;
        }
        applySuggestion(row.suggestion);
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
      ? "Add another filter… (/subject)"
      : placeholder;

  const showFilterGrid =
    !pending && !slashChoosing && !draft.trim() && !liveSearchText.trim();
  const showSlashMenu = !pending && slashChoosing;

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
                <span>
                  <BlurredEmails text={t.value} />
                </span>
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
          {showFilterGrid && (
            <div className="search-panel-section">
              <div className="search-panel-label">Add filter</div>
              <div className="search-filter-grid">
                {ADD_FILTERS.map((f, i) => {
                  const Icon = f.icon;
                  const idx = palette.findIndex(
                    (row) =>
                      row.kind === "suggestion" &&
                      row.suggestion.kind === "filter" &&
                      row.suggestion.field === f.field,
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
                        <small>
                          {f.hint} · <code>{f.slash}</code>
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showSlashMenu && (
            <div className="search-panel-section">
              <div className="search-panel-label">Filter shortcut</div>
              <div className="search-suggest-list">
                {suggestions.map((s, i) => {
                  if (s.kind !== "slash") return null;
                  const Icon = filterIcon(s.field);
                  const active = i === activeIdx;
                  return (
                    <button
                      key={s.slash}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`search-suggest${active ? " active" : ""}`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => applySuggestion(s)}
                    >
                      <Icon size={14} strokeWidth={1.75} />
                      <span className="search-suggest-meta">
                        <strong>{SEARCH_FIELD_META[s.field].label}</strong>
                        <small>
                          <code>{s.slash}</code> ·{" "}
                          {ADD_FILTERS.find((f) => f.field === s.field)?.hint}
                        </small>
                      </span>
                    </button>
                  );
                })}
                {suggestions.length === 0 && (
                  <div className="search-suggest-empty">
                    Try /from, /subject, /is…
                  </div>
                )}
              </div>
            </div>
          )}

          {effectivePending && (
            <div className="search-panel-section">
              <div className="search-panel-label">
                {SEARCH_FIELD_META[effectivePending].label}
                {pending && (
                  <button
                    type="button"
                    className="search-panel-cancel"
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </button>
                )}
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
                        <SearchPerson
                          name={s.contact.name}
                          email={s.contact.email}
                          prefix={fieldLabel(effectivePending)}
                        />
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
                        key={`commit-${s.field}-${s.value}`}
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

          {showMailHits && (
            <div className="search-panel-section">
              <div className="search-panel-label">Mail</div>
              <div className="search-suggest-list">
                {hits.map((hit) => {
                  const idx = palette.findIndex(
                    (row) => row.kind === "hit" && row.id === hit.id,
                  );
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`search-hit${active ? " active" : ""}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => openHit(hit.id)}
                    >
                      <span className="search-hit-top">
                        <strong>
                          <BlurredEmails text={hit.from} />
                        </strong>
                        <small>
                          {folderLabel(hit.folder)} · {hit.time}
                        </small>
                      </span>
                      <span className="search-hit-subject">
                        <MatchText text={hit.subject} />
                      </span>
                      {hit.snippet ? (
                        <span className="search-hit-snippet">
                          <MatchText text={hit.snippet} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {hits.length === 0 && (
                  <div className="search-suggest-empty">
                    {hitsLoading ? "Searching mail…" : "No mail matches yet"}
                  </div>
                )}
              </div>
            </div>
          )}

          {showMailHits &&
            palette.some((row) => row.kind === "suggestion") && (
              <div className="search-panel-section">
                <div className="search-suggest-list">
                  {palette.map((row, i) => {
                    if (row.kind !== "suggestion") return null;
                    const suggestion = row.suggestion;
                    const active = i === activeIdx;
                    if (suggestion.kind === "contact") {
                      return (
                        <button
                          key={`hit-person-${suggestion.contact.email}`}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`search-suggest${active ? " active" : ""}`}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => applySuggestion(suggestion)}
                        >
                          <User size={14} strokeWidth={1.75} />
                          <SearchPerson
                            name={suggestion.contact.name}
                            email={suggestion.contact.email}
                            prefix="From"
                          />
                        </button>
                      );
                    }
                    if (suggestion.kind !== "commit") return null;
                    return (
                      <button
                        key={`hit-commit-${suggestion.value}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`search-suggest${active ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(suggestion)}
                      >
                        <Search size={14} strokeWidth={1.75} />
                        <span className="search-suggest-meta">
                          <strong>
                            {suggestion.field === "text"
                              ? `Keep “${suggestion.value}” as a filter`
                              : `${fieldLabel(suggestion.field)}: ${suggestion.value}`}
                          </strong>
                          <small>Enter opens the highlighted mail</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {showFilterGrid && (recentSearches.length > 0 || recentOpens.length > 0) && (
            <div className="search-panel-section">
              <div className="search-panel-label">Recent</div>
              <div className="search-suggest-list">
                {recentSearches.map((query) => {
                  const idx = palette.findIndex(
                    (row) => row.kind === "recent" && row.query === query,
                  );
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={`recent-${query}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`search-suggest${active ? " active" : ""}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => pickRecent(query)}
                    >
                      <Search size={14} strokeWidth={1.75} />
                      <span className="search-suggest-meta">
                        <strong>{query}</strong>
                        <small>Recent search</small>
                      </span>
                    </button>
                  );
                })}
                {recentOpens.map((open) => {
                  const idx = palette.findIndex(
                    (row) => row.kind === "open" && row.open.id === open.id,
                  );
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={`open-${open.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`search-suggest${active ? " active" : ""}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => openHit(open.id)}
                    >
                      <Search size={14} strokeWidth={1.75} />
                      <span className="search-suggest-meta">
                        <strong>
                          <BlurredEmails text={open.subject} />
                        </strong>
                        <small>
                          <BlurredEmails text={open.from} /> · {open.time}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!showMailHits && !pending && !slashChoosing && !effectivePending && draft.trim() && (
            <div className="search-panel-section">
              <div className="search-panel-label">Search</div>
              <div className="search-suggest-list">
                {suggestions
                  .filter(
                    (s) => s.kind === "contact" || s.kind === "commit",
                  )
                  .map((s) => {
                    const i = suggestions.indexOf(s);
                    const active = i === activeIdx;
                    if (s.kind === "contact") {
                      return (
                        <button
                          key={`people-${s.contact.email}`}
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
                          <SearchPerson
                            name={s.contact.name}
                            email={s.contact.email}
                            prefix="From"
                          />
                        </button>
                      );
                    }
                    if (s.kind !== "commit") return null;
                    return (
                      <button
                        key={`text-${s.value}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`search-suggest${active ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => applySuggestion(s)}
                      >
                        <Search size={14} strokeWidth={1.75} />
                        <span className="search-suggest-meta">
                          <strong>Search “{s.value}”</strong>
                          <small>/from · /subject · from:email</small>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {showFilterGrid && (
            <p className="search-panel-hint">
              Tip: type <code>/from</code> or <code>/subject</code>, pick a
              person for From, or use <code>from:email</code>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SearchPerson({
  name,
  email,
  prefix,
}: {
  name: string;
  email: string;
  prefix: string;
}) {
  const blur = useCreatorBlur();
  const kind = blur.kindForEmail(email);
  return (
    <span className="search-suggest-meta">
      <strong className={blur.blurName(kind) ? "creator-blur" : undefined}>
        {name}
      </strong>
      <small>
        {prefix} ·{" "}
        <span className={blur.blurAddress(kind) ? "creator-blur" : undefined}>
          {email}
        </span>
      </small>
    </span>
  );
}
