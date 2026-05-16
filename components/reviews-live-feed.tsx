import Link from "next/link";
import { withTenant } from "@/lib/db/with-tenant";

type FeedSort = "newest" | "highest" | "lowest" | "relevant";

/**
 * Live feed of recent Google reviews — shown on the dashboard.
 *
 * Sort modes:
 *   - relevant: low-rating + no-reply first (what owners need to act on)
 *   - newest: postedAt DESC
 *   - highest: rating DESC, then postedAt DESC
 *   - lowest:  rating ASC,  then postedAt DESC
 *
 * Shows rating distribution bars (5★/4★/3★/2★/1★) computed from the same set.
 * Per-review: rating stars, reviewer name, snippet, "Open reply" link.
 */
export async function ReviewsLiveFeed({
  orgId,
  establishmentId,
  sort = "relevant",
  limit = 6,
}: {
  orgId: string;
  establishmentId?: string;
  sort?: FeedSort;
  limit?: number;
}) {
  const orderBy =
    sort === "highest"
      ? [{ rating: "desc" as const }, { postedAt: "desc" as const }]
      : sort === "lowest"
        ? [{ rating: "asc" as const }, { postedAt: "desc" as const }]
        : sort === "newest"
          ? [{ postedAt: "desc" as const }]
          // 'relevant': we sort in JS after fetching since "no reply + low rating" isn't easy in SQL
          : [{ postedAt: "desc" as const }];

  const where = establishmentId ? { establishmentId } : {};

  const [reviews, aggregate, breakdown] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.review.findMany({
        where,
        orderBy,
        take: sort === "relevant" ? 50 : limit,
        include: {
          establishment: { select: { id: true, name: true } },
          reply: { select: { id: true, status: true } },
        },
      }),
      tx.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
      tx.$queryRaw<{ rating: number; n: bigint }[]>`
        SELECT rating, COUNT(*)::bigint AS n
        FROM reviews
        ${establishmentId ? `WHERE establishment_id = '${establishmentId}'::uuid` : ``}
        GROUP BY rating
        ORDER BY rating DESC
      `,
    ]),
  );

  // 'relevant': bring forward 1-3 star reviews with no published reply
  let sortedReviews = reviews;
  if (sort === "relevant") {
    sortedReviews = [...reviews]
      .sort((a, b) => {
        const aUrgent = a.rating <= 3 && (!a.reply || a.reply.status !== "published") ? 0 : 1;
        const bUrgent = b.rating <= 3 && (!b.reply || b.reply.status !== "published") ? 0 : 1;
        if (aUrgent !== bUrgent) return aUrgent - bUrgent;
        return b.postedAt.getTime() - a.postedAt.getTime();
      })
      .slice(0, limit);
  }

  const totalReviews = aggregate._count._all ?? 0;
  const avgRating = aggregate._avg.rating ?? 0;
  const breakdownMap = new Map(breakdown.map((r) => [Number(r.rating), Number(r.n)]));
  const maxCount = Math.max(1, ...[1, 2, 3, 4, 5].map((s) => breakdownMap.get(s) ?? 0));

  return (
    <div className="space-y-4">
      {/* Rating header + distribution */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 md:col-span-1">
          <div className="text-sm text-muted-foreground">Average rating</div>
          <div className="mt-1 text-4xl font-bold tabular-nums">{avgRating.toFixed(1)}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Based on {totalReviews.toLocaleString()} review{totalReviews === 1 ? "" : "s"}
          </div>
          <div className="mt-2 flex" aria-label={`${avgRating.toFixed(1)} stars`}>
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className={s <= Math.round(avgRating) ? "text-amber-400" : "text-slate-200"}
                aria-hidden
              >
                ★
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 md:col-span-2 space-y-2">
          {[5, 4, 3, 2, 1].map((s) => {
            const n = breakdownMap.get(s) ?? 0;
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-10 text-muted-foreground">{s}★</span>
                <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${
                      s >= 4 ? "bg-emerald-500" : s === 3 ? "bg-amber-400" : "bg-rose-500"
                    }`}
                    style={{ width: `${(n / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums text-xs">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(["relevant", "newest", "highest", "lowest"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard?reviewsSort=${s}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              s === sort
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-input bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      {/* Review list */}
      <div className="space-y-3">
        {sortedReviews.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">
            No reviews yet. Connect your Google Business Profile to start syncing.
          </div>
        ) : (
          sortedReviews.map((r) => (
            <ReviewFeedItem
              key={r.id}
              id={r.id}
              rating={r.rating}
              reviewerName={r.reviewerName}
              body={r.body}
              postedAt={r.postedAt}
              establishmentName={r.establishment.name}
              hasReply={!!r.reply}
              replyStatus={r.reply?.status ?? null}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ReviewFeedItem({
  id,
  rating,
  reviewerName,
  body,
  postedAt,
  establishmentName,
  hasReply,
  replyStatus,
}: {
  id: string;
  rating: number;
  reviewerName: string | null;
  body: string | null;
  postedAt: Date;
  establishmentName: string;
  hasReply: boolean;
  replyStatus: string | null;
}) {
  const urgent = rating <= 3 && (!hasReply || replyStatus !== "published");
  return (
    <Link
      href={`/reviews/${id}`}
      className="block rounded-lg border bg-white p-4 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-amber-400 text-sm" aria-hidden>
              {"★".repeat(rating)}
              {"☆".repeat(5 - rating)}
            </span>
            <span className="text-slate-700">{reviewerName ?? "Anonymous"}</span>
            <span>·</span>
            <span>{establishmentName}</span>
            <span>·</span>
            <span>{new Date(postedAt).toLocaleDateString()}</span>
          </div>
          {body && (
            <p className="mt-1 text-sm text-slate-800 line-clamp-2">{body}</p>
          )}
        </div>
        <div className="shrink-0">
          {urgent ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
              Needs reply
            </span>
          ) : hasReply && replyStatus === "published" ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Replied
            </span>
          ) : hasReply ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Draft
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
