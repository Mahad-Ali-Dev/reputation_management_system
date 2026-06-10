import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "./fail-soft";

/**
 * Comments tab — pure helpers + types + RSC-only READ queries (Module 09 —
 * Inbox, Wave 3c-A).
 *
 * Surfaces `SocialComment` rows (FB/IG) in the unified inbox Comments tab. This
 * module is imported by SERVER code only (the inbox shell's `CommentsTab`
 * loader + `comments-actions.ts`). The mutating Server Actions live in
 * `comments-actions.ts` (top-level "use server") because the client island
 * imports them directly — Next.js forbids a Client Component from importing a
 * module that mixes sync helper/type exports with Server Actions.
 *
 * FAIL-SOFT: `SocialComment` ships via the Wave-0 delta and may not be migrated
 * on a given deploy. The READ helpers wrap their query in `softInbox` so a
 * not-yet-migrated relation (Postgres 42P01 / 42703) degrades to empty rather
 * than 500-ing the inbox — the guard is centralized HERE so every caller is
 * protected, not only the inbox shell.
 *
 * CRITICAL DISTINCTION (guardrail): FB/IG comments are SOCIAL comments — they
 * are hideable via the platform APIs. Google ("google_qa") rows are NOT
 * hideable; they can only be REPLIED to. `canHide()` encodes this so the UI and
 * the actions both refuse to offer/perform "hide" on Google. We never imply a
 * Google review/comment can be hidden.
 */

/**
 * Platforms whose comments CAN be hidden. Google is intentionally excluded.
 * Comments on BOOSTED / ad posts (`facebook_ad` / `instagram_ad`) are still
 * ordinary FB/IG comments — they are equally hideable via the Graph API.
 */
const HIDEABLE_PLATFORMS = new Set(["facebook", "instagram", "facebook_ad", "instagram_ad"]);

/** Platform discriminators that denote a comment on a boosted / ad post. */
const AD_PLATFORMS = new Set(["facebook_ad", "instagram_ad"]);

/** True if a comment on this platform may be hidden (FB/IG, organic or ad). */
export function canHide(platform: string): boolean {
  return HIDEABLE_PLATFORMS.has(platform);
}

/** True if this comment came from a boosted / promoted (ad) post. */
export function isAdComment(platform: string): boolean {
  return AD_PLATFORMS.has(platform);
}

/** Coarse source bucket for the Comments-panel "Ad comments" filter. */
export function commentSource(platform: string): "organic" | "ad" | "google" {
  if (AD_PLATFORMS.has(platform)) return "ad";
  if (platform === "google_qa") return "google";
  return "organic";
}

/** Human label for the platform badge. */
export function platformLabel(platform: string): string {
  switch (platform) {
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "facebook_ad":
      return "Facebook Ad";
    case "instagram_ad":
      return "Instagram Ad";
    case "google_qa":
      return "Google Q&A";
    default:
      return platform;
  }
}

export type CommentRow = {
  id: string;
  platform: string;
  isHideable: boolean;
  isSocial: boolean;
  isAd: boolean;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  status: string;
  aiSuggested: string | null;
  assignedTo: string | null;
  externalPostId: string | null;
  postedAt: Date;
  respondedAt: Date | null;
};

/**
 * List comments for the Comments tab. Filters by status + platform. Returns a
 * serialized shape with `isHideable`/`isSocial` precomputed so the client island
 * never has to know the hide rules. (RSC-only caller.)
 */
export async function listComments(args: {
  orgId: string;
  status?: string;
  platform?: string;
  /**
   * Coarse source filter for the Comments panel chips:
   *   - "ad"      → only boosted/promoted-post comments (`*_ad` platforms)
   *   - "organic" → only organic FB/IG + Google comments (exclude `*_ad`)
   *   - "all"/undefined → everything
   * Applied in addition to `status`. `platform` (exact) still wins if supplied.
   */
  source?: "all" | "ad" | "organic";
  take?: number;
}): Promise<CommentRow[]> {
  const { orgId, status, platform, source, take = 100 } = args;
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (platform && platform !== "all") {
    where.platform = platform;
  } else if (source === "ad") {
    where.platform = { in: ["facebook_ad", "instagram_ad"] };
  } else if (source === "organic") {
    where.platform = { notIn: ["facebook_ad", "instagram_ad"] };
  }

  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const rows = await tx.socialComment.findMany({
          where,
          orderBy: { postedAt: "desc" },
          take,
        });
        return rows.map((c) => ({
          id: c.id,
          platform: c.platform,
          isHideable: canHide(c.platform),
          isSocial: c.platform !== "google_qa",
          isAd: isAdComment(c.platform),
          authorName: c.authorName,
          authorAvatarUrl: c.authorAvatarUrl,
          body: c.body,
          status: c.status,
          aiSuggested: c.aiSuggested,
          assignedTo: c.assignedTo,
          externalPostId: c.externalPostId,
          postedAt: c.postedAt,
          respondedAt: c.respondedAt,
        }));
      }),
    [],
    { event: "inbox.comments.list_failed", swallowAll: true, context: { orgId } },
  );
}

/** Status counts for the Comments filter chips. Fail-soft → {}. (RSC-only caller.) */
export async function commentStatusCounts(orgId: string): Promise<Record<string, number>> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const grouped = await tx.socialComment.groupBy({ by: ["status"], _count: true });
        const out: Record<string, number> = {};
        for (const g of grouped) out[g.status] = g._count;
        return out;
      }),
    {},
    { event: "inbox.comments.counts_failed", swallowAll: true, context: { orgId } },
  );
}
