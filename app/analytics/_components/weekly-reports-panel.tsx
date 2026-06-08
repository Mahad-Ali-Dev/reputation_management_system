import { Icon } from "@/components/shell/icon";
import type { SeoSnapshotView } from "@/lib/seo/queries";
import type { ScoreFactor } from "@/lib/seo/reputation-score";
import { GenerateNowButton } from "./generate-now-button";

/**
 * Weekly Reports tab (Module 13). Lists generated `SeoSnapshot` rows
 * (newest-first); each is a digest of that period's reputation score, exec
 * summary, local-pack position, and website sessions. "Generate now" enqueues
 * an on-demand refresh (manager-gated server action). Empty state explains the
 * weekly cadence. Server-renderable; the only interactivity is the small
 * client GenerateNowButton + native <details> for expansion.
 */
export function WeeklyReportsPanel({
  snapshots,
  entitled,
}: {
  snapshots: SeoSnapshotView[];
  entitled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ds-card" style={{ background: "var(--surface-2)" }}>
        <div className="ds-card__body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ color: "var(--pri)", marginTop: 2, display: "inline-flex" }}>
              <Icon name="cal" size={18} />
            </span>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>Weekly reports</h3>
              <p style={{ fontSize: 13, color: "var(--rl-muted)", marginTop: 4, marginBottom: 0, maxWidth: 560 }}>
                A snapshot is generated every Monday and emailed to your team. Each captures your
                reputation score, review movements, and SEO/competitor changes for the period.
              </p>
            </div>
          </div>
          <GenerateNowButton entitled={entitled} />
        </div>
      </div>

      {snapshots.length === 0 ? (
        <div className="ds-card">
          <div className="ds-card__body" style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ color: "var(--rl-muted-3)", display: "inline-flex" }}>
              <Icon name="presentation" size={28} />
            </div>
            <p style={{ fontSize: 14, color: "var(--ink)", margin: "10px 0 2px", fontWeight: 600 }}>
              No reports yet
            </p>
            <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
              Your first weekly report will appear here. Generate one now to preview it.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {snapshots.map((s) => (
            <ReportRow key={s.id} snapshot={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({ snapshot }: { snapshot: SeoSnapshotView }) {
  const factors = Array.isArray(snapshot.scoreFactors)
    ? (snapshot.scoreFactors as ScoreFactor[])
    : [];
  const period = `${fmt(snapshot.periodStart)} – ${fmt(snapshot.periodEnd)}`;

  return (
    <details className="ds-card">
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--pri)", fontVariantNumeric: "tabular-nums" }}>
            {snapshot.reputationScore}
            <span style={{ fontSize: 12, color: "var(--rl-muted-2)" }}>/100</span>
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{period}</div>
            <div style={{ fontSize: 11.5, color: "var(--rl-muted-2)" }}>
              Generated {fmt(snapshot.generatedAt)}
            </div>
          </div>
        </div>
        <Icon name="chevD" size={16} />
      </summary>
      <div className="ds-card__body" style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
        {snapshot.execSummary && (
          <p style={{ fontSize: 13.5, color: "var(--ink)", margin: 0, lineHeight: 1.5 }}>{snapshot.execSummary}</p>
        )}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
          <Stat label="Local pack" value={snapshot.localPackPosition != null ? `#${snapshot.localPackPosition}` : "—"} />
          <Stat label="Website sessions" value={snapshot.websiteSessions != null ? snapshot.websiteSessions.toLocaleString() : "—"} />
        </div>
        {factors.length > 0 && (
          <div>
            <div style={{ fontSize: 11.5, color: "var(--rl-muted-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Score factors
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {factors.map((f) => (
                <span key={f.key} className="chip chip--out" style={{ height: 22, padding: "0 8px", fontSize: 11 }}>
                  {f.label}: {f.points.toFixed(1)}/{f.weight}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--rl-muted-2)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
