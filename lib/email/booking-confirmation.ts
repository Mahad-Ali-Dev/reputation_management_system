/**
 * Booking-confirmation email templates + sender.
 *
 * Two audiences, two templates:
 *   - Customer (caller) — confirmation of *their* meeting
 *   - Owner (Repulabs tenant) — heads-up that the AI receptionist booked
 *     a meeting on their behalf
 *
 * Why hand-rolled HTML (no React-email): consistent with the rest of this
 * codebase's email layer (see lib/email/templates.ts). Outlook + older
 * Gmail clients reliably render table-based layouts; flexbox is brittle
 * across the long tail of clients we have no test coverage for.
 *
 * Idempotency lives at the caller (lib/phone/notify-booking.ts) which
 * gates sends on PhoneBooking.notifiedCustomerAt / notifiedOwnerAt. This
 * module is a pure renderer + a one-shot send. A retry loop reinvokes
 * the gate logic upstream.
 */

import { SUPPORT_REPLY_TO } from "@/lib/email/reply-to";
import {
  BRAND,
  type EmailBrand,
  ctaButton,
  emailCalendar,
  emailDetailCard,
  emailHero,
  emailHeroIcon,
  emailParagraph,
  emailPersonCard,
  emailPill,
  emailShell,
  emailSmall,
  emailTeamName,
} from "@/lib/email/templates";
import { assertSendableEmailConfig } from "@/lib/outreach/email-guard";
import { Resend } from "resend";
import { senderFor } from "./senders";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    assertSendableEmailConfig(process.env.EMAIL_FROM);
    throw new Error("RESEND_API_KEY not set");
  }
  assertSendableEmailConfig(process.env.EMAIL_FROM);
  _resend = new Resend(key);
  return _resend;
}

export type BookingEmailResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface BookingEmailContext {
  /** Caller's name as given to the AI ("Maria Lopez"). */
  attendeeName: string;
  /** Caller's email address. */
  attendeeEmail: string;
  /** Caller's phone in human-readable form ("+61 4XX XXX XXX"). */
  attendeePhone: string | null;
  /** Meeting start time (UTC). We format in `timezone` for display. */
  startAt: Date;
  /** Caller's timezone. Falls back to UTC if Cal.com didn't capture it. */
  timezone: string;
  /** Free-text notes captured during the call (e.g., "new patient, knee pain"). */
  notes: string | null;
  /** The business's display name — used in subject lines + signatures. */
  businessName: string;
  /** Owner's display name (greeting line on owner email). */
  ownerName: string | null;
}

/**
 * Customer-facing confirmation. Voice: helpful concierge, not transactional
 * receipt. We confirm what we know they expect ("you booked X at Y") + add
 * one piece of value (rescheduling instructions or contact email).
 */
