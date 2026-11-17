"use client";

/**
 * Lightweight, dependency-free SVG charts tuned for glass surfaces.
 * Colors come from the glass tokens (or explicit props) so they adapt to
 * light/dark automatically. Decorative by role — each exposes an aria-label
 * summary for assistive tech, per the design spec a11y rules.
 */

import { cn } from "@/lib/utils";
import * as React from "react";

/* ── Area trend ─────────────────────────────────────────────────── */

export function AreaTrend({
  data,
  labels,
  height = 220,
  domain,
  yTicks,
  formatTick = (v) => v.toFixed(1),
  className,
  ariaLabel,
}: {
  data: number[];
  labels?: string[];
  height?: number;
  /**
   * Fixed value range for the Y axis. Without it the line is scaled to its own
   * min/max, so ANY movement fills the full height — a rating drifting from 4.0
   * to 4.6 drew as a plunge to the floor and a spike to the ceiling. Pass a
   * domain whenever the scale itself carries meaning (ratings, percentages).
   * The data is always kept inside it, so nothing can be clipped off.
   */
  domain?: [number, number];
  /** Values to label in a left gutter (and draw gridlines at). */
  yTicks?: number[];
  formatTick?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
}) {
  const gradientId = React.useId();
  const w = 600;
  const h = height;
  const padX = 8;
  const padY = 16;
  const dataMin = Math.min(...data);
  const dataMax = Math.max(...data);
  const lo = domain ? Math.min(domain[0], dataMin) : dataMin;
  const hi = domain ? Math.max(domain[1], dataMax) : dataMax;
  const span = Math.max(hi - lo, 0.0001);
  const yOf = (v: number) => padY + (1 - (v - lo) / span) * (h - padY * 2);

  const pts = data.map((v, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX * 2);
    return [x, yOf(v)] as const;
  });
  const gridYs = yTicks ? yTicks.map(yOf) : [0.25, 0.5, 0.75].map((t) => padY + t * (h - padY * 2));

  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(w - padX).toFixed(1)},${h} L${padX},${h} Z`;

  return (
    <figure className={cn("w-full", className)} role="img" aria-label={ariaLabel}>
      {/* Tick labels live in an HTML gutter, not inside the SVG: the SVG uses
          preserveAspectRatio="none", which would stretch any text drawn in it. */}
      <div className={cn("relative", yTicks && "pl-9")}>
        {yTicks
          ? yTicks.map((t) => (
              <span
                key={`y-${t}`}
                aria-hidden="true"
                className="absolute left-0 -translate-y-1/2 text-[11px] glass-subtle [font-variant-numeric:tabular-nums]"
                style={{ top: `${(yOf(t) / h) * 100}%` }}
              >
                {formatTick(t)}
              </span>
            ))
          : null}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-[220px] w-full"
          style={{ height }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--glass-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--glass-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* gridlines — at the labelled ticks when given, so a label always
            sits on its own line */}
          {gridYs.map((gy) => (
            <line
              key={gy.toFixed(2)}
              x1={padX}
              x2={w - padX}
              y1={gy}
              y2={gy}
              stroke="var(--glass-border-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--glass-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {pts.map(([x, y]) => (
            <circle
              key={`${x.toFixed(2)}-${y.toFixed(2)}`}
              cx={x}
              cy={y}
              r="3"
              fill="var(--glass-accent)"
              stroke="var(--glass-fill-strong)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      {labels ? (
        <div className="mt-2 flex justify-between text-[11px] glass-subtle">
          {labels
            .map((label, i) => ({ id: `tick-${i}`, label }))
            .map((t) => (
              <span key={t.id}>{t.label}</span>
            ))}
        </div>
      ) : null}
    </figure>
  );
}

/* ── Source donut ───────────────────────────────────────────────── */

export function SourceDonut({
  segments,
  className,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const r = 56;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <svg
        viewBox="0 0 140 140"
        className="h-[140px] w-[140px] shrink-0 -rotate-90"
        role="img"
        aria-label={`Review volume by source, total ${total.toLocaleString()}`}
      >
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="var(--glass-border-soft)"
          strokeWidth="16"
        />
        {segments.map((s) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle
              key={s.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <dl className="grid gap-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <dt className="text-[13px] glass-muted">{s.label}</dt>
            <dd className="text-[13px] font-semibold text-[var(--glass-text)] [font-variant-numeric:tabular-nums]">
              {Math.round((s.value / total) * 100)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── Sentiment split ────────────────────────────────────────────── */

export function SentimentSplit({
  positive,
  neutral,
  negative,
  className,
}: {
  positive: number;
  neutral: number;
  negative: number;
  className?: string;
}) {
  const total = positive + neutral + negative || 1;
  const parts = [
    { label: "Positive", value: positive, color: "var(--glass-success)" },
    { label: "Neutral", value: neutral, color: "var(--glass-text-subtle)" },
    { label: "Negative", value: negative, color: "var(--glass-danger)" },
  ];

  return (
    <div className={cn("grid gap-3", className)}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`Sentiment: ${Math.round((positive / total) * 100)}% positive, ${Math.round((neutral / total) * 100)}% neutral, ${Math.round((negative / total) * 100)}% negative`}
      >
        {parts.map((p) => (
          <span
            key={p.label}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="text-[13px] glass-muted">{p.label}</span>
            <span className="text-[13px] font-semibold text-[var(--glass-text)] [font-variant-numeric:tabular-nums]">
              {Math.round((p.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
