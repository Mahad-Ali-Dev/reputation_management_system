"use client";

import { ScoreRing } from "@/components/shell/score-ring";
import { Sparkline } from "@/components/shell/sparkline";
import { StackedBars } from "@/components/shell/stacked-bars";
import type { NpsDistribution, ResponseRatePoint } from "@/lib/surveys/queries";

/**
 * Responses-tab visualizations (Module 11). All math is done server-side and
 * passed as props; this is `"use client"` only because the chart primitives are
 * client components. Reuses the shared `StackedBars` / `Sparkline` / `ScoreRing`.
 */
export function ResponsesCharts({
  distribution,
  rateOverTime,
  avgNps,
}: {
  distribution: NpsDistribution;
  rateOverTime: ResponseRatePoint[];
  /** Org-wide NPS index 0..100 mapped from the −100..100 scale; null when none. */
  avgNps: number | null;
}) {
  const total = distribution.promoters + distribution.passives + distribution.detractors;
  const completedSeries = rateOverTime.map((p) => p.completed);
  const sentSeries = rateOverTime.map((p) => p.sent);
  const hasTrend = rateOverTime.length >= 2 && sentSeries.some((v) => v > 0);

  // ScoreRing expects 0..100; NPS is −100..100. Map to a 0..100 gauge.
  const ringValue = avgNps === null ? 0 : Math.round((avgNps + 100) / 2);

  return (
    <div className="grid-3" style={{ gap: 14, alignItems: "stretch" }}>
      {/* NPS distribution */}
      <div className="ds-card" style={{ padding: 18 }}>
        <div className="lbl-mono" style={{ marginBottom: 4 }}>
          NPS distribution
        </div>
        {total === 0 ? (
          <EmptyChart label="No scored responses yet" />
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <StackedBars
                width={260}
                height={170}
                data={[
                  [distribution.promoters],
                  [distribution.passives],
                  [distribution.detractors],
                ]}
                labels={["Promoters", "Passives", "Detractors"]}
                colors={["var(--ok)", "var(--warn)", "var(--bad)"]}
              />
            </div>
            <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: "wrap" }}>
              <Legend color="var(--ok)" label="Promoters 9–10" value={distribution.promoters} />
              <Legend color="var(--warn)" label="Passives 7–8" value={distribution.passives} />
              <Legend color="var(--bad)" label="Detractors 0–6" value={distribution.detractors} />
            </div>
          </>
        )}
      </div>

      {/* Response rate over time */}
      <div className="ds-card" style={{ padding: 18 }}>
        <div className="lbl-mono" style={{ marginBottom: 4 }}>
          Responses over time
        </div>
        {!hasTrend ? (
          <EmptyChart label="Not enough history yet" />
        ) : (
          <>
            <div style={{ marginTop: 8 }}>
              <Sparkline points={completedSeries.length >= 2 ? completedSeries : [0, 0]} width={260} height={90} color="var(--pri)" />
            </div>
            <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: "wrap" }}>
              <Legend color="var(--pri)" label="Completed" value={completedSeries.reduce((a, b) => a + b, 0)} />
              <Legend color="var(--rl-muted-2)" label="Sent" value={sentSeries.reduce((a, b) => a + b, 0)} />
            </div>
          </>
        )}
      </div>

      {/* Avg NPS ring */}
      <div className="ds-card" style={{ padding: 18, display: "flex", flexDirection: "column" }}>
        <div className="lbl-mono" style={{ marginBottom: 4 }}>
          Net Promoter Score
        </div>
        <div style={{ display: "grid", placeItems: "center", flex: 1, gap: 8, paddingTop: 6 }}>
          <ScoreRing value={avgNps === null ? 0 : ringValue} max={100} suffix="" hideMax color="var(--pri)" />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {avgNps === null ? "—" : avgNps}
            </div>
            <div className="dim" style={{ fontSize: 11.5 }}>
              NPS index (−100 to 100)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="row" style={{ gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--rl-muted)" }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
      <strong style={{ color: "var(--ink)" }}>{value}</strong>
    </span>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div
      style={{
        height: 150,
        display: "grid",
        placeItems: "center",
        color: "var(--rl-muted-2)",
        fontSize: 12.5,
      }}
    >
      {label}
    </div>
  );
}
