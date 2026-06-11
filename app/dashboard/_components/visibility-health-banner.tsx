import { Icon } from "@/components/shell/icon";
import { ScoreRing } from "@/components/shell/score-ring";
import type { HealthMetric, HealthScoreResult, MetricStatus } from "@/lib/dashboard/health-score";
import Link from "next/link";

/**
 * `<VisibilityHealthBanner>` — the dashboard's flagship "Online Visibility
 * Health Score" banner (spec: `tasks/build-plan/modules/02_dashboard.md`,
 * mockup: `public/assets/repulabs/design-mockups/dashboard-after.png`).
 *
 * A blue→teal gradient card (styles in `../dashboard-hero.css`, `.dbh-` prefix):
 * left — a "Live visibility health" pill, a multi-location framing headline
 * ("Strong and improving across N locations", keyed STRICTLY to the real score
 * band + real 7d review-velocity delta — it never claims "improving" unless the
 * delta is actually positive), the one-line summary, and the white "View Full
 * Report" → /analytics button; right — the score ring + the status-dot metric
 * panel.
 *
 * Server component — pure presentation, no interactivity. It consumes the
 * ALREADY-COMPUTED `computeHealthScore(...)` output passed down from
 * `page.tsx`; it does NOT recompute the score. The shared `ScoreRing` is reused
 * directly — `.dbh-banner__ring` locally remaps `--ink`/`--surface-3`/
 * `--rl-muted` so its number renders white on the gradient.
 */

const DOT_COLOR: Record<MetricStatus, string> = {
  good: "var(--ok)",
  warn: "var(--gold)",
  bad: "var(--bad)",
  locked: "rgba(255,255,255,0.45)",
};

/**
 * The multi-location framing headline. Honest by construction: the lead phrase
 * comes from the real score band, "and improving" is appended ONLY when the
 * real 7d review-volume delta is positive, and the "across N locations" suffix
 * uses the real establishment count (omitted when the count is 0/unknown).
 */
function framingHeadline(
  band: HealthScoreResult["band"],
  trendPct: number | null,
  locations: number,
): string {
  const lead = band === "strong" ? "Strong" : band === "fair" ? "On track" : "Building momentum";
  const improving = trendPct !== null && trendPct > 0 && band !== "weak";
  const phrase = improving ? `${lead} and improving` : lead;
  const where =
    locations >= 1 ? ` across ${locations} location${locations === 1 ? "" : "s"}` : "";
  return phrase + where;
}

export function VisibilityHealthBanner({
  score,
  metrics,
  summary,
  band,
  locations,
  trendPct,
}: {
  /** Composite 0–100 health score (from `computeHealthScore`). */
  score: number;
  /** Per-metric breakdown (rating, responseRate, velocity, seo). */
  metrics: HealthMetric[];
  /** One-line summary keyed off the score band. */
  summary: string;
  /** Score band (from `computeHealthScore`) — drives the framing headline. */
  band: HealthScoreResult["band"];
  /** Real establishment count (non-deleted) — the "across N locations" framing. */
  locations: number;
  /** Real reviews-7d vs prior-7d delta % (null = no prior data). */
  trendPct: number | null;
}) {
  const velocityLine =
    trendPct !== null && trendPct > 0 ? ` Review velocity is up ${trendPct}% vs last week.` : "";

  return (
    <div className="viz-banner dbh-banner">
      {/* Left — live pill + framing headline + summary + CTA */}
      <div className="dbh-banner__main">
        <span className="dbh-banner__chip">Live visibility health</span>
        <h2 className="dbh-banner__headline">{framingHeadline(band, trendPct, locations)}</h2>
        <p className="dbh-banner__sub">
          {summary}
          {velocityLine}
        </p>
        <Link href="/analytics" className="btn dbh-banner__cta">
          View Full Report <Icon name="arrowR" size={13} />
        </Link>
      </div>

      {/* Right — score ring + status-dot metric panel */}
      <div className="dbh-banner__side">
        <div className="dbh-banner__ring">
          <ScoreRing value={score} suffix="SCORE" size={106} stroke={9} color="var(--dbh-ring-stroke, #3ddc97)" />
        </div>
        <div className="dbh-banner__metrics">
          {metrics.map((m) => (
            <MetricRow key={m.key} metric={m} />
          ))}
        </div>
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
