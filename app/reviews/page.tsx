import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { getAutoReply5StarState } from "@/lib/auto-reply/managed-rule";
import { hasActiveGoogleConnection } from "@/lib/reviews/connection-status";
import {
  REVIEW_SOURCES,
  type ReplyStatusFilter,
  type ReviewSource,
  listReviews,
  replyStatusCounts,
  reviewCountsBySource,
  reviewStats,
} from "@/lib/reviews/queries";
import { buildReplyDeepLink, getReviewSourceMeta } from "@/lib/reviews/source-meta";
import Link from "next/link";
import { AutoReplyToggle } from "./_components/auto-reply-toggle";
import { ConnectGoogleEmpty } from "./_components/connect-google-empty";
import { ReplyDraftBox } from "./_components/reply-draft-box";

/**
 * Review Feed & Replies — repulabs v3 design (Module 06).
 *
 * One queue for every review across every connected platform. Status filter
 * pills (Needs Reply / Replied / AI Draft Ready), a one-switch 5★ auto-reply
 * toggle, status badges, and an inline AI-draft box per card. The native
 * Google-like review surface (avatar + stars + body) is intentionally left
 * un-restyled — controls are added AROUND it.
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

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    rating?: string;
    status?: string;
    q?: string;
    source?: string;
  }>;
}) {
  const { orgId } = await getOrgContext();

  const sp = await searchParams;
  const rating = sp.rating ? Number.parseInt(sp.rating, 10) : undefined;
  // Validate source against the known enum so a tampered URL can't poke
  // at unknown values and turn into a SQL filter we didn't intend.
  const source = (REVIEW_SOURCES as readonly string[]).includes(sp.source ?? "")
    ? (sp.source as ReviewSource)
    : undefined;
  const replyStatus = (STATUS_VALUES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ReplyStatusFilter)
    : undefined;

  // The base filter (no reply-status) drives the pill counts so they reflect
  // "within what you're currently looking at".
  const baseFilter = { rating, search: sp.q, source };

  const [reviews, stats, sourceCounts, statusCounts, autoReply, hasGoogle] = await Promise.all([
    listReviews(orgId, { ...baseFilter, replyStatus, limit: 50 }),
    reviewStats(orgId),
    reviewCountsBySource(orgId),
    replyStatusCounts(orgId, baseFilter),
    getAutoReply5StarState(orgId),
    hasActiveGoogleConnection(orgId),
  ]);

  const distribution = [5, 4, 3, 2, 1].map((r) => ({
    rating: r as 1 | 2 | 3 | 4 | 5,
    count:
      stats.byRating.find((b: { rating: number; _count: number }) => b.rating === r)?._count ?? 0,
  }));
  const maxBucket = Math.max(...distribution.map((d) => d.count), 1);

  // Helper: build a /reviews URL that preserves the active rating/source/q
  // while setting (or clearing) the status pill.
  const statusHref = (next?: ReplyStatusFilter) => {
    const params = new URLSearchParams();
    if (rating) params.set("rating", String(rating));
    if (source) params.set("source", source);
    if (sp.q) params.set("q", sp.q);
    if (next) params.set("status", next);
    const qs = params.toString();
    return qs ? `/reviews?${qs}` : "/reviews";
  };

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Reviews"]}>
      <PageHeader
        kicker={`${stats.total.toLocaleString()} total · avg ${stats.avgRating ? stats.avgRating.toFixed(2) : "—"}`}
        title="Review Feed & Replies"
        description="Every review across every connected platform, in one queue. AI drafts replies you approve."
        actions={
          <Link href="/reviews/dispute" className="btn">
            <Icon name="flag" size={12} />
            View disputes
          </Link>
        }
      />

      {/* Status filter pills — server-driven, preserve other params. */}
      <StatusPills active={replyStatus} statusHref={statusHref} counts={statusCounts} />

      <div className="rev-grid">
        {/* LEFT: distribution + filters + auto-reply toggle */}
        <aside className="col" style={{ gap: 14 }}>
          <div className="ds-card">
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
                  style={{ marginBottom: 6, fontSize: 12, textDecoration: "none", color: "inherit" }}
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
                    style={{ width: 60, textAlign: "right", fontSize: 11.5 }}
                  >
                    {d.count.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <FilterCard sp={sp} sourceCounts={sourceCounts} status={replyStatus} />

          <AutoReplyToggle enabled={autoReply.enabled} />
        </aside>

        {/* RIGHT: the review feed */}
        <div>
          {reviews.length === 0 ? (
            <ConnectGoogleEmpty hasGoogle={hasGoogle} />
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {reviews.map((r, i) => (
                <ReviewCard key={r.id} review={r} tone={((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two-column on wide screens; stack on narrow. Scoped, no global CSS. */}
      <style>{`
        .rev-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
        @media (max-width: 880px) { .rev-grid { grid-template-columns: 1fr; } }
      `}</style>
    </AppShellServer>
  );
}

function StatusPills({
  active,
  statusHref,
  counts,
}: {
  active?: ReplyStatusFilter;
  statusHref: (next?: ReplyStatusFilter) => string;
  counts: { all: number; needsReply: number; replied: number; draftReady: number };
}) {
  const pills: Array<{
    key: ReplyStatusFilter | undefined;
    label: string;
    count?: number;
    danger?: boolean;
  }> = [
    { key: undefined, label: "All", count: counts.all },
    { key: "needs_reply", label: "Needs Reply", count: counts.needsReply, danger: true },
    { key: "replied", label: "Replied", count: counts.replied },
    { key: "draft_ready", label: "AI Draft Ready", count: counts.draftReady },
  ];
  return (
    <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      {pills.map((p) => {
        const isActive = p.key === active;
        return (
          <Link
            key={p.label}
            href={statusHref(p.key)}
            className={`chip ${isActive ? "chip--pri" : ""}`}
            style={{
              textDecoration: "none",
              gap: 6,
              ...(isActive
                ? { background: "var(--pri, #2563eb)", color: "#fff", borderColor: "var(--pri, #2563eb)" }
                : {}),
            }}
          >
            {p.label}
            {typeof p.count === "number" && p.count > 0 && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  padding: "0 6px",
                  borderRadius: 999,
                  fontWeight: 700,
                  background: p.danger && !isActive ? "var(--bad, #dc2626)" : "rgba(0,0,0,0.08)",
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
  );
}

function FilterCard({
  sp,
  sourceCounts,
  status,
}: {
  sp: { rating?: string; q?: string; source?: string };
  sourceCounts: Record<string, number>;
  status?: ReplyStatusFilter;
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
  return (
    <form className="ds-card" style={{ padding: 14 }}>
      <h3 className="ds-card__title" style={{ marginBottom: 10 }}>
        Filters
      </h3>
      {/* Preserve the active status pill across a filter submit. */}
      {status && <input type="hidden" name="status" value={status} />}
      <div className="col" style={{ gap: 8 }}>
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search review text…"
          aria-label="Search reviews"
          style={inputStyle}
        />
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
      </div>
    </form>
  );
}

type ReviewRow = Awaited<ReturnType<typeof listReviews>>[number];

function ReviewCard({ review: r, tone }: { review: ReviewRow; tone: 1 | 2 | 3 | 4 | 5 | 6 | 7 }) {
  const reply = r.reply;
  const sourceMeta = getReviewSourceMeta(r.source);
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
      href={`/reviews/${r.id}`}
      className="ds-card ds-card--hover"
      style={{ padding: 16, textDecoration: "none", color: "inherit", display: "block" }}
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
        <ReplyStatusBadge status={reply?.status ?? null} rating={r.rating} />
      </div>
      {r.body && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>"{r.body}"</p>
      )}

      {/* Inline AI draft flow — Generate / Approve & Post / Regenerate / Edit. */}
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

      {/* Reply-on-platform deep-link (only when no reply exists yet). */}
      {replyDeepLink && !reply && (
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
            onClick={(e) => e.stopPropagation()}
            style={{ color: sourceMeta.fg, textDecoration: "none", fontWeight: 500 }}
          >
            Open in {sourceMeta.label} →
          </a>
        </div>
      )}
    </Link>
  );
}

/**
 * Reply-status-driven badge:
 *   - published          → green "Replied"
 *   - draft/pending      → blue "AI Draft Ready"
 *   - none + rating ≤ 4  → red "Needs Reply"
 *   - none + 5★          → nothing (a 5★ with no reply isn't urgent)
 */
function ReplyStatusBadge({ status, rating }: { status: string | null; rating: number }) {
  if (status === "published") {
    return (
      <span className="chip chip--ok" style={{ gap: 4 }}>
        <Icon name="check" size={11} />
        Replied
      </span>
    );
  }
  if (status === "draft" || status === "pending_review") {
    return (
      <span
        className="chip"
        style={{ gap: 4, background: "var(--pri-50, #eff6ff)", color: "var(--pri, #2563eb)" }}
      >
        <Icon name="sparkle" size={11} />
        AI Draft Ready
      </span>
    );
  }
  if (!status && rating <= 4) {
    return <span className="chip chip--bad">Needs Reply</span>;
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
