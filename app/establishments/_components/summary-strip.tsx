import { Sparkline } from "@/components/shell/sparkline";
import { Stars } from "@/components/shell/stars";
import type { SummaryTile } from "./summary-state";

/**
 * Per-location summary strip above the establishment card list — one compact
 * tile per business: name, rating stars, profile-completeness meter, 30-day
 * review sparkline, and (only when real KeywordRank data exists) a local-rank
 * badge with a trend arrow.
 *
 * Tiles are plain anchors to `#est-{id}` — clicking one scrolls/highlights
 * that establishment's full card below (the `:target` ring in
 * establishments.css), the server-safe equivalent of the old rail selection.
 * With a single location the tile renders full-width slim (`--solo`).
 *
 * Server component: all numbers are precomputed by `deriveSummaryTile`.
 */
export function SummaryStrip({ tiles }: { tiles: SummaryTile[] }) {
  if (tiles.length === 0) return null;
  const solo = tiles.length === 1;
  return (
    <nav
      className={`est-strip${solo ? " est-strip--solo" : ""}`}
      aria-label="Locations at a glance"
    >
      {tiles.map((t) => (
        <a key={t.id} href={`#est-${t.id}`} className="est-tile">
          <div className="est-tile__head">
            <span className="est-tile__name">{t.name}</span>
            {t.rank && <RankBadge rank={t.rank} />}
          </div>

          <div className="est-tile__rating">
            {t.avgRating !== null ? (
              <>
                <span className="mono est-tile__score">{t.avgRating.toFixed(1)}</span>
                <Stars value={Math.round(t.avgRating)} size={11} />
              </>
            ) : (
              <span className="dim" style={{ fontSize: 12 }}>
                No rating yet
              </span>
            )}
          </div>

          <div className="est-tile__meterwrap">
            <div
              className="est-tile__meter"
              role="img"
              aria-label={`Profile ${t.completenessPct}% complete`}
            >
              <span className="est-tile__meter-fill" style={{ width: `${t.completenessPct}%` }} />
            </div>
            <span className="est-tile__caption dim">
              {t.completenessPct}% complete
              {t.nextStep ? ` · next: ${t.nextStep}` : ""}
            </span>
          </div>

          <div className="est-tile__spark">
            <Sparkline points={t.spark} width={solo ? 150 : 110} height={26} />
            <span className="est-tile__caption dim">
              {t.reviews30d} review{t.reviews30d === 1 ? "" : "s"} · 30d
            </span>
          </div>
        </a>
      ))}
    </nav>
  );
}

/**
 * Local-rank badge — rendered ONLY with real KeywordRank data. Lower position
 * is better, so prev > position = improving (↑ green).
 */
function RankBadge({ rank }: { rank: NonNullable<SummaryTile["rank"]> }) {
  const trend =
    rank.prevPosition === null || rank.prevPosition === rank.position
      ? null
      : rank.prevPosition > rank.position
        ? "up"
        : "down";
  return (
    <span
      className="chip est-tile__rank"
      title={`Latest local rank for “${rank.keyword}”${
        rank.prevPosition !== null ? ` (was #${rank.prevPosition})` : ""
      }`}
    >
      <span className="mono" style={{ fontWeight: 600 }}>
        #{rank.position}
      </span>
      {trend && (
        <span
          aria-label={trend === "up" ? "improved" : "dropped"}
          style={{ color: trend === "up" ? "var(--ok)" : "var(--bad)", fontWeight: 700 }}
        >
          {trend === "up" ? "↑" : "↓"}
        </span>
      )}
    </span>
  );
}
