import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  /** Blur the detail line (creator mode — own addresses). */
  detailBlurred?: boolean;
  /** Blur the selected name (creator mode). */
  labelBlurred?: boolean;
};

type MenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

export function AppSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  compact,
  trailing,
  detailBlurred = false,
  labelBlurred = false,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
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
    if (!open) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const estimated = Math.min(260, options.length * 40 + 16);
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
      const spaceAbove = rect.top - gap - 8;
      const openUp = spaceBelow < estimated && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        120,
        Math.min(260, openUp ? spaceAbove : spaceBelow),
      );
      const width = Math.max(rect.width, compact ? 180 : 160);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setMenuPos({
        top: openUp ? rect.top - gap : rect.bottom + gap,
        left,
        width,
        maxHeight,
        openUp,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length, compact]);

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

  const menuStyle: CSSProperties | undefined = menuPos
    ? {
        position: "fixed",
        top: menuPos.openUp ? undefined : menuPos.top,
        bottom: menuPos.openUp
          ? window.innerHeight - menuPos.top
          : undefined,
        left: menuPos.left,
        width: menuPos.width,
        minWidth: menuPos.width,
        maxHeight: menuPos.maxHeight,
        right: "auto",
        zIndex: 200,
      }
    : undefined;

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={listRef}
            id={listId}
            className="app-select-menu app-select-menu-portal"
            role="listbox"
            aria-label={ariaLabel}
            style={menuStyle}
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
                    <span
                      className={`app-select-label${labelBlurred ? " creator-blur" : ""}`}
                    >
                      {o.label}
                    </span>
                    {o.detail ? (
                      <span
                        className={`app-select-detail${detailBlurred ? " creator-blur" : ""}`}
                      >
                        {o.detail}
                      </span>
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`app-select${compact ? " compact" : ""}${open ? " open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        ref={triggerRef}
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
          <span
            className={`app-select-label${labelBlurred ? " creator-blur" : ""}`}
          >
            {selected?.label ?? "Select"}
          </span>
          {selected?.detail ? (
            <span
              className={`app-select-detail${detailBlurred ? " creator-blur" : ""}`}
            >
              {selected.detail}
            </span>
          ) : null}
        </span>
        <ChevronDown size={14} strokeWidth={1.75} className="app-select-caret" />
      </button>
      {trailing}
      {menu}
    </div>
  );
}
