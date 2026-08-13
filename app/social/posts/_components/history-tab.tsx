import { Icon, type IconName } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { retrySocialPost } from "@/lib/social/post-actions";
import Link from "next/link";

/**
 * `<HistoryTab>` (Module 10) — Post History panel (server component), rebuilt to
 * the delivered design kit (.sk-table).
 *
 * Paginated table of the org's posts with: thumbnail + platform icon + caption,
 * a colored status pill, engagement metrics (Likes/Comments/Shares/Reach summed
 * across the post's latest `SocialPostMetric` rows), when, and a row action.
 * Published posts show engagement; scheduled/queued/draft show dashes. Paged via
 * `?hpage=`. Empty state uses the kit history illustration.
 *
 * FAIL SOFT: `social_post_metrics` may not exist pre-migration — the metric join
 * is wrapped so a 42P01/42703 degrades to "no metrics" instead of 500-ing the
 * hub. The post list itself uses the long-existing `social_posts` table.
 */

const PAGE_SIZE = 20;

const PLATFORM_ICON: Record<string, IconName> = {
  facebook: "fb",
  instagram: "insta",
  linkedin: "linkedin",
  twitter: "twitter",
};

type Metrics = { likes: number; comments: number; shares: number; reach: number };

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

async function loadMetrics(orgId: string, postIds: string[]): Promise<Map<string, Metrics>> {
  const map = new Map<string, Metrics>();
  if (postIds.length === 0) return map;
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.socialPostMetric.findMany({
        where: { socialPostId: { in: postIds } },
        select: { socialPostId: true, likes: true, comments: true, shares: true, reach: true },
      }),
    );
    for (const r of rows) {
      const prev = map.get(r.socialPostId) ?? { likes: 0, comments: 0, shares: 0, reach: 0 };
      map.set(r.socialPostId, {
        likes: prev.likes + r.likes,
        comments: prev.comments + r.comments,
        shares: prev.shares + r.shares,
        reach: prev.reach + r.reach,
      });
    }
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        event: "social.history.metrics.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // pre-migration / error → empty metrics, no throw
  }
  return map;
}

