import { Icon } from "@/components/shell/icon";
import type { CompetitorView } from "@/lib/seo/queries";
import { CompetitorControls } from "./competitor-controls";

/**
 * Competitors tab (Module 13) — Pro-gated at the page level. Shows the
 * side-by-side matrix (yours highlighted), Share-of-Voice bars, and the Keyword
 * Gap list. Add/remove route through the `addCompetitor`/`removeCompetitor`
 * server actions (the client `CompetitorControls` island). Server-renderable
 * matrix; only the add/remove form is client.
 */

export type CompetitorsPanelData = {
  competitors: CompetitorView[];
  /** Your own business numbers, for the highlighted "You" column. */
  you: { name: string; rating: number | null; reviewCount: number | null };
  establishmentId: string | null;
};

const CAP = 3;

export function CompetitorsPanel({ data }: { data: CompetitorsPanelData }) {
  const { competitors, you } = data;
  const atCap = competitors.length >= CAP;

  // Share of Voice: normalize by review counts (yours + competitors).
  const allReviewCounts = [you.reviewCount ?? 0, ...competitors.map((c) => c.reviewCount ?? 0)];
  const totalReviews = allReviewCounts.reduce((a, b) => a + b, 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ds-card" style={{ background: "var(--surface-2)" }}>
        <div
          className="ds-card__body"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ color: "var(--pri)", marginTop: 2, display: "inline-flex" }}>
              <Icon name="target" size={18} />
            </span>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                Competitor tracking
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--rl-muted)",
                  marginTop: 4,
                  marginBottom: 0,
                  maxWidth: 560,
                }}
              >
                Track up to {CAP} local rivals side-by-side. We monitor their rating, review volume,
                and the keywords they rank for that you don't.
              </p>
            </div>
          </div>
          <CompetitorControls establishmentId={data.establishmentId} atCap={atCap} />
        </div>
      </div>

      {competitors.length === 0 ? (
        <div className="ds-card">
          <div className="ds-card__body" style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ color: "var(--rl-muted-3)", display: "inline-flex" }}>
              <Icon name="target" size={28} />
            </div>
            <p style={{ fontSize: 14, color: "var(--ink)", margin: "10px 0 2px", fontWeight: 600 }}>
              No competitors tracked yet
            </p>
            <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
              Add a competitor above to see the side-by-side comparison and keyword gap.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Side-by-side matrix */}
          <div className="ds-card">
            <div className="ds-card__head">
              <div className="ds-card__title">Side-by-side</div>
            </div>
            <div className="ds-card__body" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--rl-muted-2)", fontSize: 11.5 }}>
                    <th style={th}>Business</th>
                    <th style={{ ...th, textAlign: "center" }}>Rating</th>
                    <th style={{ ...th, textAlign: "center" }}>Reviews</th>
                    <th style={{ ...th, textAlign: "right" }}>Share of voice</th>
                  </tr>
                </thead>
                <tbody>
                  <MatrixRow
                    name={`${you.name} (You)`}
                    rating={you.rating}
                    reviewCount={you.reviewCount}
                    sov={((you.reviewCount ?? 0) / totalReviews) * 100}
                    highlight
                  />
                  {competitors.map((c) => (
                    <MatrixRow
                      key={c.id}
                      name={c.name}
                      rating={c.rating}
                      reviewCount={c.reviewCount}
                      sov={((c.reviewCount ?? 0) / totalReviews) * 100}
                      betterThanYou={{
                        rating: (c.rating ?? 0) > (you.rating ?? 0),
                        reviews: (c.reviewCount ?? 0) > (you.reviewCount ?? 0),
                      }}
                      onRemoveId={c.id}
                      establishmentId={data.establishmentId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Keyword gap */}
          <div className="ds-card">
            <div className="ds-card__head">
              <div className="ds-card__title">Keyword gap</div>
              <div className="ds-card__sub">Keywords competitors rank for that you don't.</div>
            </div>
            <div className="ds-card__body">
              {competitors.some((c) => c.keywordGap.length > 0) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {competitors
                    .filter((c) => c.keywordGap.length > 0)
                    .map((c) => (
                      <div key={c.id}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--ink)",
                            marginBottom: 6,
                          }}
                        >
                          {c.name}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {c.keywordGap.map((kw) => (
                            <span
                              key={kw}
                              className="chip chip--warn"
                              style={{ height: 22, padding: "0 8px", fontSize: 11 }}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
                  No keyword gap data yet it populates after the next rank-tracking crawl.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MatrixRow({
  name,
  rating,
  reviewCount,
  sov,
  highlight,
  betterThanYou,
  onRemoveId,
  establishmentId,
}: {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  sov: number;
  highlight?: boolean;
  betterThanYou?: { rating: boolean; reviews: boolean };
  onRemoveId?: string;
  establishmentId?: string | null;
}) {
  return (
    <tr
      style={{
        borderTop: "1px solid var(--line)",
        background: highlight ? "color-mix(in srgb, var(--pri) 7%, transparent)" : undefined,
      }}
    >
      <td
        style={{
          ...td,
          fontWeight: highlight ? 700 : 500,
          color: highlight ? "var(--pri)" : "var(--ink)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {name}
          {onRemoveId && (
            <CompetitorControls.RemoveButton
              id={onRemoveId}
              establishmentId={establishmentId ?? null}
            />
          )}
        </span>
      </td>
      <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        <Cmp
          value={rating != null ? rating.toFixed(2) : "—"}
          better={betterThanYou?.rating}
          worse={betterThanYou ? !betterThanYou.rating : undefined}
        />
      </td>
      <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        <Cmp
          value={reviewCount != null ? reviewCount.toLocaleString() : "—"}
          better={betterThanYou?.reviews}
          worse={betterThanYou ? !betterThanYou.reviews : undefined}
        />
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <div
            style={{
              width: 80,
              height: 7,
              borderRadius: 4,
              background: "var(--surface-3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.max(0, Math.min(100, sov))}%`,
                background: highlight ? "var(--pri)" : "var(--rl-muted-2)",
              }}
            />
          </div>
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--rl-muted)",
              fontSize: 12,
              width: 38,
              textAlign: "right",
            }}
          >
            {sov.toFixed(0)}%
          </span>
        </div>
      </td>
    </tr>
  );
}

function Cmp({ value, better, worse }: { value: string; better?: boolean; worse?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--ink)" }}>
      {value}
      {better && (
        <Icon
          name="triangleR"
          size={10}
          style={{ color: "var(--bad)", transform: "rotate(-90deg)" }}
        />
      )}
      {worse && (
        <Icon
          name="triangleR"
          size={10}
          style={{ color: "var(--ok)", transform: "rotate(90deg)" }}
        />
      )}
    </span>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 10px", color: "var(--rl-muted)" };
