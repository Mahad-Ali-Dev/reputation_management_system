"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
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
  locations: z.string().max(2000).optional(),
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

/**
 * Shared upsert used by both the full-form save and the autosave variant.
 * Parses the FormData, validates, and writes the AiTrainingProfile in tenant
 * context. Returns nothing; throws on validation error.
 */
async function persistTraining(orgId: string, form: FormData): Promise<void> {
  const parsed = Schema.safeParse({
    businessOverview: (form.get("businessOverview") as string) || undefined,
    servicesProducts: (form.get("servicesProducts") as string) || undefined,
    pricingDetails: (form.get("pricingDetails") as string) || undefined,
    locations: (form.get("locations") as string) || undefined,
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
    const data = {
      businessOverview: parsed.data.businessOverview ?? null,
      servicesProducts: parsed.data.servicesProducts ?? null,
      operatingHours: hoursParsed.data,
      pricingDetails: parsed.data.pricingDetails ?? null,
      locations: parsed.data.locations ?? null,
      aiPersonalityStyle: parsed.data.aiPersonalityStyle ?? "friendly",
      customerInquiryStyle: parsed.data.customerInquiryStyle ?? "warm_intro_quick_qualification",
      bookingStyle: parsed.data.bookingStyle ?? "propose_time_slots",
      complaintStyle: parsed.data.complaintStyle ?? "apologize_propose_fix",
      supportStyle: parsed.data.supportStyle ?? "check_in_after_purchase",
      customPrompt: parsed.data.customPrompt ?? null,
    };
    if (existing) {
      await tx.aiTrainingProfile.update({ where: { organizationId: orgId }, data });
    } else {
      await tx.aiTrainingProfile.create({ data: { organizationId: orgId, ...data } });
    }
  });
}

/**
 * Full-form save (non-JS fallback + explicit "Save & retrain"). Revalidates the
 * route so the readiness ribbon + tabs reflect the new state.
 */
export async function saveAiTraining(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  await assertEntitled(orgId);
  await persistTraining(orgId, form);
  revalidatePath("/ai/training");
}

/**
 * Autosave variant for the client island. Same upsert, but skips
 * revalidatePath (autosave shouldn't thrash the router) and returns JSON so the
 * tab can show a "Saved" pill without a full server round-trip re-render.
 */
export async function autosaveAiTraining(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const { orgId } = await requireOrg();
  try {
    await assertEntitled(orgId);
    await persistTraining(orgId, form);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "save_failed" };
  }
}
