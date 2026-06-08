/**
 * Social connection-aware helper (Module 10, Wave 3d) — the SINGLE
 * provider-mapping point for the post creator.
 *
 * `Connection.provider` stores the *OAuth provider* string, which for the
 * combined Facebook + Instagram OAuth is **`meta`** (not `facebook`/`instagram`).
 * The composer, calendar, preview, and publish adapter all reason about
 * *platforms* (`facebook | instagram | twitter | linkedin`). This module is the
 * one place that maps between the two — get it wrong and connection-gating
 * mis-fires (a connected Page shows as "not connected" or vice-versa).
 *
 * Everything here is pure reads (`withTenant`) + pure logic. No external calls.
 * Reads FAIL SOFT: on a brand-new deploy the `connections` table / new columns
 * may not exist (Postgres 42P01 / 42703) — degrade to "nothing connected"
 * rather than 500-ing the hub (the conservative direction: a gated control
 * stays disabled).
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/** The platforms the post creator targets. */
export type SocialPlatform = "facebook" | "instagram" | "twitter" | "linkedin";

export const ALL_PLATFORMS: readonly SocialPlatform[] = [
  "facebook",
  "instagram",
  "twitter",
  "linkedin",
] as const;

/**
 * Map a `Connection.provider` value → the platforms that connection can post
 * to. `meta` is the combined Facebook + Instagram OAuth, so it lights up BOTH.
 * Returns `[]` for providers that aren't social post targets (google_business,
 * shopify, …) so the caller can ignore them.
 */
export function providerToPlatforms(provider: string): SocialPlatform[] {
  switch (provider.toLowerCase()) {
    case "meta":
    case "facebook": // tolerate a legacy/registry id
      return ["facebook", "instagram"];
    case "instagram":
      return ["instagram"];
    case "linkedin":
      return ["linkedin"];
    case "x":
    case "twitter":
      return ["twitter"];
    default:
      return [];
  }
}

/**
 * Inverse map: a target platform → the `Connection.provider` string the publish
 * adapter must look up. FB + IG both ride the `meta` connection.
 */
export function platformToProvider(platform: SocialPlatform): string {
  switch (platform) {
    case "facebook":
    case "instagram":
      return "meta";
    case "linkedin":
      return "linkedin";
    case "twitter":
      return "x";
  }
}

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/**
 * The set of platforms this org can actually publish to right now, derived from
 * its ACTIVE `Connection` rows. Optionally scope to a single establishment
 * (org-level connections — `establishmentId: null` — always apply).
 *
 * Fail-soft → empty Set on any error (treated as "nothing connected").
 */
export async function getConnectedPlatforms(
  orgId: string,
  establishmentId?: string | null,
): Promise<Set<SocialPlatform>> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.connection.findMany({
        where: {
          status: "active",
          ...(establishmentId
            ? { OR: [{ establishmentId }, { establishmentId: null }] }
            : {}),
        },
        select: { provider: true },
      });
      const set = new Set<SocialPlatform>();
      for (const r of rows) {
        for (const p of providerToPlatforms(r.provider)) set.add(p);
      }
      return set;
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "social.connections.skipped_unmigrated" });
    } else {
      logger.warn({
        orgId,
        error: err instanceof Error ? err.message : String(err),
        event: "social.connections.failed",
      });
    }
    return new Set<SocialPlatform>();
  }
}

/**
 * Per-platform rules used by the composer's inline validation AND the dispatch
 * pre-check. `maxChars` is the caption character ceiling; `requiresMedia` flags
 * platforms that reject a text-only post (Instagram).
 */
export const PLATFORM_LIMITS: Record<
  SocialPlatform,
  { maxChars: number; requiresMedia: boolean; maxMedia: number; label: string }
> = {
  facebook: { maxChars: 63206, requiresMedia: false, maxMedia: 10, label: "Facebook" },
  instagram: { maxChars: 2200, requiresMedia: true, maxMedia: 10, label: "Instagram" },
  twitter: { maxChars: 280, requiresMedia: false, maxMedia: 4, label: "X" },
  linkedin: { maxChars: 3000, requiresMedia: false, maxMedia: 9, label: "LinkedIn" },
};

export type ValidationIssue = { platform: SocialPlatform; code: string; message: string };

export type PostValidationInput = {
  platforms: string[];
  caption?: string | null;
  /** Count of attached media (uploads + library + creatives). */
  media?: string[] | null;
};

/**
 * Validate a post against every selected platform's rules. Returns the list of
 * issues (empty = valid). Pure — no IO. Also rejects unknown platform strings so
 * a typo can't silently bypass gating.
 */
export function validatePost(input: PostValidationInput): {
  ok: boolean;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const caption = (input.caption ?? "").trim();
  const mediaCount = (input.media ?? []).filter(Boolean).length;

  const platforms = input.platforms.map((p) => p.toLowerCase());
  if (platforms.length === 0) {
    return {
      ok: false,
      issues: [
        { platform: "facebook", code: "no_platform", message: "Pick at least one platform." },
      ],
    };
  }

  for (const p of platforms) {
    if (!(p in PLATFORM_LIMITS)) {
      issues.push({
        platform: p as SocialPlatform,
        code: "unknown_platform",
        message: `Unknown platform "${p}".`,
      });
      continue;
    }
    const platform = p as SocialPlatform;
    const limit = PLATFORM_LIMITS[platform];

    if (caption.length === 0 && mediaCount === 0) {
      issues.push({
        platform,
        code: "empty",
        message: `${limit.label}: add a caption or at least one image/video.`,
      });
    }
    if (caption.length > limit.maxChars) {
      issues.push({
        platform,
        code: "too_long",
        message: `${limit.label}: caption is ${caption.length} characters (max ${limit.maxChars}).`,
      });
    }
    if (limit.requiresMedia && mediaCount === 0) {
      issues.push({
        platform,
        code: "media_required",
        message: `${limit.label} requires at least one image or video.`,
      });
    }
    if (mediaCount > limit.maxMedia) {
      issues.push({
        platform,
        code: "too_many_media",
        message: `${limit.label}: up to ${limit.maxMedia} media items (you have ${mediaCount}).`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
