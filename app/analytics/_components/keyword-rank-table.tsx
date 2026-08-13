import { Icon } from "@/components/shell/icon";
import type { KeywordRankView } from "@/lib/seo/queries";

/**
 * Presentational keyword-rankings table (Module 13). Pure props from the SEO
 * query layer. Columns: keyword, current position, 7-day delta arrow, local-pack
 * flag, search volume. Server-renderable (no interactivity).
 */
export function KeywordRankTable({ ranks }: { ranks: KeywordRankView[] }) {
  if (ranks.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
        No keyword data yet. Add tracked keywords and the weekly refresh will populate ranks.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--rl-muted-2)", fontSize: 11.5 }}>
            <th style={th}>Keyword</th>
            <th style={{ ...th, textAlign: "center" }}>Position</th>
            <th style={{ ...th, textAlign: "center" }}>7-day</th>
            <th style={{ ...th, textAlign: "center" }}>Local pack</th>
            <th style={{ ...th, textAlign: "right" }}>Volume</th>
          </tr>
        </thead>
        <tbody>
          {ranks.map((r) => (
            <tr key={r.keyword} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ ...td, fontWeight: 500, color: "var(--ink)" }}>{r.keyword}</td>
              <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                {r.position == null ? (
                  <span style={{ color: "var(--rl-muted-2)" }}>—</span>
                ) : (
                  `#${r.position}`
                )}
              </td>
              <td style={{ ...td, textAlign: "center" }}>
                <Delta current={r.position} previous={r.previousPosition} />
              </td>
              <td style={{ ...td, textAlign: "center" }}>
                {r.inLocalPack ? (
                  <span className="chip chip--ok" style={chipSm}>
                    <Icon name="check" size={11} /> In pack
                  </span>
                ) : (
                  <span style={{ color: "var(--rl-muted-2)" }}>—</span>
                )}
              </td>
              <td
                style={{
                  ...td,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--rl-muted)",
                }}
              >
                {r.searchVolume != null ? r.searchVolume.toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Rank delta arrow. A LOWER position number is BETTER, so a decrease shows an
 * up/green improvement arrow.
 */
function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) {
    return <span style={{ color: "var(--rl-muted-2)" }}>—</span>;
  }
  const change = previous - current; // positive = improved (moved up)
  if (change === 0) {
    return <span style={{ color: "var(--rl-muted-2)" }}>0</span>;
  }
  const improved = change > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        color: improved ? "var(--ok)" : "var(--bad)",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
      }}
    >
      <Icon name={improved ? "arrowU" : "arrowD"} size={12} />
      {Math.abs(change)}
    </span>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "9px 10px", color: "var(--rl-muted)" };
const chipSm: React.CSSProperties = {
  height: 18,
  padding: "0 6px",
  fontSize: 10.5,
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
};
