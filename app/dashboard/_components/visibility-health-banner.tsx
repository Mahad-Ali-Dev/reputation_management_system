import { Icon } from "@/components/shell/icon";
import type { HealthMetric, MetricStatus } from "@/lib/dashboard/health-score";
import Link from "next/link";

/**
 * `<VisibilityHealthBanner>` — the dashboard's flagship "Online Visibility
 * Health Score" banner (spec: `tasks/build-plan/modules/02_dashboard.md`).
 *
 * A blue→indigo gradient card rendered ABOVE the feed: a left score ring
 * (overall 0–100), a center heading + one-line summary, a right column of
 * status-dot metrics (rating / response-rate / review-velocity + a locked
 * "connect to unlock SEO" stat), and a white "View Full Report" → /analytics
 * button.
 *
 * Server component — pure presentation, no interactivity. It consumes the
 * ALREADY-COMPUTED `computeHealthScore(...)` output passed down from
 * `page.tsx`; it does NOT recompute the score.
 *
 * The shared `ScoreRing` primitive renders its center number in `--ink` (dark),
 * which would be invisible on the indigo gradient, so the ring is drawn inline
 * here with a white stroke + white number (self-contained, no edit to the
 * shared primitive).
 */

const DOT_COLOR: Record<MetricStatus, string> = {
  good: "var(--ok)",
  warn: "var(--gold)",
  bad: "var(--bad)",
  locked: "rgba(255,255,255,0.45)",
};

export function VisibilityHealthBanner({
  score,
  metrics,
  summary,
}: {
  /** Composite 0–100 health score (from `computeHealthScore`). */
  score: number;
  /** Per-metric breakdown (rating, responseRate, velocity, seo). */
  metrics: HealthMetric[];
  /** One-line summary keyed off the score band. */
  summary: string;
}) {
  return (
    <div
      className="ds-card viz-banner"
      style={{
        background: "linear-gradient(135deg, var(--pri) 0%, #4f46e5 100%)",
        color: "#fff",
        border: "none",
        padding: "22px 26px",
        marginBottom: 14,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 24,
      }}
    >
      {/* Left — score ring (white, drawn inline so the number is visible) */}
      <WhiteScoreRing value={score} />

      {/* Center — heading + summary */}
      <div style={{ flex: "1 1 240px", minWidth: 200 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          Online Visibility Health Score
        </div>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: "6px 0 0",
          }}
        >
          {score}
          <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.7 }}> / 100</span>
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", opacity: 0.92, maxWidth: 460 }}>
          {summary}
        </p>
        <Link
          href="/analytics"
          className="btn"
          style={{
            marginTop: 14,
            background: "#fff",
            color: "var(--pri)",
            fontWeight: 600,
            border: "none",
          }}
        >
          View Full Report <Icon name="arrowR" size={13} />
        </Link>
      </div>

      {/* Right — status-dot metric column */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minWidth: 190,
          padding: "14px 16px",
          background: "rgba(255,255,255,0.12)",
          borderRadius: 12,
        }}
      >
        {metrics.map((m) => (
          <MetricRow key={m.key} metric={m} />
        ))}
      </div>
    </div>
  );
}

function MetricRow({ metric }: { metric: HealthMetric }) {
  const locked = metric.status === "locked";
  return (
    <div className="viz-banner__metric row" style={{ gap: 9, alignItems: "center" }}>
      <span
        className={`status-dot status-dot--${metric.status}`}
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: DOT_COLOR[metric.status],
          flexShrink: 0,
          boxShadow: locked ? "none" : `0 0 0 3px ${DOT_COLOR[metric.status]}33`,
        }}
        aria-hidden
      />
      <span style={{ fontSize: 12.5, opacity: 0.9, flex: 1 }}>{metric.label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, opacity: locked ? 0.7 : 1, whiteSpace: "nowrap" }}>
        {locked && <Icon name="lock" size={11} style={{ marginRight: 4, verticalAlign: "-1px", opacity: 0.8 }} />}
        {metric.value}
      </span>
    </div>
  );
}

/**
 * A white score ring for the dark gradient banner. Mirrors the geometry of the
 * shared `ScoreRing` but draws the track + number in white so they read on the
 * indigo background (the shared primitive hard-codes the number to `--ink`).
 */
function WhiteScoreRing({ value, size = 104, stroke = 9 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 100));
  const dash = c * pct;
  const numFs = Math.round(size * 0.3);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: numFs, fontWeight: 700, letterSpacing: "-0.03em", color: "#fff" }}>{value}</span>
        <span style={{ fontSize: numFs * 0.32, color: "rgba(255,255,255,0.75)", fontWeight: 500, marginTop: 2 }}>
          / 100
        </span>
      </div>
    </div>
  );
}
