import { AppShellServer } from "@/components/app-shell-server";
import { Avatar } from "@/components/shell/avatar";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { getAutoReply5StarState } from "@/lib/auto-reply/managed-rule";
import { normalizeRangeDays } from "@/lib/date-range";
import { listEstablishments } from "@/lib/establishments/queries";
import { hasActiveGoogleConnection } from "@/lib/reviews/connection-status";
import { getReviewDispute } from "@/lib/reviews/dispute-queries";
import {
  REVIEW_SOURCES,
  type ReplyStatusFilter,
  type ReviewSource,
  getReview,
  listReviews,
  replyStatusCounts,
  reviewCountsBySource,
  reviewStats,
} from "@/lib/reviews/queries";
import { buildReplyDeepLink, getReviewSourceMeta } from "@/lib/reviews/source-meta";
import {
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Flag,
  Inbox,
  type LucideIcon,
  MessageSquareReply,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { AutoReplyToggle } from "./_components/auto-reply-toggle";
import { ConnectGoogleEmpty } from "./_components/connect-google-empty";
import { PlatformDeepLink } from "./_components/platform-deep-link";
import { ReplyDraftBox } from "./_components/reply-draft-box";
import "./review-feed.css";
import "./review-feed-glass.css";
import "./review-inbox-apple.css";

/**
 * Review Inbox — repulabs v3, two-pane relayout (Module 06).
 *
 * Mail-client shape:
 *   - LEFT  : persistent filter rail (search + status pills + rating + source +
 *             rating distribution + 5★ auto-reply toggle)
 *   - MID   : the filterable review LIST (one row per review, selectable)
 *   - RIGHT : DETAIL + reply pane for the selected review (full review body,
 *             AI-draft reply with approve/edit/send, dispute deep-link, and the
 *             open-on-platform PlatformDeepLink client island)
 *
 * Selection is server-driven via `?selected=<id>` so the detail pane renders
 * server-side (no client store) and deep-links survive a refresh. On narrow
 * screens the layout collapses to: filters → list → (tap) → detail.
 *
 * All data wiring, the existing reply/AI-draft/dispute server actions, and the
 * `/reviews/[id]` · `/reviews/dispute` · `/reviews/auto-reply` deep-links are
 * preserved unchanged. force-dynamic + fail-soft retained.
 */

export const dynamic = "force-dynamic";

const RATING_COLORS = {
  5: "var(--ok)",
  4: "#84CC16",
  3: "var(--warn)",
  2: "#F97316",
  1: "var(--bad)",
} as const;

const STATUS_VALUES = ["needs_reply", "replied", "draft_ready"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    rating?: string;
    status?: string;
    q?: string;
    source?: string;
    selected?: string;
    range?: string;
    establishment?: string;
  }>;
}) {
  const { orgId } = await getOrgContext();

  const sp = await searchParams;
  // The topbar date-range filter was removed, so default to ALL-TIME (0 = no
  // window). The old 30-day default hid any business whose reviews are older
  // than 30 days, making the inbox look empty. A `?range` param still works.
  const rangeDays = sp.range ? normalizeRangeDays(sp.range) : 0;
  const rating = sp.rating ? Number.parseInt(sp.rating, 10) : undefined;
  // Validate source against the known enum so a tampered URL can't poke
  // at unknown values and turn into a SQL filter we didn't intend.
  const source = (REVIEW_SOURCES as readonly string[]).includes(sp.source ?? "")
    ? (sp.source as ReviewSource)
    : undefined;
  const replyStatus = (STATUS_VALUES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ReplyStatusFilter)
    : undefined;
  const selectedId = sp.selected && UUID_RE.test(sp.selected) ? sp.selected : undefined;
  const establishmentId =
    sp.establishment && UUID_RE.test(sp.establishment) ? sp.establishment : undefined;

  // The base filter (no reply-status) drives the pill counts so they reflect
  // "within what you're currently looking at".
  const baseFilter = { rating, search: sp.q, source, sinceDays: rangeDays, establishmentId };

  const [reviews, stats, sourceCounts, statusCounts, autoReply, hasGoogle, businesses] =
    await Promise.all([
      listReviews(orgId, { ...baseFilter, replyStatus, limit: 50 }),
      reviewStats(orgId, undefined, rangeDays),
      reviewCountsBySource(orgId, rangeDays),
      replyStatusCounts(orgId, baseFilter),
      getAutoReply5StarState(orgId),
      hasActiveGoogleConnection(orgId),
      listEstablishments(orgId),
    ]);

  // Resolve the selected review. Default to the first row in the current list
  // so the detail pane is never empty on a desktop with results. If the
  // explicit `?selected` no longer matches the filtered list, fall back too.
  const effectiveSelectedId =
    selectedId && reviews.some((r) => r.id === selectedId)
      ? selectedId
      : (reviews[0]?.id ?? selectedId);

  // The detail pane needs the full review (brandVoice etc.) + its dispute.
  // Fail-soft: a bad/stale id just yields no detail rather than 500-ing.
  const [detail, detailDispute] = effectiveSelectedId
    ? await Promise.all([
        getReview(orgId, effectiveSelectedId).catch(() => null),
        getReviewDispute(orgId, effectiveSelectedId).catch(() => null),
      ])
    : [null, null];

  const distribution = [5, 4, 3, 2, 1].map((r) => ({
    rating: r as 1 | 2 | 3 | 4 | 5,
    count:
      stats.byRating.find((b: { rating: number; _count: number }) => b.rating === r)?._count ?? 0,
  }));
  const maxBucket = Math.max(...distribution.map((d) => d.count), 1);

  // Helper: build a /reviews URL preserving the active filters while changing
  // ONE knob (the status pill, the rating row, or the selected review). The
  // selected review is dropped when filters change so we re-default to row 1.
  const buildHref = (
    overrides: Partial<{
      status: ReplyStatusFilter | undefined;
      rating: number | undefined;
      selected: string | undefined;
    }>,
  ) => {
    const params = new URLSearchParams();
    const nextRating = "rating" in overrides ? overrides.rating : rating;
    const nextStatus = "status" in overrides ? overrides.status : replyStatus;
    const nextSelected = "selected" in overrides ? overrides.selected : undefined;
    if (nextRating) params.set("rating", String(nextRating));
    if (source) params.set("source", source);
    if (sp.q) params.set("q", sp.q);
    if (nextStatus) params.set("status", nextStatus);
    if (nextSelected) params.set("selected", nextSelected);
    // Carry the topbar window through, or clicking a pill silently resets it.
    if (sp.range) params.set("range", sp.range);
    if (establishmentId) params.set("establishment", establishmentId);
    const qs = params.toString();
    return qs ? `/reviews?${qs}` : "/reviews";
  };

  // When the inbox is empty (no Google connection or no reviews) show the
  // existing connection-aware empty state full-width instead of the panes.
  const isEmpty = reviews.length === 0;
  // Distinguish a genuinely empty inbox from one that's empty only because of
  // the active filters (business, rating, platform, search, status, range).
  const hasActiveFilter = Boolean(
    establishmentId || rating || source || sp.q || replyStatus || rangeDays,
  );
  const selectedBusiness = establishmentId
    ? businesses.find((b) => b.id === establishmentId)
    : undefined;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Review Inbox"]}>
      {/* Apple Mail-style inbox: frosted panes, system greys, one accent. The
          `rf` scope is kept so the connect-Google empty state keeps its kit vars. */}
      <div className="rf ri">
        <header className="ri-head">
          <div>
            <span className="ri-eyebrow">Reputation</span>
            <h1 className="ri-title">Review Inbox</h1>
            <p className="ri-sub">
              {stats.total.toLocaleString()} reviews
              {stats.avgRating ? ` · ${stats.avgRating.toFixed(1)} average` : ""} · AI drafts
              replies you approve
            </p>
          </div>
          <Link href="/reviews/dispute" className="ri-pill">
            <Flag size={15} strokeWidth={1.8} />
            Disputes
          </Link>
        </header>

        {isEmpty && !hasActiveFilter ? (
          <ConnectGoogleEmpty hasGoogle={hasGoogle} />
        ) : (
          <div className="rev-inbox">
            {/* ── PANE 1: filters, ratings, auto-reply ── */}
            <aside className="rev-rail ri-rail">
              <FilterRail
                sp={sp}
                sourceCounts={sourceCounts}
                status={replyStatus}
                statusCounts={statusCounts}
                buildHref={buildHref}
                businesses={businesses}
              />

              <section className="ri-card ri-dist" aria-label="Rating distribution">
                <div className="ri-card__head">
                  <h2 className="ri-card__title">Ratings</h2>
                  <span className="ri-muted">
                    {rangeDays ? `Last ${rangeDays} days` : "All time"}
                  </span>
                </div>
                {distribution.map((d) => {
                  const isActive = rating === d.rating;
                  return (
                    <Link
                      key={d.rating}
                      href={buildHref({ rating: isActive ? undefined : d.rating })}
                      className={`ri-dist__row${isActive ? " is-active" : ""}${rating && !isActive ? " is-dim" : ""}`}
                    >
                      <span className="ri-dist__label">
                        {d.rating}
                        <Star size={11} strokeWidth={0} fill="currentColor" />
                      </span>
                      <span className="ri-dist__track">
                        <i
                          style={{
                            width: `${Math.round((d.count / maxBucket) * 100)}%`,
                            background: RATING_COLORS[d.rating],
                          }}
                        />
                      </span>
                      <span className="ri-dist__count">{d.count.toLocaleString()}</span>
                    </Link>
                  );
                })}
              </section>

              <AutoReplyToggle enabled={autoReply.enabled} />
            </aside>

            {/* ── PANE 2: the review list ── */}
            <div className="rev-list" data-detail-open={detail ? "1" : "0"}>
              <section className="ri-card ri-list" aria-label="Reviews">
                <div className="ri-list__head">
                  <h2 className="ri-card__title">
                    {replyStatus ? statusLabel(replyStatus) : "All reviews"}
                  </h2>
                  <span className="ri-muted">
                    {reviews.length}
                    {reviews.length === 50 ? "+" : ""}
                  </span>
                </div>
                {reviews.length === 0 ? (
                  <div className="ri-empty">
                    <Inbox size={40} strokeWidth={1.3} className="ri-empty__icon" />
                    <div className="ri-empty__title">No reviews</div>
                    <p className="ri-empty__sub">
                      {selectedBusiness?.name
                        ? `${selectedBusiness.name} has no reviews that match these filters.`
                        : "No reviews match the current filters."}
                    </p>
                    <Link href="/reviews" className="ri-pill ri-pill--sm">
                      Clear filters
                    </Link>
                  </div>
                ) : (
                  <ul className="rev-list__items ri-list__items">
                    {reviews.map((r, i) => (
                      <li key={r.id}>
                        <ReviewListItem
                          review={r}
                          active={r.id === effectiveSelectedId}
                          href={buildHref({ selected: r.id })}
                          tone={((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* ── PANE 3: detail + reply ── */}
            <div className="rev-detail" data-detail-open={detail ? "1" : "0"}>
              {detail ? (
                <ReviewDetailPane
                  review={detail}
                  dispute={detailDispute}
                  backHref={buildHref({ selected: undefined })}
                />
              ) : (
                <section className="ri-card ri-empty">
                  <MessageSquareReply size={40} strokeWidth={1.3} className="ri-empty__icon" />
                  <p className="ri-empty__sub">Select a review to read and reply.</p>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Three-pane on wide screens. On narrow screens the rail stacks on top,
          and the list/detail swap based on whether a review is selected
          (data-detail-open), so it reads list → tap → detail. Scoped CSS. */}
      <style>{`
        .rev-inbox {
          display: grid;
          grid-template-columns: 272px minmax(300px, 380px) 1fr;
          gap: 16px;
          /* stretch: pane 1 sets the row height; panes 2 & 3 scroll inside. */
          align-items: stretch;
        }
        .rev-list {
          display: flex;
          flex-direction: column;
          min-height: 0;
          /* Hard ceiling so the list never grows past the viewport. */
          max-height: calc(100vh - 200px);
        }
        .rev-list .ri-list {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        .rev-list__items {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
        .rev-detail {
          min-height: 0;
          overflow-y: auto;
        }
        @media (max-width: 1100px) {
          .rev-inbox { grid-template-columns: 240px 1fr; align-items: start; }
          .rev-list { min-height: unset; max-height: unset; }
          .rev-list .ri-list { flex: unset; min-height: unset; }
          .rev-list__items { flex: unset; min-height: unset; overflow-y: visible; }
          .rev-detail {
            grid-column: 1 / -1;
            min-height: unset;
            overflow-y: visible;
          }
          /* Once a review is open, fold the list to give the detail room. */
          .rev-list[data-detail-open="1"] { display: none; }
        }
        @media (max-width: 760px) {
          .rev-inbox { grid-template-columns: 1fr; }
          /* On phones: rail always visible at top; list and detail swap. */
          .rev-list[data-detail-open="1"] { display: none; }
          .rev-detail[data-detail-open="0"] { display: none; }
        }
      `}</style>
    </AppShellServer>
  );
}

function statusLabel(s: ReplyStatusFilter): string {
  if (s === "needs_reply") return "Needs reply";
  if (s === "replied") return "Replied";
  return "AI draft ready";
}

/* ───────────────────────── Filter rail (pane 1) ───────────────────────── */

function FilterRail({
  sp,
  sourceCounts,
  status,
  statusCounts,
  buildHref,
  businesses,
}: {
  sp: { rating?: string; q?: string; source?: string; selected?: string; establishment?: string };
  sourceCounts: Record<string, number>;
  businesses: Array<{ id: string; name: string }>;
  status?: ReplyStatusFilter;
  statusCounts: { all: number; needsReply: number; replied: number; draftReady: number };
  buildHref: (
    o: Partial<{
      status: ReplyStatusFilter | undefined;
      rating: number | undefined;
      selected: string | undefined;
    }>,
  ) => string;
}) {
  const statusRows: Array<{
    key: ReplyStatusFilter | undefined;
    label: string;
    count: number;
    icon: LucideIcon;
    danger?: boolean;
  }> = [
    { key: undefined, label: "All reviews", count: statusCounts.all, icon: Inbox },
    {
      key: "needs_reply",
      label: "Needs reply",
      count: statusCounts.needsReply,
      icon: CircleAlert,
      danger: true,
    },
    { key: "replied", label: "Replied", count: statusCounts.replied, icon: CircleCheck },
    { key: "draft_ready", label: "AI drafts", count: statusCounts.draftReady, icon: Sparkles },
  ];

  return (
    <section className="ri-card ri-filters" aria-label="Filters">
      {/* Mailbox-style status list — server-driven Links that keep the
          search / rating / platform filters. */}
      <nav className="ri-boxes" aria-label="Reply status">
        {statusRows.map((p) => {
          const isActive = p.key === status;
          const RowIcon = p.icon;
          return (
            <Link
              key={p.label}
              href={buildHref({ status: p.key, selected: undefined })}
              className={`ri-box${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <RowIcon size={17} strokeWidth={1.8} className="ri-box__icon" />
              <span className="ri-box__label">{p.label}</span>
              {p.count > 0 && (
                <span className={`ri-box__count${p.danger ? " is-danger" : ""}`}>{p.count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Search + rating + platform + business live in a GET form so they keep
          the active status (hidden input) on submit. */}
      <form className="ri-form">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="ri-search">
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search"
            aria-label="Search reviews"
          />
        </label>
        <select
          name="rating"
          defaultValue={sp.rating ?? ""}
          aria-label="Filter by rating"
          className="ri-select"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star{r === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={sp.source ?? ""}
          aria-label="Filter by platform"
          className="ri-select"
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
        {businesses.length > 1 && (
          <select
            name="establishment"
            defaultValue={sp.establishment ?? ""}
            aria-label="Filter by business"
            className="ri-select"
          >
            <option value="">All businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <div className="ri-form__actions">
          <button type="submit" className="ri-pill ri-pill--pri">
            Apply
          </button>
          <Link href="/reviews" className="ri-link">
            Reset
          </Link>
        </div>
      </form>
    </section>
  );
}

/* ───────────────────────── Review list item (pane 2) ───────────────────────── */

type ReviewRow = Awaited<ReturnType<typeof listReviews>>[number];

function ReviewListItem({
  review: r,
  active,
  href,
  tone,
}: {
  review: ReviewRow;
  active: boolean;
  href: string;
  tone: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}) {
  const sourceMeta = getReviewSourceMeta(r.source);
  const replyStatus = r.reply?.status ?? null;
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rev-row ri-row${active ? " is-active" : ""}`}
    >
      <Avatar name={r.reviewerName ?? "User"} size={36} tone={tone} />
      <div className="ri-row__main">
        <div className="ri-row__top">
          <span className="ri-row__name">{r.reviewerName ?? "Anonymous"}</span>
          <span className="ri-row__time">{r.postedAt ? relativeTime(r.postedAt) : "—"}</span>
        </div>
        <div className="ri-row__meta">
          <Stars value={r.rating} size={11} />
          <span className="ri-source" style={{ color: sourceMeta.fg }}>
            {sourceMeta.label}
          </span>
          <ReplyStatusBadge status={replyStatus} rating={r.rating} />
        </div>
        {r.body && <p className="ri-row__body">{r.body}</p>}
        {r.establishment?.name && <div className="ri-row__biz">{r.establishment.name}</div>}
      </div>
    </Link>
  );
}

/* ───────────────────────── Detail + reply (pane 3) ───────────────────────── */

type DetailReview = NonNullable<Awaited<ReturnType<typeof getReview>>>;
type DetailDispute = Awaited<ReturnType<typeof getReviewDispute>>;

function ReviewDetailPane({
  review: r,
  dispute,
  backHref,
}: {
  review: DetailReview;
  dispute: DetailDispute;
  backHref: string;
}) {
  const reply = r.reply;
  const sourceMeta = getReviewSourceMeta(r.source);
  const replyDeepLink = sourceMeta.canReplyDeepLink
    ? buildReplyDeepLink({
        source: r.source,
        establishment: {
          googlePlaceId: r.establishment?.googlePlaceId ?? null,
          // getReview's establishment select is narrower; fall back to null
          // for the listing fields it doesn't fetch (deep-link still resolves
          // to the platform's generic reviews surface).
          airbnbListingUrl: null,
          bookingcomListingId: null,
        },
      })
    : null;

  const hasOpenDispute = !!dispute && dispute.status !== "withdrawn";
  const posted = r.postedAt
    ? new Date(r.postedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <article className="ri-card ri-detail">
      {/* Back to list — only matters on narrow screens where the list folds. */}
      <div className="rev-detail__back">
        <Link href={backHref} className="ri-link ri-back">
          <ChevronLeft size={16} strokeWidth={2} />
          Reviews
        </Link>
      </div>

      <header className="ri-detail__head">
        <Avatar name={r.reviewerName ?? "User"} size={48} tone={4} />
        <div className="ri-detail__who">
          <h2 className="ri-detail__name">{r.reviewerName ?? "Anonymous"}</h2>
          <div className="ri-detail__meta">
            <Stars value={r.rating} size={14} />
            <span
              className="ri-source"
              style={{ color: sourceMeta.fg }}
              title={sourceMeta.description}
            >
              {sourceMeta.label}
            </span>
            <ReplyStatusBadge status={reply?.status ?? null} rating={r.rating} />
          </div>
          <div className="ri-muted">
            {posted ?? "—"}
            {r.establishment?.name ? ` · ${r.establishment.name}` : ""}
          </div>
        </div>
      </header>

      {r.body ? (
        <p className="ri-detail__body">{r.body}</p>
      ) : (
        <p className="ri-detail__body ri-muted">(no review text)</p>
      )}

      {/* AI-draft reply flow — reuses the existing ReplyDraftBox island and the
          generateReplyForReview / publishReply server actions verbatim. */}
      <ReplyDraftBox
        reviewId={r.id}
        rating={r.rating}
        canReplyDeepLink={sourceMeta.canReplyDeepLink}
        reply={
          reply
            ? {
                id: reply.id,
                body: reply.body,
                status: reply.status,
                scheduledPublishAt: reply.scheduledPublishAt
                  ? reply.scheduledPublishAt.toISOString()
                  : null,
              }
            : null
        }
      />

      {/* Footer: open-on-platform (client island) + dispute + full page. */}
      <footer className="ri-detail__foot">
        {replyDeepLink && (
          <span className="ri-foot__item">
            <span className="ri-muted">Reply on</span>
            <PlatformDeepLink href={replyDeepLink} label={sourceMeta.label} color={sourceMeta.fg} />
          </span>
        )}

        {hasOpenDispute ? (
          <Link href={`/reviews/dispute/${dispute.id}`} className="ri-foot__item ri-foot__warn">
            <Flag size={14} strokeWidth={1.8} />
            Dispute {dispute.status.replace(/_/g, " ")}
          </Link>
        ) : (
          <Link href={`/reviews/dispute/new?reviewId=${r.id}`} className="ri-foot__item">
            <Flag size={14} strokeWidth={1.8} />
            Dispute this review
          </Link>
        )}

        <Link href={`/reviews/${r.id}`} className="ri-foot__item ri-foot__end">
          Open full page
          <ExternalLink size={13} strokeWidth={1.8} />
        </Link>
      </footer>
    </article>
  );
}

/**
 * Reply-status-driven label (dot + text, Apple style):
 *   - published          → green "Replied"
 *   - draft/pending      → accent "AI draft"
 *   - none + rating ≤ 4  → red "Needs reply"
 *   - none + 5★          → nothing (a 5★ with no reply isn't urgent)
 */
function ReplyStatusBadge({ status, rating }: { status: string | null; rating: number }) {
  if (status === "published") {
    return <span className="ri-status ri-status--ok">Replied</span>;
  }
  if (status === "draft" || status === "pending_review") {
    return <span className="ri-status ri-status--draft">AI draft</span>;
  }
  if (!status && rating <= 4) {
    return <span className="ri-status ri-status--bad">Needs reply</span>;
  }
  return null;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
