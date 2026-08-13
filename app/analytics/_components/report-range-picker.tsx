"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Report window control: three presets plus a custom span.
 *
 * Writes to the URL rather than to local state so the selected window survives a
 * refresh, can be shared as a link, and — the reason that matters most here —
 * is what the print/PDF export renders. A client-only selection would produce a
 * PDF that disagreed with the screen.
 */

const PRESETS = [
  { value: "7", label: "7 days" },
  { value: "15", label: "15 days" },
  { value: "30", label: "30 days" },
] as const;

export function ReportRangePicker({
  preset,
  fromInput,
  toInput,
}: {
  preset: string;
  fromInput: string;
  toInput: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [showCustom, setShowCustom] = useState(preset === "custom");
  const [from, setFrom] = useState(fromInput);
  const [to, setTo] = useState(toInput);

  function go(next: URLSearchParams) {
    start(() => router.push(`/analytics?${next.toString()}`, { scroll: false }));
  }

  function pick(value: string) {
    setShowCustom(false);
    const next = new URLSearchParams(params.toString());
    next.set("range", value);
    next.delete("from");
    next.delete("to");
    go(next);
  }

  function applyCustom() {
    if (!from || !to) return;
    const next = new URLSearchParams(params.toString());
    next.set("range", "custom");
    next.set("from", from);
    next.set("to", to);
    go(next);
  }

  return (
    <div className="brp-range no-print">
      <fieldset className="brp-range__presets" aria-label="Report period">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`brp-chip${preset === p.value ? " is-active" : ""}`}
            aria-pressed={preset === p.value}
            disabled={pending}
            onClick={() => pick(p.value)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`brp-chip${preset === "custom" ? " is-active" : ""}`}
          aria-pressed={preset === "custom"}
          aria-expanded={showCustom}
          disabled={pending}
          onClick={() => setShowCustom((v) => !v)}
        >
          Custom
        </button>
      </fieldset>

      {showCustom && (
        <div className="brp-range__custom">
          <label className="brp-range__field">
            <span>From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="brp-range__field">
            <span>To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="brp-btn brp-btn--primary"
            onClick={applyCustom}
            disabled={pending || !from || !to}
          >
            {pending ? "Loading…" : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
