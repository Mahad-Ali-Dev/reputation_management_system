"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

/**
 * Dismiss the onboarding wizard. We set onboardingStep to a sentinel value (99)
 * so we never show the wizard again, even if the user later creates establishments
 * and clears later checkpoints.
 */
export async function dismissOnboarding(): Promise<void> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");

  await withTenant(orgId, async (tx) => {
    await tx.organization.update({
      where: { id: orgId },
      data: { onboardingStep: 99 },
    });
  });
  revalidatePath("/dashboard");
}

/**
 * Mark a specific onboarding step complete. We take the max with the existing
 * value so we never go backwards (defensive against a user re-clicking an early
 * step's CTA after they've already finished later ones).
 *
 * Implemented as a single SQL UPDATE with GREATEST() so we don't need a
 * read-then-write race window.
 */
export async function advanceOnboardingTo(step: number): Promise<void> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  if (!Number.isInteger(step) || step < 0 || step > 98) return;

  await withTenant(orgId, async (tx) => {
    await tx.$executeRaw`
      UPDATE organizations
      SET onboarding_step = GREATEST(COALESCE(onboarding_step, 0), ${step})
      WHERE id = ${orgId}::uuid
    `;
  });
  revalidatePath("/dashboard");
}
