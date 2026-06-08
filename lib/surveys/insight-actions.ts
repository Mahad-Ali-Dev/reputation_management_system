"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { assertEntitled, PlanInactiveError } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";
import { generateSurveyInsights, type RefreshInsightsResult } from "./insights";

/**
 * `"use server"` wrapper for the AI Insights "Refresh Analysis" button (Module
 * 11). Gates with `requireRole("manager")` + `assertEntitled` (paid feature),
 * runs the generator, and revalidates the surveys page.
 *
 * This file exports ONLY the async action; `RefreshInsightsResult` lives in the
 * plain `./insights` module. Gated / not-entitled / no-key / budget all degrade
 * gracefully (never throw to the user).
 */
export async function refreshSurveyInsightsAction(): Promise<RefreshInsightsResult> {
  const { orgId } = await requireRole("manager");

  // Entitlement (paid feature). Surface a typed result rather than a thrown
  // error so the panel can show the upgrade affordance.
  try {
    await assertEntitled(orgId);
  } catch (err) {
    if (err instanceof PlanInactiveError) {
      return { ok: false, reason: "not_entitled", insights: [] };
    }
    throw err;
  }

  const result = await generateSurveyInsights(orgId);
  revalidatePath("/surveys");

  if (result.ok && result.gated) {
    return { ok: true, gated: true, generatedAt: null, insights: [] };
  }
  if (result.ok) {
    return {
      ok: true,
      gated: false,
      generatedAt: result.generatedAt.toISOString(),
      insights: result.insights,
    };
  }
  logger.warn({ orgId, reason: result.reason, event: "survey.insights.refresh_degraded" });
  return { ok: false, reason: result.reason, insights: result.insights };
}
