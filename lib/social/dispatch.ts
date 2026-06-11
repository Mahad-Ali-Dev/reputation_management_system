/**
 * Shared dispatch core (Module 10, Wave 3d).
 *
 * `dispatchDuePost(postId, orgId)` is the single code path that turns a claimed
 * `SocialPost` into a published/failed one. It is called by:
 *   - the per-minute `dispatch-social-posts` cron (after it claims a due row), and
 *   - the synchronous "Publish Now" server action.
 *
 * Contract:
 *   - IDEMPOTENT: only acts on a post whose status is `"publishing"` (the claim
 *     state). If it's already `published`/`failed`/anything else, it no-ops and
 *     reports `skipped` — so a double cron tick or a retry can't double-send.
 *   - Validates with `validatePost` before any publish; a validation failure
 *     marks the post `failed` with a readable `error` (Retry-able).
 *   - On publish results:
 *       • any platform returned an `externalId` → `published`, set `postedAt`,
 *         persist `externalIds`.
 *       • all platforms `skipped:"not_configured"` → in **dev** mark `published`
 *         with a stub note so the demo flows; in **prod** mark `failed` with
 *         `error:"no_connected_platform"` so Retry is meaningful.
 *       • a thrown error anywhere → `failed` + `error`.
 *   - All writes go through `withTenant`. Never throws to the caller.
 */

import { isProductionRuntime } from "@/lib/secrets";
import {
  publishSocialPost,
  type PlatformPublishResult,
  type PublishablePost,
} from "@/lib/social/publish";
import { validatePost } from "@/lib/social/connections";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export type DispatchResult =
  | { status: "published"; postId: string; externalIds: Record<string, string> }
  | { status: "failed"; postId: string; error: string }
  | { status: "skipped"; postId: string; reason: string };

/** Postgres 42P01 / 42703 → table/column not migrated yet. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703" || code === "P2021" || code === "P2022";
}

/**
 * Dispatch one post. Caller is expected to have already claimed it
 * (`status:"publishing"`) — this re-checks defensively for idempotency.
 */
export async function dispatchDuePost(postId: string, orgId: string): Promise<DispatchResult> {
  let post: (PublishablePost & { status: string }) | null = null;
  try {
    post = await withTenant(orgId, async (tx) =>
      tx.socialPost.findFirst({
        where: { id: postId },
        select: {
          id: true,
          status: true,
          platforms: true,
          caption: true,
          mediaUrl: true,
          approvedCreativeUrls: true,
          establishmentId: true,
        },
      }),
    );
  } catch (err) {
    logger.warn({
      orgId,
      postId,
      event: "social.dispatch.load_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "skipped", postId, reason: "load_failed" };
  }

  if (!post) return { status: "skipped", postId, reason: "not_found" };

  // Idempotency guard: only act on the claim state. A second tick / retry that
  // finds it already resolved no-ops.
  if (post.status !== "publishing") {
    return { status: "skipped", postId, reason: `not_publishing(${post.status})` };
  }

  // Pre-publish validation (IG-needs-media, X-280, …). Fail → mark failed.
  const validation = validatePost({
    platforms: post.platforms,
    caption: post.caption,
    media: mediaList(post),
  });
  if (!validation.ok) {
    const error = validation.issues.map((i) => i.message).join("; ").slice(0, 500);
    await markFailed(orgId, postId, error);
    return { status: "failed", postId, error };
  }

  let results: PlatformPublishResult[];
  try {
    results = await publishSocialPost(post, orgId);
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await markFailed(orgId, postId, error);
    return { status: "failed", postId, error };
  }

  const published = results.filter(
    (r): r is Extract<PlatformPublishResult, { ok: true }> => r.ok,
  );
  const allSkipped =
    results.length > 0 && results.every((r) => !r.ok && "skipped" in r);

  // At least one real publish → published.
  if (published.length > 0) {
    const externalIds: Record<string, string> = {};
    for (const r of published) externalIds[r.platform] = r.externalId;
    await markPublished(orgId, postId, externalIds, null);
    return { status: "published", postId, externalIds };
  }

  // Nothing connected/enabled on any platform.
  if (allSkipped) {
    if (isProductionRuntime()) {
      await markFailed(orgId, postId, "no_connected_platform");
      return { status: "failed", postId, error: "no_connected_platform" };
    }
    // Dev stub: let the demo flow without live creds.
    await markPublished(orgId, postId, {}, "(stub: no platform connected)");
    return { status: "published", postId, externalIds: {} };
  }

  // Some platforms errored (and none succeeded).
  const error = results
    .filter((r) => !r.ok && "error" in r)
    .map((r) => `${r.platform}: ${(r as { error: string }).error}`)
    .join("; ")
    .slice(0, 500) || "publish_failed";
  await markFailed(orgId, postId, error);
  return { status: "failed", postId, error };
}

function mediaList(post: PublishablePost): string[] {
  const out: string[] = [];
  for (const u of post.approvedCreativeUrls ?? []) if (u) out.push(u);
  if (post.mediaUrl && !out.includes(post.mediaUrl)) out.push(post.mediaUrl);
  return out;
}

async function markPublished(
  orgId: string,
  postId: string,
  externalIds: Record<string, string>,
  note: string | null,
): Promise<void> {
  try {
    await withTenant(orgId, async (tx) => {
      await tx.socialPost.updateMany({
        where: { id: postId, status: "publishing" },
        data: {
          status: "published",
          postedAt: new Date(),
          externalIds: Object.keys(externalIds).length > 0 ? externalIds : undefined,
          error: note,
        },
      });
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.error({
        orgId,
        postId,
        event: "social.dispatch.mark_published_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function markFailed(orgId: string, postId: string, error: string): Promise<void> {
  try {
    await withTenant(orgId, async (tx) => {
      await tx.socialPost.updateMany({
        where: { id: postId, status: "publishing" },
        data: { status: "failed", error: error.slice(0, 500) },
      });
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.error({
        orgId,
        postId,
        event: "social.dispatch.mark_failed_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
