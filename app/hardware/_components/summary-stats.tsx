import { Icon, type IconName } from "@/components/shell/icon";

/**
 * Module 04 — the spec's 3-pill aggregate row: Total Scans, Reviews from Scans,
 * Conversion Rate. Pure presentational server component; the page computes the
 * numbers via `getDeviceMetrics` (one `groupBy`/aggregate) and passes them in.
 *
 * Reuses the v3 `.ds-card` + `.stat` look so it reads identically to the rest
 * of the workspace. No new CSS — inline styles + existing tokens, matching the
 * page's existing KPI cards.
 */
export function SummaryStats({
  totalScans,
  reviewsFromScans,
  conversionRate,
}: {
  totalScans: number;
  reviewsFromScans: number;
  /** Pre-formatted string, e.g. "12.5%" or "—". */
  conversionRate: string;
}) {
  return (
    <div className="grid-3" style={{ gap: 12, marginBottom: 18 }}>
      <Pill icon="qr" label="Total Scans" value={fmt(totalScans)} tint="var(--pri)" />
      <Pill
        icon="star"
        label="Reviews from Scans"
        value={fmt(reviewsFromScans)}
        tint="var(--gold)"
      />
      <Pill icon="trend" label="Conversion Rate" value={conversionRate} tint="var(--ok)" />
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function Pill({
  icon,
  label,
  value,
  tint,
}: {
  icon: IconName;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="ds-card" style={{ padding: "16px 18px" }}>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <span
          aria-hidden
          style={{
            display: "grid",
            placeItems: "center",
            width: 40,
            height: 40,
            flex: "0 0 40px",
            borderRadius: 10,
            background: "var(--surface-3)",
            color: tint,
          }}
        >
          <Icon name={icon} size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl-mono" style={{ margin: 0 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              marginTop: 4,
              fontVariantNumeric: "tabular-nums",
              color: "var(--ink)",
            }}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
