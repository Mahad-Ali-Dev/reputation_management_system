import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import type { OverviewMetrics } from "@/lib/seo/overview";
import { ExecSummaryCard } from "./exec-summary-card";

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
  execSummary,
  entitled,
}: {
  metrics: OverviewMetrics;
  execSummary: { summary: string; generatedAt: string | null; ai: boolean };
  entitled: boolean;
}) {
  const rep = metrics.reputation;
  const hasReviews = rep.reviewCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* AI Executive Summary (date range now lives in the report header) */}
      <ExecSummaryCard
        summary={execSummary.summary}
        generatedAt={execSummary.generatedAt}
        ai={execSummary.ai}
        canRegenerate={entitled}
      />

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

        {/* SEO cards — gated by connection */}
        {metrics.connected.rankTracking ? (
          <KpiTile
            label="Local pack position"
            value={metrics.seo.localPackPosition != null ? `#${metrics.seo.localPackPosition}` : "—"}
            hint={metrics.seo.localPackPosition != null ? "Best tracked keyword" : "Awaiting first crawl"}
            icon="pin"
          />
        ) : (
          <ConnectTile label="Local pack position" hint="Connect rank tracking" href="/connections" icon="pin" />
        )}
        {metrics.connected.ga4 ? (
          <KpiTile
            label="Website sessions"
            value={metrics.seo.websiteSessions != null ? metrics.seo.websiteSessions.toLocaleString() : "—"}
            hint="Last 30 days (GA4)"
            icon="bars"
          />
        ) : (
          <ConnectTile label="Website sessions" hint="Connect GA4" href="/connections" icon="bars" />
        )}
      </div>

      {/* Reviews trend */}
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

      {/* Rating distribution + NPS/chatbot */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="ds-card">
          <div className="ds-card__head">
            <div className="ds-card__title">Rating distribution</div>
            <div className="ds-card__sub">Last {metrics.rangeDays} days</div>
          </div>
          <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <RatingHistogram buckets={rep.ratingBreakdown} hasReviews={hasReviews} />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <div className="ds-card__title">NPS &amp; Chatbot</div>
            <div className="ds-card__sub">Survey + AI activity</div>
          </div>
          <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--rl-muted)" }}>NPS score</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
                {rep.npsScore === null ? "—" : rep.npsScore}
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--rl-muted)" }}>AI chatbot conversations</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
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

function KpiTile({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: IconName }) {
  return (
    <div className="ds-card">
      <div className="ds-card__body">
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--rl-muted)", fontSize: 12 }}>
          <Icon name={icon} size={13} />
          {label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ink)", marginTop: 4 }}>
          {value}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--rl-muted-2)", marginTop: 2 }}>{hint}</div>
      </div>
    </div>
  );
}

function ConnectTile({ label, hint, href, icon }: { label: string; hint: string; href: string; icon: IconName }) {
  return (
    <Link
      href={href}
      className="ds-card"
      style={{ textDecoration: "none", display: "block", borderStyle: "dashed" }}
    >
      <div className="ds-card__body">
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--rl-muted)", fontSize: 12 }}>
          <Icon name={icon} size={13} />
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--pri)", marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="plug" size={13} /> {hint} →
        </div>
      </div>
    </Link>
  );
}

function RatingHistogram({ buckets, hasReviews }: { buckets: RatingBucket[]; hasReviews: boolean }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <>
      {buckets.map((b) => (
        <div key={b.star} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{ width: 34, color: "var(--rl-muted)" }}>{b.star} ★</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(b.count / max) * 100}%`,
                background: b.star >= 4 ? "var(--ok)" : b.star === 3 ? "var(--warn)" : "var(--bad)",
              }}
            />
          </div>
          <span style={{ width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--rl-muted)" }}>
            {b.count}
          </span>
        </div>
      ))}
      {!hasReviews && <p style={{ fontSize: 12, color: "var(--rl-muted-2)", margin: 0 }}>No reviews yet.</p>}
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
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: 176 }} role="img" aria-label="Reviews per day">
        <defs>
          <linearGradient id="seoTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pri)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--pri)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={padX} x2={width - padX} y1={padY + innerH * t} y2={padY + innerH * t} stroke="var(--line)" strokeDasharray="2,3" />
        ))}
        <path d={areaPath} fill="url(#seoTrendFill)" />
        <path d={linePath} fill="none" stroke="var(--pri)" strokeWidth="2" />
        {coords.map((c) => (
          <circle key={c.day} cx={c.x} cy={c.y} r="2" fill="var(--pri)">
            <title>{c.day}: {c.count} review{c.count === 1 ? "" : "s"}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--rl-muted-2)", paddingTop: 4 }}>
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}
