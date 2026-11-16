import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export type AppSelectOption<T extends string = string> = {
  id: T;
  label: string;
  detail?: string;
  leading?: ReactNode;
};

type Props<T extends string> = {
  value: T;
  options: AppSelectOption<T>[];
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  /** Compact trigger for tight bars (reply From). */
  compact?: boolean;
  /** Optional trailing node outside the menu (e.g. account chip). */
  trailing?: ReactNode;
};

export function AppSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  compact,
  trailing,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected = options.find((o) => o.id === value) ?? options[0];
  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );

  useEffect(() => {
    if (!open) return;
    setActive(selectedIdx);
  }, [open, selectedIdx]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${selectedIdx}"]`,
    );
    el?.focus();
  }, [open, selectedIdx]);

  const pick = (id: T) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`app-select${compact ? " compact" : ""}${open ? " open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="app-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected?.leading ? (
          <span className="app-select-leading">{selected.leading}</span>
        ) : null}
        <span className="app-select-copy">
          <span className="app-select-label">{selected?.label ?? "Select"}</span>
          {selected?.detail ? (
            <span className="app-select-detail">{selected.detail}</span>
          ) : null}
        </span>
        <ChevronDown size={14} strokeWidth={1.75} className="app-select-caret" />
      </button>
      {trailing}
      {open && (
        <div
          ref={listRef}
          id={listId}
          className="app-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((o, i) => {
            const isActive = i === active;
            const isSelected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                data-idx={i}
                aria-selected={isSelected}
                className={`app-select-option${isActive ? " active" : ""}${isSelected ? " selected" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((n) => Math.min(n + 1, options.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((n) => Math.max(n - 1, 0));
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(options[active]?.id ?? o.id);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
              >
                {o.leading ? (
                  <span className="app-select-leading">{o.leading}</span>
                ) : null}
                <span className="app-select-copy">
                  <span className="app-select-label">{o.label}</span>
                  {o.detail ? (
                    <span className="app-select-detail">{o.detail}</span>
                  ) : null}
                </span>
                {isSelected ? (
                  <Check
                    size={14}
                    strokeWidth={2.25}
                    className="app-select-check"
                    aria-hidden
                  />
                ) : (
                  <span className="app-select-check-spacer" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
