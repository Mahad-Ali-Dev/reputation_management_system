import { withTenant } from "@/lib/db/with-tenant";

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
 * CRITICAL DISTINCTION (guardrail): FB/IG comments are SOCIAL comments — they
 * are hideable via the platform APIs. Google ("google_qa") rows are NOT
 * hideable; they can only be REPLIED to. `canHide()` encodes this so the UI and
 * the actions both refuse to offer/perform "hide" on Google. We never imply a
 * Google review/comment can be hidden.
 */

/** Platforms whose comments CAN be hidden. Google is intentionally excluded. */
const HIDEABLE_PLATFORMS = new Set(["facebook", "instagram"]);

/** True if a comment on this platform may be hidden (FB/IG only). */
export function canHide(platform: string): boolean {
  return HIDEABLE_PLATFORMS.has(platform);
}

/** Human label for the platform badge. */
export function platformLabel(platform: string): string {
  switch (platform) {
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
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
  take?: number;
}): Promise<CommentRow[]> {
  const { orgId, status, platform, take = 100 } = args;
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (platform && platform !== "all") where.platform = platform;

  const rows = await withTenant(orgId, async (tx) =>
    tx.socialComment.findMany({ where, orderBy: { postedAt: "desc" }, take }),
  );

  return rows.map((c) => ({
    id: c.id,
    platform: c.platform,
    isHideable: canHide(c.platform),
    isSocial: c.platform !== "google_qa",
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
}

/** Status counts for the Comments filter chips. (RSC-only caller.) */
export async function commentStatusCounts(orgId: string): Promise<Record<string, number>> {
  const grouped = await withTenant(orgId, async (tx) =>
    tx.socialComment.groupBy({ by: ["status"], _count: true }),
  );
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.status] = g._count;
  return out;
}
