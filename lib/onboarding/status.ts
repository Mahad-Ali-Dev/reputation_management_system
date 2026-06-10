/**
 * Onboarding status projection (PLAIN module — no "use server").
 *
 * Maps the most-recent OnboardingRun row to the STABLE `OnboardingStatusResponse`
 * the `/onboarding` poller + page consume. Shared by the status API route and
 * the `getOnboardingStatus` server action so both emit the identical shape.
 */

import { ONBOARDING_STEP_KEYS, type OnboardingStatusResponse } from "./constants";
import { getLatestRun } from "./run-store";

/** Build the status JSON for an org's latest run (active or finished). */
export async function buildStatusResponse(orgId: string): Promise<OnboardingStatusResponse> {
  const run = await getLatestRun(orgId);
  if (!run) {
    return { hasRun: false, run: null };
  }

  const dashboardReady = run.status === "done" || run.status === "needs_user";
  return {
    hasRun: true,
    run: {
      id: run.id,
      status: run.status,
      businessName: run.businessName,
      websiteUrl: run.websiteUrl,
      currentStep: run.currentStep,
      totalSteps: ONBOARDING_STEP_KEYS.length,
      steps: run.steps,
      suggestions: run.suggestions,
      dashboardReady,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    },
  };
}
