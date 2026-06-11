import type { SurveysOverview } from "@/lib/surveys/queries";

/**
 * Server-friendly presentational stat-card row for the Surveys tab (Module 11).
 * Pure props; reuses the `.ds-card` / `.stat` classes used across the app. Shows
 * Total Sent, Completed (+ rate), Avg NPS (0–100), CSAT (when rating-type
 * answers exist — tile is omitted otherwise), and Scheduled. The `.svl-kpis`
 * auto-fit grid absorbs the 4-vs-5 tile difference.
 */
export function StatCards({
  overview,
  csat,
}: {
  overview: SurveysOverview;
  /** `null` = no rating-type answers yet → tile omitted (live data only). */
  csat?: { score: number; count: number } | null;
}) {
  return (
    <div className="svl-kpis">
      <Stat label="Total sent" value={overview.totalSent.toLocaleString()} sub="Survey invites · all time" />
      <Stat
        label="Completed"
        value={overview.completed.toLocaleString()}
        sub={`${overview.completionRate}% completion rate`}
      />
      <Stat
        label="Avg NPS"
        value={overview.avgNps === null ? "—" : String(overview.avgNps)}
        sub="% promoters − % detractors"
        accent
      />
      {csat ? (
        <Stat
          label="CSAT"
          value={`${csat.score}%`}
          sub={`${csat.count.toLocaleString()} rating answer${csat.count === 1 ? "" : "s"} · 4–5★`}
          accent
        />
      ) : null}
      <Stat label="Scheduled" value={overview.scheduled.toLocaleString()} sub="Awaiting response" />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{label}</div>
        <div
          className="stat__value"
          style={{ fontSize: 28, color: accent ? "var(--pri)" : undefined }}
        >
          {value}
        </div>
        <div className="stat__delta">{sub}</div>
      </div>
    </div>
  );
}
