import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import { LegendDot } from "@/components/shell/legend-dot";
import { SentimentDonut } from "@/components/shell/sentiment-donut";
import { Sparkline } from "@/components/shell/sparkline";
import { StackedBars } from "@/components/shell/stacked-bars";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";

/**
 * Dashboard — repulabs v2 design, real-data wired.
 *
 * All KPIs, charts, and feeds are driven by live Prisma queries scoped to
 * the authenticated org's tenant. No fixture values. Empty states render
 * when a section has no data yet.
 */

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  rating: number;
  reviewerName: string | null;
  body: string | null;
  postedAt: Date | null;
  source: string;
  hasReply: boolean;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { orgId, userName, userEmail, org } = await getOrgContext();

  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since12weeks = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  // PERF: every query that follows runs inside one tenant transaction. The
  // previous code fired three separate transactions (dashboard data,
  // reviewRequestStats, notifications bell) — each paying the SET LOCAL ROLE +
  // SET LOCAL app.current_org_id + COMMIT cost. Folding them removes ~80-150ms
  // of stacked overhead per page load on a remote Postgres (Neon).
  const { data, requestStats } = await withTenant(orgId, async (tx) => {
    const [
      reviews7d,
      reviewsPrev7d,
      allReviewsRecent,
      ratingAgg,
      ratingAggPrev,
      pendingReplyCount,
      publishedReplyCount,
      liveReviews,
      establishments,
      reviewsForChart,
      recentReplies,
      recentRequests,
      recentCalls,
      recentScans,
      reqSent,
      reqDelivered,
      reqOpened,
      reqConverted,
    ] = await Promise.all([
      tx.review.count({ where: { postedAt: { gte: since7d } } }),
      tx.review.count({
        where: { postedAt: { gte: since14d, lt: since7d } },
      }),
      tx.review.findMany({
        where: { postedAt: { gte: since30d } },
        select: { rating: true, source: true },
      }),
      tx.review.aggregate({
        _avg: { rating: true },
        _count: { _all: true },
      }),
      tx.review.aggregate({
        _avg: { rating: true },
        where: { postedAt: { lt: since7d } },
      }),
      tx.reviewReply.count({ where: { status: "pending_review" } }),
      tx.reviewReply.count({
        where: { status: { in: ["published", "pending_review"] } },
      }),
      tx.review.findMany({
        orderBy: { postedAt: "desc" },
        take: 3,
        select: {
          id: true,
          rating: true,
          reviewerName: true,
          body: true,
          postedAt: true,
          source: true,
          reply: { select: { id: true } },
        },
      }),
      // PERF: previously fetched ALL reviews per establishment to compute avg
      // ratings. For a busy account that was thousands of rows. Replaced with
      // groupBy(rating).count and join in JS.
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          address: true,
          _count: {
            select: {
              connections: { where: { status: "active" } },
              reviews: true,
            },
          },
        },
        take: 6,
      }),
      tx.review.findMany({
        where: { postedAt: { gte: since12weeks } },
        select: { postedAt: true, source: true },
      }),
      tx.reviewReply.findMany({
        where: { createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, status: true, createdAt: true },
      }),
      tx.reviewRequest.findMany({
        where: { createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          status: true,
          channel: true,
          recipient: true,
        },
      }),
      tx.phoneCall.findMany({
        where: { startedAt: { gte: since24h } },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: {
          id: true,
          startedAt: true,
          status: true,
          fromE164: true,
          durationSeconds: true,
        },
      }),
      tx.deviceScan.findMany({
        where: { scannedAt: { gte: since24h } },
        orderBy: { scannedAt: "desc" },
        take: 5,
        select: {
          id: true,
          scannedAt: true,
          country: true,
        },
      }),
      // Inlined reviewRequestStats (was a separate withTenant tx).
      tx.reviewRequest.count({ where: { sentAt: { gte: since30d } } }),
      tx.reviewRequest.count({ where: { deliveredAt: { gte: since30d } } }),
      tx.reviewRequest.count({ where: { openedAt: { gte: since30d } } }),
      tx.reviewRequest.count({ where: { convertedAt: { gte: since30d } } }),
    ]);

    // Per-establishment avg rating: one extra grouped query instead of N
    // findMany() relations.
    const estabIds = establishments.map((e) => e.id);
    const ratingGroups =
      estabIds.length > 0
        ? await tx.review.groupBy({
            by: ["establishmentId"],
            where: { establishmentId: { in: estabIds } },
            _avg: { rating: true },
            _count: { rating: true },
          })
        : [];
    const ratingsByEstab = new Map<string, { avg: number | null; n: number }>();
    for (const g of ratingGroups) {
      if (g.establishmentId) {
        ratingsByEstab.set(g.establishmentId, {
          avg: g._avg.rating,
          n: g._count.rating,
        });
      }
    }
    const establishmentsWithRatings = establishments.map((e) => ({
      ...e,
      avgRating: ratingsByEstab.get(e.id)?.avg ?? null,
      reviewCount: ratingsByEstab.get(e.id)?.n ?? 0,
    }));

    return {
      data: {
        reviews7d,
        reviewsPrev7d,
        allReviewsRecent,
        ratingAgg,
        ratingAggPrev,
        pendingReplyCount,
        publishedReplyCount,
        liveReviews,
        establishments: establishmentsWithRatings,
        reviewsForChart,
        recentReplies,
        recentRequests,
        recentCalls,
        recentScans,
      },
      requestStats: {
        sent: reqSent,
        delivered: reqDelivered,
        opened: reqOpened,
        converted: reqConverted,
      },
    };
  });

  const compositeRating = data.ratingAgg._avg.rating ?? null;
  const compositeRatingPrev = data.ratingAggPrev._avg.rating ?? null;
  const ratingDelta =
    compositeRating !== null && compositeRatingPrev !== null
      ? compositeRating - compositeRatingPrev
      : 0;
  const reviewsDelta =
    data.reviewsPrev7d > 0
      ? Math.round(((data.reviews7d - data.reviewsPrev7d) / data.reviewsPrev7d) * 100)
      : data.reviews7d > 0
        ? 100
        : 0;
  const responseRate =
    data.allReviewsRecent.length > 0
      ? Math.round((data.publishedReplyCount / Math.max(1, data.allReviewsRecent.length)) * 100)
      : 0;
  const sentiment = computeSentiment(data.allReviewsRecent);
  const channelMix = computeChannelMix(data.allReviewsRecent);
  const stackedChart = compute12WeekChart(data.reviewsForChart, since12weeks);
  const funnel = computeFunnel(requestStats);

  const welcomeName =
    userName?.split(" ")[0] ?? userEmail?.split("@")[0] ?? "there";
  const kicker = `${now.toLocaleDateString("en-US", { weekday: "short" })} · ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const params = await searchParams;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "Dashboard"]} biz={org.name}>
      <PageHeader
        kicker={kicker}
        title={`${greeting(now)}, ${welcomeName}`}
        description={dashboardSummary(data, ratingDelta)}
        actions={
          <>
            <div className="seg">
              <button type="button" className="seg__t">
                24h
              </button>
              <button type="button" className="seg__t is-active">
                7d
              </button>
              <button type="button" className="seg__t">
                30d
              </button>
              <button type="button" className="seg__t">
                12mo
              </button>
            </div>
            <button type="button" className="btn">
              <Icon name="download" size={13} />
              Export
            </button>
            <button type="button" className="btn btn--pri">
              <Icon name="plus" size={13} />
              New request
            </button>
          </>
        }
      />

      {params.checkout === "success" && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Subscription active. Welcome to Pro.
        </div>
      )}

      {/* KPI strip — all real numbers */}
      <div className="grid-5" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi
          l="Composite rating"
          v={compositeRating ? compositeRating.toFixed(2) : "—"}
          em={compositeRating ? "/5" : undefined}
          d={
            ratingDelta === 0
              ? "No change"
              : `${ratingDelta > 0 ? "+" : ""}${ratingDelta.toFixed(2)}`
          }
          up={ratingDelta >= 0}
        />
        <Kpi
          l="Reviews · 7d"
          v={String(data.reviews7d)}
          d={reviewsDelta === 0 ? "Steady" : `${reviewsDelta >= 0 ? "+" : ""}${reviewsDelta}%`}
          up={reviewsDelta >= 0}
        />
        <Kpi
          l="Requests sent · 30d"
          v={String(requestStats.sent)}
          d={
            requestStats.sent > 0
              ? `${Math.round((requestStats.opened / requestStats.sent) * 100)}% open`
              : "No sends yet"
          }
          up={requestStats.sent > 0}
        />
        <Kpi
          l="Response rate"
          v={String(responseRate)}
          em="%"
          d={`${data.publishedReplyCount} replies sent`}
          up={responseRate > 0}
        />
        <Kpi
          l="AI replies drafted"
          v={String(data.pendingReplyCount + data.publishedReplyCount)}
          d={`${data.pendingReplyCount} pending`}
          primary
        />
      </div>

      {/* Reviews chart + queue */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div className="ds-card">
          <div className="ds-card__head">
            <div>
              <h3 className="ds-card__title">Reviews collected · last 12 weeks</h3>
              <div className="ds-card__sub">By channel · stacked</div>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <LegendDot c="var(--pri)" label="Google" />
              <LegendDot c="#5EEAD4" label="Facebook" />
              <LegendDot c="#CCFBF1" label="Other" />
            </div>
          </div>
          <div className="ds-card__body" style={{ padding: "18px 20px 12px", overflowX: "auto" }}>
            <StackedBars
              data={stackedChart.data}
              labels={stackedChart.labels}
              colors={["var(--pri)", "#5EEAD4", "#CCFBF1"]}
              width={620}
              height={220}
            />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Today's queue</h3>
            {data.pendingReplyCount > 0 && (
              <span className="chip chip--bad">{data.pendingReplyCount} urgent</span>
            )}
          </div>
          <div style={{ padding: 4 }}>
            <QueueRow
              icon="star"
              tone="bad"
              title={
                data.pendingReplyCount > 0
                  ? `${data.pendingReplyCount} reviews need reply`
                  : "All reviews replied"
              }
              sub={data.pendingReplyCount > 0 ? "Review queue · drafts ready" : "Great job!"}
              cta={data.pendingReplyCount > 0 ? "Reply" : "View"}
              href="/reviews"
            />
            <QueueRow
              icon="chat"
              tone="warn"
              title="Support inbox"
              sub="Comments + DMs pending review"
              cta="Open"
              href="/support/comments"
            />
            <QueueRow
              icon="phone"
              tone="info"
              title="Recent voicemails"
              sub={`${data.recentCalls.length} in last 24h`}
              cta="Listen"
              href="/phone"
            />
            <QueueRow
              icon="flag"
              tone="info"
              title="Disputes"
              sub="Tracking with Google"
              cta="Track"
              href="/reviews/dispute"
            />
            <QueueRow
              icon="sparkle"
              tone="pri"
              title={
                data.pendingReplyCount > 0
                  ? `AI drafted ${data.pendingReplyCount} replies`
                  : "AI is idle"
              }
              sub="Ready for your approval"
              cta="Review"
              href="/reviews"
            />
          </div>
        </div>
      </div>

      {/* Locations + Sentiment + Live feed */}
      <div className="grid-3" style={{ gap: 14, marginBottom: 14 }}>
        <LocationsCard establishments={data.establishments} />
        <SentimentCard sentiment={sentiment} total={data.allReviewsRecent.length} />
        <LiveFeedCard reviews={data.liveReviews} />
      </div>

      {/* AI insights + Channel mix + Funnel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <InsightsRibbon replyCount={data.publishedReplyCount} pending={data.pendingReplyCount} />
        <ChannelMixCard channels={channelMix} />
        <FunnelCard funnel={funnel} />
      </div>

      <ActivityStream
        replies={data.recentReplies}
        requests={data.recentRequests}
        calls={data.recentCalls}
        scans={data.recentScans}
      />
    </AppShellServer>
  );
}

// ============================================================
// Components
// ============================================================

function Kpi({
  l,
  v,
  em,
  d,
  up,
  primary,
}: {
  l: string;
  v: string;
  em?: string;
  d: string;
  up?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="stat__label">{l}</span>
          {primary && (
            <span
              style={{
                marginLeft: "auto",
                width: 6,
                height: 6,
                borderRadius: 50,
                background: "var(--pri)",
              }}
            />
          )}
        </div>
        <div
          className="row"
          style={{ alignItems: "flex-end", gap: 8, justifyContent: "space-between" }}
        >
          <span className="stat__value">
            {v}
            {em && <em>{em}</em>}
          </span>
        </div>
        <div className={`stat__delta${up ? " up" : ""}`}>
          {up && <Icon name="arrowU" size={10} stroke={2.4} />}
          {d}
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  icon,
  tone,
  title,
  sub,
  cta,
  href,
}: {
  icon: IconName;
  tone: "bad" | "warn" | "info" | "pri";
  title: string;
  sub: string;
  cta: string;
  href: string;
}) {
  const bg =
    tone === "bad"
      ? "var(--bad-soft)"
      : tone === "warn"
        ? "var(--warn-soft)"
        : tone === "pri"
          ? "var(--pri-50)"
          : "var(--info-soft)";
  const fg =
    tone === "bad"
      ? "var(--bad)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "pri"
          ? "var(--pri)"
          : "var(--info)";
  return (
    <div
      className="row"
      style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--line)",
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: bg,
          color: fg,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 12.5 }}>{title}</div>
        <div
          className="dim"
          style={{
            fontSize: 11.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      </div>
      <a href={href} className="btn btn--xs">
        {cta}
      </a>
    </div>
  );
}

function LocationsCard({
  establishments,
}: {
  establishments: Array<{
    id: string;
    name: string;
    address: unknown;
    avgRating: number | null;
    reviewCount: number;
    _count: { connections: number; reviews: number };
  }>;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Locations</h3>
        <a href="/establishments" className="btn btn--xs">
          View all
        </a>
      </div>
      <div>
        {establishments.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--rl-muted)",
              fontSize: 12.5,
            }}
          >
            No locations yet —{" "}
            <a href="/establishments/new" style={{ color: "var(--pri)" }}>
              add your first
            </a>
            .
          </div>
        ) : (
          establishments.map((l, i) => {
            const avg = l.avgRating;
            const reviewCount = l.reviewCount;
            const addr = l.address as { city?: string; region?: string } | null;
            const short = addr?.city ? `${addr.city}${addr.region ? ` ${addr.region}` : ""}` : "—";
            const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
            return (
              <div
                key={l.id}
                className="row"
                style={{
                  padding: "12px 16px",
                  borderTop: i ? "1px solid var(--line)" : "none",
                }}
              >
                <Avatar name={l.name} size={32} tone={tone} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 12.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.name}
                  </div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {short}
                  </div>
                </div>
                {avg !== null ? (
                  <div style={{ textAlign: "right" }}>
                    <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {avg.toFixed(1)}
                      </span>
                      <Stars value={Math.round(avg)} size={10} />
                    </div>
                    <div className="mono dim" style={{ fontSize: 10.5 }}>
                      {reviewCount} reviews
                    </div>
                  </div>
                ) : (
                  <span className="chip chip--warn">
                    {l._count.connections > 0 ? "No reviews" : "Verifying"}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SentimentCard({
  sentiment,
  total,
}: {
  sentiment: {
    pos: number;
    neu: number;
    neg: number;
    posPct: number;
    neuPct: number;
    negPct: number;
  };
  total: number;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Sentiment</h3>
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          {total} REVIEWS
        </span>
      </div>
      <div className="ds-card__body" style={{ padding: "12px 16px 16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em" }}>
              {sentiment.posPct}
              <span style={{ fontSize: 16, color: "var(--rl-muted)", fontWeight: 500 }}>%</span>
            </div>
            <div className="dim" style={{ fontSize: 11.5 }}>
              Net positive
            </div>
          </div>
          {total > 0 && (
            <SentimentDonut
              pos={sentiment.posPct}
              neu={sentiment.neuPct}
              neg={sentiment.negPct}
              size={84}
            />
          )}
        </div>
        {(
          [
            { l: "Positive", v: sentiment.pos, p: sentiment.posPct, c: "var(--ok)" },
            { l: "Neutral", v: sentiment.neu, p: sentiment.neuPct, c: "var(--rl-muted-2)" },
            { l: "Negative", v: sentiment.neg, p: sentiment.negPct, c: "var(--bad)" },
          ] as const
        ).map((r) => (
          <div key={r.l} className="row" style={{ marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.c }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{r.l}</span>
            <span className="mono dim" style={{ fontSize: 11 }}>
              {r.v}
            </span>
            <span className="mono" style={{ fontSize: 11, width: 32, textAlign: "right" }}>
              {r.p}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveFeedCard({
  reviews,
}: {
  reviews: Array<{
    id: string;
    rating: number;
    reviewerName: string | null;
    body: string | null;
    postedAt: Date | null;
    source: string;
    reply: { id: string } | null;
  }>;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Latest reviews</h3>
        <span className="chip chip--ok">
          <span className="live" />
          Live
        </span>
      </div>
      <div style={{ padding: 4 }}>
        {reviews.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--rl-muted)",
              fontSize: 12.5,
            }}
          >
            Reviews appear here within 15 minutes of being posted.
          </div>
        ) : (
          reviews.map((r, i) => {
            const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
            const needsReply = r.rating <= 2 && r.reply === null;
            return (
              <div
                key={r.id}
                style={{
                  padding: 12,
                  borderTop: i ? "1px solid var(--line)" : "none",
                }}
              >
                <div className="row" style={{ marginBottom: 4 }}>
                  <Avatar name={r.reviewerName ?? "User"} size={22} tone={tone} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {r.reviewerName ?? "Anonymous"}
                  </span>
                  <span className="dim mono" style={{ fontSize: 10 }}>
                    {r.postedAt ? relativeTime(r.postedAt) : "—"}
                  </span>
                  <Stars value={r.rating} size={11} />
                  {needsReply && (
                    <span className="chip chip--bad" style={{ marginLeft: "auto" }}>
                      Reply
                    </span>
                  )}
                </div>
                {r.body && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "var(--ink-2)",
                      lineHeight: 1.5,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {r.body}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function InsightsRibbon({
  replyCount,
  pending,
}: {
  replyCount: number;
  pending: number;
}) {
  return (
    <div className="ds-card spot" style={{ overflow: "hidden", position: "relative" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -60,
          top: -60,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "rgba(255,255,255,.12)",
        }}
      />
      <div className="ds-card__body" style={{ padding: 18, position: "relative" }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <Icon name="sparkle" size={15} />
          <span
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              fontFamily: "var(--f-mono)",
              opacity: 0.8,
            }}
          >
            AI Insights
          </span>
        </div>
        <h3
          style={{
            fontSize: 18,
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.3,
            marginBottom: 14,
            letterSpacing: "-0.015em",
          }}
        >
          {pending > 0
            ? `You have ${pending} AI-drafted replies waiting for approval.`
            : replyCount > 0
              ? `Your AI has drafted ${replyCount} replies. The more you approve, the closer it gets to your voice.`
              : "Connect Google Business Profile to start drafting AI replies for every review."}
        </h3>
        <div className="col" style={{ gap: 8 }}>
          <a
            href={pending > 0 ? "/reviews" : "/ai/training"}
            className="row"
            style={{
              padding: 8,
              background: "rgba(255,255,255,.08)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Icon name="sparkle" size={13} style={{ opacity: 0.9 }} />
            <span style={{ fontSize: 12.5, opacity: 0.92, lineHeight: 1.4 }}>
              {pending > 0
                ? "Review and approve pending drafts"
                : "Train your AI with brand voice + business context"}
            </span>
            <Icon name="arrowR" size={13} style={{ marginLeft: "auto", opacity: 0.6 }} />
          </a>
          <a
            href="/connections"
            className="row"
            style={{
              padding: 8,
              background: "rgba(255,255,255,.08)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Icon name="plug" size={13} style={{ opacity: 0.9 }} />
            <span style={{ fontSize: 12.5, opacity: 0.92, lineHeight: 1.4 }}>
              Connect more channels — POS, CRM, social
            </span>
            <Icon name="arrowR" size={13} style={{ marginLeft: "auto", opacity: 0.6 }} />
          </a>
        </div>
      </div>
    </div>
  );
}

function ChannelMixCard({
  channels,
}: {
  channels: Array<{ ch: string; n: number; pct: number; c: string }>;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Channel mix</h3>
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          30 DAYS
        </span>
      </div>
      <div className="ds-card__body">
        {channels.length === 0 ? (
          <div className="dim" style={{ fontSize: 12.5, textAlign: "center", padding: 20 }}>
            No reviews yet.
          </div>
        ) : (
          channels.map((c, i) => (
            <div key={c.ch} style={{ marginBottom: i === channels.length - 1 ? 0 : 12 }}>
              <div className="row" style={{ marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: c.c }} />
                <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{c.ch}</span>
                <span className="mono dim" style={{ fontSize: 11 }}>
                  {c.n}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 34,
                    textAlign: "right",
                  }}
                >
                  {c.pct}%
                </span>
              </div>
              <div className="gauge">
                <i style={{ width: `${c.pct}%`, background: c.c }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FunnelCard({
  funnel,
}: {
  funnel: Array<{ l: string; n: number; pct: number; color: string }>;
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Review funnel</h3>
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          LAST 30 DAYS
        </span>
      </div>
      <div className="ds-card__body">
        {funnel[0]?.n === 0 ? (
          <div className="dim" style={{ fontSize: 12.5, textAlign: "center", padding: 20 }}>
            Send your first review request to see the funnel.
          </div>
        ) : (
          funnel.map((f) => (
            <div key={f.l} style={{ marginBottom: 8 }}>
              <div className="row" style={{ marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, color: "var(--ink-2)", flex: 1 }}>{f.l}</span>
                <span className="mono" style={{ fontSize: 11 }}>
                  {f.n}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    width: 36,
                    textAlign: "right",
                  }}
                >
                  {f.pct}%
                </span>
              </div>
              <div
                style={{
                  height: 14,
                  borderRadius: 3,
                  background: "var(--surface-3)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${f.pct}%`,
                    background: f.color,
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityStream({
  replies,
  requests,
  calls,
  scans,
}: {
  replies: Array<{ id: string; status: string; createdAt: Date }>;
  requests: Array<{
    id: string;
    createdAt: Date;
    status: string;
    channel: string;
    recipient: string;
  }>;
  calls: Array<{
    id: string;
    startedAt: Date | null;
    status: string;
    fromE164: string;
    durationSeconds: number | null;
  }>;
  scans: Array<{ id: string; scannedAt: Date | null; country: string | null }>;
}) {
  type Entry = {
    t: Date;
    icon: IconName;
    color: "info" | "ok" | "pri" | "muted" | "bad";
    txt: string;
    meta: string;
    key: string;
  };
  const entries: Entry[] = [];
  for (const r of replies) {
    entries.push({
      t: r.createdAt,
      icon: "sparkle",
      color: "pri",
      txt: "AI drafted a review reply",
      meta: r.status,
      key: `reply-${r.id}`,
    });
  }
  for (const r of requests) {
    entries.push({
      t: r.createdAt,
      icon: "send",
      color: "muted",
      txt: `Review request sent via ${r.channel} to ${r.recipient}`,
      meta: r.status,
      key: `req-${r.id}`,
    });
  }
  for (const c of calls) {
    if (!c.startedAt) continue;
    entries.push({
      t: c.startedAt,
      icon: "phone",
      color: c.status === "completed" ? "info" : "bad",
      txt: `Phone call from ${c.fromE164}`,
      meta: c.durationSeconds
        ? `${Math.round(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s`
        : "—",
      key: `call-${c.id}`,
    });
  }
  for (const s of scans) {
    if (!s.scannedAt) continue;
    entries.push({
      t: s.scannedAt,
      icon: "qr",
      color: "ok",
      txt: `QR scan${s.country ? ` from ${s.country}` : ""}`,
      meta: "",
      key: `scan-${s.id}`,
    });
  }
  entries.sort((a, b) => b.t.getTime() - a.t.getTime());

  const colorBg = (c: Entry["color"]) =>
    c === "muted" ? "var(--surface-3)" : c === "pri" ? "var(--pri-50)" : `var(--${c}-soft)`;
  const colorFg = (c: Entry["color"]) => (c === "muted" ? "var(--rl-muted)" : `var(--${c})`);

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Recent activity</h3>
          <div className="ds-card__sub">Last 24 hours · all locations</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="chip">All</span>
          <span className="chip chip--out">Reviews</span>
          <span className="chip chip--out">Requests</span>
          <span className="chip chip--out">Calls</span>
        </div>
      </div>
      <div style={{ padding: 4 }}>
        {entries.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--rl-muted)",
              fontSize: 12.5,
            }}
          >
            Quiet last 24 hours — nothing to report.
          </div>
        ) : (
          entries.slice(0, 10).map((a, i) => (
            <div
              key={a.key}
              className="row"
              style={{
                padding: "10px 16px",
                borderTop: i ? "1px solid var(--line)" : "none",
              }}
            >
              <span className="mono dim" style={{ fontSize: 10.5, width: 56 }}>
                {a.t.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: colorBg(a.color),
                  color: colorFg(a.color),
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name={a.icon} size={12} />
              </span>
              <span style={{ fontSize: 12.5, flex: 1 }}>{a.txt}</span>
              <span className="dim mono" style={{ fontSize: 11 }}>
                {a.meta}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// Pure helpers
// ============================================================

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function dashboardSummary(
  data: {
    reviews7d: number;
    pendingReplyCount: number;
    publishedReplyCount: number;
  },
  ratingDelta: number,
): string {
  const ratingPart =
    ratingDelta === 0
      ? "Rating is steady."
      : `Rating is ${ratingDelta > 0 ? "up" : "down"} ${Math.abs(ratingDelta).toFixed(2)}★ this week.`;
  const replyPart =
    data.pendingReplyCount === 0
      ? "All reviews replied."
      : `${data.pendingReplyCount} review${data.pendingReplyCount === 1 ? "" : "s"} need your reply.`;
  const reviewsPart =
    data.reviews7d === 0
      ? ""
      : ` ${data.reviews7d} new review${data.reviews7d === 1 ? "" : "s"} in the last 7 days.`;
  return `${ratingPart} ${replyPart}${reviewsPart}`;
}

function computeSentiment(reviews: Array<{ rating: number }>) {
  let pos = 0;
  let neu = 0;
  let neg = 0;
  for (const r of reviews) {
    if (r.rating >= 4) pos += 1;
    else if (r.rating === 3) neu += 1;
    else neg += 1;
  }
  const total = reviews.length;
  return {
    pos,
    neu,
    neg,
    posPct: total > 0 ? Math.round((pos / total) * 100) : 0,
    neuPct: total > 0 ? Math.round((neu / total) * 100) : 0,
    negPct: total > 0 ? Math.round((neg / total) * 100) : 0,
  };
}

function computeChannelMix(reviews: Array<{ source: string }>) {
  if (reviews.length === 0) return [];
  const groups = new Map<string, number>();
  for (const r of reviews) {
    groups.set(r.source, (groups.get(r.source) ?? 0) + 1);
  }
  const total = reviews.length;
  const palette: Record<string, string> = {
    google: "var(--pri)",
    facebook: "#5EEAD4",
    instagram: "#F59E0B",
    qr: "var(--ok)",
  };
  return Array.from(groups.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => ({
      ch: ch.charAt(0).toUpperCase() + ch.slice(1),
      n,
      pct: Math.round((n / total) * 100),
      c: palette[ch] ?? "var(--rl-muted-2)",
    }));
}

function compute12WeekChart(
  reviews: Array<{ postedAt: Date | null; source: string }>,
  startDate: Date,
): { data: number[][]; labels: string[] } {
  // Buckets: 12 weeks × 3 sources (google, facebook, other)
  const buckets: number[][] = Array.from({ length: 12 }, () => [0, 0, 0]);
  const labels: string[] = Array.from({ length: 12 }, (_, i) => `W${i + 1}`);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (const r of reviews) {
    if (!r.postedAt) continue;
    const idx = Math.floor((r.postedAt.getTime() - startDate.getTime()) / weekMs);
    if (idx < 0 || idx >= 12) continue;
    const sourceIdx = r.source === "google" ? 0 : r.source === "facebook" ? 1 : 2;
    const bucket = buckets[idx];
    if (bucket) bucket[sourceIdx] = (bucket[sourceIdx] ?? 0) + 1;
  }
  return { data: buckets, labels };
}

function computeFunnel(stats: {
  sent: number;
  delivered: number;
  opened: number;
  converted: number;
}) {
  const sent = stats.sent;
  const pct = (n: number) => (sent > 0 ? Math.round((n / sent) * 100) : 0);
  return [
    { l: "Requests sent", n: sent, pct: sent > 0 ? 100 : 0, color: "var(--pri)" },
    { l: "Delivered", n: stats.delivered, pct: pct(stats.delivered), color: "#6366F1" },
    { l: "Opened", n: stats.opened, pct: pct(stats.opened), color: "#5EEAD4" },
    { l: "Converted", n: stats.converted, pct: pct(stats.converted), color: "var(--ok)" },
  ];
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
