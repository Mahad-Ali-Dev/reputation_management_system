import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

type DailyCount = { day: string; count: number };

export default async function AnalyticsPage() {
  const { orgId } = await getOrgContext();

  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const data = await withTenant(orgId, async (tx) => {
    const [
      reviewAggregate,
      scanCount,
      replyAggregate,
      ratingBreakdown,
      reviewsPerDay,
      npsAggregate,
      conversationCount,
    ] = await Promise.all([
      // Reviews 30d — count + avg rating
      tx.review.aggregate({
        where: { postedAt: { gte: since30d } },
        _count: { _all: true },
        _avg: { rating: true },
      }),
      // Scans 30d
      tx.deviceScan.count({ where: { scannedAt: { gte: since30d } } }),
      // Replies published 30d
      tx.reviewReply.count({
        where: { status: "published", publishedAt: { gte: since30d } },
      }),
      // Rating breakdown (for sparkbars) — Postgres GROUP BY via raw
      tx.$queryRaw<{ rating: number; n: bigint }[]>`
        SELECT rating, COUNT(*)::bigint AS n
        FROM reviews
        WHERE posted_at >= ${since30d}
        GROUP BY rating
        ORDER BY rating ASC
      `,
      // Reviews per day — gap-fill via generate_series
      tx.$queryRaw<{ day: Date; n: bigint }[]>`
        SELECT d::date AS day, COUNT(r.id)::bigint AS n
        FROM generate_series(${since30d}::timestamp, ${now}::timestamp, '1 day'::interval) AS d
        LEFT JOIN reviews r
          ON DATE_TRUNC('day', r.posted_at) = DATE_TRUNC('day', d)
        GROUP BY d
        ORDER BY d ASC
      `,
      // NPS 30d — avg numeric answer where question type=nps
      tx.$queryRaw<{ n: bigint; promoters: bigint; passives: bigint; detractors: bigint }[]>`
        SELECT
          COUNT(*)::bigint AS n,
          COUNT(*) FILTER (WHERE (sa.value->>'score')::int >= 9)::bigint AS promoters,
          COUNT(*) FILTER (WHERE (sa.value->>'score')::int BETWEEN 7 AND 8)::bigint AS passives,
          COUNT(*) FILTER (WHERE (sa.value->>'score')::int <= 6)::bigint AS detractors
        FROM survey_answers sa
        JOIN survey_questions sq ON sq.id = sa.question_id
        JOIN survey_responses sr ON sr.id = sa.response_id
        WHERE sq.type = 'nps'
          AND sr.completed_at IS NOT NULL
          AND sr.completed_at >= ${since30d}
      `,
      // AI chatbot conversations 30d
      tx.aiConversation.count({ where: { createdAt: { gte: since30d } } }),
    ]);

    return {
      reviewAggregate,
      scanCount,
      replyAggregate,
      ratingBreakdown,
      reviewsPerDay,
      npsAggregate: npsAggregate[0] ?? { n: 0n, promoters: 0n, passives: 0n, detractors: 0n },
      conversationCount,
    };
  });

  const reviewCount = data.reviewAggregate._count._all ?? 0;
  const avgRating = data.reviewAggregate._avg.rating ?? 0;
  const responseRate =
    reviewCount > 0 ? Math.round((data.replyAggregate / reviewCount) * 100) : 0;

  // NPS = % promoters − % detractors
  const npsTotal = Number(data.npsAggregate.n);
  const npsScore =
    npsTotal > 0
      ? Math.round(
          (Number(data.npsAggregate.promoters) / npsTotal) * 100 -
            (Number(data.npsAggregate.detractors) / npsTotal) * 100,
        )
      : null;

  const daily: DailyCount[] = data.reviewsPerDay.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    count: Number(r.n),
  }));

  // Rating histogram (1..5)
  const ratingMap = new Map(data.ratingBreakdown.map((r) => [Number(r.rating), Number(r.n)]));
  const ratings = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: ratingMap.get(star) ?? 0,
  }));
  const maxRatingCount = Math.max(1, ...ratings.map((r) => r.count));

  return (
    <AppShellServer topBar={<TopBar title="Analytics" />}>
      <PageHeader
        title="Analytics"
        description="Last 30 days · auto-refreshed."
        breadcrumb={[{"label":"Home","href":"/dashboard"},{"label":"Analytics"}]}
      />

        
      <div className="space-y-6">
{/* KPI tiles */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Reviews"
            value={reviewCount.toLocaleString()}
            hint={reviewCount === 0 ? "Connect Google to start syncing" : "30-day total"}
          />
          <KpiTile
            label="Avg rating"
            value={reviewCount === 0 ? "—" : avgRating.toFixed(2)}
            hint={
              reviewCount === 0
                ? "Needs reviews"
                : avgRating >= 4.5
                  ? "🎉 Excellent"
                  : avgRating >= 4
                    ? "Good"
                    : "Needs attention"
            }
          />
          <KpiTile
            label="QR scans"
            value={data.scanCount.toLocaleString()}
            hint={data.scanCount === 0 ? "No scans yet" : "Stand activations"}
          />
          <KpiTile
            label="Response rate"
            value={reviewCount === 0 ? "—" : `${responseRate}%`}
            hint={
              reviewCount === 0
                ? "—"
                : responseRate >= 80
                  ? "On top of it"
                  : "Approve more replies"
            }
          />
        </div>

        {/* Reviews trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reviews per day</CardTitle>
            <CardDescription>
              {reviewCount === 0
                ? "No data yet. Sync your Google reviews to see activity here."
                : `${reviewCount} review${reviewCount === 1 ? "" : "s"} in the last 30 days.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewsTrendChart points={daily} />
          </CardContent>
        </Card>

        {/* Rating distribution + NPS + chatbot */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rating distribution</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ratings.map((r) => (
                <div key={r.star} className="flex items-center gap-3 text-sm">
                  <span className="w-12 text-muted-foreground">{r.star} ★</span>
                  <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${
                        r.star >= 4
                          ? "bg-emerald-500"
                          : r.star === 3
                            ? "bg-amber-400"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${(r.count / maxRatingCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">{r.count}</span>
                </div>
              ))}
              {reviewCount === 0 && (
                <p className="text-xs text-muted-foreground pt-2">No reviews yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">NPS &amp; Chatbot</CardTitle>
              <CardDescription>Survey + AI activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">NPS score (30d)</div>
                <div className="text-3xl font-bold tabular-nums">
                  {npsScore === null ? "—" : npsScore}
                </div>
                <div className="text-xs text-muted-foreground">
                  {npsTotal === 0
                    ? "No responses yet."
                    : `${npsTotal} response${npsTotal === 1 ? "" : "s"} · ${Number(
                        data.npsAggregate.promoters,
                      )} promoter${Number(data.npsAggregate.promoters) === 1 ? "" : "s"}, ${Number(
                        data.npsAggregate.detractors,
                      )} detractor${Number(data.npsAggregate.detractors) === 1 ? "" : "s"}`}
                </div>
              </div>
              <hr />
              <div>
                <div className="text-sm text-muted-foreground">AI chatbot conversations (30d)</div>
                <div className="text-3xl font-bold tabular-nums">
                  {data.conversationCount.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  <Link href="/ai" className="text-primary hover:underline">
                    Manage widget →
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShellServer>
  );
}

// ─── presentational helpers ───────────────────────────────────

function KpiTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ReviewsTrendChart({ points }: { points: DailyCount[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }
  const width = 720;
  const height = 180;
  const padX = 16;
  const padY = 16;
  const maxN = Math.max(1, ...points.map((p) => p.count));
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * stepX;
    const y = padY + innerH - (p.count / maxN) * innerH;
    return { x, y, count: p.count, day: p.day };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath =
    `M ${coords[0]?.x ?? padX} ${padY + innerH} ` +
    coords.map((c) => `L ${c.x} ${c.y}`).join(" ") +
    ` L ${coords[coords.length - 1]?.x ?? padX} ${padY + innerH} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-44"
        role="img"
        aria-label="Reviews per day, last 30 days"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={width - padX}
            y1={padY + innerH * t}
            y2={padY + innerH * t}
            stroke="rgb(226 232 240)"
            strokeDasharray="2,3"
          />
        ))}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke="rgb(79 70 229)" strokeWidth="2" />
        {coords.map((c) => (
          <circle
            key={c.day}
            cx={c.x}
            cy={c.y}
            r="2"
            fill="rgb(79 70 229)"
          >
            <title>
              {c.day}: {c.count} review{c.count === 1 ? "" : "s"}
            </title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground pt-1">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}
