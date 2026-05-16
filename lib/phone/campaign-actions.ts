"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { parseRecipientsCsv } from "@/lib/outreach/bulk";
import { logger } from "@/lib/logger";

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

const CampaignSchema = z.object({
  name: z.string().min(1).max(120),
  purpose: z.enum(["review_request", "nps_survey", "win_back", "custom"]),
  script: z.string().max(2000).optional(),
  phoneNumberId: z.string().uuid(),
  scheduledFor: z.string().datetime().optional(),
  callWindowStart: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  callWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).default("20:00"),
  callWindowTimezone: z.string().max(40).default("America/New_York"),
  ratePerMinute: z.coerce.number().int().min(1).max(50).default(5),
  csvText: z.string().min(1).max(2_000_000),
  consentAttested: z.coerce.boolean().default(false),
});

/**
 * Create a campaign + populate targets from CSV.
 *
 * TCPA: caller must attest prior consent for every recipient. We record this
 * timestamp on each target row.
 */
export async function createOutboundCampaign(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = CampaignSchema.safeParse({
    name: form.get("name"),
    purpose: form.get("purpose"),
    script: (form.get("script") as string) || undefined,
    phoneNumberId: form.get("phoneNumberId"),
    scheduledFor: (form.get("scheduledFor") as string) || undefined,
    callWindowStart: form.get("callWindowStart") ?? "09:00",
    callWindowEnd: form.get("callWindowEnd") ?? "20:00",
    callWindowTimezone: form.get("callWindowTimezone") ?? "America/New_York",
    ratePerMinute: form.get("ratePerMinute") ?? 5,
    csvText: form.get("csvText"),
    consentAttested: form.get("consentAttested") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  if (!parsed.data.consentAttested) {
    throw new Error("TCPA consent required. You must attest every recipient has given prior consent.");
  }

  // Parse targets
  const { rows } = parseRecipientsCsv({ csvText: parsed.data.csvText, channel: "sms" });
  if (rows.length === 0) throw new Error("No valid phone numbers in CSV");

  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : new Date();
  const consentAt = new Date();

  await withTenant(orgId, async (tx) => {
    const campaign = await tx.phoneCampaign.create({
      data: {
        organizationId: orgId,
        phoneNumberId: parsed.data.phoneNumberId,
        name: parsed.data.name,
        purpose: parsed.data.purpose,
        status: "draft",
        script: parsed.data.script ?? null,
        callWindowStart: new Date(`1970-01-01T${parsed.data.callWindowStart}:00.000Z`),
        callWindowEnd: new Date(`1970-01-01T${parsed.data.callWindowEnd}:00.000Z`),
        callWindowTimezone: parsed.data.callWindowTimezone,
        callWindowDays: ["mon", "tue", "wed", "thu", "fri"],
        ratePerMinute: parsed.data.ratePerMinute,
        totalTargets: rows.length,
        scheduledFor,
      },
    });

    // Bulk insert instead of N round-trips. For 5k rows the prior code was
    // sending 5k INSERT statements; createMany is a single COPY.
    if (rows.length > 0) {
      await tx.phoneCampaignTarget.createMany({
        data: rows.map((r) => ({
          campaignId: campaign.id,
          organizationId: orgId,
          toE164: r.recipient,
          attendeeName: r.recipientName,
          scheduledFor,
          consentAttestedAt: consentAt,
        })),
      });
    }
  });

  logger.info(
    { event: "phone.campaign.created", orgId, name: parsed.data.name, targets: rows.length },
    "outbound campaign created",
  );

  revalidatePath("/phone/campaigns");
}

const StatusSchema = z.object({
  id: z.string().uuid(),
});

export async function startCampaign(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = StatusSchema.parse({ id: form.get("id") }).id;
  await withTenant(orgId, async (tx) => {
    await tx.phoneCampaign.update({
      where: { id },
      data: { status: "running", startedAt: new Date() },
    });
  });
  revalidatePath("/phone/campaigns");
}

export async function pauseCampaign(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = StatusSchema.parse({ id: form.get("id") }).id;
  await withTenant(orgId, async (tx) => {
    await tx.phoneCampaign.update({
      where: { id },
      data: { status: "paused" },
    });
  });
  revalidatePath("/phone/campaigns");
}

export async function deleteCampaign(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = StatusSchema.parse({ id: form.get("id") }).id;
  await withTenant(orgId, async (tx) => {
    await tx.phoneCampaign.delete({ where: { id } });
  });
  revalidatePath("/phone/campaigns");
}
