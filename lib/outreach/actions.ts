"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { generateSlug, googleReviewUrl } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { getHmacSecret } from "@/lib/secrets";
import { defaultReviewRequestHtml, sendReviewRequestEmail } from "./email";
import { hasSmsConsent, isUnsubscribed, recordSmsConsent } from "./suppression";
import { sendSms } from "./twilio";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Body = z.object({
  establishmentId: z.string().uuid(),
  channel: z.enum(["sms", "email"]),
  recipient: z.string().min(3).max(200),
  recipientName: z.string().max(120).optional(),
  scheduleHours: z.coerce.number().int().min(0).max(720).optional().default(0),
  consentAttested: z.coerce.boolean().optional(),  // required for SMS
  customBody: z.string().max(4000).optional(),     // override default template body
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

  const parsed = Body.safeParse({
    establishmentId: form.get("establishmentId"),
    channel: form.get("channel"),
    recipient: form.get("recipient"),
    recipientName: form.get("recipientName") || undefined,
    scheduleHours: form.get("scheduleHours") ?? 0,
    consentAttested: form.get("consentAttested") === "on",
    customBody: (form.get("customBody") as string) || undefined,
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
        status: data.scheduleHours > 0 ? "queued" : "queued",
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
    await dispatchReviewRequest(rr.id, orgId, {
      reviewLink: effectiveLink,
      unsubscribeUrl,
      businessName: estab.name,
      customBody: data.customBody,
    });
  } else {
    logger.info(
      { orgId, reviewRequestId: rr.id, scheduledFor, event: "review_request.scheduled" },
      "review request scheduled — worker will dispatch",
    );
  }

  revalidatePath("/outreach");
}

async function dispatchReviewRequest(
  reviewRequestId: string,
  orgId: string,
  args: { reviewLink: string; unsubscribeUrl: string; businessName: string; customBody?: string },
): Promise<void> {
  const rr = await withTenant(orgId, (tx) =>
    tx.reviewRequest.findUnique({ where: { id: reviewRequestId } }),
  );
  if (!rr) throw new Error("review_request_not_found");

  // Substitute placeholders in custom body
  const renderCustom = (s: string) =>
    s
      .replaceAll("{{customerName}}", rr.recipientName ?? "there")
      .replaceAll("{{businessName}}", args.businessName)
      .replaceAll("{{reviewLink}}", args.reviewLink);

  if (rr.channel === "sms") {
    const body = args.customBody
      ? renderCustom(args.customBody)
      : `Hi${rr.recipientName ? ` ${rr.recipientName}` : ""}, thanks for choosing ${args.businessName}! We'd love your honest feedback: ${args.reviewLink}`;
    const result = await sendSms({ to: rr.recipient, body, isFirstMessage: true });
    await withTenant(orgId, (tx) =>
      result.ok
        ? tx.reviewRequest.update({
            where: { id: rr.id },
            data: { status: "sent", sentAt: new Date(), providerMessageId: result.messageSid },
          })
        : tx.reviewRequest.update({
            where: { id: rr.id },
            data: { status: "failed", error: result.error },
          }),
    );
    return;
  }

  if (rr.channel === "email") {
    let html: string;
    let text: string;
    if (args.customBody) {
      text = renderCustom(args.customBody) + `\n\nUnsubscribe: ${args.unsubscribeUrl}`;
      const escaped = renderCustom(args.customBody)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e2e8f0;"><div style="color:#0f172a;font-size:14px;line-height:1.6;">${escaped}</div><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/><p style="color:#94a3b8;font-size:12px;margin:0;">Don't want these? <a href="${args.unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a></p></div></body></html>`;
    } else {
      const generated = defaultReviewRequestHtml({
        reviewerName: rr.recipientName,
        businessName: args.businessName,
        reviewLink: args.reviewLink,
        unsubscribeUrl: args.unsubscribeUrl,
      });
      html = generated.html;
      text = generated.text;
    }
    const result = await sendReviewRequestEmail({
      to: rr.recipient,
      subject: `How was your experience at ${args.businessName}?`,
      bodyText: text,
      bodyHtml: html,
      unsubscribeUrl: args.unsubscribeUrl,
    });
    await withTenant(orgId, (tx) =>
      result.ok
        ? tx.reviewRequest.update({
            where: { id: rr.id },
            data: { status: "sent", sentAt: new Date(), providerMessageId: result.messageId },
          })
        : tx.reviewRequest.update({
            where: { id: rr.id },
            data: { status: "failed", error: result.error },
          }),
    );
  }
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
