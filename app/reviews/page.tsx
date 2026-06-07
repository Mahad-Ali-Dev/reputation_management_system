import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import {
  REVIEW_SOURCES,
  type ReviewSource,
  listReviews,
  reviewCountsBySource,
  reviewStats,
} from "@/lib/reviews/queries";
import { buildReplyDeepLink, getReviewSourceMeta } from "@/lib/reviews/source-meta";
import Link from "next/link";

/**
 * Reviews — repulabs v2 design.
 *
 * Real data: review list, rating histogram, totals + avg rating from the
 * Review + ReviewReply models.
 */

export const dynamic = "force-dynamic";

const RATING_COLORS = {
  5: "var(--ok)",
  4: "#84CC16",
  3: "var(--warn)",
  2: "#F97316",
  1: "var(--bad)",
} as const;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ rating?: string; reply?: string; q?: string; source?: string }>;
}) {
  const { orgId } = await getOrgContext();

  const sp = await searchParams;
  const rating = sp.rating ? Number.parseInt(sp.rating, 10) : undefined;
  const hasReply = sp.reply === "yes" ? true : sp.reply === "no" ? false : undefined;
  // Validate source against the known enum so a tampered URL can't poke
  // at unknown values and turn into a SQL filter we didn't intend.
  const source = (REVIEW_SOURCES as readonly string[]).includes(sp.source ?? "")
    ? (sp.source as ReviewSource)
    : undefined;

  const [reviews, stats, sourceCounts] = await Promise.all([
    listReviews(orgId, { rating, hasReply, search: sp.q, source, limit: 50 }),
    reviewStats(orgId),
    reviewCountsBySource(orgId),
  ]);

  const distribution = [5, 4, 3, 2, 1].map((r) => ({
    rating: r as 1 | 2 | 3 | 4 | 5,
    count:
      stats.byRating.find((b: { rating: number; _count: number }) => b.rating === r)?._count ?? 0,
  }));
  const maxBucket = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Reviews"]}>
      <PageHeader
        kicker={`${stats.total.toLocaleString()} total · avg ${stats.avgRating ? stats.avgRating.toFixed(2) : "—"}`}
        title="Reviews"
        description="Every review across every connected platform, in one queue. AI drafts replies you approve."
        actions={
          <>
            <Link href="/reviews/dispute" className="btn">
              <Icon name="flag" size={12} />
              View disputes
            </Link>
            <Link href="/reviews?reply=pending" className="btn btn--pri">
              <Icon name="sparkle" size={12} />
              Draft pending
            </Link>
          </>
        }
      />

      <div className="ds-card" style={{ marginBottom: 14 }}>
        <div className="ds-card__head">
          <h3 className="ds-card__title">Rating distribution</h3>
          <span className="mono dim" style={{ fontSize: 10.5 }}>
            LAST 30 DAYS
          </span>
        </div>
        <div className="ds-card__body">
          {distribution.map((d) => (
            <Link
              key={d.rating}
              href={`/reviews?rating=${d.rating}`}
              className="row"
              style={{
                marginBottom: 6,
                fontSize: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span className="row" style={{ gap: 2, width: 38 }}>
                <span className="mono">{d.rating}</span>
                <Icon name="star" size={11} style={{ color: "var(--gold)" }} />
              </span>
              <div className="gauge" style={{ flex: 1 }}>
                <i
                  style={{
                    width: `${maxBucket > 0 ? Math.round((d.count / maxBucket) * 100) : 0}%`,
                    background: RATING_COLORS[d.rating],
                  }}
                />
              </div>
              <span className="mono dim" style={{ width: 60, textAlign: "right", fontSize: 11.5 }}>
                {d.count.toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <form className="row" style={{ marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search review text…"
          aria-label="Search reviews"
          style={{
            flex: "1 1 240px",
            height: 36,
            padding: "0 12px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontFamily: "var(--f-ui)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <select
          name="rating"
          defaultValue={sp.rating ?? ""}
          aria-label="Filter by rating"
          style={{
            height: 36,
            padding: "0 32px 0 12px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontFamily: "var(--f-ui)",
            fontSize: 13,
          }}
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r}★
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={sp.source ?? ""}
          aria-label="Filter by platform"
          style={{
            height: 36,
            padding: "0 32px 0 12px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontFamily: "var(--f-ui)",
            fontSize: 13,
          }}
        >
          <option value="">All platforms</option>
          {(["google", "airbnb", "booking_com", "facebook", "yelp", "trustpilot"] as const).map(
            (s) => {
              const meta = getReviewSourceMeta(s);
              const count = sourceCounts[s] ?? 0;
              return (
                <option key={s} value={s}>
                  {meta.label}
                  {count > 0 ? ` (${count})` : ""}
                </option>
              );
            },
          )}
        </select>
        <select
          name="reply"
          defaultValue={sp.reply ?? ""}
          aria-label="Filter by reply status"
          style={{
            height: 36,
            padding: "0 32px 0 12px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            fontFamily: "var(--f-ui)",
            fontSize: 13,
          }}
        >
          <option value="">All</option>
          <option value="no">No reply</option>
          <option value="yes">Replied</option>
        </select>
        <button type="submit" className="btn">
          <Icon name="filter" size={12} />
          Filter
        </button>
        <Link href="/reviews" className="btn btn--ghost">
          Reset
        </Link>
      </form>

      {reviews.length === 0 ? (
        <div className="ds-card" style={{ padding: 48, textAlign: "center" }}>
          <Icon name="star" size={28} style={{ color: "var(--gold)" }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12 }}>No reviews yet</h3>
          <p className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
            Reviews sync from Google within 15 minutes of being posted.
          </p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {reviews.map((r, i) => {
            const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
            const hasReplyBool = "reply" in r && r.reply !== null && r.reply !== undefined;
            const sourceMeta = getReviewSourceMeta(r.source);
            // For the deep-link CTA: only render when the source supports it
            // AND we have enough establishment info to route correctly.
            const replyDeepLink = sourceMeta.canReplyDeepLink
              ? buildReplyDeepLink({
                  source: r.source,
                  establishment: {
                    googlePlaceId: r.establishment?.googlePlaceId ?? null,
                    airbnbListingUrl: r.establishment?.airbnbListingUrl ?? null,
                    bookingcomListingId: r.establishment?.bookingcomListingId ?? null,
                  },
                })
              : null;

            return (
              <Link
                key={r.id}
                href={`/reviews/${r.id}`}
                className="ds-card ds-card--hover"
                style={{
                  padding: 16,
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <div className="row" style={{ marginBottom: 8, gap: 10 }}>
                  <Avatar name={r.reviewerName ?? "User"} size={32} tone={tone} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {r.reviewerName ?? "Anonymous"}
                      <span
                        title={sourceMeta.description}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: sourceMeta.bgTint,
                          color: sourceMeta.fg,
                          fontFamily: "var(--f-mono)",
                        }}
                      >
                        {sourceMeta.label.toUpperCase()}
                      </span>
                    </div>
                    <div className="dim mono" style={{ fontSize: 10.5 }}>
                      {r.postedAt ? relativeTime(r.postedAt) : "—"}
                      {r.establishment?.name ? ` · ${r.establishment.name}` : ""}
                    </div>
                  </div>
                  <Stars value={r.rating} size={13} />
                  {hasReplyBool ? (
                    <span className="chip chip--ok">Replied</span>
                  ) : r.rating <= 2 ? (
                    <span className="chip chip--bad">Needs reply</span>
                  ) : (
                    <span className="chip chip--out">Open</span>
                  )}
                </div>
                {r.body && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "var(--ink-2)",
                      lineHeight: 1.55,
                    }}
                  >
                    "{r.body}"
                  </p>
                )}
                {/* Reply-on-platform deep-link. Stops propagation so clicking
                    the link doesn't navigate to the review detail page first. */}
                {replyDeepLink && !hasReplyBool && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px solid var(--line)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11.5,
                    }}
                  >
                    <span style={{ color: "var(--rl-muted)" }}>Reply on platform:</span>
                    <a
                      href={replyDeepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: sourceMeta.fg,
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      Open in {sourceMeta.label} →
                    </a>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </AppShellServer>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString();
}
