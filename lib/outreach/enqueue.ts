/**
 * Programmatic review-request enqueue seam (Module 15 — Differentiators).
 *
 * The NON-FormData, NON-session creator of a review request. Both the
 * Voice→Review funnel (`lib/phone/voice-review.ts`) and any cron/webhook context
 * call THIS — they cannot use `lib/outreach/actions.ts::createReviewRequest`
 * because that helper depends on `auth()`/`requireOrg` (a logged-in session).
 *
 * It is the same MECHANICS as `createReviewRequest`'s core (build the tracked
 * `/r/{slug}` link, insert a `ReviewRequest` with a `triggerSource`, then either
 * dispatch immediately or leave it `scheduled` for the per-minute
 * `dispatch-review-requests` cron) — minus the UI/session concerns.
 *
 * ── WHY THIS DELIVERY PATH (not the Scheduler `scheduled_request` kind) ──
 * Module 07's REAL scheduled-send path is `ReviewRequest.status:"scheduled"` +
 * `scheduledFor`, drained by `/api/cron/dispatch-review-requests`. The Scheduler
 * `scheduled_request` handler is still a foundation no-op stub in this build, so
 * routing through it would silently drop the send. We therefore create the
 * scheduled row directly — the durable, already-wired path — and the existing
 * cron sends it at `scheduledFor`. (`07_review_requests` did NOT extract a shared
 * enqueue seam; this module adds it. See `lib/outreach/dispatch.ts`.)
 *
 * Compliance is preserved end-to-end: `isUnsubscribed` hard-blocks; SMS requires
 * `hasSmsConsent` (callers without consent should pass `channel:"email"`). We do
 * NOT attest consent on the caller's behalf here — that is a UI-only action.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { generateSlug } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { createHmac } from "node:crypto";
import { getHmacSecret } from "@/lib/secrets";
import { dispatchReviewRequest } from "./dispatch";
import { hasSmsConsent, isUnsubscribed } from "./suppression";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EnqueueReviewRequestArgs = {
  orgId: string;
  establishmentId: string;
  channel: "sms" | "email";
  recipient: string;
  recipientName?: string | null;
  /** Provenance, written to `ReviewRequest.triggerSource` (e.g. "voice_call"). */
  triggerSource: string;
  /** Delay before send. 0 → dispatch inline now; >0 → scheduled for the cron. */
  delayHours?: number;
  /** Optional override body / template (passed through to dispatch). */
  customBody?: string;
  outreachTemplateId?: string;
};

export type EnqueueReviewRequestResult =
  | {
      ok: true;
      reviewRequestId: string;
      status: "queued" | "scheduled" | "sent" | "failed";
      /**
       * Provider/transport reason when `status === "failed"`. `ok:true` here means
       * "the row was created", NOT "the message went out" — callers that report
       * delivery to a human MUST branch on `status` and surface this.
       */
      error?: string;
    }
  | { ok: false; reason: string };

/**
 * Create (and optionally send) a review request without a user session.
 *
 * Returns a structured result instead of throwing for the expected
 * compliance/validation skips (so webhook/cron callers can branch cleanly). Only
 * truly unexpected errors propagate.
 */
export async function enqueueReviewRequest(
  args: EnqueueReviewRequestArgs,
): Promise<EnqueueReviewRequestResult> {
  const { orgId, establishmentId, triggerSource } = args;
  const channel = args.channel;
  const recipient = args.recipient.trim();
  const delayHours = Math.max(0, args.delayHours ?? 0);

  // ---- Channel-shaped validation ----
  if (channel === "sms" && !PHONE_RE.test(recipient)) {
    return { ok: false, reason: "invalid_sms_recipient" };
  }
  if (channel === "email" && !EMAIL_RE.test(recipient)) {
    return { ok: false, reason: "invalid_email_recipient" };
  }

  // ---- Hard compliance gates (same gates as the UI path) ----
  if (await isUnsubscribed({ channel, recipient, organizationId: orgId })) {
    return { ok: false, reason: "unsubscribed" };
  }
  if (channel === "sms") {
    const consent = await hasSmsConsent({ organizationId: orgId, phoneE164: recipient });
    if (!consent) {
      // Programmatic callers must NOT self-attest consent. Prefer email instead.
      return { ok: false, reason: "no_sms_consent" };
    }
  }

  // ---- Resolve establishment ----
  const estab = await withTenant(orgId, (tx) =>
    tx.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { id: true, name: true },
    }),
  );
  if (!estab) return { ok: false, reason: "establishment_not_found" };

  const trackingSlug = generateSlug();
  const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);
  const unsubscribeUrl = `${APP_URL}/u?${buildUnsubToken(orgId, channel, recipient)}`;

  // ---- Insert the row ----
  const rr = await withTenant(orgId, (tx) =>
    tx.reviewRequest.create({
      data: {
        organizationId: orgId,
        establishmentId: estab.id,
        channel,
        recipient,
        recipientName: args.recipientName ?? null,
        shortSlug: trackingSlug,
        scheduledFor,
        // Future-dated → scheduled (cron sends at scheduledFor).
        // Zero delay → queued (dispatched inline below, or by the cron as backup).
        status: delayHours > 0 ? "scheduled" : "queued",
        triggerSource,
      },
      select: { id: true },
    }),
  );

  // ---- Send now if no delay (race-safe claim, identical to actions.ts) ----
  if (delayHours === 0) {
    const claimed = await withTenant(orgId, (tx) =>
      tx.reviewRequest.updateMany({
        where: { id: rr.id, status: "queued" },
        data: { status: "sending" },
      }),
    );
    if (claimed.count > 0) {
      // No reviewLink override here — dispatch derives the tracked /r/{slug}
      // link itself from the row's shortSlug (see lib/outreach/dispatch.ts).
      const outcome = await dispatchReviewRequest(rr.id, orgId, {
        unsubscribeUrl,
        businessName: estab.name,
        customBody: args.customBody,
        outreachTemplateId: args.outreachTemplateId,
      });
      logger.info(
        { orgId, reviewRequestId: rr.id, triggerSource, status: outcome.status, event: "outreach.enqueue.dispatched" },
        "programmatic review request dispatched",
      );
      return {
        ok: true,
        reviewRequestId: rr.id,
        status: outcome.dispatched ? "sent" : "failed",
        error: outcome.dispatched ? undefined : outcome.error,
      };
    }
    // Lost the claim race (cron beat us) — still a success; it will send.
    return { ok: true, reviewRequestId: rr.id, status: "queued" };
  }

  logger.info(
    { orgId, reviewRequestId: rr.id, triggerSource, scheduledFor: scheduledFor.toISOString(), event: "outreach.enqueue.scheduled" },
    "programmatic review request scheduled — dispatch-review-requests cron will send",
  );
  return { ok: true, reviewRequestId: rr.id, status: "scheduled" };
}

/** Signed unsubscribe token (orgId.channel.recipient.signature, base64url). */
function buildUnsubToken(orgId: string, channel: string, recipient: string): string {
  const secret = getHmacSecret();
  const payload = `${orgId}|${channel}|${recipient}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `t=${Buffer.from(payload).toString("base64url")}&s=${sig}`;
}
