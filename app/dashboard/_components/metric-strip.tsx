import { Sparkline } from "@/components/shell/sparkline";

/**
 * Top-of-dashboard metric strip (replaces the old 2×2 stat chips).
 *
 * A compact inline row of key figures — label · value · delta — and, on hover
 * or keyboard focus, a popover with that metric's trend over time. Pure
 * server-rendered: the popover is a sibling shown via CSS `:hover`/`:focus-within`
 * (see dashboard-glass.css · `.dash-metrics`), so no client JS is needed. The
 * trend uses the dashboard's existing weekly series (12-week buckets).
 */

export type DashMetric = {
  key: string;
  label: string;
  /** Preformatted display value, e.g. "4.8", "17", "88%". */
  value: string;
  /** Period-over-period change; null hides the delta. `flat` renders muted. */
  delta: { text: string; dir: "up" | "down" | "flat" } | null;
  /** Trend series (oldest → newest). <2 points shows an empty-state in the popover. */
  series: number[];
  /** Popover heading, e.g. "Average rating over time". */
  title: string;
  /** Popover one-line description. */
  desc: string;
  /** Accent color for the trend chart. */
  color?: string;
};

export function MetricStrip({ metrics }: { metrics: DashMetric[] }) {
  return (
    <div className="dash-metrics" role="list" aria-label="Key metrics">
      {metrics.map((m) => (
        <div className="dash-metric" role="listitem" tabIndex={0} key={m.key}>
          <span className="dash-metric__label">{m.label}</span>
          <span className="dash-metric__row">
            <span className="dash-metric__value">{m.value}</span>
            <span className="dash-metric__rule" aria-hidden="true" />
            {m.delta && (
              <span className={`dash-metric__delta dash-metric__delta--${m.delta.dir}`}>
                {m.delta.text}
              </span>
            )}
          </span>

          {/* Hover / focus trend popover */}
          <span className="dash-metric__pop" role="tooltip">
            <span className="dash-metric__pop-head">
              <span className="dash-metric__pop-val">{m.value}</span>
              {m.delta && (
                <span className={`dash-metric__delta dash-metric__delta--${m.delta.dir}`}>
                  {m.delta.text}
                </span>
              )}
            </span>
            <span className="dash-metric__pop-title">{m.title}</span>
            <span className="dash-metric__pop-desc">{m.desc}</span>
            <span className="dash-metric__pop-chart">
              {m.series.length >= 2 ? (
                <Sparkline
                  points={m.series}
                  color={m.color ?? "#2563eb"}
                  width={440}
                  height={150}
                  area
                />
              ) : (
                <span className="dash-metric__pop-empty">Not enough data yet.</span>
              )}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
