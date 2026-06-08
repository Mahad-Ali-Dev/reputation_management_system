"use server";

import { requireRole } from "@/lib/auth/rbac";
import { assertEntitled, PlanInactiveError } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  suggestKeywords,
  suggestCompetitors,
  type CompetitorSuggestion,
} from "./adapters/rank-tracker";

/**
 * Onboarding suggest actions (Module 13) — thin `"use server"` wrappers the
 * wizard calls for AI/provider suggestions. Each:
 *  - `requireRole("manager")` + `assertEntitled` (paid surface),
 *  - seeds context from the establishment `category` + `address`,
 *  - is NO-OP-SAFE: returns `{ available:false, items:[] }` when the provider
 *    has no creds (never throws, no paid call).
 */

export type SuggestActionResult<T> =
  | { ok: true; available: boolean; items: T[] }
  | { ok: false; reason: "plan_inactive" | "error" };

/** Resolve a (category, location) seed from the org's primary establishment. */
async function establishmentSeed(
  orgId: string,
  establishmentId?: string | null,
): Promise<{ category: string | null; location: string | null; placeId: string | null }> {
  try {
    return await withTenant(orgId, async (tx) => {
      const est = establishmentId
        ? await tx.establishment.findUnique({
            where: { id: establishmentId },
            select: { category: true, address: true, googlePlaceId: true },
          })
        : await tx.establishment.findFirst({
            orderBy: { createdAt: "asc" },
            select: { category: true, address: true, googlePlaceId: true },
          });
      if (!est) return { category: null, location: null, placeId: null };
      const addr = (est.address ?? {}) as Record<string, unknown>;
      const location = [addr.city, addr.region]
        .filter((p) => typeof p === "string" && p.length > 0)
        .join(", ");
      return {
        category: est.category ?? null,
        location: location || null,
        placeId: est.googlePlaceId ?? null,
      };
    });
  } catch {
    return { category: null, location: null, placeId: null };
  }
}

/** Suggest tracking keywords from the establishment category + location. */
export async function suggestKeywordsAction(
  establishmentId?: string,
): Promise<SuggestActionResult<string>> {
  let orgId: string;
  try {
    ({ orgId } = await requireRole("manager"));
    await assertEntitled(orgId);
  } catch (err) {
    if (err instanceof PlanInactiveError) return { ok: false, reason: "plan_inactive" };
    throw err; // redirect() etc. bubble
  }

  try {
    const seed = await establishmentSeed(orgId, establishmentId);
    const res = await suggestKeywords({ category: seed.category, location: seed.location });
    return { ok: true, available: res.available, items: res.items };
  } catch (err) {
    logger.warn({ orgId, event: "seo.onboarding.suggest_keywords_failed", error: String(err) });
    return { ok: true, available: false, items: [] };
  }
}

/** Suggest up to 3 local competitors from the establishment category + location. */
export async function suggestCompetitorsAction(
  establishmentId?: string,
): Promise<SuggestActionResult<CompetitorSuggestion>> {
  let orgId: string;
  try {
    ({ orgId } = await requireRole("manager"));
    await assertEntitled(orgId);
  } catch (err) {
    if (err instanceof PlanInactiveError) return { ok: false, reason: "plan_inactive" };
    throw err;
  }

  try {
    const seed = await establishmentSeed(orgId, establishmentId);
    const res = await suggestCompetitors({
      category: seed.category,
      location: seed.location,
      placeId: seed.placeId,
    });
    return { ok: true, available: res.available, items: res.items.slice(0, 3) };
  } catch (err) {
    logger.warn({ orgId, event: "seo.onboarding.suggest_competitors_failed", error: String(err) });
    return { ok: true, available: false, items: [] };
  }
}
