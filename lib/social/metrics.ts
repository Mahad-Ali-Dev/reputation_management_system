/**
 * Engagement-metrics service (Module 10, Wave 3d) — `SocialPostMetric`.
 *
 * Two responsibilities:
 *   1. `fetchPostMetrics(post, orgId)` — env-gated adapter that pulls per-platform
 *      engagement (likes/comments/shares/reach) from the Graph API. **No-ops to
 *      `skipped` + zeros, making ZERO network calls, when Meta isn't enabled**
 *      (the default unattended path). Mocked in tests.
 *   2. `upsertPostMetric(...)` — writes one latest snapshot per (post, platform),
 *      tenant-scoped. Fail-soft on the not-migrated table.
 *   3. `getLatestMetricsForPosts(...)` — read helper the History tab uses to sum
 *      Likes/Comments/Shares/Reach per post (fail-soft → empty map).
 *
 * Imported by the `refresh-social-metrics` cron (write path) and the History tab
 * (read path).
 */

import { decryptAccessToken } from "@/lib/connections/adapters/refresh";
import { GRAPH_VERSION } from "@/lib/connections/adapters/meta";
import { isMetaPublishEnabled } from "@/lib/social/publish";
import { platformToProvider, type SocialPlatform } from "@/lib/social/connections";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export type MetricSnapshot = {
  platform: SocialPlatform;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
};

export type PostForMetrics = {
  id: string;
  platforms: string[];
  externalIds: unknown; // Json: { facebook: "...", instagram: "..." }
  establishmentId: string | null;
};

/** Postgres 42P01 / 42703 → table/column not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** Is daily metrics refresh enabled? Same gate as publishing (Meta creds). */
export function isMetricsRefreshEnabled(): boolean {
  return isMetaPublishEnabled();
}

type ConnTokenRow = {
  id: string;
  organizationId: string;
  provider: string;
  externalId: string | null;
  accessTokenCt: Uint8Array;
  refreshTokenCt: Uint8Array | null;
  iv: Uint8Array;
  keyVersion: number;
  dekCiphertext: Uint8Array;
  encryptionCtx: unknown;
};

