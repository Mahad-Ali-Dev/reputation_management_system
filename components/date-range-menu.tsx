"use client";

import { Icon } from "@/components/shell/icon";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Topbar date pill — a real dropdown, not a decorative chip.
 *
 * Writes `?range=7|30|90` on the current route, which is the same param the
 * Business Reports segmented control uses (see `normalizeRange` in
 * lib/seo/overview.ts), so the two controls stay in sync instead of drifting.
 *
 * Labels are computed on the server and passed in (`labels`) so the rendered
 * date window can't hydrate differently from the SSR pass when the browser
 * timezone differs from the server's.
 */
export const DATE_RANGE_DAYS = [7, 30, 90] as const;
export const DEFAULT_RANGE_DAYS = 30;

const OPTION_LABELS: Record<number, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

export function DateRangeMenu({ labels }: { labels: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const requested = Number(searchParams?.get("range"));
  const current = (DATE_RANGE_DAYS as readonly number[]).includes(requested)
    ? requested
    : DEFAULT_RANGE_DAYS;

  // Close on outside click / Escape — same pattern as the establishment kebab.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(days: number) {
    setOpen(false);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("range", String(days));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div ref={wrapRef} className="tb__datewrap">
      <button
        type="button"
        className="tb__date"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Date range: ${OPTION_LABELS[current]}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="cal" size={13} style={{ color: "var(--rl-muted)" }} />
        <span>{labels[String(current)] ?? OPTION_LABELS[current]}</span>
        <Icon
          name="chevD"
          size={11}
          style={{
            color: "var(--rl-muted)",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform .15s",
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Date range"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 252,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            boxShadow: "var(--sh-pop)",
            padding: 5,
            zIndex: 40,
          }}
        >
          {DATE_RANGE_DAYS.map((days) => {
            const isActive = days === current;
            return (
              <button
                key={days}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => select(days)}
                className="row"
                style={{
                  gap: 9,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: 500,
                  textAlign: "left",
                  color: isActive ? "var(--pri)" : "var(--ink-2)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Icon
                  name="check"
                  size={13}
                  style={{ opacity: isActive ? 1 : 0, flex: "0 0 13px" }}
                />
                <span style={{ flex: 1 }}>{OPTION_LABELS[days]}</span>
                <span style={{ fontSize: 11, color: "var(--rl-muted)", fontWeight: 400 }}>
                  {labels[String(days)]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
