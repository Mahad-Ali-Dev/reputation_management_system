"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { generateSlug } from "@/lib/hardware/codes";
import { recordSmsConsent } from "./suppression";
import { MAX_CSV_BYTES, parseRecipientsCsv, previewBulkRecipients } from "./bulk";

const BulkInput = z.object({
  establishmentId: z.string().uuid(),
  channel: z.enum(["sms", "email"]),
  csvText: z.string().min(1).max(MAX_CSV_BYTES),
  scheduleHours: z.coerce.number().int().min(0).max(720).default(0),
  consentAttested: z.coerce.boolean().optional(),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

/**
 * Commit a bulk send: parse CSV, suppress unsubs and recent contacts, insert
 * review_requests in batch, audit, and (for SMS) record consent.
 *
 * Delivery itself relies on the existing per-request scheduled-send cron worker.
 */
export async function commitBulkReviewRequests(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = BulkInput.safeParse({
    establishmentId: form.get("establishmentId"),
    channel: form.get("channel"),
    csvText: form.get("csvText"),
    scheduleHours: form.get("scheduleHours") ?? 0,
    consentAttested: form.get("consentAttested") === "on",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const { establishmentId, channel, csvText, scheduleHours, consentAttested } = parsed.data;

  const estab = await withTenant(orgId, async (tx) =>
    tx.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { id: true },
    }),
  );
  if (!estab) throw new Error("Establishment not found");

  const { rows } = parseRecipientsCsv({ csvText, channel });
  if (rows.length === 0) throw new Error("No valid recipients found in CSV");

  if (channel === "sms" && !consentAttested) {
    throw new Error(
      "TCPA consent required. You must attest that every recipient in this list has previously given written consent to receive SMS marketing.",
    );
  }

  const preview = await previewBulkRecipients({ orgId, channel, rows });
  if (preview.valid.length === 0) {
    throw new Error(
      `All ${rows.length} recipients are either unsubscribed or were contacted within the last 30 days.`,
    );
  }

  const scheduledFor = new Date(Date.now() + scheduleHours * 60 * 60 * 1000);

  await withTenant(orgId, async (tx) => {
    // Bulk INSERT — one statement instead of one per recipient.
    if (preview.valid.length > 0) {
      await tx.reviewRequest.createMany({
        data: preview.valid.map((r) => ({
          organizationId: orgId,
          establishmentId,
          channel,
          recipient: r.recipient,
          recipientName: r.recipientName,
          shortSlug: generateSlug(),
          scheduledFor,
          status: "queued" as const,
          triggerSource: "bulk_csv" as const,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review_request.bulk_created",
        resourceType: "review_request",
        afterData: {
          channel,
          establishmentId,
          totalRows: rows.length,
          validInserted: preview.valid.length,
          skippedUnsubscribed: preview.unsubscribed.length,
          skippedAlreadyContacted: preview.alreadyContacted.length,
          scheduledFor: scheduledFor.toISOString(),
          consentAttested,
        },
      },
    });
  });

  if (channel === "sms" && consentAttested) {
    for (const r of preview.valid) {
      await recordSmsConsent({
        organizationId: orgId,
        phoneE164: r.recipient,
        consentText:
          "Owner attested prior consent via bulk-upload form. Recipient previously agreed to receive SMS marketing per business records.",
        source: "imported_with_attestation",
      });
    }
  }

  logger.info(
    {
      event: "review_request.bulk_committed",
      orgId,
      channel,
      establishmentId,
      inserted: preview.valid.length,
      skipped: preview.unsubscribed.length + preview.alreadyContacted.length,
    },
    "bulk review-request batch committed",
  );

  revalidatePath("/outreach");
  revalidatePath("/outreach/bulk");
}
