import { Icon, type IconName } from "@/components/shell/icon";
import { retrySocialPost } from "@/lib/social/post-actions";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import Link from "next/link";

/**
 * `<HistoryTab>` (Module 10) — Post History panel (server component).
 *
 * Paginated list of the org's posts with: status chip, platform icons,
 * scheduled/posted time, engagement metrics (Likes/Comments/Shares/Reach summed
 * across the post's latest `SocialPostMetric` rows), and a Retry action on
 * `failed` rows. Paged via `?hpage=`.
 *
 * FAIL SOFT: `social_post_metrics` may not exist pre-migration — the metric join
 * is wrapped so a 42P01/42703 degrades to "no metrics" instead of 500-ing the
 * hub. The post list itself uses the long-existing `social_posts` table.
 */

const PAGE_SIZE = 20;

const STATUS_TONE: Record<string, string> = {
  draft: "chip--out",
  scheduled: "chip--warn",
  publishing: "chip--info",
  published: "chip--ok",
  failed: "chip--bad",
};

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

export async function HistoryTab({ orgId, page }: { orgId: string; page: number }) {
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * PAGE_SIZE;

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
  );

  const metrics = await loadMetrics(
    orgId,
    posts.filter((p) => p.status === "published").map((p) => p.id),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (total === 0) {
    return (
      <div className="ds-card" style={{ padding: 40, textAlign: "center", color: "var(--rl-muted)" }}>
        <Icon name="clock" size={28} style={{ color: "var(--pri)" }} />
        <p style={{ marginTop: 10, fontSize: 13 }}>
          No posts yet. Head to <Link href="/social/posts?tab=create" style={{ color: "var(--pri)" }}>Create post</Link> to compose your first.
        </p>
      </div>
    );
  }

  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* header row */}
      <div
        className="lbl-mono"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2.4fr) 0.9fr 1.6fr 0.8fr",
          gap: 12,
          padding: "12px 16px",
          margin: 0,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span>Post</span>
        <span>Status</span>
        <span>Engagement</span>
        <span style={{ textAlign: "right" }}>When</span>
      </div>

      {posts.map((p, i) => {
        const m = metrics.get(p.id);
        const when = p.postedAt ?? p.scheduledFor ?? p.createdAt;
        const whenLabel = p.postedAt ? "Posted" : p.scheduledFor ? "Scheduled" : "Created";
        return (
          <div
            key={p.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2.4fr) 0.9fr 1.6fr 0.8fr",
              gap: 12,
              padding: "14px 16px",
              borderTop: i ? "1px solid var(--line)" : "none",
              alignItems: "center",
            }}
          >
            {/* post col */}
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
              {p.mediaUrl ? (
                // biome-ignore lint/performance/noImgElement: post thumbnail (user/blob asset)
                <img
                  src={p.mediaUrl}
                  alt=""
                  style={{ width: 38, height: 38, borderRadius: 7, objectFit: "cover", flexShrink: 0, border: "1px solid var(--line)" }}
                />
              ) : (
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 7,
                    background: "var(--surface-3)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="chat" size={15} style={{ color: "var(--rl-muted-2)" }} />
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/social/posts?tab=create&post=${p.id}`}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: "var(--ink)",
                    textDecoration: "none",
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.caption ? truncate(p.caption, 70) : "(no caption)"}
                </Link>
                <span className="row" style={{ gap: 5, marginTop: 3 }}>
                  {(p.platforms ?? []).map((pl) => (
                    <Icon
                      key={pl}
                      name={PLATFORM_ICON[pl.toLowerCase()] ?? "share"}
                      size={11}
                      style={{ color: "var(--rl-muted)" }}
                      title={pl}
                    />
                  ))}
                </span>
              </div>
            </div>

            {/* status col */}
            <div>
              <span className={`chip ${STATUS_TONE[p.status] ?? "chip--out"}`}>{p.status}</span>
              {p.status === "failed" && (
                <form action={retrySocialPost} style={{ marginTop: 6 }}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="btn btn--xs" title={p.error ?? undefined}>
                    <Icon name="refresh" size={11} />
                    Retry
                  </button>
                </form>
              )}
            </div>

            {/* engagement col */}
            <div className="row" style={{ gap: 12, fontSize: 11.5, color: "var(--ink-2)" }}>
              {p.status === "published" ? (
                <>
                  <Metric icon="star" value={m?.likes ?? 0} label="likes" />
                  <Metric icon="chat" value={m?.comments ?? 0} label="comments" />
                  <Metric icon="share" value={m?.shares ?? 0} label="shares" />
                  <Metric icon="eye" value={m?.reach ?? 0} label="reach" />
                </>
              ) : (
                <span className="dim" style={{ fontSize: 11 }}>
                  —
                </span>
              )}
            </div>

            {/* when col */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{fmtDate(when)}</div>
              <div className="dim mono" style={{ fontSize: 9.5 }}>
                {whenLabel}
              </div>
            </div>
          </div>
        );
      })}

      {/* pagination */}
      {totalPages > 1 && (
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            padding: "12px 16px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
          }}
        >
          <span className="dim mono" style={{ fontSize: 11 }}>
            Page {safePage} of {totalPages} · {total} posts
          </span>
          <div className="row" style={{ gap: 8 }}>
            <PageLink page={safePage - 1} disabled={safePage <= 1} label="Previous" icon="chevL" />
            <PageLink page={safePage + 1} disabled={safePage >= totalPages} label="Next" icon="chevR" />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <span className="row" style={{ gap: 4 }} title={`${value} ${label}`}>
      <Icon name={icon} size={12} style={{ color: "var(--rl-muted)" }} />
      {compact(value)}
    </span>
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
      <span className="btn btn--xs" style={{ opacity: 0.45, pointerEvents: "none" }}>
        <Icon name={icon} size={11} />
        {label}
      </span>
    );
  }
  return (
    <Link href={`/social/posts?tab=history&hpage=${page}`} className="btn btn--xs">
      <Icon name={icon} size={11} />
      {label}
    </Link>
  );
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
