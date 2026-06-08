import { Icon } from "@/components/shell/icon";
import type { CitationAuditView } from "@/lib/seo/queries";

/**
 * Presentational NAP-consistency table (Module 13). Rows = directories
 * (Google / Yelp / Facebook / Apple Maps); columns = Name / Address / Phone
 * match vs the canonical establishment record (✓ / ✗ / —). Pure props from
 * `CitationAudit`. Server-renderable.
 */

const DIRECTORY_LABELS: Record<string, string> = {
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
  apple_maps: "Apple Maps",
};

const ALL_DIRECTORIES = ["google", "yelp", "facebook", "apple_maps"] as const;

const STATUS_CHIP: Record<string, { cls: string; label: string }> = {
  consistent: { cls: "chip chip--ok", label: "Consistent" },
  inconsistent: { cls: "chip chip--bad", label: "Inconsistent" },
  missing: { cls: "chip chip--warn", label: "Not listed" },
  unknown: { cls: "chip chip--out", label: "Unknown" },
};

export function CitationAuditTable({ rows }: { rows: CitationAuditView[] }) {
  // Index by directory so we always render all four in a stable order, even
  // before an audit has run (those show as "Unknown").
  const byDir = new Map(rows.map((r) => [r.directory, r]));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--rl-muted-2)", fontSize: 11.5 }}>
            <th style={th}>Directory</th>
            <th style={{ ...th, textAlign: "center" }}>Name</th>
            <th style={{ ...th, textAlign: "center" }}>Address</th>
            <th style={{ ...th, textAlign: "center" }}>Phone</th>
            <th style={{ ...th, textAlign: "right" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {ALL_DIRECTORIES.map((dir) => {
            const r = byDir.get(dir);
            const status = r?.status ?? "unknown";
            const chip = STATUS_CHIP[status] ?? STATUS_CHIP.unknown;
            return (
              <tr key={dir} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ ...td, fontWeight: 500, color: "var(--ink)" }}>
                  {DIRECTORY_LABELS[dir] ?? dir}
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <MatchMark value={r?.nameMatch ?? null} />
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <MatchMark value={r?.addressMatch ?? null} />
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <MatchMark value={r?.phoneMatch ?? null} />
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <span className={chip!.cls} style={chipSm}>
                    {chip!.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** ✓ (match) / ✗ (mismatch) / — (unknown). */
function MatchMark({ value }: { value: boolean | null }) {
  if (value == null) return <span style={{ color: "var(--rl-muted-2)" }}>—</span>;
  return value ? (
    <span style={{ color: "var(--ok)", display: "inline-flex" }} title="Matches">
      <Icon name="check" size={15} />
    </span>
  ) : (
    <span style={{ color: "var(--bad)", display: "inline-flex" }} title="Does not match">
      <Icon name="x" size={15} />
    </span>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "9px 10px", color: "var(--rl-muted)" };
const chipSm: React.CSSProperties = { height: 18, padding: "0 8px", fontSize: 10.5 };
