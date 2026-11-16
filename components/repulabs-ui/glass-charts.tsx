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
  className,
  ariaLabel,
}: {
  data: number[];
  labels?: string[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const gradientId = React.useId();
  const w = 600;
  const h = height;
  const padX = 8;
  const padY = 16;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(max - min, 0.0001);

  const pts = data.map((v, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX * 2);
    const y = padY + (1 - (v - min) / span) * (h - padY * 2);
    return [x, y] as const;
  });

  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(w - padX).toFixed(1)},${h} L${padX},${h} Z`;

  return (
    <figure className={cn("w-full", className)} role="img" aria-label={ariaLabel}>
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
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={padY + t * (h - padY * 2)}
            y2={padY + t * (h - padY * 2)}
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
    { label: "Positive", value: positive, color: "#10b981" },
    { label: "Neutral", value: neutral, color: "var(--glass-text-subtle)" },
    { label: "Negative", value: negative, color: "#f43f5e" },
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
