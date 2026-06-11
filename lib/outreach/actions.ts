"use server";

import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { assertEntitled, PlanInactiveError } from "@/lib/billing/entitlements";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueReviewRequest } from "./enqueue";
import { hasSmsConsent, isUnsubscribed, recordSmsConsent } from "./suppression";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Result contract for the outreach send actions. Thrown server-action errors
 * get their messages MASKED in production builds, so the compliance-critical
 * messages here (TCPA attestation, unsubscribed recipients) never reached
 * users — and bare `<form action>` callers crashed outright (bugs 010/011 in
 * the June 2026 assessment). Callers render `error` inline.
 */
export type OutreachActionResult = { ok: true } | { ok: false; error: string };

/** Next.js control-flow errors (redirect/notFound) must propagate. */
function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

function mapOutreachError(err: unknown, event: string): OutreachActionResult {
  if (err instanceof PlanInactiveError) {
    return { ok: false, error: "Review requests are a paid feature — upgrade to send them." };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, error: "Only managers and admins can send review requests." };
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") {
    return {
      ok: false,
      error: "Outreach isn't provisioned yet — ask your admin to apply the latest database migration.",
    };
  }
  logger.error({ event, error: err instanceof Error ? err.message : String(err) });
  return { ok: false, error: "Could not send the request. Try again." };
}

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

/**
 * Server action: create + dispatch a review request.
 * - SMS: requires TCPA consent + checks unsubscribe list + sends via Twilio
 * - Email: uses Resend, adds List-Unsubscribe header
 */
export async function createReviewRequest(form: FormData): Promise<OutreachActionResult> {
  try {
  const { orgId, userId } = await requireRole("manager");
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
    return { ok: false, error: `Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  const data = parsed.data;

  // Normalize + validate recipient by channel
  const recipient = data.recipient.trim();
  if (data.channel === "sms" && !PHONE_RE.test(recipient)) {
    return { ok: false, error: "SMS recipient must be E.164 format, e.g. +15551234567" };
  }
  if (data.channel === "email" && !EMAIL_RE.test(recipient)) {
    return { ok: false, error: "Invalid email address" };
  }

  // Unsubscribe check (hard block — required for compliance)
  if (await isUnsubscribed({ channel: data.channel, recipient, organizationId: orgId })) {
    return { ok: false, error: `This recipient has unsubscribed from ${data.channel}` };
  }

  // SMS: TCPA consent required
  if (data.channel === "sms") {
    const hasConsent = await hasSmsConsent({ organizationId: orgId, phoneE164: recipient });
    if (!hasConsent) {
      if (!data.consentAttested) {
        return {
          ok: false,
          error:
            "TCPA consent required. Confirm you have prior express written consent from this recipient by checking the attestation box.",
        };
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

  // Delegate the insert + (optional inline) dispatch to the shared programmatic
  // seam — the SAME single send path the Voice→Review funnel + cron use. The
  // session/entitlement/consent-attestation concerns above stay here; the
  // reusable mechanics (tracked link, row insert, dispatch-or-schedule) live in
  // `enqueueReviewRequest`. Consent was just recorded above for SMS, so the
  // seam's consent re-check passes; unsubscribe is re-checked (idempotent).
  const enq = await enqueueReviewRequest({
    orgId,
    establishmentId: data.establishmentId,
    channel: data.channel,
    recipient,
    recipientName: data.recipientName ?? null,
    triggerSource: "manual",
    delayHours: data.scheduleHours,
    customBody: data.customBody,
    outreachTemplateId: data.outreachTemplateId,
  });

  if (!enq.ok) {
    // Map the seam's structured reasons back to the UI's result contract.
    switch (enq.reason) {
      case "establishment_not_found":
        return { ok: false, error: "Establishment not found" };
      case "unsubscribed":
        return { ok: false, error: `This recipient has unsubscribed from ${data.channel}` };
      case "no_sms_consent":
        return { ok: false, error: "TCPA consent required for this SMS recipient." };
      default:
        return { ok: false, error: `Could not create review request: ${enq.reason}` };
    }
  }

  // Auto-capture the recipient into the Contact directory. Fire-and-forget +
  // fail-soft (the hook never throws and dedupes internally) so it can't break
  // / slow the send. Recipient is an email or an E.164 phone depending on the
  // channel; the review-request id makes the marker idempotent.
  captureContactInBackground({
    orgId,
    source: "outreach",
    email: data.channel === "email" ? recipient : null,
    phone: data.channel === "sms" ? recipient : null,
    name: data.recipientName ?? null,
    establishmentId: data.establishmentId,
    activity: {
      title: "Sent a review request",
      externalRef: `review-request:${enq.reviewRequestId}`,
    },
  });

  // Audit with the acting user (the seam runs sessionless, so the actor-attributed
  // audit row is written here where we know `userId`).
  await withTenant(orgId, (tx) =>
    tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review_request.created",
        resourceType: "review_request",
        resourceId: enq.reviewRequestId,
        afterData: {
          channel: data.channel,
          recipient,
          scheduleHours: data.scheduleHours,
          status: enq.status,
        },
      },
    }),
  );

  revalidatePath("/outreach");
  return { ok: true };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    return mapOutreachError(err, "review_request.create_failed");
  }
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
export async function resendReviewRequest(form: FormData): Promise<OutreachActionResult> {
  try {
    const { orgId } = await requireRole("manager");
    await assertEntitled(orgId);
    const idParsed = z.string().uuid().safeParse(form.get("id"));
    if (!idParsed.success) return { ok: false, error: "Invalid request id." };
    const id = idParsed.data;

    const rr = await withTenant(orgId, (tx) =>
      tx.reviewRequest.findUnique({
        where: { id },
        select: { id: true, channel: true, recipient: true },
      }),
    );
    if (!rr) return { ok: false, error: "That request no longer exists." };

    const channel = rr.channel === "sms" ? "sms" : "email";
    if (await isUnsubscribed({ channel, recipient: rr.recipient, organizationId: orgId })) {
      return { ok: false, error: `This recipient has unsubscribed from ${channel}` };
    }

    await withTenant(orgId, (tx) =>
      tx.reviewRequest.update({
        where: { id },
        data: { status: "queued", scheduledFor: new Date(), error: null },
      }),
    );

    logger.info({ orgId, reviewRequestId: id, event: "review_request.resend_queued" });
    revalidatePath("/outreach");
    return { ok: true };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    return mapOutreachError(err, "review_request.resend_failed");
  }
}
