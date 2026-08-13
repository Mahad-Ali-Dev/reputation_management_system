import { Icon } from "@/components/shell/icon";
import { ScoreRing } from "@/components/shell/score-ring";
import type { ScoreFactor } from "@/lib/seo/reputation-score";

/**
 * Reputation Score tab (Module 13). Renders the 0–100 score via `ScoreRing`
 * plus a factor breakdown bar list (rating, volume, response rate, recency,
 * citation consistency, local-pack visibility). The two SEO factors contribute
 * 0 until SEO data exists and render with a muted "connect to unlock" hint —
 * graceful pre-SEO. Server-renderable (pure props).
 */
export function ReputationScorePanel({
  score,
  factors,
}: {
  score: number;
  factors: ScoreFactor[];
}) {
  const band =
    score >= 80
      ? { label: "Excellent", color: "var(--ok)" }
      : score >= 60
        ? { label: "Good", color: "var(--pri)" }
        : score >= 40
          ? { label: "Fair", color: "var(--warn)" }
          : { label: "Needs work", color: "var(--bad)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ds-card">
        <div
          className="ds-card__body"
          style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}
        >
          <ScoreRing value={score} color={band.color} />
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ fontSize: 13, color: "var(--rl-muted)" }}>Reputation score</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: band.color, marginTop: 2 }}>
              {band.label}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--rl-muted)",
                marginTop: 8,
                marginBottom: 0,
                maxWidth: 460,
                lineHeight: 1.5,
              }}
            >
              A weighted blend of your rating, review volume, response rate, recency, and (once
              connected) citation consistency + local-pack visibility. Connect SEO integrations to
              unlock the final{" "}
              {factors
                .filter(
                  (f) =>
                    !f.available && (f.key === "citation_consistency" || f.key === "local_pack"),
                )
                .reduce((s, f) => s + f.weight, 0)}{" "}
              points.
            </p>
          </div>
        </div>
      </div>

      <div className="ds-card">
        <div className="ds-card__head">
          <div className="ds-card__title">Factor breakdown</div>
          <div className="ds-card__sub">How each component contributes to your score.</div>
        </div>
        <div
          className="ds-card__body"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {factors.map((f) => (
            <FactorBar key={f.key} factor={f} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FactorBar({ factor }: { factor: ScoreFactor }) {
  const pct = factor.weight > 0 ? (factor.points / factor.weight) * 100 : 0;
  const locked = !factor.available;
  return (
    <div>
      <div
        style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}
      >
        <span
          style={{
            color: locked ? "var(--rl-muted-2)" : "var(--ink)",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {factor.label}
          {locked && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                color: "var(--rl-muted-2)",
                fontSize: 11,
              }}
            >
              <Icon name="lock" size={11} /> not connected
            </span>
          )}
        </span>
        <span style={{ color: "var(--rl-muted)", fontVariantNumeric: "tabular-nums" }}>
          {factor.points.toFixed(1)} / {factor.weight}
        </span>
      </div>
      <div
        style={{ height: 8, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: locked
              ? "var(--rl-muted-3)"
              : pct >= 70
                ? "var(--ok)"
                : pct >= 40
                  ? "var(--warn)"
                  : "var(--bad)",
          }}
        />
      </div>
    </div>
  );
}
