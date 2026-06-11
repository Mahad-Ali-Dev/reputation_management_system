"use server";

import { auth } from "@/lib/auth/config";
import { assertEntitled, PlanInactiveError } from "@/lib/billing/entitlements";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { withTenant } from "@/lib/db/with-tenant";
import { generateSlug } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MAX_CSV_BYTES, parseRecipientsCsv, previewBulkRecipients } from "./bulk";
import { recordSmsConsent } from "./suppression";

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
 * Result contract for the bulk commit. Every expected failure (bad CSV, wrong
 * channel for the pasted values, plan gating, all-suppressed) returns an
 * inline-renderable error — the old throwing version crashed the whole
 * /outreach/bulk page with a digest (bug 011 in the June 2026 assessment).
 */
export type BulkCommitResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

/**
 * Commit a bulk send: parse CSV, suppress unsubs and recent contacts, insert
 * review_requests in batch, audit, and (for SMS) record consent.
 *
 * Delivery itself relies on the existing per-request scheduled-send cron worker.
 */
export async function commitBulkReviewRequests(form: FormData): Promise<BulkCommitResult> {
  try {
  const { orgId, userId } = await requireOrg();
  // Bulk outreach incurs SMS/email cost — gate on an active plan.
  await assertEntitled(orgId);

  const parsed = BulkInput.safeParse({
    establishmentId: form.get("establishmentId"),
    channel: form.get("channel"),
    csvText: form.get("csvText"),
    scheduleHours: form.get("scheduleHours") ?? 0,
    consentAttested: form.get("consentAttested") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: `Check the form: ${parsed.error.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join("; ")}`,
    };
  }

  const { establishmentId, channel, csvText, scheduleHours, consentAttested } = parsed.data;

  const estab = await withTenant(orgId, async (tx) =>
    tx.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { id: true },
    }),
  );
  if (!estab) return { ok: false, error: "Establishment not found." };

  const { rows } = parseRecipientsCsv({ csvText, channel });
  if (rows.length === 0) {
    return {
      ok: false,
      error:
        channel === "email"
          ? "No valid email recipients found. Each line needs an email address (you may have pasted phone numbers — switch the channel to SMS)."
          : "No valid SMS recipients found. Each line needs an E.164 phone like +15551234567 (you may have pasted emails — switch the channel to Email).",
    };
  }

  if (channel === "sms" && !consentAttested) {
    return {
      ok: false,
      error:
        "TCPA consent required. You must attest that every recipient in this list has previously given written consent to receive SMS marketing.",
    };
  }

  const preview = await previewBulkRecipients({ orgId, channel, rows });
  if (preview.valid.length === 0) {
    return {
      ok: false,
      error: `All ${rows.length} recipients are either unsubscribed or were contacted within the last 30 days.`,
    };
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

  // Auto-capture each bulk recipient into the Contact directory. Fire-and-forget
  // + fail-soft (the hook never throws and dedupes internally) so it can't break
  // / slow the bulk commit. Sourced as "csv" — a weak source that the hook will
  // upgrade later if the same person leaves a real review. The (org, channel,
  // recipient) externalRef keeps re-uploads idempotent.
  for (const r of preview.valid) {
    captureContactInBackground({
      orgId,
      source: "csv",
      email: channel === "email" ? r.recipient : null,
      phone: channel === "sms" ? r.recipient : null,
      name: r.recipientName,
      establishmentId,
      activity: {
        title: "Imported via bulk review-request CSV",
        externalRef: `outreach-csv:${channel}:${r.recipient}`,
      },
    });
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
  return {
    ok: true,
    inserted: preview.valid.length,
    skipped: preview.unsubscribed.length + preview.alreadyContacted.length,
  };
  } catch (err) {
    // requireOrg's /login redirect is Next control flow — let it propagate.
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;

    if (err instanceof PlanInactiveError) {
      return { ok: false, error: "Bulk review requests are a paid feature — upgrade to send them." };
    }
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") {
      return {
        ok: false,
        error: "Outreach isn't provisioned yet — ask your admin to apply the latest database migration.",
      };
    }
    logger.error({
      event: "review_request.bulk_commit_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Could not queue the bulk send. Try again." };
  }
}
