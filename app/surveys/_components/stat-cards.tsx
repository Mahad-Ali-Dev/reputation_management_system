import type { SurveysOverview } from "@/lib/surveys/queries";

/**
 * Server-friendly presentational stat-card row for the Surveys tab (Module 11).
 * Pure props; reuses the `.ds-card` / `.stat` classes used across the app. Shows
 * Total Sent, Completed (+ rate), Avg NPS (0–100), and Scheduled.
 */
export function StatCards({ overview }: { overview: SurveysOverview }) {
  return (
    <div className="grid-4" style={{ gap: 12 }}>
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
