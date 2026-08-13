import { EmptyIllustration } from "@/components/empty-state";
import { Icon } from "@/components/shell/icon";
import type { OverviewMetrics } from "@/lib/seo/overview";
import Link from "next/link";
import type { ReactNode } from "react";

/** Minimal competitor slice for the Overview compare chart (built by the page
 *  from the same `listCompetitors` query the Competitors tab uses; `null` when
 *  the org isn't entitled so gated data never reaches the client). */
export type CompetitorCompareData = {
  you: { name: string; rating: number | null; reviewCount: number | null };
  competitors: { name: string; rating: number | null; reviewCount: number | null }[];
};

/**
 * Overview tab (Module 13) — the cross-functional hub.
 *
 * Server-rendered: receives the assembled `OverviewMetrics` + the cached exec
 * summary as props (the page fetches them). Renders the AI Executive Summary on
 * top, then reputation KPI cards (Rating, Volume, Response Rate) + SEO cards
 * (Local Pack Position, Website Sessions) — the SEO cards show a "Connect to
 * unlock" tile when the relevant integration isn't connected. The reviews-per-
 * day trend + rating distribution carry over from the legacy single page.
 */
export function OverviewPanel({
  metrics,
  execSummarySlot,
  entitled,
  orgName,
  competitorCompare,
}: {
  metrics: OverviewMetrics;
  /** AI Executive Summary, streamed from the page inside a <Suspense> boundary
   *  so the ~15s Anthropic call never blocks the report shell. */
  execSummarySlot: ReactNode;
  entitled: boolean;
  /** Org display name — labels the "You" slot in the local 3-pack visual. */
  orgName: string;
  /** Compare-chart data (entitled orgs only; null ⇒ upgrade CTA). */
  competitorCompare: CompetitorCompareData | null;
}) {
  const rep = metrics.reputation;
  const hasReviews = rep.reviewCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* AI Executive Summary — streamed (date range lives in the report header) */}
      {execSummarySlot}

      {/* KPI tiles — reputation + SEO */}
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
        }}
      >
        <KpiTile
          label="Reviews"
          value={rep.reviewCount.toLocaleString()}
          hint={hasReviews ? `${metrics.rangeDays}-day total` : "Connect Google to start syncing"}
          icon="star"
        />
        <KpiTile
          label="Avg rating"
          value={hasReviews ? rep.avgRating.toFixed(2) : "—"}
          hint={
            !hasReviews
              ? "Needs reviews"
              : rep.avgRating >= 4.5
                ? "Excellent"
                : rep.avgRating >= 4
                  ? "Good"
                  : "Needs attention"
          }
          icon="trend"
        />
        <KpiTile
          label="Response rate"
          value={hasReviews ? `${rep.responseRate}%` : "—"}
          hint={!hasReviews ? "—" : rep.responseRate >= 80 ? "On top of it" : "Reply to more"}
          icon="reply"
        />
        <KpiTile
          label="QR scans"
          value={rep.scanCount.toLocaleString()}
          hint={rep.scanCount === 0 ? "No scans yet" : "Stand activations"}
          icon="qr"
        />

        {/* SEO cards — gated by connection. The local-rank KPI only renders when
            connected; the unconnected state lives in the richer 3-pack card below. */}
        {metrics.connected.rankTracking && (
          <KpiTile
            label="Local pack position"
            value={
              metrics.seo.localPackPosition != null ? `#${metrics.seo.localPackPosition}` : "—"
            }
            hint={
              metrics.seo.localPackPosition != null
                ? "Best tracked keyword"
                : "Awaiting first crawl"
            }
            icon="pin"
          />
        )}
        {metrics.connected.ga4 ? (
          <KpiTile
            label="Website sessions"
            value={
              metrics.seo.websiteSessions != null
                ? metrics.seo.websiteSessions.toLocaleString()
                : "—"
            }
            hint="Last 30 days (GA4)"
            icon="bars"
          />
        ) : (
          <ConnectTile
            label="Website sessions"
            hint="Connect GA4"
            href="/connections"
            icon="bars"
          />
        )}
      </div>

      {/* Chart row — reviews trend + local 3-pack + competitor compare */}
      <div className="anx-row">
        <div className="ds-card">
          <div className="ds-card__head">
            <div className="ds-card__title">Reviews per day</div>
            <div className="ds-card__sub">
              {hasReviews
                ? `${rep.reviewCount} review${rep.reviewCount === 1 ? "" : "s"} in the last ${metrics.rangeDays} days.`
                : "No data yet. Sync your Google reviews to see activity here."}
            </div>
          </div>
          <div className="ds-card__body">
            <ReviewsTrendChart points={rep.reviewsPerDay} />
          </div>
        </div>

        <LocalPackCard
          connected={metrics.connected.rankTracking}
          position={metrics.seo.localPackPosition}
          orgName={orgName}
          rating={hasReviews ? rep.avgRating : null}
        />

        <CompetitorCompareCard data={competitorCompare} />
      </div>

      {/* Rating distribution + NPS/chatbot */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div className="ds-card">
          <div className="ds-card__head">
            <div className="ds-card__title">Rating distribution</div>
            <div className="ds-card__sub">Last {metrics.rangeDays} days</div>
          </div>
          <div
            className="ds-card__body"
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <RatingHistogram buckets={rep.ratingBreakdown} hasReviews={hasReviews} />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <div className="ds-card__title">NPS &amp; Chatbot</div>
            <div className="ds-card__sub">Survey + AI activity</div>
          </div>
          <div
            className="ds-card__body"
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--rl-muted)" }}>NPS score</div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink)",
                }}
              >
                {rep.npsScore === null ? "—" : rep.npsScore}
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--rl-muted)" }}>AI chatbot conversations</div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink)",
                }}
              >
                {rep.conversationCount.toLocaleString()}
              </div>
              <Link href="/ai" style={{ fontSize: 12, color: "var(--pri)" }}>
                Manage widget →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── presentational helpers (moved from the legacy app/analytics/page.tsx) ──

