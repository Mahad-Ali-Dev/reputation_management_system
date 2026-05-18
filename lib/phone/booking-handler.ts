/**
 * Booking flow handler for the AI phone receptionist.
 *
 * Called by /api/voice/respond when the brain detects booking intent.
 *
 * Two-step conversational flow:
 *   Step A: Caller says "I'd like to book"
 *           → we fetch upcoming slots
 *           → store the slot list in call context
 *           → AI says: "Sure! I can offer Tuesday at 2pm, Thursday at 10am, or Friday at 3pm. Which works?"
 *
 *   Step B: Caller picks a slot + gives name/email
 *           → AI confirms the booking via Cal.com
 *           → AI says: "Great, you're all set for Thursday at 10am. You'll get a confirmation email."
 *
 * We track which step we're in via the most-recent assistant turn metadata.
 * v1 stores the offered slots in the assistant turn's `text` (parseable JSON)
 * which is hacky but avoids a new column. Day-14: split into proper state.
 */

import { fetchAvailableSlots, formatSlotsForVoice, createBooking, loadCalComConfig } from "./calcom";
import { notifyBookingInBackground } from "./notify-booking";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export type BookingFlowResult = {
  /** What the assistant should say next */
  response: string;
  /** Whether to keep the conversation going or end */
  next_action: "continue" | "end_call" | "handoff_to_human";
  /** If a booking was just made, the booking ID */
  bookingId?: string;
};

const BUSINESS_HOURS_BUFFER_DAYS = 14;

/**
 * Step A: Caller expressed booking intent. Fetch slots + format them for voice.
 */
export async function offerSlots(args: {
  orgId: string;
  callId: string;
  timezone?: string;
}): Promise<BookingFlowResult> {
  const config = await loadCalComConfig(args.orgId);
  if (!config) {
    return {
      response:
        "I'd love to help you book, but our online calendar isn't set up yet. Let me have someone call you back to schedule. What's the best number to reach you?",
      next_action: "continue",
    };
  }

  const assistant = await prisma.phoneAssistant.findUnique({
    where: { organizationId: args.orgId },
    select: { bookingBufferMin: true },
  });
  const buffer = assistant?.bookingBufferMin ?? 60;
  const startUtc = new Date(Date.now() + buffer * 60 * 1000);
  const endUtc = new Date(Date.now() + BUSINESS_HOURS_BUFFER_DAYS * 24 * 60 * 60 * 1000);

  try {
    const slots = await fetchAvailableSlots({
      config,
      startUtc,
      endUtc,
      timezone: args.timezone,
    });
    if (slots.length === 0) {
      return {
        response: "I don't see any open slots in the next two weeks. Would you like someone to call you back to schedule further out?",
        next_action: "continue",
      };
    }
    const formatted = formatSlotsForVoice(slots, 3, args.timezone);
    return {
      response: `I can offer ${formatted}. Which works best for you?`,
      next_action: "continue",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "phone.booking.offer_failed", orgId: args.orgId, callId: args.callId, error: msg });
    return {
      response: "I'm having trouble pulling up the calendar right now. Let me transfer you to someone who can help.",
      next_action: "handoff_to_human",
    };
  }
}

/**
 * Step B: Caller confirmed a slot + provided details. Book it.
 *
 * The brain's structured output should include parsed datetime + attendee info
 * when next_action="continue" and we're in booking flow. The caller's spoken
 * slot pick comes in as natural language ("Thursday at 10am works") so the
 * brain has to parse it — we pass the available slots to the brain prompt
 * for grounding.
 */
export async function confirmBooking(args: {
  orgId: string;
  callId: string;
  startUtc: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  timezone?: string;
  notes?: string;
}): Promise<BookingFlowResult> {
  const config = await loadCalComConfig(args.orgId);
  if (!config) {
    return {
      response: "Sorry, the calendar isn't connected right now. I'll have someone call you back to confirm.",
      next_action: "end_call",
    };
  }

  try {
    const result = await createBooking({
      config,
      startUtc: args.startUtc,
      attendeeName: args.attendeeName,
      attendeeEmail: args.attendeeEmail,
      attendeePhone: args.attendeePhone,
      timezone: args.timezone,
      notes: args.notes,
    });

    // Save to phone_bookings. We capture the returned id so the
    // fire-and-forget notifier knows which row to act on.
    const phoneBookingId = await withTenant(args.orgId, async (tx) => {
      const row = await tx.phoneBooking.create({
        data: {
          organizationId: args.orgId,
          callId: args.callId,
          provider: "cal_com",
          externalBookingId: result.bookingId,
          attendeeName: args.attendeeName,
          attendeeEmail: args.attendeeEmail,
          attendeePhone: args.attendeePhone ?? null,
          startAt: new Date(args.startUtc),
          timezone: args.timezone ?? "UTC",
          status: result.status === "confirmed" ? "confirmed" : "pending",
          notes: args.notes ?? null,
        },
        select: { id: true },
      });
      return row.id;
    });

    // Send the two confirmation emails (customer + owner) without
    // blocking the live phone conversation. The notifier is idempotent
    // via PhoneBooking.notified_*_at timestamps, so a retry sweep can
    // pick up any failures later.
    notifyBookingInBackground(phoneBookingId);

    const friendlyTime = new Date(args.startUtc).toLocaleString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: args.timezone,
    });

    return {
      response: `You're all set for ${friendlyTime}. We'll send a confirmation email to ${args.attendeeEmail}. Anything else I can help with?`,
      next_action: "continue",
      bookingId: result.bookingId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "phone.booking.confirm_failed", orgId: args.orgId, callId: args.callId, error: msg });
    return {
      response: "I tried to book that, but ran into an issue. Let me transfer you to someone who can confirm it manually.",
      next_action: "handoff_to_human",
    };
  }
}
