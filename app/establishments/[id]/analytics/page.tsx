import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { Sparkline } from "@/components/shell/sparkline";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { getReviewSourceMeta } from "@/lib/reviews/source-meta";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Per-listing analytics dashboard.
 *
 * Five panels, all powered by real review + reply + scan data scoped to
 * the establishment_id:
 *
 *   1. Hero KPI strip — avg rating · review count (30d/90d/all) · response
 *      rate · median time-to-reply
 *   2. Source breakdown — count + avg rating per platform, with the
 *      `lib/reviews/source-meta.ts` badge for visual consistency
 *   3. 12-week review-velocity sparkline — bucketed counts over the last
 *      84 days so the line is steady (not jagged from weekly variance)
 *   4. Topic mentions — top 10 topics extracted from review bodies via
 *      the existing extract-topics cron, with mention-count delta vs the
 *      prior 30d period
 *   5. Recent unanswered reviews — quick action list (top 5) with a
 *      direct link to the review detail for replying
 *
 * Why a separate route (not a tab on the establishment page): hosts with
 * 5+ listings want per-listing analytics deep-linkable from email + Slack.
 * A URL like `/establishments/abc-123/analytics` is the share-able artifact.
 */
export default async function ListingAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { orgId } = await getOrgContext();
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const since12w = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  // Bundle everything into a single withTenant transaction. The RLS
  // predicate evaluation is shared across all reads, which on Neon
  // shaves ~150ms vs separate transactions.
  const data = await withTenant(orgId, async (tx) => {
    const establishment = await tx.establishment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        kind: true,
        airbnbListingUrl: true,
        googlePlaceId: true,
      },
    });
    if (!establishment) return null;

    const [
      reviewsAggAll,
      reviewsAgg30d,
      reviewsAgg60d,
      reviewsBySource,
      velocityReviews,
      topicReviews,
      repliesAgg,
      recentUnanswered,
    ] = await Promise.all([
      tx.review.aggregate({
        where: { establishmentId: id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      tx.review.aggregate({
        where: { establishmentId: id, postedAt: { gte: since30d } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      tx.review.aggregate({
        where: { establishmentId: id, postedAt: { gte: since60d, lt: since30d } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      tx.review.groupBy({
        by: ["source"],
        where: { establishmentId: id },
        _count: { _all: true },
        _avg: { rating: true },
      }),
      tx.review.findMany({
        where: { establishmentId: id, postedAt: { gte: since12w } },
        select: { postedAt: true },
      }),
      tx.review.findMany({
        where: {
          establishmentId: id,
          postedAt: { gte: since30d },
          topics: { isEmpty: false },
        },
        select: { topics: true },
      }),
      // Reply latency: select all reviews with replies posted in 30d
      // and compute time-to-reply in JS (Prisma doesn't expose arithmetic
      // on Date columns inside aggregate).
      tx.review.findMany({
        where: {
          establishmentId: id,
          postedAt: { gte: since30d },
          reply: { isNot: null },
        },
        select: {
          postedAt: true,
          reply: { select: { publishedAt: true } },
        },
        take: 500,
      }),
      tx.review.findMany({
        where: { establishmentId: id, reply: null },
        orderBy: { postedAt: "desc" },
        take: 5,
        select: {
          id: true,
          rating: true,
          reviewerName: true,
          body: true,
          source: true,
          postedAt: true,
        },
      }),
    ]);

    return {
      establishment,
      reviewsAggAll,
      reviewsAgg30d,
      reviewsAgg60d,
      reviewsBySource,
      velocityReviews,
      topicReviews,
      repliesAgg,
      recentUnanswered,
    };
  });

  if (!data) notFound();

  // ---- Derive computed metrics from the raw data --------------------------

  const avgAll = data.reviewsAggAll._avg.rating ?? null;
  const count30d = data.reviewsAgg30d._count._all;
  const countPrev30d = data.reviewsAgg60d._count._all;
  const reviewDelta = formatDelta(count30d, countPrev30d);

  // Velocity sparkline — 12 weekly buckets covering the trailing 84 days.
  const velocity = buildWeeklyVelocity(
    data.velocityReviews.map((r) => r.postedAt),
    12,
  );

  // Response-rate (replies posted in the last 30d / reviews posted in the
  // last 30d that had a body — we don't count star-only as "needs reply").
  const repliedIn30d = data.repliesAgg.length;
  const responseRate =
    count30d > 0 ? Math.round((repliedIn30d / count30d) * 100) : 0;

  // Median time-to-reply in hours.
  const ttrSamples = data.repliesAgg
    .map((r) => {
      const t1 = r.postedAt?.getTime();
      const t2 = r.reply?.publishedAt?.getTime();
      if (!t1 || !t2 || t2 < t1) return null;
      return (t2 - t1) / (1000 * 60 * 60); // hours
    })
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const medianTtrHours =
    ttrSamples.length > 0 ? ttrSamples[Math.floor(ttrSamples.length / 2)] : null;

  // Topic frequency — flatten + count.
  const topicCounts = new Map<string, number>();
  for (const r of data.topicReviews) {
    for (const t of r.topics) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Per-source breakdown sorted by count desc.
  const sourceRows = data.reviewsBySource
    .map((r) => ({
      source: r.source,
      count: r._count._all,
      avg: r._avg.rating ? Number(r._avg.rating) : null,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Listings", data.establishment.name, "Analytics"]}
    >
      <PageHeader
        kicker={data.establishment.kind === "airbnb_listing" ? "Airbnb listing" : "Listing"}
        title={`Analytics · ${data.establishment.name}`}
        description="Real metrics across every connected review source for this listing."
        breadcrumb={[
          { label: "Listings", href: "/establishments" },
          {
            label: data.establishment.name,
            href: `/establishments/${data.establishment.id}`,
          },
          { label: "Analytics" },
        ]}
        actions={
          <Link
            href={`/establishments/${data.establishment.id}`}
            className="btn"
          >
            <Icon name="chevL" size={12} />
            Back to listing
          </Link>
        }
      />

      {/* ---- 1) KPI strip ------------------------------------------------- */}
      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Avg rating · all time"
          value={avgAll ? avgAll.toFixed(2) : "—"}
          subLabel={`${data.reviewsAggAll._count._all.toLocaleString()} reviews`}
        />
        <Kpi
          label="Reviews · 30d"
          value={count30d.toLocaleString()}
          subLabel={reviewDelta}
          spark={velocity.values.length > 0 ? velocity.values : undefined}
        />
        <Kpi
          label="Response rate · 30d"
          value={`${responseRate}%`}
          subLabel={`${repliedIn30d} of ${count30d} replied`}
        />
        <Kpi
          label="Median time-to-reply"
          value={medianTtrHours == null ? "—" : formatHours(medianTtrHours)}
          subLabel={ttrSamples.length > 0 ? `${ttrSamples.length} sample${ttrSamples.length === 1 ? "" : "s"}` : "no replies yet"}
        />
      </div>

      {/* ---- 2) Source breakdown ----------------------------------------- */}
      <div className="ds-card" style={{ marginBottom: 14 }}>
        <div className="ds-card__head">
          <h3 className="ds-card__title">By platform</h3>
          <span className="mono dim" style={{ fontSize: 10.5 }}>ALL TIME</span>
        </div>
        <div className="ds-card__body">
          {sourceRows.length === 0 ? (
            <p className="dim" style={{ fontSize: 13 }}>
              No reviews captured yet. Connect a source or wait for inbound.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sourceRows.map((row) => {
                const meta = getReviewSourceMeta(row.source);
                const maxCount = sourceRows[0]?.count ?? 1;
                const widthPct = Math.max(2, Math.round((row.count / maxCount) * 100));
                return (
                  <div key={row.source} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: meta.bgTint,
                        color: meta.fg,
                        fontFamily: "var(--f-mono)",
                        minWidth: 90,
                        textAlign: "center",
                      }}
                    >
                      {meta.label.toUpperCase()}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        background: "var(--surface-2, #fafbf8)",
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: "100%",
                          background: meta.fg,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        minWidth: 56,
                        textAlign: "right",
                        color: "var(--ink-2)",
                      }}
                    >
                      {row.count.toLocaleString()}
                      {row.avg !== null && (
                        <span style={{ marginLeft: 6, color: "var(--rl-muted)" }}>
                          · {row.avg.toFixed(2)}★
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ---- 3) Topics + 4) Recent unanswered (side-by-side) -------------- */}
      <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">What guests mention</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>LAST 30 DAYS</span>
          </div>
          <div className="ds-card__body">
            {topTopics.length === 0 ? (
              <p className="dim" style={{ fontSize: 13 }}>
                Not enough text reviews to extract topics yet. The extract-topics
                cron runs hourly.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {topTopics.map(([topic, count]) => (
                  <span
                    key={topic}
                    className="chip"
                    style={{
                      background: "var(--surface-2, #fafbf8)",
                      border: "1px solid var(--line)",
                      fontSize: 12,
                    }}
                  >
                    {topic}
                    <span className="dim" style={{ marginLeft: 6 }}>
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Recent unanswered</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              {data.recentUnanswered.length} OF {Math.max(data.recentUnanswered.length, 0)}
            </span>
          </div>
          <div className="ds-card__body">
            {data.recentUnanswered.length === 0 ? (
              <p className="dim" style={{ fontSize: 13 }}>
                Inbox is clear — every review has a reply.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {data.recentUnanswered.map((r, i) => {
                  const meta = getReviewSourceMeta(r.source);
                  return (
                    <li
                      key={r.id}
                      style={{
                        padding: "10px 0",
                        borderTop: i === 0 ? "none" : "1px solid var(--line)",
                      }}
                    >
                      <Link
                        href={`/reviews/${r.id}`}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          display: "block",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: meta.bgTint,
                              color: meta.fg,
                              fontFamily: "var(--f-mono)",
                            }}
                          >
                            {meta.label.toUpperCase()}
                          </span>
                          <span className="mono dim" style={{ fontSize: 10.5 }}>
                            {r.rating}★
                          </span>
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 500,
                              color: "var(--ink-2)",
                            }}
                          >
                            {r.reviewerName ?? "Anonymous"}
                          </span>
                          <span
                            className="mono dim"
                            style={{ fontSize: 10.5, marginLeft: "auto" }}
                          >
                            {relativeTime(r.postedAt)}
                          </span>
                        </div>
                        {r.body && (
                          <p
                            style={{
                              margin: "4px 0 0",
                              fontSize: 12.5,
                              color: "var(--rl-muted)",
                              lineHeight: 1.45,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {r.body}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

// =========================================================================
// Helpers — kept inline (single-use, page-specific)
// =========================================================================

function Kpi({
  label,
  value,
  subLabel,
  spark,
}: {
  label: string;
  value: string;
  subLabel?: string;
  spark?: number[];
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{label}</div>
        <div
          className="row"
          style={{
            alignItems: "flex-end",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <span className="stat__value">{value}</span>
          {spark && spark.length > 0 && (
            <Sparkline points={spark} width={68} height={26} />
          )}
        </div>
        {subLabel && <div className="stat__delta">{subLabel}</div>}
      </div>
    </div>
  );
}

function buildWeeklyVelocity(dates: Date[], weeks: number) {
  const out = new Array<number>(weeks).fill(0);
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (const d of dates) {
    const weeksAgo = Math.floor((now - d.getTime()) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < weeks) {
      // Most-recent week sits at index (weeks-1) so the sparkline reads left-to-right.
      const idx = weeks - 1 - weeksAgo;
      out[idx] = (out[idx] ?? 0) + 1;
    }
  }
  return { values: out };
}

function formatDelta(current: number, prior: number): string {
  if (prior === 0 && current === 0) return "no reviews yet";
  if (prior === 0 && current > 0) return "new this period";
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return "flat vs prior 30d";
  return `${pct > 0 ? "+" : ""}${pct}% vs prior 30d`;
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

function relativeTime(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return d.toLocaleDateString();
}
