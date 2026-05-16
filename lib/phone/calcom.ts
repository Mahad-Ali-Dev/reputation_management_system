/**
 * Cal.com integration for AI Phone Receptionist booking.
 *
 * v2 API base: https://api.cal.com/v2
 *
 * Auth: Cal.com supports both API keys (cal_...) and OAuth. We use the simpler
 * API-key path for v1: user pastes their key in the assistant config page;
 * we envelope-encrypt it.
 *
 * Booking flow:
 *   1. Caller says "I'd like to book" → brain returns next_action = "collect_contact"
 *   2. We probe Cal.com for next 7 days of slots on the configured event_type
 *   3. Brain picks 2-3 viable slots and offers them: "Tuesday at 2pm, Thursday at 10am"
 *   4. Caller picks a slot → brain returns booking details
 *   5. We POST /v2/bookings to confirm
 *
 * For v2 we make availability lookup + booking creation work; recurring bookings
 * + rescheduling + cancellation are Phase 3.
 */

import { decrypt } from "@/lib/crypto/envelope";
import { prisma } from "@/lib/db/client";

export type CalComConfig = {
  apiKey: string;
  eventTypeId: number;
};

/**
 * Load Cal.com config for an org from the encrypted assistant row.
 */
export async function loadCalComConfig(orgId: string): Promise<CalComConfig | null> {
  const row = await prisma.phoneAssistant.findUnique({
    where: { organizationId: orgId },
    select: {
      bookingProvider: true,
      calComApiKeyCt: true,
      calComIv: true,
      calComEventType: true,
    },
  });
  if (!row || row.bookingProvider !== "cal_com") return null;
  if (!row.calComApiKeyCt || !row.calComIv || !row.calComEventType) return null;

  const apiKey = decrypt({
    ciphertext: Buffer.from(row.calComApiKeyCt),
    iv: Buffer.from(row.calComIv),
    dekCiphertext: Buffer.alloc(0),
    keyVersion: 1,
    encryptionContext: { orgId, provider: "cal_com", purpose: "oauth" },
  });

  return { apiKey, eventTypeId: row.calComEventType };
}

export type AvailableSlot = {
  startUtc: string;     // ISO 8601 UTC
  endUtc: string;
  spots: number;
};

/**
 * Fetch the next N days of available slots for the org's configured event type.
 */
export async function fetchAvailableSlots(args: {
  config: CalComConfig;
  startUtc: Date;
  endUtc: Date;
  timezone?: string;
}): Promise<AvailableSlot[]> {
  const params = new URLSearchParams({
    eventTypeId: String(args.config.eventTypeId),
    startTime: args.startUtc.toISOString(),
    endTime: args.endUtc.toISOString(),
    timeZone: args.timezone ?? "UTC",
  });

  const res = await fetch(`https://api.cal.com/v2/slots/available?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${args.config.apiKey}`,
      "cal-api-version": "2024-09-04",
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`calcom_availability_failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: {
      slots?: Record<string, Array<{ time: string; attendees?: number }>>;
    };
  };

  const slots: AvailableSlot[] = [];
  const slotsByDay = data.data?.slots ?? {};
  for (const day of Object.keys(slotsByDay)) {
    for (const s of slotsByDay[day] ?? []) {
      slots.push({
        startUtc: s.time,
        endUtc: new Date(new Date(s.time).getTime() + 30 * 60 * 1000).toISOString(),
        spots: 1,
      });
    }
  }
  return slots;
}

/**
 * Create a booking on the org's configured event type.
 */
export async function createBooking(args: {
  config: CalComConfig;
  startUtc: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  timezone?: string;
  notes?: string;
}): Promise<{ bookingId: string; status: string }> {
  const body = {
    start: args.startUtc,
    eventTypeId: args.config.eventTypeId,
    attendee: {
      name: args.attendeeName,
      email: args.attendeeEmail,
      timeZone: args.timezone ?? "UTC",
      phoneNumber: args.attendeePhone,
    },
    metadata: {
      source: "repulabs_ai_phone",
      notes: args.notes,
    },
  };

  const res = await fetch("https://api.cal.com/v2/bookings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.config.apiKey}`,
      "cal-api-version": "2024-08-13",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`calcom_book_failed: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: { id?: number; uid?: string; status?: string } };
  return {
    bookingId: data.data?.uid ?? String(data.data?.id ?? ""),
    status: data.data?.status ?? "pending",
  };
}

/**
 * Format slots into a phone-friendly suggestion: "Tuesday at 2pm or Thursday at 10am"
 */
export function formatSlotsForVoice(slots: AvailableSlot[], maxOptions = 3, timezone = "UTC"): string {
  if (slots.length === 0) return "I don't see any open slots in the next two weeks.";
  const top = slots.slice(0, maxOptions);
  const formatted = top.map((s) => {
    const d = new Date(s.startUtc);
    const day = d.toLocaleString("en-US", { weekday: "long", timeZone: timezone });
    const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone });
    return `${day} at ${time}`;
  });
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return `${formatted[0]} or ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, or ${formatted[formatted.length - 1]}`;
}
