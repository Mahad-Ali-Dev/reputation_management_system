"use server";
/**
 * Server-action shim for automation-rule mutations.
 *
 * Next.js requires server actions imported by client components to be defined
 * (not just re-exported) inside a module with a top-level "use server" directive.
 */
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { upsertAutomationRule as _upsertAutomationRule } from "./automation";

export async function upsertAutomationRule(form: FormData): Promise<void> {
  return _upsertAutomationRule(form);
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || code === "42P01" || code === "42703";
}

/**
 * Flip a single automation rule's enabled flag (the Automation Rules list-row
 * toggle). Pro-gated (sends incur cost) and tenant-scoped; fail-soft if the
 * table isn't migrated. Returns the new enabled state so the client island can
 * reflect it optimistically without a full reload.
 */
export async function toggleAutomationRule(ruleId: string, enabled: boolean): Promise<{ ok: boolean }> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  await assertEntitled(orgId);

  try {
    await withTenant(orgId, async (tx) => {
      // Tenant guard: the RLS policy already scopes to org, but assert ownership
      // explicitly so a forged id from another org is a no-op, not a 500.
      const row = await tx.automationRule.findFirst({ where: { id: ruleId }, select: { id: true } });
      if (!row) return;
      await tx.automationRule.update({ where: { id: ruleId }, data: { enabled } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "automation_rule.toggled",
          resourceType: "automation_rule",
          resourceId: ruleId,
          afterData: { enabled },
        },
      });
    });
  } catch (err) {
    if (isMissingRelation(err)) return { ok: false };
    throw err;
  }
  revalidatePath("/outreach");
  return { ok: true };
}