export async function sendCustomerBookingEmail(args: {
  to: string;
  ctx: BookingEmailContext;
  fromOverride?: string;
}): Promise<BookingEmailResult> {
  const subject = `Booking confirmed at ${args.ctx.businessName}`;
  const when = formatHuman(args.ctx.startAt, args.ctx.timezone);

  const biz = escapeHtml(args.ctx.businessName);
  const html = buildEmailShell({
    preheader: `Your booking at ${args.ctx.businessName} is confirmed for ${when}.`,
    title: subject,
    brand: { name: args.ctx.businessName },
    hero: emailHero({
      tone: "success",
      badge: emailPill("&#10003;&nbsp; Booking confirmed", "white", BRAND.ok),
      visual: emailCalendar(calendarParts(args.ctx.startAt, args.ctx.timezone)),
      title: `You're booked in, ${escapeHtml(firstName(args.ctx.attendeeName))}`,
      sub: "We can't wait to see you. Here are your booking details.",
    }),
    body: `
      ${emailDetailCard([
        { label: "When", value: escapeHtml(when) },
        { label: "Where", value: biz },
        ...(args.ctx.attendeePhone ? [{ label: "Phone", value: escapeHtml(args.ctx.attendeePhone) }] : []),
        ...(args.ctx.notes ? [{ label: "Notes", value: escapeHtml(args.ctx.notes) }] : []),
      ])}
      ${emailParagraph("Need to change or cancel? Just reply to this email and someone from the team will sort it out.", "margin:22px 0 0;text-align:center;")}
      ${emailSmall(`See you soon,<br>${emailTeamName(args.ctx.businessName)}`, `margin-top:16px;text-align:center;color:${BRAND.ink2};`)}
    `,
  });
  const text = [
    `Hi ${firstName(args.ctx.attendeeName)},`,
    "",
    `You're booked at ${args.ctx.businessName} for ${when}.`,
    args.ctx.attendeePhone
      ? `We'll reach you at ${args.ctx.attendeePhone} if anything changes.`
      : "",
    args.ctx.notes ? `What we noted from your call: ${args.ctx.notes}` : "",
    "",
    `To reschedule or cancel, just reply to this email and a human at ${args.ctx.businessName} will get back to you.`,
    "",
    `The team at ${args.ctx.businessName}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendOnce({
    to: args.to,
    from: args.fromOverride ?? defaultFromAddress(args.ctx.businessName),
    subject,
    html,
    text,
  });
}

/**
 * Owner-facing notification. Voice: ops report — caller details, when,
 * how to listen back to the call recording. NOT a marketing email; the
 * owner pays for the platform partly to NOT have to read paragraphs.
 */
export async function sendOwnerBookingEmail(args: {
  to: string;
  callId: string;
  ctx: BookingEmailContext;
  fromOverride?: string;
}): Promise<BookingEmailResult> {
  const when = formatHuman(args.ctx.startAt, args.ctx.timezone);
  const subject = `New booking via AI receptionist, ${when}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const callDetailUrl = `${appUrl}/phone/calls/${encodeURIComponent(args.callId)}`;

  const contact = [
    args.ctx.attendeePhone
      ? `<a href="tel:${encodeURIComponent(args.ctx.attendeePhone)}" style="color:${BRAND.muted};text-decoration:none;">${escapeHtml(args.ctx.attendeePhone)}</a>`
      : "",
    `<a href="mailto:${encodeURIComponent(args.ctx.attendeeEmail)}" style="color:${BRAND.muted};text-decoration:none;">${escapeHtml(args.ctx.attendeeEmail)}</a>`,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const html = buildEmailShell({
    preheader: `${args.ctx.attendeeName} booked ${when}.`,
    title: subject,
    hero: emailHero({
      tone: "success",
      badge: emailPill("AI receptionist", "white", BRAND.ok),
      visual: emailHeroIcon("hero-phone.gif"),
      title: `New booking from ${escapeHtml(args.ctx.attendeeName)}`,
      sub: `Your AI receptionist just booked them in for ${escapeHtml(when)}.`,
    }),
    body: `
      ${emailPersonCard({ name: args.ctx.attendeeName, sub: contact, quote: args.ctx.notes })}
      ${ctaButton({ url: callDetailUrl, label: "Open the call" })}
      ${emailSmall(`Change who gets these in <a href="${appUrl}/phone/assistant" style="color:${BRAND.muted};">AI receptionist settings</a>.`)}
    `,
  });

  const text = [
    `Hi ${firstName(args.ctx.ownerName ?? "there")},`,
    "",
    "Your AI receptionist just booked a meeting:",
    "",
    `Who:    ${args.ctx.attendeeName}`,
    `When:   ${when}`,
    `Email:  ${args.ctx.attendeeEmail}`,
    args.ctx.attendeePhone ? `Phone:  ${args.ctx.attendeePhone}` : "",
    args.ctx.notes ? `Notes:  ${args.ctx.notes}` : "",
    "",
    `Open call: ${callDetailUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendOnce({
    to: args.to,
    from: args.fromOverride ?? defaultFromAddress(args.ctx.businessName),
    subject,
    html,
    text,
  });
}

// =========================================================================
// Helpers
// =========================================================================

async function sendOnce(args: {
  to: string;
  from: string;
  /** Business address when the caller has org context; support otherwise. */
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<BookingEmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: args.from,
      replyTo: args.replyTo ?? SUPPORT_REPLY_TO,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: "resend_no_id" };
    return { ok: true, messageId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// =========================================================================
// Helpers — exported for unit testing. Keeping them at module scope (not
// inside a `__test_internals__` export) because each one is independently
// useful and several have security-relevant behavior (escapeHtml is the
// primary XSS gate for AI-receptionist-supplied attendeeName).
// =========================================================================

export function defaultFromAddress(businessName: string): string {
  // Send-from defaults to a per-business display name with our verified
  // sending domain. Hosts can override later via per-org sender config.
  const verified = senderFor("bookings");
  const display = sanitizeDisplay(businessName);
  return display.length > 0 ? `${display} <${verified}>` : verified;
}

export function sanitizeDisplay(s: string): string {
  // Strip characters that break RFC 5322 display-name quoting if present
  // in the wild (commas, semicolons, double quotes, angle brackets).
  return s
    .replace(/[",;<>]/g, "")
    .trim()
    .slice(0, 60);
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full.trim();
}

export function formatHuman(d: Date, tz: string): string {
  try {
    return d.toLocaleString("en-GB", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      timeZoneName: "short",
    });
  } catch {
    // Invalid timezone → fall back to UTC; better than throwing.
    return d.toLocaleString("en-GB", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
      timeZoneName: "short",
    });
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Booking mail is sent on the BUSINESS's behalf, so it carries their brand.
 * This used to be a second, near-duplicate shell that drifted from the real one
 * (no viewport meta, no Outlook-safe button, a hardcoded Repulabs masthead on
 * mail going to someone else's customer).
 */
function buildEmailShell(opts: {
  preheader: string;
  title: string;
  body: string;
  hero?: string;
  brand?: EmailBrand | null;
}): string {
  return emailShell({
    preheader: opts.preheader,
    title: opts.title,
    body: opts.body,
    hero: opts.hero,
    brand: opts.brand ?? null,
  });
}

/** Month / day / weekday for the calendar tile, in the booking's timezone. */
function calendarParts(d: Date, tz: string): { month: string; day: string; weekday: string } {
  const fmt = (o: Intl.DateTimeFormatOptions, zone: string) => d.toLocaleDateString("en-GB", { ...o, timeZone: zone });
  try {
    return { month: fmt({ month: "short" }, tz), day: fmt({ day: "numeric" }, tz), weekday: fmt({ weekday: "long" }, tz) };
  } catch {
    return { month: fmt({ month: "short" }, "UTC"), day: fmt({ day: "numeric" }, "UTC"), weekday: fmt({ weekday: "long" }, "UTC") };
  }
}
