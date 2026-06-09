"use server";

import { requireRole } from "@/lib/auth/rbac";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refreshOrg } from "./refresh";

/**
 * Module 13 server actions (user-facing, `"use server"`).
 *
 * RULES (uniform across every action):
 *  - `requireRole("manager")` — content writes need manager+; reads don't.
 *  - `assertEntitled(orgId)` on the PAID surfaces (keywords / competitors /
 *    on-demand refresh / geo-post) — the server-side boundary the ProGate UI
 *    only presents.
 *  - `withTenant(orgId, …)` for every DB touch (RLS) + `auditLog.create`.
 *  - Fail-soft on the unmigrated SEO tables (42P01/42703) so a pre-migration
 *    click returns a typed soft result rather than a 500.
 */

const COMPETITOR_CAP = 3;
const REVALIDATE = "/analytics";

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; reason: "unmigrated" | "cap_reached" | "invalid_input" | "scheduler_unavailable" | "error" };

/**
 * Result of `scheduleGeoPost`. `status:"draft"` is the ONLY success shape — geo
 * posts are saved into the Social composer as a draft for review, NOT
 * auto-published. The UI must tell the user this honestly.
 */
export type GeoPostResult =
  | { ok: true; status: "draft"; data: { id: string } }
  | { ok: false; reason: "unmigrated" | "invalid_input" | "error" };

// ─────────────────────────── Onboarding step ───────────────────────────

const OnboardingStepSchema = z.object({
  step: z.coerce.number().int().min(0).max(5),
  /** Mark the first-report request timestamp (step 5). */
  requestFirstReport: z.coerce.boolean().optional(),
});

