"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  QUESTION_TYPES,
  type SaveTemplateInput,
  type SaveTemplateResult,
  mergeBrandingIntoIncentive,
} from "./templates";

/**
 * `"use server"` actions for the survey template editor (Module 11).
 *
 * `saveSurveyTemplate` persists the question set (replace-all `SurveyQuestion`
 * rows, re-numbered by position) + name + branding (into `incentive.branding`).
 * `manager` tier; tenant-scoped; audit-logged.
 *
 * Note: editing questions on a template with existing responses is allowed but
 * the editor warns; answers reference question rows by id, so a destructive
 * replace orphans nothing critical (answers cascade with the campaign, not the
 * question). We keep it simple here and just replace.
 */

const QuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(1).max(300),
  required: z.boolean(),
  choices: z.array(z.string().min(1).max(120)).max(12).optional(),
});

const SaveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  questions: z.array(QuestionSchema).min(1).max(20),
  branding: z.object({
    primaryColor: z.string().max(32).optional(),
    greeting: z.string().max(300).optional(),
    thankYou: z.string().max(300).optional(),
    logoUrl: z.string().url().max(500).optional().or(z.literal("")),
  }),
});

export async function saveSurveyTemplate(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const { orgId, userId } = await requireRole("manager");

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const data = parsed.data;

  // Normalize branding: drop empty logo string.
  const branding = {
    primaryColor: data.branding.primaryColor || undefined,
    greeting: data.branding.greeting || undefined,
    thankYou: data.branding.thankYou || undefined,
    logoUrl: data.branding.logoUrl || undefined,
  };

  try {
    await withTenant(orgId, async (tx) => {
      const campaign = await tx.surveyCampaign.findFirst({
        where: { id: data.id },
        select: { id: true, incentive: true },
      });
      if (!campaign) throw new Error("not_found");

      // Update name + branding (preserving coupon fields on incentive).
      await tx.surveyCampaign.update({
        where: { id: data.id },
        data: {
          name: data.name,
          incentive: mergeBrandingIntoIncentive(campaign.incentive, branding) as Prisma.InputJsonValue,
        },
      });

      // Replace-all questions, re-numbered.
      await tx.surveyQuestion.deleteMany({ where: { campaignId: data.id } });
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i]!;
        await tx.surveyQuestion.create({
          data: {
            campaignId: data.id,
            position: i + 1,
            type: q.type,
            prompt: q.prompt,
            required: q.required,
            options: q.type === "multichoice" && q.choices ? { choices: q.choices } : undefined,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "survey_template.saved",
          resourceType: "survey_campaign",
          resourceId: data.id,
          afterData: { questionCount: data.questions.length },
        },
      });
    });

    revalidatePath("/surveys/templates");
    revalidatePath(`/surveys/templates/${data.id}`);
    revalidatePath("/surveys");
    return { ok: true };
  } catch (err) {
    logger.error({ orgId, error: String(err), event: "survey.template.save_failed" });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save template" };
  }
}
