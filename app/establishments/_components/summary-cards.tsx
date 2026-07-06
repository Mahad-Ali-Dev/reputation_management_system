import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import type { EstTint } from "./card-state";

/**
 * Row A — business summary cards (3-up) + a dashed "Add New Business" card,
 * matching the delivered kit (12-my-establishments-populated). Each business
 * card: 56px tinted icon tile + name + type, then a 3-metric row
 * (Avg. Rating · Total Reviews · vs last 30d).
 *
 * Pure presentational server component — every number is precomputed by the
 * page from real establishment rows. Clicking a card scrolls to that
 * business's row below (`#est-{id}`, highlighted via the :target ring).
 */
export type SummaryCard = {
  id: string;
  name: string;
  type: string;
  tint: EstTint;
  tileIcon: string;
  avgRating: number | null;
  totalReviews: number;
  trendPct: number | null;
};

export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="est-summary">
      {cards.map((c) => (
        <a key={c.id} href={`#est-${c.id}`} className="est-scard">
          <div className="est-scard__top">
            <span className={`est-tile est-tile--${c.tint}`}>
              {/* biome-ignore lint/performance/noImgElement: static kit SVG glyph */}
              <img src={c.tileIcon} alt="" width={56} height={56} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="est-scard__name">{c.name}</div>
              <div className="est-scard__type">{c.type}</div>
            </div>
          </div>

          <div className="est-scard__metrics">
            <div className="est-metric">
              <div className="est-metric__val">
                {c.avgRating !== null ? (
                  <>
                    <Icon name="star" size={14} className="est-star" />
                    <span aria-label={`${c.avgRating.toFixed(1)} out of 5`}>
                      {c.avgRating.toFixed(1)}
                    </span>
                  </>
                ) : (
                  <span className="est-star" style={{ color: "var(--est-muted-2)" }}>
                    —
                  </span>
                )}
              </div>
              <div className="est-metric__lbl">Avg. Rating</div>
            </div>

            <div className="est-metric">
              <div className="est-metric__val">{c.totalReviews.toLocaleString()}</div>
              <div className="est-metric__lbl">Total Reviews</div>
            </div>

            <div className="est-metric">
              <div
                className={`est-metric__val${c.trendPct !== null && c.trendPct >= 0 ? " est-metric__val--up" : ""}`}
              >
                {c.trendPct !== null ? (
                  <>
                    <Icon
                      name={c.trendPct >= 0 ? "arrowU" : "arrowD"}
                      size={13}
                      stroke={2.4}
                    />
                    {Math.abs(c.trendPct)}%
                  </>
                ) : (
                  <span style={{ color: "var(--est-muted-2)" }}>—</span>
                )}
              </div>
              <div className="est-metric__lbl">vs last 30d</div>
            </div>
          </div>
        </a>
      ))}

      <Link href="/establishments/new" className="est-scard est-scard--add">
        <span className="est-addcircle" aria-hidden="true">
          <Icon name="plus" size={22} />
        </span>
        <span>Add New Business</span>
      </Link>
    </div>
  );
}