import type { IconName } from "@/components/shell/icon";
import type { DailyCount, RatingBucket } from "@/lib/seo/overview";

function KpiTile({
  label,
  value,
  hint,
  icon,
}: { label: string; value: string; hint: string; icon: IconName }) {
  return (
    <div className="ds-card">
      <div className="ds-card__body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--rl-muted)",
            fontSize: 12,
          }}
        >
          <Icon name={icon} size={13} />
          {label}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink)",
            marginTop: 4,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--rl-muted-2)", marginTop: 2 }}>{hint}</div>
      </div>
    </div>
  );
}

function ConnectTile({
  label,
  hint,
  href,
  icon,
}: { label: string; hint: string; href: string; icon: IconName }) {
  return (
    <Link
      href={href}
      className="ds-card"
      style={{ textDecoration: "none", display: "block", borderStyle: "dashed" }}
    >
      <div className="ds-card__body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--rl-muted)",
            fontSize: 12,
          }}
        >
          <Icon name={icon} size={13} />
          {label}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--pri)",
            marginTop: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Icon name="plug" size={13} /> {hint} →
        </div>
      </div>
    </Link>
  );
}

/**
 * Local 3-pack mini visual. Three states:
 *  - rank tracking connected + position known → mini map-pack: three rank
 *    slots, yours highlighted (anonymous slots are skeleton bars — we never
 *    invent competitor names for positions we don't know).
 *  - connected, no crawl yet → "awaiting first crawl".
 *  - not connected → designed connect-CTA card into /connections.
 */
