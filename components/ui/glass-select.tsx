"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./glass-select.css";

/**
 * GlassSelect: an Apple-style dropdown that replaces native <select> in forms.
 *
 * - Submits through a hidden <input name={name}>, so server actions read it
 *   exactly like a native select.
 * - The menu is portalled to <body> with fixed positioning, so it is never
 *   clipped by a modal's overflow and always sits above it.
 * - Keyboard: Enter / Space / ↓ opens; ↑ ↓ move; Enter picks; Esc closes
 *   (captured so it doesn't also close the surrounding modal); typing filters
 *   when `searchable`, or jumps to the first match otherwise.
 */

export type GlassOption = {
  value: string;
  label: string;
  /** Small grey text on the right of the row (e.g. "GMT+5"). */
  hint?: string;
};

export function GlassSelect({
  name,
  options,
  value: controlled,
  defaultValue,
  onChange,
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Search",
  icon,
  ariaLabel,
  id,
  disabled,
}: {
  name?: string;
  options: GlassOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const value = controlled ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Labels that START with the query first (typing "lon" → London), then
    // any other match on the label or the raw value.
    const starts: GlassOption[] = [];
    const rest: GlassOption[] = [];
    for (const o of options) {
      const l = o.label.toLowerCase();
      if (l.startsWith(q)) starts.push(o);
      else if (l.includes(q) || o.value.toLowerCase().includes(q)) rest.push(o);
    }
    return [...starts, ...rest];
  }, [options, query]);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 300 && r.top > spaceBelow;
    setRect({ top: up ? r.top : r.bottom, left: r.left, width: r.width, up });
  }, []);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const pick = (o: GlassOption) => {
    if (controlled === undefined) setInner(o.value);
    onChange?.(o.value);
    close();
  };

  const openMenu = () => {
    if (disabled) return;
    place();
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  };

  // Reposition while open; close on outside click.
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    // Capture Esc before a surrounding modal's own Esc handler sees it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, place, close]);

  // Focus the search box (or the list) once the menu mounts, and keep the
  // active row in view.
  useEffect(() => {
    if (!open) return;
    (searchable ? searchRef.current : listRef.current)?.focus();
  }, [open, searchable]);
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onListKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o);
    } else if (e.key === "Tab") {
      close(false);
    } else if (!searchable && e.key.length === 1) {
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      {name !== undefined && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`gsel${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        {icon && <span className="gsel__icon">{icon}</span>}
        <span className={`gsel__value${selected ? "" : " is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.hint && <span className="gsel__hint">{selected.hint}</span>}
        <ChevronDown size={16} strokeWidth={2} className="gsel__chev" aria-hidden />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popRef}
            className={`gsel-pop${rect.up ? " is-up" : ""}`}
            style={{
              left: rect.left,
              width: Math.max(rect.width, 220),
              ...(rect.up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.top + 6 }),
            }}
          >
            {searchable && (
              <label className="gsel-pop__search">
                <Search size={14} strokeWidth={2} aria-hidden />
                <input
                  ref={searchRef}
                  value={query}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onListKey}
                />
              </label>
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              className="gsel-pop__list"
              aria-label={ariaLabel}
              onKeyDown={onListKey}
            >
              {shown.length === 0 && <li className="gsel-pop__none">No matches</li>}
              {shown.map((o, i) => {
                const isSel = o.value === value;
                return (
                  <li
                    key={o.value}
                    data-i={i}
                    role="option"
                    aria-selected={isSel}
                    className={`gsel-opt${i === active ? " is-active" : ""}${isSel ? " is-sel" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                    onKeyDown={onListKey}
                  >
                    <span className="gsel-opt__check">
                      {isSel && <Check size={14} strokeWidth={2.6} />}
                    </span>
                    <span className="gsel-opt__label">{o.label}</span>
                    {o.hint && <span className="gsel-opt__hint">{o.hint}</span>}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ---------- ready-made option lists ---------- */

/** Every IANA timezone, labelled "City" with "Region · GMT±h" as the hint. */
export function timezoneOptions(): GlassOption[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      "timeZone",
    );
  } catch {
    zones = [];
  }
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  const now = new Date();
  return zones.map((z) => {
    let offset = "";
    try {
      offset =
        new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "shortOffset" })
          .formatToParts(now)
          .find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch {
      offset = "";
    }
    const parts = z.split("/");
    const city = (parts[parts.length - 1] ?? z).replace(/_/g, " ");
    const region = parts.length > 1 ? parts[0] : "";
    return {
      value: z,
      label: z === "UTC" ? "UTC" : city,
      hint: [region, offset].filter(Boolean).join(" · "),
    };
  });
}

/** The visitor's own timezone (falls back to UTC). */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
