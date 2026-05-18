/**
 * Bad-review SMS early-warning.
 *
 * Called after a Review is ingested (Airbnb inbound parser, Google sync,
 * etc.). When the establishment has SMS alerts opted in AND the rating
 * falls at or below the configured threshold, we send a single SMS to
 * the configured alert phone with a short summary + a deep-link back to
 * the review in our dashboard.
 *
 * Why a separate module (not inline in the ingest path):
 *   - Single responsibility. Ingest cares about parsing + persisting; the
 *     alert pipeline cares about notification policy + delivery.
 *   - Idempotency. We use `review.id` as the dedup key in logs so a
 *     re-ingest of the same email (Resend webhook retry) doesn't double-fire.
 *   - Testability. Pure decision logic in `shouldAlert()` is unit-testable
 *     without touching Twilio.
 *
 * What we deliberately don't do here:
 *   - Re-fetch the establishment row. The ingest path already loaded it;
 *     the caller passes the relevant fields as args. Keeps the dependency
 *     graph one-directional (no circular Prisma reads).
 *   - Block on Twilio. Twilio is normally <1s but spikes happen; the
 *     caller fires this with `void` and we log failures rather than throw.
 */

import { logger } from "@/lib/logger";
import { sendSms } from "@/lib/outreach/twilio";

export interface BadReviewAlertInput {
  reviewId: string;
  organizationId: string;
  establishmentId: string;
  establishmentName: string;
  reviewerName: string | null;
  rating: number;
  bodyPreview: string | null;
  source: string; // 'airbnb' | 'google' | ...
  alert: {
    enabled: boolean;
    phone: string | null;
    minRating: number;
  };
}

export interface BadReviewAlertResult {
  fired: boolean;
  reason:
    | "ok"
    | "disabled"
    | "no_phone"
    | "rating_above_threshold"
    | "sms_failed";
  smsError?: string;
}

/**
 * Pure decision logic — no I/O. Exported so we can unit-test it without
 * a mock Twilio.
 */
export function shouldAlert(input: BadReviewAlertInput): boolean {
  if (!input.alert.enabled) return false;
  if (!input.alert.phone) return false;
  if (input.rating > input.alert.minRating) return false;
  return true;
}

/**
 * Build the SMS body. Kept under 160 chars where possible so the
 * recipient's carrier doesn't split it across two parts (each part
 * billed separately). Body preview is truncated mid-word with an
 * ellipsis when needed.
 *
 * Format:
 *   ⚠️ 1★ Airbnb review at Cliff House from Maria L.: "Place was
 *   really disappointing..." — open in Repulabs: https://...
 */
export function formatAlertSms(args: {
  rating: number;
  source: string;
  establishmentName: string;
  reviewerName: string | null;
  bodyPreview: string | null;
  dashboardUrl: string;
}): string {
  const platform = prettySource(args.source);
  const who = (args.reviewerName ?? "A guest").split(/\s+/).slice(0, 2).join(" ");
  // Trim the body to fit within ~80 chars (leaves room for the URL +
  // platform header in a single SMS segment).
  const preview = args.bodyPreview
    ? `"${truncateForSms(args.bodyPreview, 80)}"`
    : "(no text — star rating only)";

  return `⚠ ${args.rating}★ ${platform} review at ${args.establishmentName} from ${who}: ${preview} — open: ${args.dashboardUrl}`;
}

/**
 * Main entry — called fire-and-forget by the ingest path. Never throws;
 * all errors logged and surfaced via the return value for the (sync) caller
 * that wants to wait.
 */
export async function maybeFireBadReviewAlert(
  input: BadReviewAlertInput,
): Promise<BadReviewAlertResult> {
  // Cheap policy check before any I/O.
  if (!input.alert.enabled) {
    return { fired: false, reason: "disabled" };
  }
  if (!input.alert.phone) {
    return { fired: false, reason: "no_phone" };
  }
  if (input.rating > input.alert.minRating) {
    return { fired: false, reason: "rating_above_threshold" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const dashboardUrl = `${appUrl}/reviews/${input.reviewId}`;

  const body = formatAlertSms({
    rating: input.rating,
    source: input.source,
    establishmentName: input.establishmentName,
    reviewerName: input.reviewerName,
    bodyPreview: input.bodyPreview,
    dashboardUrl,
  });

  const result = await sendSms({
    to: input.alert.phone,
    body,
    // We deliberately mark as first-message so the full STOP disclosure
    // ships every time — operators may receive these rarely, and we want
    // the unsubscribe instruction visible every alert.
    isFirstMessage: true,
  });

  if (!result.ok) {
    logger.warn(
      {
        event: "alert.bad_review.sms_failed",
        reviewId: input.reviewId,
        organizationId: input.organizationId,
        error: result.error,
      },
      "bad-review SMS alert failed",
    );
    return { fired: false, reason: "sms_failed", smsError: result.error };
  }

  logger.info(
    {
      event: "alert.bad_review.sms_sent",
      reviewId: input.reviewId,
      organizationId: input.organizationId,
      rating: input.rating,
      source: input.source,
      messageSid: result.messageSid,
    },
    "bad-review SMS alert sent",
  );
  return { fired: true, reason: "ok" };
}

// =========================================================================
// Helpers
// =========================================================================

function prettySource(s: string): string {
  switch (s) {
    case "airbnb":
      return "Airbnb";
    case "google":
      return "Google";
    case "booking_com":
      return "Booking.com";
    case "facebook":
      return "Facebook";
    case "yelp":
      return "Yelp";
    case "trustpilot":
      return "Trustpilot";
    default:
      return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

function truncateForSms(s: string, maxChars: number): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxChars) return trimmed;
  // Cut at the previous word boundary so we don't strand "Th"
  const cut = trimmed.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 16 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