function LocalPackCard({
  connected,
  position,
  orgName,
  rating,
}: {
  connected: boolean;
  position: number | null;
  orgName: string;
  rating: number | null;
}) {
  if (!connected) {
    return (
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="ds-card__title">Local 3-pack</div>
          <div className="ds-card__sub">Your spot in Google's map results</div>
        </div>
        <div className="ds-card__body anx-connect">
          <span className="anx-connect__icon">
            <Icon name="pin" size={18} />
          </span>
          <p className="anx-connect__title">See your local 3-pack rank</p>
          <p className="anx-connect__sub">
            Connect rank tracking to monitor where you appear in Google's local map pack for your
            keywords.
          </p>
          <Link href="/connections" className="anx-connect__cta">
            <Icon name="plug" size={13} /> Connect rank tracking
          </Link>
        </div>
      </div>
    );
  }

  if (position == null) {
    return (
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="ds-card__title">Local 3-pack</div>
          <div className="ds-card__sub">Your spot in Google's map results</div>
        </div>
        <div className="ds-card__body anx-connect">
          <span className="anx-connect__icon">
            <Icon name="pin" size={18} />
          </span>
          <p className="anx-connect__title">Awaiting first crawl</p>
          <p className="anx-connect__sub">
            Rank tracking is connected — your local-pack position appears after the next crawl.
          </p>
        </div>
      </div>
    );
  }

  const inPack = position <= 3;
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div className="ds-card__title">Local 3-pack</div>
        <div className="ds-card__sub">Best tracked keyword</div>
      </div>
      <div className="ds-card__body">
        <div className="anx-pack__list">
          {[1, 2, 3].map((slot) =>
            inPack && slot === position ? (
              <div key={slot} className="anx-pack__slot anx-pack__slot--you">
                <span className="anx-pack__rank">{slot}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="anx-pack__you-name" style={{ display: "block" }}>
                    {orgName}
                  </span>
                  <span className="anx-pack__you-meta">
                    You{rating != null ? ` · ${rating.toFixed(1)} ★` : ""}
                  </span>
                </span>
              </div>
            ) : (
              <div key={slot} className="anx-pack__slot" aria-hidden="true">
                <span className="anx-pack__rank">{slot}</span>
                <span className="anx-pack__ghost">
                  <span className="anx-pack__ghost-bar" />
                  <span className="anx-pack__ghost-bar anx-pack__ghost-bar--short" />
                </span>
              </div>
            ),
          )}
        </div>
        {inPack ? (
          <p className="anx-pack__foot">You hold position #{position} in the map pack.</p>
        ) : (
          <p className="anx-pack__foot anx-pack__foot--out">
            You're #{position} — outside the 3-pack. See Recommendations to climb.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Competitor compare — compact bar chart of review volume (You vs tracked
 * rivals), reusing the Competitors tab's `listCompetitors` data. Zero state
 * deep-links into the Competitors tab; non-entitled orgs get the upgrade CTA
 * (same `/subscription` route the padlocked tab uses).
 */
function CompetitorCompareCard({ data }: { data: CompetitorCompareData | null }) {
  if (data === null) {
    return (
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="ds-card__title">Competitor compare</div>
          <div className="ds-card__sub">Review volume vs rivals</div>
        </div>
        <div className="ds-card__body anx-connect">
          <span className="anx-connect__icon">
            <Icon name="lock" size={16} />
          </span>
          <p className="anx-connect__title">Competitor intel is a Pro feature</p>
          <p className="anx-connect__sub">
            Upgrade to benchmark your rating and review volume against up to 3 local rivals.
          </p>
          <Link href="/subscription?feature=competitors" className="anx-connect__cta">
            Upgrade →
          </Link>
        </div>
      </div>
    );
  }

  if (data.competitors.length === 0) {
    return (
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="ds-card__title">Competitor compare</div>
          <div className="ds-card__sub">Review volume vs rivals</div>
        </div>
        <div className="ds-card__body anx-comp__empty">
          <EmptyIllustration name="insights-empty" size={120} />
          <p className="anx-connect__title">No competitors tracked yet</p>
          <p className="anx-connect__sub">
            Track up to 3 local rivals to see how your review volume stacks up.
          </p>
          <Link href="/analytics?tab=competitors" className="anx-connect__cta">
            <Icon name="target" size={13} /> Track competitors
          </Link>
        </div>
      </div>
    );
  }

  const entries = [
    {
      name: data.you.name,
      rating: data.you.rating,
      reviewCount: data.you.reviewCount ?? 0,
      you: true,
    },
    ...data.competitors.map((c) => ({
      name: c.name,
      rating: c.rating,
      reviewCount: c.reviewCount ?? 0,
      you: false,
    })),
  ];
  const max = Math.max(1, ...entries.map((e) => e.reviewCount));

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div className="ds-card__title">Competitor compare</div>
        <div className="ds-card__sub">Total review volume</div>
      </div>
      <div className="ds-card__body">
        <div
          className="anx-comp__bars"
          role="img"
          aria-label="Review volume: you vs tracked competitors"
        >
          {entries.map((e) => (
            <div key={e.name + (e.you ? "-you" : "")} className="anx-comp__col">
              <span className="anx-comp__val">{e.reviewCount.toLocaleString()}</span>
              <div
                className={`anx-comp__bar${e.you ? " anx-comp__bar--you" : ""}`}
                style={{ height: `${Math.max(3, (e.reviewCount / max) * 80)}%` }}
                title={`${e.name}: ${e.reviewCount.toLocaleString()} reviews${e.rating != null ? `, ${e.rating.toFixed(1)} ★` : ""}`}
              />
            </div>
          ))}
        </div>
        <div className="anx-comp__labels">
          {entries.map((e) => (
            <span
              key={e.name + (e.you ? "-you" : "")}
              className={`anx-comp__label${e.you ? " anx-comp__label--you" : ""}`}
            >
              {e.you ? "You" : e.name}
              <span className="anx-comp__rating">
                {e.rating != null ? `${e.rating.toFixed(1)} ★` : "—"}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RatingHistogram({
  buckets,
  hasReviews,
}: { buckets: RatingBucket[]; hasReviews: boolean }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <>
      {buckets.map((b) => (
        <div key={b.star} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{ width: 34, color: "var(--rl-muted)" }}>{b.star} ★</span>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: "var(--surface-3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(b.count / max) * 100}%`,
                background: b.star >= 4 ? "var(--ok)" : b.star === 3 ? "var(--warn)" : "var(--bad)",
              }}
            />
          </div>
          <span
            style={{
              width: 36,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              color: "var(--rl-muted)",
            }}
          >
            {b.count}
          </span>
        </div>
      ))}
      {!hasReviews && (
        <p style={{ fontSize: 12, color: "var(--rl-muted-2)", margin: 0 }}>No reviews yet.</p>
      )}
    </>
  );
}

function ReviewsTrendChart({ points }: { points: DailyCount[] }) {
  if (points.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>No data.</p>;
  }
  const width = 720;
  const height = 180;
  const padX = 16;
  const padY = 16;
  const maxN = Math.max(1, ...points.map((p) => p.count));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - (p.count / maxN) * innerH,
    count: p.count,
    day: p.day,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath =
    `M ${coords[0]?.x ?? padX} ${padY + innerH} ` +
    coords.map((c) => `L ${c.x} ${c.y}`).join(" ") +
    ` L ${coords[coords.length - 1]?.x ?? padX} ${padY + innerH} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 176 }}
        role="img"
        aria-label="Reviews per day"
      >
        <defs>
          <linearGradient id="seoTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pri)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--pri)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={width - padX}
            y1={padY + innerH * t}
            y2={padY + innerH * t}
            stroke="var(--line)"
            strokeDasharray="2,3"
          />
        ))}
        <path d={areaPath} fill="url(#seoTrendFill)" />
        <path d={linePath} fill="none" stroke="var(--pri)" strokeWidth="2" />
        {coords.map((c) => (
          <circle key={c.day} cx={c.x} cy={c.y} r="2" fill="var(--pri)">
            <title>
              {c.day}: {c.count} review{c.count === 1 ? "" : "s"}
            </title>
          </circle>
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--rl-muted-2)",
          paddingTop: 4,
        }}
      >
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}
