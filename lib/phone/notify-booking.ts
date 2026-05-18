/**
 * Booking-confirmation notifier — fires after the AI receptionist books a
 * meeting via Cal.com (lib/phone/booking-handler.ts).
 *
 * Idempotency contract:
 *   - Reads `phone_bookings.notified_customer_at` / `notified_owner_at`.
 *     If non-null, that email was already sent — we skip it.
 *   - On successful Resend send, sets the timestamp atomically.
 *   - On Resend failure, leaves the timestamp null so the retry sweep
 *     can pick it up later (the cron route at /api/cron/picker-reminder
 *     also runs this for stragglers).
 *
 * Fire-and-forget contract:
 *   - The caller (booking-handler.ts) MUST NOT await this. The phone
 *     receptionist is in the middle of a live conversation; we have a
 *     <2s budget for the AI's "you're all set" response, and Resend can
 *     occasionally take 800-1500ms.
 *   - We catch every error so the unhandled-rejection doesn't kill the
 *     parent request's event loop.
 *
 * Concurrency notes:
 *   - This function does NOT use withTenant() because PhoneAssistant + the
 *     Organization row need cross-tenant-row reads (the assistant lives at
 *     org level; we also need org.ownerEmail as a fallback when the
 *     assistant didn't override). Falling back to the privileged Prisma
 *     client is correct here, BUT we read by organizationId so the data
 *     surface is still single-tenant.
 */

import { prisma } from "@/lib/db/client";
import {
  type BookingEmailContext,
  sendCustomerBookingEmail,
  sendOwnerBookingEmail,
} from "@/lib/email/booking-confirmation";
import { logger } from "@/lib/logger";

export interface NotifyBookingResult {
  customerEmailed: boolean;
  ownerEmailed: boolean;
  errors: Array<{ kind: "customer" | "owner"; error: string }>;
}

/**
 * Send both emails for a booking, gated on the per-row idempotency
 * timestamps. Safe to call multiple times — second call is a no-op.
 *
 * Returns a result object that describes what happened. Callers in the
 * voice pipeline should fire-and-forget; the cron retry sweep awaits.
 */
export async function notifyBooking(phoneBookingId: string): Promise<NotifyBookingResult> {
  const result: NotifyBookingResult = {
    customerEmailed: false,
    ownerEmailed: false,
    errors: [],
  };

  // We read with the privileged client because we need to join the
  // organization (for owner_email fallback) and the assistant config
  // (for the per-org notify-owner toggle). RLS would force two queries
  // through the tenant role, with no benefit here — the booking row's
  // organizationId is the only access key we use.
  const booking = await prisma.phoneBooking.findUnique({
    where: { id: phoneBookingId },
    select: {
      id: true,
      organizationId: true,
      callId: true,
      attendeeName: true,
      attendeeEmail: true,
      attendeePhone: true,
      startAt: true,
      timezone: true,
      notes: true,
      notifiedCustomerAt: true,
      notifiedOwnerAt: true,
    },
  });

  if (!booking) {
    logger.warn({ phoneBookingId, event: "booking.notify.not_found" });
    return result;
  }

  // Short-circuit when nothing left to do.
  if (booking.notifiedCustomerAt && booking.notifiedOwnerAt) {
    return result;
  }

  const [org, assistant] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: booking.organizationId },
      select: { name: true, ownerEmail: true, ownerName: true },
    }),
    prisma.phoneAssistant.findUnique({
      where: { organizationId: booking.organizationId },
      select: { notifyOwnerOnBooking: true, notifyOwnerEmail: true },
    }),
  ]);

  if (!org) {
    logger.error({ phoneBookingId, event: "booking.notify.org_missing" });
    return result;
  }

  const ctx: BookingEmailContext = {
    attendeeName: booking.attendeeName ?? "Guest",
    attendeeEmail: booking.attendeeEmail ?? "",
    attendeePhone: booking.attendeePhone,
    startAt: booking.startAt,
    timezone: booking.timezone ?? "UTC",
    notes: booking.notes,
    businessName: org.name,
    ownerName: org.ownerName,
  };

  // ---- Customer email ----------------------------------------------------
  // Skip when the caller didn't give us an email (some voice flows let
  // the caller decline). Skip when already sent.
  if (!booking.notifiedCustomerAt && booking.attendeeEmail) {
    const r = await sendCustomerBookingEmail({ to: booking.attendeeEmail, ctx });
    if (r.ok) {
      await prisma.phoneBooking.update({
        where: { id: booking.id },
        data: { notifiedCustomerAt: new Date() },
      });
      result.customerEmailed = true;
      logger.info(
        {
          phoneBookingId,
          messageId: r.messageId,
          event: "booking.notify.customer_sent",
        },
        "customer booking-confirmation sent",
      );
    } else {
      result.errors.push({ kind: "customer", error: r.error });
      logger.warn(
        { phoneBookingId, error: r.error, event: "booking.notify.customer_failed" },
        "customer booking-confirmation failed",
      );
    }
  }

  // ---- Owner email -------------------------------------------------------
  // Respect the per-org toggle. Default behavior (assistant row missing,
  // or notifyOwnerOnBooking=true) is TO SEND — opt-out, not opt-in.
  const ownerWantsNotification = assistant?.notifyOwnerOnBooking !== false;
  const ownerEmail =
    (assistant?.notifyOwnerEmail && assistant.notifyOwnerEmail.length > 0
      ? assistant.notifyOwnerEmail
      : null) ?? org.ownerEmail;

  if (!booking.notifiedOwnerAt && ownerWantsNotification && ownerEmail) {
    const r = await sendOwnerBookingEmail({
      to: ownerEmail,
      callId: booking.callId,
      ctx,
    });
    if (r.ok) {
      await prisma.phoneBooking.update({
        where: { id: booking.id },
        data: { notifiedOwnerAt: new Date() },
      });
      result.ownerEmailed = true;
      logger.info(
        {
          phoneBookingId,
          messageId: r.messageId,
          event: "booking.notify.owner_sent",
        },
        "owner booking-notification sent",
      );
    } else {
      result.errors.push({ kind: "owner", error: r.error });
      logger.warn(
        { phoneBookingId, error: r.error, event: "booking.notify.owner_failed" },
        "owner booking-notification failed",
      );
    }
  }

  return result;
}

/**
 * Fire-and-forget wrapper for the voice pipeline. Never awaits, never
 * throws. Use this from within a live AI receptionist conversation; use
 * the bare `notifyBooking` from the retry sweep cron where you do want
 * to await + record errors.
 */
export function notifyBookingInBackground(phoneBookingId: string): void {
  notifyBooking(phoneBookingId).catch((err) => {
    logger.error(
      {
        phoneBookingId,
        err: err instanceof Error ? err.message : String(err),
        event: "booking.notify.background_threw",
      },
      "notifyBooking background task threw unexpectedly",
    );
  });
}
