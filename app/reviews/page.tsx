import { AppShellServer } from "@/components/app-shell-server";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { getAutoReply5StarState } from "@/lib/auto-reply/managed-rule";
import { normalizeRangeDays } from "@/lib/date-range";
import { getReviewDispute } from "@/lib/reviews/dispute-queries";
import { hasActiveGoogleConnection } from "@/lib/reviews/connection-status";
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
import Link from "next/link";
import { AutoReplyToggle } from "./_components/auto-reply-toggle";
import { ConnectGoogleEmpty } from "./_components/connect-google-empty";
import { PlatformDeepLink } from "./_components/platform-deep-link";
import { ReplyDraftBox } from "./_components/reply-draft-box";
import "./review-feed.css";

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
  }>;
}) {
  const { orgId } = await getOrgContext();

  const sp = await searchParams;
  // Window from the topbar date pill (7 | 30 | 90, default 30).
  const rangeDays = normalizeRangeDays(sp.range);
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

  // The base filter (no reply-status) drives the pill counts so they reflect
  // "within what you're currently looking at".
  const baseFilter = { rating, search: sp.q, source, sinceDays: rangeDays };

  const [reviews, stats, sourceCounts, statusCounts, autoReply, hasGoogle] = await Promise.all([
    listReviews(orgId, { ...baseFilter, replyStatus, limit: 50 }),
    reviewStats(orgId, undefined, rangeDays),
    reviewCountsBySource(orgId, rangeDays),
    replyStatusCounts(orgId, baseFilter),
    getAutoReply5StarState(orgId),
    hasActiveGoogleConnection(orgId),
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
    const qs = params.toString();
    return qs ? `/reviews?${qs}` : "/reviews";
  };

  // When the inbox is empty (no Google connection or no reviews) show the
  // existing connection-aware empty state full-width instead of the panes.
  const isEmpty = reviews.length === 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Reviews"]}>
      {/* Inbox header — "Review Inbox" branding per the Review Feed design kit:
          title + live total/avg subtitle + "View disputes" deep-link. The `rf`
          scope supplies the kit's CSS vars; figures bind to the real reviewStats
          query (avg shows "—" when there are no rated reviews yet). */}
      <div className="rf rf-head">
        <div className="rf-head__main">
          <h1 className="rf-head__title">Review Inbox</h1>
          <p className="rf-head__subtitle">
            {stats.total.toLocaleString()} total · avg{" "}
            {stats.avgRating ? stats.avgRating.toFixed(2) : "—"} · AI drafts replies you approve
          </p>
        </div>
        <Link href="/reviews/dispute" className="rf-head__disputes">
          <Icon name="flag" size={14} />
          View disputes
        </Link>
      </div>

      {isEmpty ? (
        <ConnectGoogleEmpty hasGoogle={hasGoogle} />
      ) : (
        <div className="rev-inbox">
          {/* ── PANE 1: persistent filter rail ── */}
          <aside className="rev-rail col" style={{ gap: 14 }}>
            <FilterRail
              sp={sp}
              sourceCounts={sourceCounts}
              status={replyStatus}
              statusCounts={statusCounts}
              buildHref={buildHref}
            />

            <div className="ds-card">
              <div className="ds-card__head">
                <h3 className="ds-card__title">Rating distribution</h3>
                <span className="mono dim" style={{ fontSize: 10.5 }}>
                  LAST 30 DAYS
                </span>
              </div>
              <div className="ds-card__body">
                {distribution.map((d) => {
                  const isActive = rating === d.rating;
                  return (
                    <Link
                      key={d.rating}
                      href={buildHref({ rating: isActive ? undefined : d.rating })}
                      className="row"
                      style={{
                        marginBottom: 6,
                        fontSize: 12,
                        textDecoration: "none",
                        color: "inherit",
                        opacity: rating && !isActive ? 0.5 : 1,
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
                      <span
                        className="mono dim"
                        style={{ width: 50, textAlign: "right", fontSize: 11.5 }}
                      >
                        {d.count.toLocaleString()}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <AutoReplyToggle enabled={autoReply.enabled} />
          </aside>

          {/* ── PANE 2: the review list ── */}
          <div className="rev-list" data-detail-open={detail ? "1" : "0"}>
            <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                className="rev-list__head"
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {replyStatus ? statusLabel(replyStatus) : "All reviews"}
                </span>
                <span className="mono dim" style={{ fontSize: 11 }}>
                  {reviews.length}
                  {reviews.length === 50 ? "+" : ""}
                </span>
              </div>
              <ul
                className="rev-list__items"
                style={{ listStyle: "none", margin: 0, padding: 0 }}
              >
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
            </div>
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
              <div
                className="ds-card"
                style={{ padding: 40, textAlign: "center", color: "var(--rl-muted)" }}
              >
                <Icon name="reply" size={20} />
                <p style={{ fontSize: 13, marginTop: 8 }}>Select a review to read and reply.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Three-pane on wide screens. On narrow screens the rail stacks on top,
          and the list/detail swap based on whether a review is selected
          (data-detail-open), so it reads list → tap → detail. Scoped CSS. */}
      <style>{`
        .rev-inbox {
          display: grid;
          grid-template-columns: 264px minmax(280px, 360px) 1fr;
          gap: 14px;
          align-items: start;
        }
        .rev-detail { position: sticky; top: 12px; }
        @media (max-width: 1100px) {
          .rev-inbox { grid-template-columns: 240px 1fr; }
          .rev-detail {
            grid-column: 1 / -1;
            position: static;
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
}: {
  sp: { rating?: string; q?: string; source?: string; selected?: string };
  sourceCounts: Record<string, number>;
  status?: ReplyStatusFilter;
  statusCounts: { all: number; needsReply: number; replied: number; draftReady: number };
  buildHref: (o: Partial<{ status: ReplyStatusFilter | undefined; rating: number | undefined; selected: string | undefined }>) => string;
}) {
  const inputStyle = {
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: "var(--r)",
    border: "1px solid var(--line)",
    background: "var(--surface)",
    fontFamily: "var(--f-ui)",
    fontSize: 13,
    outline: "none",
  } as const;

  const statusPills: Array<{
    key: ReplyStatusFilter | undefined;
    label: string;
    count: number;
    danger?: boolean;
  }> = [
    { key: undefined, label: "All", count: statusCounts.all },
    { key: "needs_reply", label: "Needs reply", count: statusCounts.needsReply, danger: true },
    { key: "replied", label: "Replied", count: statusCounts.replied },
    { key: "draft_ready", label: "AI draft", count: statusCounts.draftReady },
  ];

  return (
    <div className="ds-card" style={{ padding: 14 }}>
      <h3 className="ds-card__title" style={{ marginBottom: 10 }}>
        Filters
      </h3>

      {/* Search + rating + source live in a GET form so they preserve the
          active status pill (hidden input) on submit. */}
      <form className="col" style={{ gap: 8, marginBottom: 12 }}>
        {status && <input type="hidden" name="status" value={status} />}
        <div style={{ position: "relative" }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--rl-muted)",
              pointerEvents: "none",
            }}
          >
            <Icon name="search" size={14} />
          </span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search reviews…"
            aria-label="Search reviews"
            style={{ ...inputStyle, padding: "0 12px 0 32px" }}
          />
        </div>
        <select
          name="rating"
          defaultValue={sp.rating ?? ""}
          aria-label="Filter by rating"
          style={{ ...inputStyle, padding: "0 32px 0 12px" }}
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
          style={{ ...inputStyle, padding: "0 32px 0 12px" }}
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
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn" style={{ flex: 1 }}>
            <Icon name="filter" size={12} />
            Apply
          </button>
          <Link href="/reviews" className="btn btn--ghost">
            Reset
          </Link>
        </div>
      </form>

      {/* Status filter chips — server-driven Links, preserve search/rating/source. */}
      <div
        className="mono dim"
        style={{ fontSize: 10, letterSpacing: "0.06em", marginBottom: 6 }}
      >
        STATUS
      </div>
      <div className="col" style={{ gap: 6 }}>
        {statusPills.map((p) => {
          const isActive = p.key === status;
          return (
            <Link
              key={p.label}
              href={buildHref({ status: p.key, selected: undefined })}
              className="row"
              style={{
                justifyContent: "space-between",
                textDecoration: "none",
                padding: "7px 10px",
                borderRadius: "var(--r)",
                fontSize: 12.5,
                color: isActive ? "#fff" : "var(--ink)",
                background: isActive ? "var(--pri, #2563eb)" : "transparent",
                border: `1px solid ${isActive ? "var(--pri, #2563eb)" : "var(--line)"}`,
              }}
            >
              <span>{p.label}</span>
              {p.count > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    padding: "0 6px",
                    borderRadius: 999,
                    fontWeight: 700,
                    background:
                      p.danger && !isActive
                        ? "var(--bad, #dc2626)"
                        : isActive
                          ? "rgba(255,255,255,0.22)"
                          : "rgba(0,0,0,0.08)",
                    color: p.danger && !isActive ? "#fff" : isActive ? "#fff" : "inherit",
                  }}
                >
                  {p.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
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
      className="rev-row"
      style={{
        display: "block",
        padding: "11px 14px",
        textDecoration: "none",
        color: "inherit",
        borderBottom: "1px solid var(--line)",
        borderLeft: `3px solid ${active ? "var(--pri, #2563eb)" : "transparent"}`,
        background: active ? "var(--pri-50, #eff6ff)" : "transparent",
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <Avatar name={r.reviewerName ?? "User"} size={30} tone={tone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="row"
            style={{ gap: 8, justifyContent: "space-between", alignItems: "baseline" }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.reviewerName ?? "Anonymous"}
            </span>
            <span className="dim mono" style={{ fontSize: 10, flexShrink: 0 }}>
              {r.postedAt ? relativeTime(r.postedAt) : "—"}
            </span>
          </div>
          <div className="row" style={{ gap: 6, margin: "3px 0 4px" }}>
            <Stars value={r.rating} size={11} />
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "1px 5px",
                borderRadius: 999,
                background: sourceMeta.bgTint,
                color: sourceMeta.fg,
                fontFamily: "var(--f-mono)",
              }}
            >
              {sourceMeta.label.toUpperCase()}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <ReplyStatusBadge status={replyStatus} rating={r.rating} compact />
            </span>
          </div>
          {r.body && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: "var(--ink-2)",
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
        </div>
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

  return (
    <div className="ds-card" style={{ padding: 18 }}>
      {/* Back to list — only matters on narrow screens where the list folds. */}
      <div className="rev-detail__back" style={{ marginBottom: 12 }}>
        <Link href={backHref} className="btn btn--ghost" style={{ fontSize: 11.5 }}>
          <Icon name="chevL" size={12} />
          Back to list
        </Link>
      </div>

      {/* Reviewer header */}
      <div className="row" style={{ gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
        <Avatar name={r.reviewerName ?? "User"} size={40} tone={4} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{r.reviewerName ?? "Anonymous"}</span>
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
            <ReplyStatusBadge status={reply?.status ?? null} rating={r.rating} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <Stars value={r.rating} size={14} />
            <span className="dim mono" style={{ fontSize: 11 }}>
              {r.postedAt ? new Date(r.postedAt).toLocaleString() : "—"}
              {r.establishment?.name ? ` · ${r.establishment.name}` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Full review body */}
      {r.body ? (
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 13.5,
            color: "var(--ink)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {r.body}
        </p>
      ) : (
        <p className="dim" style={{ fontSize: 13, margin: "0 0 14px" }}>
          (no review text)
        </p>
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

      {/* Footer actions: open-on-platform (client island) + dispute deep-link +
          full-page view. */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          fontSize: 11.5,
        }}
      >
        {replyDeepLink && (
          <span className="row" style={{ gap: 6 }}>
            <span style={{ color: "var(--rl-muted)" }}>Reply on platform:</span>
            <PlatformDeepLink href={replyDeepLink} label={sourceMeta.label} color={sourceMeta.fg} />
          </span>
        )}

        {hasOpenDispute ? (
          <Link
            href={`/reviews/dispute/${dispute.id}`}
            className="row"
            style={{ gap: 5, color: "var(--warn, #b45309)", textDecoration: "none", fontWeight: 500 }}
          >
            <Icon name="flag" size={12} />
            Dispute {dispute.status.replace(/_/g, " ")}
          </Link>
        ) : (
          <Link
            href={`/reviews/dispute/new?reviewId=${r.id}`}
            className="row"
            style={{ gap: 5, color: "var(--rl-muted)", textDecoration: "none", fontWeight: 500 }}
          >
            <Icon name="flag" size={12} />
            Dispute this review
          </Link>
        )}

        <Link
          href={`/reviews/${r.id}`}
          className="row"
          style={{ gap: 5, color: "var(--rl-muted)", textDecoration: "none", marginLeft: "auto" }}
        >
          Full view
          <Icon name="ext" size={11} />
        </Link>
      </div>
    </div>
  );
}

/**
 * Reply-status-driven badge:
 *   - published          → green "Replied"
 *   - draft/pending      → blue "AI Draft Ready"
 *   - none + rating ≤ 4  → red "Needs Reply"
 *   - none + 5★          → nothing (a 5★ with no reply isn't urgent)
 */
function ReplyStatusBadge({
  status,
  rating,
  compact = false,
}: {
  status: string | null;
  rating: number;
  compact?: boolean;
}) {
  if (status === "published") {
    return (
      <span className="chip chip--ok" style={{ gap: 4, ...(compact ? { fontSize: 10, padding: "1px 7px" } : {}) }}>
        <Icon name="check" size={compact ? 10 : 11} />
        Replied
      </span>
    );
  }
  if (status === "draft" || status === "pending_review") {
    return (
      <span
        className="chip"
        style={{
          gap: 4,
          background: "var(--pri-50, #eff6ff)",
          color: "var(--pri, #2563eb)",
          ...(compact ? { fontSize: 10, padding: "1px 7px" } : {}),
        }}
      >
        <Icon name="sparkle" size={compact ? 10 : 11} />
        {compact ? "Draft" : "AI Draft Ready"}
      </span>
    );
  }
  if (!status && rating <= 4) {
    return (
      <span className="chip chip--bad" style={compact ? { fontSize: 10, padding: "1px 7px" } : undefined}>
        Needs Reply
      </span>
    );
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
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString();
}
