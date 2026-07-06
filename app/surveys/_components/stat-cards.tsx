import type { SurveysOverview } from "@/lib/surveys/queries";

/**
 * KPI metric row for the Campaigns tab (Module 11), styled to the "Customer
 * Surveys" kit: a coloured icon tile + big value + helper line per card
 * (Total sent / Completed / Avg NPS / Scheduled), plus an optional CSAT tile
 * when rating-type answers exist. Icons are the real kit assets. Pure props.
 */

const ASSET = "/assets/repulabs/customer-surveys/campaigns";

export function StatCards({
  overview,
  csat,
}: {
  overview: SurveysOverview;
  /** `null` = no rating-type answers yet → tile omitted (live data only). */
  csat?: { score: number; count: number } | null;
}) {
  return (
    <div className="surv-kpis">
      <Kpi
        tone="violet"
        icon={`${ASSET}/total-sent.svg`}
        label="Total sent"
        value={overview.totalSent.toLocaleString()}
        sub="Survey invites · all time"
      />
      <Kpi
        tone="green"
        icon={`${ASSET}/completed.svg`}
        label="Completed"
        value={overview.completed.toLocaleString()}
        sub={`${overview.completionRate}% completion rate`}
      />
      <Kpi
        tone="blue"
        icon={`${ASSET}/avg-nps.svg`}
        label="Avg NPS"
        value={overview.avgNps === null ? "—" : String(overview.avgNps)}
        sub="% promoters − % detractors"
      />
      {csat ? (
        <Kpi
          tone="green"
          icon={`${ASSET}/completed.svg`}
          label="CSAT"
          value={`${csat.score}%`}
          sub={`${csat.count.toLocaleString()} rating answer${csat.count === 1 ? "" : "s"} · 4–5★`}
        />
      ) : null}
      <Kpi
        tone="orange"
        icon={`${ASSET}/scheduled.svg`}
        label="Scheduled"
        value={overview.scheduled.toLocaleString()}
        sub="Awaiting response"
      />
    </div>
  );
}

function Kpi({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: "violet" | "green" | "blue" | "orange";
  icon: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={`ds-card surv-kpi surv-kpi--${tone}`}>
      <span className="surv-kpi__icon" aria-hidden>
        <img src={icon} alt="" />
      </span>
      <div>
        <div className="surv-kpi__label">{label}</div>
        <div className="surv-kpi__value">{value}</div>
        <div className="surv-kpi__sub">{sub}</div>
      </div>
    </div>
  );
}
