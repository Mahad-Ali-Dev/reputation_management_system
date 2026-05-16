"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

const HoursSchema = z.object({
  monday:    z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
  tuesday:   z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
  wednesday: z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
  thursday:  z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
  friday:    z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
  saturday:  z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
  sunday:    z.object({ open: z.string().optional(), close: z.string().optional() }).optional(),
});

const Schema = z.object({
  businessOverview: z.string().max(2000).optional(),
  servicesProducts: z.string().max(2000).optional(),
  pricingDetails: z.string().max(2000).optional(),
  aiPersonalityStyle: z.enum(["friendly", "professional", "playful", "concise"]).optional(),
  customerInquiryStyle: z.string().max(100).optional(),
  bookingStyle: z.string().max(100).optional(),
  complaintStyle: z.string().max(100).optional(),
  supportStyle: z.string().max(100).optional(),
  customPrompt: z.string().max(3000).optional(),
});

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

export async function saveAiTraining(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = Schema.safeParse({
    businessOverview: (form.get("businessOverview") as string) || undefined,
    servicesProducts: (form.get("servicesProducts") as string) || undefined,
    pricingDetails: (form.get("pricingDetails") as string) || undefined,
    aiPersonalityStyle: (form.get("aiPersonalityStyle") as string) || undefined,
    customerInquiryStyle: (form.get("customerInquiryStyle") as string) || undefined,
    bookingStyle: (form.get("bookingStyle") as string) || undefined,
    complaintStyle: (form.get("complaintStyle") as string) || undefined,
    supportStyle: (form.get("supportStyle") as string) || undefined,
    customPrompt: (form.get("customPrompt") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  // Parse hours from form
  const hours: Record<string, { open?: string; close?: string }> = {};
  for (const day of DAYS) {
    const open = (form.get(`${day}.open`) as string)?.trim();
    const close = (form.get(`${day}.close`) as string)?.trim();
    if (open || close) {
      hours[day] = { open: open || undefined, close: close || undefined };
    }
  }
  const hoursParsed = HoursSchema.safeParse(hours);
  if (!hoursParsed.success) throw new Error("Invalid hours format");

  await withTenant(orgId, async (tx) => {
    const existing = await tx.aiTrainingProfile.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) {
      await tx.aiTrainingProfile.update({
        where: { organizationId: orgId },
        data: {
          businessOverview: parsed.data.businessOverview ?? null,
          servicesProducts: parsed.data.servicesProducts ?? null,
          operatingHours: hoursParsed.data,
          pricingDetails: parsed.data.pricingDetails ?? null,
          aiPersonalityStyle: parsed.data.aiPersonalityStyle ?? "friendly",
          customerInquiryStyle: parsed.data.customerInquiryStyle ?? "warm_intro_quick_qualification",
          bookingStyle: parsed.data.bookingStyle ?? "propose_time_slots",
          complaintStyle: parsed.data.complaintStyle ?? "apologize_propose_fix",
          supportStyle: parsed.data.supportStyle ?? "check_in_after_purchase",
          customPrompt: parsed.data.customPrompt ?? null,
        },
      });
    } else {
      await tx.aiTrainingProfile.create({
        data: {
          organizationId: orgId,
          businessOverview: parsed.data.businessOverview ?? null,
          servicesProducts: parsed.data.servicesProducts ?? null,
          operatingHours: hoursParsed.data,
          pricingDetails: parsed.data.pricingDetails ?? null,
          aiPersonalityStyle: parsed.data.aiPersonalityStyle ?? "friendly",
          customerInquiryStyle: parsed.data.customerInquiryStyle ?? "warm_intro_quick_qualification",
          bookingStyle: parsed.data.bookingStyle ?? "propose_time_slots",
          complaintStyle: parsed.data.complaintStyle ?? "apologize_propose_fix",
          supportStyle: parsed.data.supportStyle ?? "check_in_after_purchase",
          customPrompt: parsed.data.customPrompt ?? null,
        },
      });
    }
  });

  revalidatePath("/ai/training");
}