async function loadActiveToken(
  orgId: string,
  provider: string,
  establishmentId: string | null,
): Promise<string | null> {
  try {
    const conn = (await withTenant(orgId, async (tx) =>
      tx.connection.findFirst({
        where: {
          provider,
          status: "active",
          ...(establishmentId
            ? { OR: [{ establishmentId }, { establishmentId: null }] }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          organizationId: true,
          provider: true,
          externalId: true,
          accessTokenCt: true,
          refreshTokenCt: true,
          iv: true,
          keyVersion: true,
          dekCiphertext: true,
          encryptionCtx: true,
        },
      }),
    )) as ConnTokenRow | null;
    if (!conn) return null;
    return decryptAccessToken({
      id: conn.id,
      organizationId: conn.organizationId,
      provider: conn.provider,
      externalId: conn.externalId,
      accountLabel: null,
      establishmentId: null,
      accessTokenCt: conn.accessTokenCt,
      refreshTokenCt: conn.refreshTokenCt,
      iv: conn.iv,
      keyVersion: conn.keyVersion,
      dekCiphertext: conn.dekCiphertext,
      encryptionCtx: conn.encryptionCtx,
      tokenExpiresAt: null,
      scopes: [],
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        provider,
        event: "social.metrics.token_load_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

/**
 * Fetch per-platform metrics for a published post. ENV-GATED: returns
 * `{ skipped:true, snapshots:[] }` with NO network call when Meta isn't enabled.
 * Never throws.
 */
export async function fetchPostMetrics(
  post: PostForMetrics,
  orgId: string,
): Promise<{ skipped: boolean; snapshots: MetricSnapshot[] }> {
  if (!isMetaPublishEnabled()) {
    return { skipped: true, snapshots: [] };
  }

  const externalIds = (post.externalIds ?? {}) as Record<string, string>;
  const snapshots: MetricSnapshot[] = [];

  for (const raw of post.platforms) {
    const platform = raw.toLowerCase() as SocialPlatform;
    if (platform !== "facebook" && platform !== "instagram") continue; // only Meta live
    const externalId = externalIds[platform];
    if (!externalId) continue;

    const token = await loadActiveToken(orgId, platformToProvider(platform), post.establishmentId);
    if (!token) continue;

    try {
      const snap = await fetchGraphInsights(platform, externalId, token);
      if (snap) snapshots.push(snap);
    } catch (err) {
      logger.warn({
        orgId,
        postId: post.id,
        platform,
        event: "social.metrics.fetch_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { skipped: false, snapshots };
}

/** The single paid metrics call. Reached only behind the env gate + a token. */
async function fetchGraphInsights(
  platform: SocialPlatform,
  externalId: string,
  token: string,
): Promise<MetricSnapshot | null> {
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;
  // Summary engagement fields available on a post node.
  const fields =
    platform === "instagram"
      ? "like_count,comments_count"
      : "likes.summary(true),comments.summary(true),shares";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const url = `${base}/${encodeURIComponent(externalId)}?fields=${encodeURIComponent(
      fields,
    )}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;

    const likes =
      platform === "instagram"
        ? num(json.like_count)
        : num((json.likes as { summary?: { total_count?: number } })?.summary?.total_count);
    const comments =
      platform === "instagram"
        ? num(json.comments_count)
        : num((json.comments as { summary?: { total_count?: number } })?.summary?.total_count);
    const shares = num((json.shares as { count?: number })?.count);

    return {
      platform,
      likes,
      comments,
      shares,
      reach: 0,
      impressions: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Upsert one latest snapshot per (post, platform). Tenant-scoped. Fail-soft on
 * not-migrated. Returns true on success.
 */
export async function upsertPostMetric(
  orgId: string,
  socialPostId: string,
  snap: MetricSnapshot,
): Promise<boolean> {
  try {
    await withTenant(orgId, async (tx) => {
      await tx.socialPostMetric.upsert({
        where: { socialPostId_platform: { socialPostId, platform: snap.platform } },
        create: {
          organizationId: orgId,
          socialPostId,
          platform: snap.platform,
          likes: snap.likes,
          comments: snap.comments,
          shares: snap.shares,
          reach: snap.reach,
          impressions: snap.impressions,
        },
        update: {
          likes: snap.likes,
          comments: snap.comments,
          shares: snap.shares,
          reach: snap.reach,
          impressions: snap.impressions,
          fetchedAt: new Date(),
        },
      });
    });
    return true;
  } catch (err) {
    if (isMissingRelation(err)) return false;
    logger.warn({
      orgId,
      socialPostId,
      event: "social.metrics.upsert_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export type PostMetricTotals = {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
};

/**
 * Sum the latest metric snapshots per post for a set of post ids. Used by the
 * History tab. Fail-soft → empty map (so History renders with blank metrics
 * pre-migration rather than crashing).
 */
export async function getLatestMetricsForPosts(
  orgId: string,
  postIds: string[],
): Promise<Map<string, PostMetricTotals>> {
  const out = new Map<string, PostMetricTotals>();
  if (postIds.length === 0) return out;
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.socialPostMetric.findMany({
        where: { socialPostId: { in: postIds } },
        select: {
          socialPostId: true,
          likes: true,
          comments: true,
          shares: true,
          reach: true,
        },
      }),
    );
    for (const r of rows) {
      const prev = out.get(r.socialPostId) ?? { likes: 0, comments: 0, shares: 0, reach: 0 };
      prev.likes += r.likes;
      prev.comments += r.comments;
      prev.shares += r.shares;
      prev.reach += r.reach;
      out.set(r.socialPostId, prev);
    }
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        event: "social.metrics.read_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