/** Persist the SEO onboarding step (and optional first-report request stamp). */
export async function saveSeoOnboardingStep(form: FormData): Promise<ActionResult> {
  const { orgId, userId } = await requireRole("manager");
  const parsed = OnboardingStepSchema.safeParse({
    step: form.get("step"),
    requestFirstReport: form.get("requestFirstReport") ?? undefined,
  });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const { step, requestFirstReport } = parsed.data;

  try {
    await withTenant(orgId, async (tx) => {
      await tx.organization.update({
        where: { id: orgId },
        data: {
          seoOnboardingStep: step,
          ...(requestFirstReport ? { seoFirstReportRequestedAt: new Date() } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.onboarding.step_saved",
          resourceType: "organization",
          resourceId: orgId,
          afterData: { seoOnboardingStep: step },
        },
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "unmigrated" };
    logger.error({ orgId, event: "seo.action.onboarding_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

// ─────────────────────────── Tracking keywords ───────────────────────────

const KeywordsSchema = z.object({
  establishmentId: z.string().uuid().optional(),
  /** Comma/newline-separated keyword list. */
  keywords: z.string().max(2000),
  geo: z.string().max(120).optional(),
});

/**
 * Seed the tracked keyword set. Writes one `KeywordRank` row per keyword with a
 * null position (placeholder until the rank-tracker cron fills it). PAID.
 */
export async function setTrackingKeywords(form: FormData): Promise<ActionResult<{ count: number }>> {
  const { orgId, userId } = await requireRole("manager");
  await assertEntitled(orgId);
  const parsed = KeywordsSchema.safeParse({
    establishmentId: form.get("establishmentId") ?? undefined,
    keywords: form.get("keywords") ?? "",
    geo: form.get("geo") ?? undefined,
  });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };

  const keywords = [
    ...new Set(
      parsed.data.keywords
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 120),
    ),
  ].slice(0, 50);
  if (keywords.length === 0) return { ok: false, reason: "invalid_input" };

  try {
    await withTenant(orgId, async (tx) => {
      const now = new Date();
      await tx.keywordRank.createMany({
        data: keywords.map((keyword) => ({
          organizationId: orgId,
          establishmentId: parsed.data.establishmentId ?? null,
          keyword,
          position: null,
          inLocalPack: false,
          geo: parsed.data.geo ?? null,
          provider: "manual",
          checkedAt: now,
        })),
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.keywords.set",
          resourceType: "organization",
          resourceId: orgId,
          afterData: { count: keywords.length, geo: parsed.data.geo ?? null },
        },
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true, data: { count: keywords.length } };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "unmigrated" };
    logger.error({ orgId, event: "seo.action.keywords_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

// ─────────────────────────── Competitors ───────────────────────────

const AddCompetitorSchema = z.object({
  establishmentId: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  googlePlaceId: z.string().max(200).optional(),
  websiteUrl: z.string().url().max(500).optional().or(z.literal("")),
});

/** Add a tracked competitor (cap 3, enforced here not in DB). PAID. */
export async function addCompetitor(form: FormData): Promise<ActionResult<{ id: string }>> {
  const { orgId, userId } = await requireRole("manager");
  await assertEntitled(orgId);
  const parsed = AddCompetitorSchema.safeParse({
    establishmentId: form.get("establishmentId") ?? undefined,
    name: form.get("name") ?? "",
    googlePlaceId: form.get("googlePlaceId") ?? undefined,
    websiteUrl: form.get("websiteUrl") ?? undefined,
  });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };

  try {
    const result = await withTenant(orgId, async (tx) => {
      const count = await tx.competitor.count({
        where: parsed.data.establishmentId
          ? { establishmentId: parsed.data.establishmentId }
          : {},
      });
      if (count >= COMPETITOR_CAP) return { capped: true as const };

      const created = await tx.competitor.create({
        data: {
          organizationId: orgId,
          establishmentId: parsed.data.establishmentId ?? null,
          name: parsed.data.name,
          googlePlaceId: parsed.data.googlePlaceId ?? null,
          websiteUrl: parsed.data.websiteUrl || null,
          addedById: userId,
          keywordGap: [],
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.competitor.added",
          resourceType: "competitor",
          resourceId: created.id,
          afterData: { name: parsed.data.name },
        },
      });
      return { capped: false as const, id: created.id };
    });

    if (result.capped) return { ok: false, reason: "cap_reached" };
    revalidatePath(REVALIDATE);
    return { ok: true, data: { id: result.id } };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "unmigrated" };
    logger.error({ orgId, event: "seo.action.add_competitor_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

const RemoveCompetitorSchema = z.object({ id: z.string().uuid() });

/** Remove a tracked competitor. PAID. */
export async function removeCompetitor(form: FormData): Promise<ActionResult> {
  const { orgId, userId } = await requireRole("manager");
  await assertEntitled(orgId);
  const parsed = RemoveCompetitorSchema.safeParse({ id: form.get("id") });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };

  try {
    await withTenant(orgId, async (tx) => {
      await tx.competitor.deleteMany({ where: { id: parsed.data.id } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.competitor.removed",
          resourceType: "competitor",
          resourceId: parsed.data.id,
        },
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "unmigrated" };
    logger.error({ orgId, event: "seo.action.remove_competitor_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

// ─────────────────────────── On-demand refresh ───────────────────────────

/**
 * "Generate now" / refresh-on-demand — enqueues the SAME work the cron does for
 * THIS org (synchronously, since it's a single org). PAID. Returns ok even when
 * adapters no-op (reputation-only snapshot still written).
 */
export async function requestSeoRefresh(): Promise<ActionResult> {
  const { orgId, userId } = await requireRole("manager");
  await assertEntitled(orgId);

  try {
    const ok = await refreshOrg(orgId, { force: true });
    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.refresh.requested",
          resourceType: "organization",
          resourceId: orgId,
          afterData: { ok },
        },
      });
    }).catch(() => {});
    revalidatePath(REVALIDATE);
    return ok ? { ok: true } : { ok: false, reason: "unmigrated" };
  } catch (err) {
    logger.error({ orgId, event: "seo.action.refresh_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

/** Regenerate just the AI executive summary on the latest snapshot. PAID. */
export async function regenerateExecSummary(): Promise<ActionResult> {
  const { orgId } = await requireRole("manager");
  await assertEntitled(orgId);
  const { generateExecSummary } = await import("./exec-summary");
  try {
    const exec = await generateExecSummary(orgId, 30);
    await withTenant(orgId, async (tx) => {
      const latest = await tx.seoSnapshot.findFirst({
        orderBy: { generatedAt: "desc" },
        select: { id: true },
      });
      if (latest) {
        await tx.seoSnapshot.update({
          where: { id: latest.id },
          data: { execSummary: exec.summary },
        });
      }
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "unmigrated" };
    logger.error({ orgId, event: "seo.action.regen_summary_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

// ─────────────────────────── Geo-post scheduling ───────────────────────────

const GeoPostSchema = z.object({
  establishmentId: z.string().uuid().optional(),
  keyword: z.string().max(120).optional(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  area: z.string().max(120).optional(),
  /** When to publish; default in ~1 hour. */
  runAt: z.string().datetime().optional(),
});

/**
 * Save a geo-tagged GBP post from a grid cell as a **Social composer draft**. PAID.
 *
 * HONESTY NOTE: this used to enqueue a generic `scheduled_post` job and report
 * "Scheduled" — but that job's handler is a foundation no-op stub, so the post
 * was NEVER published (silent dead-end). The geo payload carries only coords +
 * keyword (no caption / platforms / media), so there is nothing the real social
 * dispatch path (`lib/social/dispatch.ts`, which acts on an existing
 * `SocialPost` row) could publish without reimplementing Post Creator.
 *
 * So instead we create a real, reviewable `SocialPost` **draft** — the actual
 * entity the working social queue drains — pre-seeded with the geo context, and
 * return `status:"draft"`. The post does NOT auto-publish; the user finishes and
 * publishes/schedules it in the Social composer. The flow no longer claims
 * something that doesn't happen.
 */
export async function scheduleGeoPost(form: FormData): Promise<GeoPostResult> {
  const { orgId, userId } = await requireRole("manager");
  await assertEntitled(orgId);
  const parsed = GeoPostSchema.safeParse({
    establishmentId: form.get("establishmentId") ?? undefined,
    keyword: form.get("keyword") ?? undefined,
    lat: form.get("lat"),
    lng: form.get("lng"),
    area: form.get("area") ?? undefined,
    runAt: form.get("runAt") ?? undefined,
  });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };

  const { lat, lng, area, keyword, establishmentId } = parsed.data;
  const locationLabel = area ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  const captionSeed = [
    keyword
      ? `Post idea for "${keyword}" near ${locationLabel}.`
      : `Local geo-post idea near ${locationLabel}.`,
    "",
    "Drafted from your SEO geo-grid to help you rank in this area. Add your copy and photo, pick platforms, then publish or schedule.",
  ].join("\n");

  try {
    const id = await withTenant(orgId, async (tx) => {
      const created = await tx.socialPost.create({
        data: {
          organizationId: orgId,
          establishmentId: establishmentId ?? null,
          // No platforms pre-selected — the user chooses in the composer. A draft
          // with no platforms can never be picked up by the dispatch cron.
          platforms: [],
          caption: captionSeed,
          hashtags: keyword ? [`#${keyword.replace(/\s+/g, "")}`] : [],
          status: "draft",
          // Explicitly NOT scheduled: never set scheduledFor, so the
          // dispatch-social-posts cron will never auto-fire this row.
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.geo_post.drafted",
          resourceType: "social_post",
          resourceId: created.id,
          afterData: { lat, lng, area: area ?? null, keyword: keyword ?? null },
        },
      });
      return created.id;
    });
    revalidatePath(REVALIDATE);
    revalidatePath("/social/posts");
    return { ok: true, status: "draft", data: { id } };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false, reason: "unmigrated" };
    logger.error({ orgId, event: "seo.action.geo_post_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}

// ─────────────────────────── Dismiss recommendation ───────────────────────────

const DismissSchema = z.object({ key: z.string().max(200) });

/**
 * Dismiss a recommendation card. Recommendations are computed (not stored), so
 * the dismissal is a cosmetic per-user signal recorded to the audit log; the UI
 * also keeps a local hide. No paid gate (it's a UI preference).
 */
export async function dismissRecommendation(form: FormData): Promise<ActionResult> {
  const { orgId, userId } = await requireRole("manager");
  const parsed = DismissSchema.safeParse({ key: form.get("key") });
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  try {
    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "seo.recommendation.dismissed",
          resourceType: "recommendation",
          resourceId: parsed.data.key.slice(0, 64),
        },
      });
    });
    return { ok: true };
  } catch (err) {
    logger.warn({ orgId, event: "seo.action.dismiss_failed", error: String(err) });
    return { ok: false, reason: "error" };
  }
}
