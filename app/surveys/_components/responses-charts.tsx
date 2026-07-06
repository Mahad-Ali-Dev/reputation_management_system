"use client";

import { Sparkline } from "@/components/shell/sparkline";
import { StackedBars } from "@/components/shell/stacked-bars";
import type { NpsDistribution, ResponseRatePoint } from "@/lib/surveys/queries";

/**
 * Results-tab visualizations (Module 11), re-skinned to the "Customer Surveys"
 * kit: three chart cards (NPS distribution / Responses over time / Net Promoter
 * Score) with kit icon tiles, legends and footer pills. All math is done
 * server-side and passed as props; this is `"use client"` only because the chart
 * primitives are client components.
 */

const KIT = "/assets/repulabs/customer-surveys/results";

export function ResponsesCharts({
  distribution,
  rateOverTime,
  avgNps,
}: {
  distribution: NpsDistribution;
  rateOverTime: ResponseRatePoint[];
  /** Org-wide NPS index −100..100; null when none. */
  avgNps: number | null;
}) {
  const total = distribution.promoters + distribution.passives + distribution.detractors;
  const completedSeries = rateOverTime.map((p) => p.completed);
  const sentSeries = rateOverTime.map((p) => p.sent);
  const completedTotal = completedSeries.reduce((a, b) => a + b, 0);
  const sentTotal = sentSeries.reduce((a, b) => a + b, 0);
  const hasTrend = rateOverTime.length >= 2 && sentSeries.some((v) => v > 0);

  // ScoreRing expects 0..100; NPS is −100..100. Map to a 0..100 gauge.
  const ringValue = avgNps === null ? 0 : Math.round((avgNps + 100) / 2);
  const scoredPct = total > 0 && sentTotal > 0 ? Math.round((total / sentTotal) * 100) : null;

  return (
    <div className="surv-charts">
      {/* NPS distribution */}
      <div className="ds-card surv-chart-card">
        <div className="surv-chart-h">NPS distribution</div>
        <span className="surv-chart-tile" aria-hidden>
          <img src={`${KIT}/distribution.svg`} alt="" />
        </span>
        {total === 0 ? (
          <EmptyChart label="No scored responses yet" />
        ) : (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ overflowX: "auto" }}>
                <StackedBars
                  width={168}
                  height={150}
                  data={[[distribution.promoters], [distribution.passives], [distribution.detractors]]}
                  labels={["", "", ""]}
                  colors={["var(--surv-ok)", "var(--surv-yellow)", "var(--surv-bad)"]}
                />
              </div>
              <div className="surv-legend" style={{ flex: 1, minWidth: 160 }}>
                <LegendRow color="var(--surv-ok)" label="Promoters (9–10)" value={distribution.promoters} />
                <LegendRow color="var(--surv-yellow)" label="Passives (7–8)" value={distribution.passives} />
                <LegendRow color="var(--surv-bad)" label="Detractors (0–6)" value={distribution.detractors} />
              </div>
            </div>
            {scoredPct !== null && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="surv-foot-pill">Responses scored: {total} ({scoredPct}%)</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Responses over time */}
      <div className="ds-card surv-chart-card">
        <div className="surv-chart-h">Responses over time</div>
        <span className="surv-chart-tile" aria-hidden>
          <img src={`${KIT}/over-time.svg`} alt="" />
        </span>
        {!hasTrend ? (
          <EmptyChart label="Not enough history yet" />
        ) : (
          <>
            <div style={{ marginTop: 12 }}>
              <Sparkline
                points={completedSeries.length >= 2 ? completedSeries : [0, 0]}
                width={380}
                height={110}
                color="var(--surv-pri)"
              />
            </div>
            <div className="surv-legend" style={{ marginTop: 10, flexDirection: "row", gap: 18 }}>
              <span className="surv-legend-row" style={{ display: "inline-flex", gridTemplateColumns: "none", gap: 6 }}>
                <span className="surv-theme-dot" style={{ background: "var(--surv-pri)" }} />
                Completed <b>{completedTotal}</b>
              </span>
              <span className="surv-legend-row" style={{ display: "inline-flex", gridTemplateColumns: "none", gap: 6 }}>
                <span className="surv-theme-dot" style={{ background: "var(--surv-blue)" }} />
                Sent <b>{sentTotal}</b>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Avg NPS ring */}
      <div className="ds-card surv-chart-card">
        <div className="surv-chart-h">Net Promoter Score</div>
        <span className="surv-chart-tile" aria-hidden>
          <img src={`${KIT}/nps.svg`} alt="" />
        </span>
        <div style={{ display: "grid", placeItems: "center", gap: 8, paddingTop: 14 }}>
          <NpsGauge nps={avgNps} pct={ringValue / 100} />
          <span className="surv-foot-pill">NPS index (−100 to 100)</span>
        </div>
      </div>
    </div>
  );
}

/** Circular NPS gauge — arc fills by `pct` (0..1 from the −100..100 index),
 * center shows the signed NPS. Kit lavender track + violet progress. */
function NpsGauge({ nps, pct }: { nps: number | null; pct: number }) {
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = nps === null ? 0 : Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surv-pri-pale)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surv-pri)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--surv-ink)" }}>
            {nps === null ? "—" : nps}
          </div>
          <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>NPS</div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="surv-legend-row">
      <span className="surv-theme-dot" style={{ background: color }} />
      <span style={{ color: "var(--surv-text)" }}>{label}</span>
      <b>{value.toLocaleString()}</b>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ height: 160, display: "grid", placeItems: "center", gap: 10, color: "var(--surv-muted)", fontSize: 12.5 }}>
      <img src={`${KIT}/nps.svg`} alt="" aria-hidden style={{ width: 90, height: 90, objectFit: "contain", mixBlendMode: "multiply", opacity: 0.9 }} />
      {label}
    </div>
  );
}
