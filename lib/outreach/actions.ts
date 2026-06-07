"use server";

import { createHmac } from "node:crypto";
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { generateSlug, googleReviewUrl } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { getHmacSecret } from "@/lib/secrets";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dispatchReviewRequest } from "./dispatch";
import { hasSmsConsent, isUnsubscribed, recordSmsConsent } from "./suppression";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Body = z.object({
  establishmentId: z.string().uuid(),
  channel: z.enum(["sms", "email"]),
  recipient: z.string().min(3).max(200),
  recipientName: z.string().max(120).optional(),
  scheduleHours: z.coerce.number().int().min(0).max(720).optional().default(0),
  consentAttested: z.coerce.boolean().optional(), // required for SMS
  customBody: z.string().max(4000).optional(), // override default template body
  // Optional OutreachTemplate to hydrate body/subject/logo from at send time.
  // NOTE (FK correctness): this is an OutreachTemplate.id and is passed through
  // to dispatch as `outreachTemplateId` — it is NEVER written to
  // ReviewRequest.templateId (which is a FK → ReviewRequestTemplate).
  outreachTemplateId: z.string().uuid().optional(),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

/**
 * Server action: create + dispatch a review request.
 * - SMS: requires TCPA consent + checks unsubscribe list + sends via Twilio
 * - Email: uses Resend, adds List-Unsubscribe header
 */
export async function createReviewRequest(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  // Outreach sends incur SMS/email cost — gate on an active plan.
  await assertEntitled(orgId);

  const parsed = Body.safeParse({
    establishmentId: form.get("establishmentId"),
    channel: form.get("channel"),
    recipient: form.get("recipient"),
    recipientName: form.get("recipientName") || undefined,
    scheduleHours: form.get("scheduleHours") ?? 0,
    consentAttested: form.get("consentAttested") === "on",
    customBody: (form.get("customBody") as string) || undefined,
    outreachTemplateId: (form.get("outreachTemplateId") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  // Normalize + validate recipient by channel
  const recipient = data.recipient.trim();
  if (data.channel === "sms" && !PHONE_RE.test(recipient)) {
    throw new Error("SMS recipient must be E.164 format, e.g. +15551234567");
  }
  if (data.channel === "email" && !EMAIL_RE.test(recipient)) {
    throw new Error("Invalid email address");
  }

  // Unsubscribe check (hard block — required for compliance)
  if (await isUnsubscribed({ channel: data.channel, recipient, organizationId: orgId })) {
    throw new Error("This recipient has unsubscribed from " + data.channel);
  }

  // SMS: TCPA consent required
  if (data.channel === "sms") {
    const hasConsent = await hasSmsConsent({ organizationId: orgId, phoneE164: recipient });
    if (!hasConsent) {
      if (!data.consentAttested) {
        throw new Error(
          "TCPA consent required. Confirm you have prior express written consent from this recipient by checking the attestation box.",
        );
      }
      // Record consent based on the user's attestation
      await recordSmsConsent({
        organizationId: orgId,
        phoneE164: recipient,
        consentText:
          "Tenant user attested prior consent via the dashboard send-form. Recipient previously agreed to receive SMS marketing.",
        source: "imported_with_attestation",
      });
    }
  }

  // Load establishment for Google place + name
  const estab = await withTenant(orgId, async (tx) => {
    return tx.establishment.findFirst({
      where: { id: data.establishmentId, deletedAt: null },
      select: { id: true, name: true, googlePlaceId: true },
    });
  });
  if (!estab) throw new Error("Establishment not found");

  // Build tracked review link (uses our /r/{slug} edge redirect for attribution)
  const trackingSlug = generateSlug();
  const reviewLink = `${APP_URL}/r/${trackingSlug}`;
  const reviewTarget = googleReviewUrl(estab.googlePlaceId, estab.name);

  // Note: we don't currently auto-provision a Device row for review-request slugs. For Day 6 v1
  // we just point /r/{slug} at the Google review URL by stashing it in raw redirect storage.
  // Day 7+: unify with the device redirect or use a separate review_request_links table.
  // For now, fall back to direct google URL in the email/SMS body and skip the wrapped link.
  const effectiveLink = reviewTarget;

  const scheduledFor = new Date(Date.now() + data.scheduleHours * 60 * 60 * 1000);
  const unsubscribeUrl = `${APP_URL}/u?${buildUnsubToken(orgId, data.channel, recipient)}`;

  // Insert review_request row
  const rr = await withTenant(orgId, async (tx) => {
    const created = await tx.reviewRequest.create({
      data: {
        organizationId: orgId,
        establishmentId: estab.id,
        channel: data.channel,
        recipient,
        recipientName: data.recipientName ?? null,
        shortSlug: trackingSlug,
        scheduledFor,
        // Scheduled = future-dated, picked up by the cron at scheduledFor.
        // Queued (zero delay) = ready for immediate dispatch by the worker.
        status: data.scheduleHours > 0 ? "scheduled" : "queued",
        triggerSource: "manual",
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review_request.created",
        resourceType: "review_request",
        resourceId: created.id,
        afterData: { channel: data.channel, recipient, scheduledFor: scheduledFor.toISOString() },
      },
    });
    return created;
  });

  // Send now if no delay
  if (data.scheduleHours === 0) {
    // Race-safe claim (queued → sending) BEFORE dispatching, identical to the
    // dispatch cron. Without this, a cron tick firing between row creation and
    // the inline send could claim the same queued row and double-send.
    const claimed = await withTenant(orgId, (tx) =>
      tx.reviewRequest.updateMany({
        where: { id: rr.id, status: "queued" },
        data: { status: "sending" },
      }),
    );
    if (claimed.count > 0) {
      await dispatchReviewRequest(rr.id, orgId, {
        reviewLink: effectiveLink,
        unsubscribeUrl,
        businessName: estab.name,
        customBody: data.customBody,
        outreachTemplateId: data.outreachTemplateId,
      });
    }
  } else {
    logger.info(
      { orgId, reviewRequestId: rr.id, scheduledFor, event: "review_request.scheduled" },
      "review request scheduled — worker will dispatch",
    );
  }

  revalidatePath("/outreach");
}

/**
 * Server action: re-queue an already-sent (or failed/bounced) review request so
 * the dispatch cron sends it again. Used by the Sent-History "Resend" button.
 *
 * We re-queue the EXISTING row (`status:"queued"`, `scheduledFor:now`) rather than
 * cloning it, so history stays a single stream. The cron's race-safe claim then
 * picks it up. Suppression is re-checked at send time only implicitly — so we also
 * hard-block here if the recipient has since unsubscribed.
 */
export async function resendReviewRequest(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  await assertEntitled(orgId);
  const id = z.string().uuid().parse(form.get("id"));

  const rr = await withTenant(orgId, (tx) =>
    tx.reviewRequest.findUnique({
      where: { id },
      select: { id: true, channel: true, recipient: true },
    }),
  );
  if (!rr) throw new Error("review_request_not_found");

  const channel = rr.channel === "sms" ? "sms" : "email";
  if (await isUnsubscribed({ channel, recipient: rr.recipient, organizationId: orgId })) {
    throw new Error(`This recipient has unsubscribed from ${channel}`);
  }

  await withTenant(orgId, (tx) =>
    tx.reviewRequest.update({
      where: { id },
      data: { status: "queued", scheduledFor: new Date(), error: null },
    }),
  );

  logger.info({ orgId, reviewRequestId: id, event: "review_request.resend_queued" });
  revalidatePath("/outreach");
}

/**
 * Build a signed unsubscribe token. Used in email List-Unsubscribe header.
 * Format: orgId.channel.recipient.signature (base64url)
 */
function buildUnsubToken(orgId: string, channel: string, recipient: string): string {
  // Fail-closed in production via lib/secrets.ts — never use a public fallback.
  const secret = getHmacSecret();
  const payload = `${orgId}|${channel}|${recipient}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `t=${Buffer.from(payload).toString("base64url")}&s=${sig}`;
}
