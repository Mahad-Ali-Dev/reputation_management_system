"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { TRIGGER_EVENTS, type AutomationActionResult, isMissingRelation } from "./automations";

/**
 * Survey Automations write actions (Module 11 — the Automations tab).
 *
 * `"use server"` — exports ONLY async server actions. The trigger enum, the row
 * type, the provider map, and the list query live in `./automations` (a plain
 * server module) so client components can import them without breaking the
 * action-only rule. Each write requires `manager` (content-write tier), runs in
 * `withTenant`, and is audit-logged. Fail-soft on un-migrated tables.
 */

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  triggerEvent: z.enum(TRIGGER_EVENTS),
  delayMinutes: z.coerce.number().int().min(0).max(43_200), // ≤ 30 days
  status: z.enum(["active", "paused"]).default("paused"),
});

/** Create or update an automation rule. */
export async function upsertSurveyAutomation(form: FormData): Promise<AutomationActionResult> {
  const { orgId, userId } = await requireRole("manager");

  const parsed = UpsertSchema.safeParse({
    id: form.get("id") || undefined,
    campaignId: form.get("campaignId") || null,
    triggerEvent: form.get("triggerEvent"),
    delayMinutes: form.get("delayMinutes") ?? 0,
    status: form.get("status") || "paused",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const data = parsed.data;

  try {
    const id = await withTenant(orgId, async (tx) => {
      if (data.id) {
        const updated = await tx.surveyAutomation.updateMany({
          where: { id: data.id },
          data: {
            campaignId: data.campaignId ?? null,
            triggerEvent: data.triggerEvent,
            delayMinutes: data.delayMinutes,
            status: data.status,
          },
        });
        if (updated.count === 0) throw new Error("not_found");
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "user",
            actorId: userId,
            action: "survey_automation.updated",
            resourceType: "survey_automation",
            resourceId: data.id,
            afterData: { triggerEvent: data.triggerEvent, status: data.status },
          },
        });
        return data.id;
      }
      const created = await tx.surveyAutomation.create({
        data: {
          organizationId: orgId,
          campaignId: data.campaignId ?? null,
          triggerEvent: data.triggerEvent,
          delayMinutes: data.delayMinutes,
          status: data.status,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "survey_automation.created",
          resourceType: "survey_automation",
          resourceId: created.id,
          afterData: { triggerEvent: data.triggerEvent, status: data.status },
        },
      });
      return created.id;
    });
    revalidatePath("/surveys");
    return { ok: true, id };
  } catch (err) {
    if (isMissingRelation(err)) {
      return { ok: false, error: "Automations aren't available yet — finish setup to enable them." };
    }
    logger.error({ orgId, error: String(err), event: "survey.automation.upsert_failed" });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save automation" };
  }
}

const ToggleSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused"]),
});

/** Flip an automation's status (active ⇄ paused). */
export async function toggleSurveyAutomation(form: FormData): Promise<AutomationActionResult> {
  const { orgId, userId } = await requireRole("manager");
  const parsed = ToggleSchema.safeParse({ id: form.get("id"), status: form.get("status") });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  try {
    await withTenant(orgId, async (tx) => {
      const updated = await tx.surveyAutomation.updateMany({
        where: { id: parsed.data.id },
        data: { status: parsed.data.status },
      });
      if (updated.count === 0) throw new Error("not_found");
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "survey_automation.toggled",
          resourceType: "survey_automation",
          resourceId: parsed.data.id,
          afterData: { status: parsed.data.status },
        },
      });
    });
    revalidatePath("/surveys");
    return { ok: true, id: parsed.data.id };
  } catch (err) {
    if (isMissingRelation(err)) {
      return { ok: false, error: "Automations aren't available yet." };
    }
    logger.error({ orgId, error: String(err), event: "survey.automation.toggle_failed" });
    return { ok: false, error: "Failed to update automation" };
  }
}

const DeleteSchema = z.object({ id: z.string().uuid() });

/** Delete an automation rule. */
export async function deleteSurveyAutomation(form: FormData): Promise<AutomationActionResult> {
  const { orgId, userId } = await requireRole("manager");
  const parsed = DeleteSchema.safeParse({ id: form.get("id") });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  try {
    await withTenant(orgId, async (tx) => {
      const deleted = await tx.surveyAutomation.deleteMany({ where: { id: parsed.data.id } });
      if (deleted.count === 0) throw new Error("not_found");
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "survey_automation.deleted",
          resourceType: "survey_automation",
          resourceId: parsed.data.id,
        },
      });
    });
    revalidatePath("/surveys");
    return { ok: true, id: parsed.data.id };
  } catch (err) {
    if (isMissingRelation(err)) {
      return { ok: false, error: "Automations aren't available yet." };
    }
    logger.error({ orgId, error: String(err), event: "survey.automation.delete_failed" });
    return { ok: false, error: "Failed to delete automation" };
  }
}