export async function HistoryTab({
  orgId,
  page,
  forceEmpty,
}: {
  orgId: string;
  page: number;
  forceEmpty?: boolean;
}) {
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * PAGE_SIZE;

  // FAIL SOFT: degrade to an empty history (which renders the empty state) when
  // `social_posts` / a selected column isn't migrated yet (42P01 / 42703) rather
  // than 500-ing the hub; re-throw real errors so genuine bugs still surface.
  const [posts, total] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.socialPost.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          caption: true,
          platforms: true,
          status: true,
          mediaUrl: true,
          scheduledFor: true,
          postedAt: true,
          error: true,
          createdAt: true,
        },
      }),
      tx.socialPost.count(),
    ]),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return [[], 0] as const;
    throw err;
  });

  // Demo seeds use "posted"; production publishes as "published" — treat both as
  // the engagement-bearing published state.
  const isPublished = (s: string) => s === "published" || s === "posted";

  const metrics = await loadMetrics(
    orgId,
    posts.filter((p) => isPublished(p.status)).map((p) => p.id),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (forceEmpty || total === 0) {
    return (
      <div className="sk-card">
        <div className="sk-table__head">
          <span>Post</span>
          <span>Status</span>
          <span>Engagement</span>
          <span style={{ textAlign: "right" }}>When</span>
          <span />
        </div>
        <div className="sk-empty-center">
          <div className="sk-empty-center__art">
            {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
            <img src="/assets/repulabs/post-creator/history-main.svg" alt="" />
          </div>
          <h3 className="sk-empty-center__title">No post history yet</h3>
          <p className="sk-empty-center__body">
            You haven’t scheduled or published any posts yet. Create your first post and it will
            show up here.
          </p>
          <Link href="/social/posts?tab=create" className="sk-btn-out" style={{ height: 46 }}>
            <Icon name="plus" size={14} />
            Create your first post
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-card" style={{ overflow: "hidden" }}>
      <div className="sk-table__head">
        <span>Post</span>
        <span>Status</span>
        <span className="row" style={{ gap: 5 }}>
          Engagement <Icon name="info" size={12} style={{ color: "var(--sk-muted)" }} />
        </span>
        <span style={{ textAlign: "right" }}>When</span>
        <span />
      </div>

      {posts.map((p) => {
        const m = metrics.get(p.id);
        const when = p.postedAt ?? p.scheduledFor ?? p.createdAt;
        const whenLabel = p.postedAt ? "Posted" : p.scheduledFor ? "Scheduled" : "Created";
        const statusTone = p.status === "publishing" ? "queued" : p.status;
        return (
          <div key={p.id} className="sk-table__row">
            {/* post col */}
            <div className="sk-post-cell">
              {p.mediaUrl ? (
                // biome-ignore lint/performance/noImgElement: post thumbnail (user/blob asset)
                <img src={p.mediaUrl} alt="" className="sk-post-cell__thumb" />
              ) : (
                <span className="sk-post-cell__thumb sk-post-cell__thumb--ph">
                  <Icon name="chat" size={18} />
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/social/posts?tab=create&post=${p.id}`}
                  className="sk-post-cell__title"
                >
                  {p.caption ? truncate(p.caption, 60) : "(no caption)"}
                </Link>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  {(p.platforms ?? []).map((pl) => (
                    <Icon
                      key={pl}
                      name={PLATFORM_ICON[pl.toLowerCase()] ?? "share"}
                      size={13}
                      style={{ color: "var(--sk-muted)" }}
                      title={pl}
                    />
                  ))}
                  <span className="sk-post-cell__excerpt" style={{ marginTop: 0 }}>
                    {(p.platforms ?? []).map(cap).join(", ")}
                  </span>
                </div>
              </div>
            </div>

            {/* status col */}
            <div>
              <span className={`sk-status sk-status--${statusTone}`}>
                <span className="sk-status__dot" />
                {p.status}
              </span>
              {/* The reason was previously only a `title` on the Retry button —
                  invisible unless you hovered that exact spot, and unreachable
                  on touch. A failed post that won't say why is unactionable. */}
              {p.status === "failed" && p.error && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 11.5,
                    lineHeight: 1.45,
                    color: "var(--bad, #b42318)",
                    maxWidth: 260,
                  }}
                >
                  {friendlyPublishError(p.error)}
                </p>
              )}
              {p.status === "failed" && (
                <form action={retrySocialPost} style={{ marginTop: 6 }}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="sk-btn-out"
                    style={{ height: 28, padding: "0 10px", fontSize: 11.5 }}
                    title={p.error ?? undefined}
                  >
                    <Icon name="refresh" size={11} />
                    Retry
                  </button>
                </form>
              )}
            </div>

            {/* engagement col */}
            <div className="sk-engage">
              {isPublished(p.status) ? (
                <>
                  <span
                    className="sk-engage__item sk-engage--like"
                    title={`${m?.likes ?? 0} likes`}
                  >
                    <Icon name="star" size={14} />
                    {compact(m?.likes ?? 0)}
                  </span>
                  <span
                    className="sk-engage__item sk-engage--comment"
                    title={`${m?.comments ?? 0} comments`}
                  >
                    <Icon name="chat" size={14} />
                    {compact(m?.comments ?? 0)}
                  </span>
                  <span
                    className="sk-engage__item sk-engage--share"
                    title={`${m?.shares ?? 0} shares`}
                  >
                    <Icon name="share" size={14} />
                    {compact(m?.shares ?? 0)}
                  </span>
                  <span
                    className="sk-engage__item sk-engage--reach"
                    title={`${m?.reach ?? 0} reach`}
                  >
                    <Icon name="eye" size={14} />
                    {compact(m?.reach ?? 0)}
                  </span>
                </>
              ) : (
                <span style={{ color: "var(--sk-muted)", fontWeight: 500 }}>—</span>
              )}
            </div>

            {/* when col */}
            <div className="sk-when">
              <div className="sk-when__date">{fmtDate(when)}</div>
              <div className="sk-when__label">{whenLabel}</div>
            </div>

            {/* actions */}
            <button
              type="button"
              className="sk-rowmore"
              aria-label="Post actions"
              title="Post actions"
            >
              <Icon name="sliders" size={15} />
            </button>
          </div>
        );
      })}

      {/* pagination */}
      {totalPages > 1 && (
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            padding: "14px 22px",
            borderTop: "1px solid var(--sk-divider)",
            background: "var(--sk-soft)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--sk-muted)" }}>
            Page {safePage} of {totalPages} · {total} posts
          </span>
          <div className="row" style={{ gap: 8 }}>
            <PageLink page={safePage - 1} disabled={safePage <= 1} label="Previous" icon="chevL" />
            <PageLink
              page={safePage + 1}
              disabled={safePage >= totalPages}
              label="Next"
              icon="chevR"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  label,
  icon,
}: {
  page: number;
  disabled: boolean;
  label: string;
  icon: IconName;
}) {
  if (disabled) {
    return (
      <span className="sk-btn-out" style={{ height: 34, opacity: 0.45, pointerEvents: "none" }}>
        <Icon name={icon} size={12} />
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/social/posts?tab=history&hpage=${page}`}
      className="sk-btn-out"
      style={{ height: 34 }}
    >
      <Icon name={icon} size={12} />
      {label}
    </Link>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Publish failures arrive as raw provider text. Map the ones an owner can act on
 * and pass anything else through rather than hiding it — a truncated provider
 * message still beats no message.
 */
function friendlyPublishError(raw: string): string {
  const e = raw.toLowerCase();
  if (
    e.includes("token") &&
    (e.includes("expire") || e.includes("invalid") || e.includes("revoke"))
  ) {
    return "The channel connection expired. Reconnect it under Connections, then retry.";
  }
  if (e.includes("permission") || e.includes("scope") || e.includes("403")) {
    return "That channel is missing a permission needed to post. Reconnect it and accept all prompts.";
  }
  if (e.includes("data:") || e.includes("image") || e.includes("media")) {
    return "The attached image couldn't be used. Re-upload it and retry.";
  }
  if (e.includes("duplicate")) return "The network rejected this as a duplicate of a recent post.";
  if (e.includes("rate") || e.includes("429"))
    return "The network is rate-limiting this account. Retry shortly.";
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}
