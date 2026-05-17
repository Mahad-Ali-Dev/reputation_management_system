/**
 * Per-source display + behavior metadata.
 *
 * Single source of truth for:
 *   - Inbox badge: label, color, icon
 *   - "Reply on platform" deep-link URL builder (per-platform quirks)
 *   - Whether the platform supports posting replies via UI (vs read-only)
 *
 * Centralized so adding a new source (Tripadvisor, etc.) is a single
 * file change, not 6 separate UI spots.
 */

import type { ReviewSource } from "./queries";

export interface ReviewSourceMeta {
  label: string;
  // Brand-aligned colors used for the badge background tint + accent.
  // We render the badge as `color: fg; background: bgTint`.
  fg: string;
  bgTint: string;
  /** Single-character glyph for the badge. Used inline; no icon dependency. */
  glyph: string;
  /** Whether we can deep-link the host to post a reply on this platform. */
  canReplyDeepLink: boolean;
  /** Friendly description shown in the source filter pill tooltip. */
  description: string;
}

const SOURCES: Record<ReviewSource, ReviewSourceMeta> = {
  google: {
    label: "Google",
    fg: "#1A73E8",
    bgTint: "#E8F0FE",
    glyph: "G",
    canReplyDeepLink: true,
    description: "Google Business Profile reviews — replied via the connected GBP account.",
  },
  airbnb: {
    label: "Airbnb",
    fg: "#FF385C",
    bgTint: "#FFE6EC",
    glyph: "Ab",
    canReplyDeepLink: true,
    description:
      "Airbnb listings — reviews ingested via forwarded host emails. Reply opens Airbnb host dashboard.",
  },
  booking_com: {
    label: "Booking.com",
    fg: "#003580",
    bgTint: "#E0E7F2",
    glyph: "Bk",
    canReplyDeepLink: true,
    description: "Booking.com listings — read-only ingest; replies via Booking.com extranet.",
  },
  facebook: {
    label: "Facebook",
    fg: "#1877F2",
    bgTint: "#E7F0FE",
    glyph: "F",
    canReplyDeepLink: true,
    description: "Facebook page recommendations.",
  },
  yelp: {
    label: "Yelp",
    fg: "#D32323",
    bgTint: "#FCE6E6",
    glyph: "Y",
    canReplyDeepLink: false,
    description: "Yelp reviews — read-only (Yelp's API no longer supports replies).",
  },
  trustpilot: {
    label: "Trustpilot",
    fg: "#00B67A",
    bgTint: "#E0F7EF",
    glyph: "Tp",
    canReplyDeepLink: true,
    description: "Trustpilot business reviews.",
  },
  internal: {
    label: "Internal",
    fg: "#475569",
    bgTint: "#F1F5F9",
    glyph: "I",
    canReplyDeepLink: false,
    description: "Internal feedback (surveys, in-app prompts).",
  },
  mock: {
    label: "Mock",
    fg: "#7C3AED",
    bgTint: "#F3ECFD",
    glyph: "M",
    canReplyDeepLink: false,
    description: "Test data — only visible in dev.",
  },
};

export function getReviewSourceMeta(source: string): ReviewSourceMeta {
  return (
    (SOURCES as Record<string, ReviewSourceMeta | undefined>)[source] ?? {
      label: source,
      fg: "#475569",
      bgTint: "#F1F5F9",
      glyph: source.charAt(0).toUpperCase(),
      canReplyDeepLink: false,
      description: source,
    }
  );
}

/**
 * Build the URL that opens the platform's reply UI for a specific review.
 * Each platform has its own quirks:
 *
 *  - Google:    GBP dashboard, scoped to the connected place
 *  - Airbnb:    host's reviews page for the listing (URL pattern uses the
 *               listing URL we stored at onboarding)
 *  - Booking:   extranet review-management view by listing id
 *  - Facebook:  page reviews tab
 *
 * Returns null when we don't have enough info to deep-link (e.g., Airbnb
 * source but the host hasn't connected an airbnbListingUrl — shouldn't
 * happen because we match-by-listing during ingest, but defensive).
 */
export function buildReplyDeepLink(args: {
  source: string;
  establishment: {
    googlePlaceId: string | null;
    airbnbListingUrl: string | null;
    bookingcomListingId: string | null;
  };
}): string | null {
  const { source, establishment } = args;
  switch (source) {
    case "google":
      // The host signs into business.google.com; the place page hosts
      // all their reviews. We don't have a way to deep-link to a single
      // review without that review's review_id, which we don't store.
      return establishment.googlePlaceId
        ? `https://business.google.com/reviews?lid=${encodeURIComponent(establishment.googlePlaceId)}`
        : "https://business.google.com/reviews";
    case "airbnb":
      // Airbnb's host dashboard for the listing — the host lands on their
      // reviews list for that property. They can't see all reviews in a
      // global list, so per-listing deep-linking is the best we can do.
      if (establishment.airbnbListingUrl) {
        const m = establishment.airbnbListingUrl.match(/airbnb\.[a-z.]+\/rooms\/(\d+)/i);
        if (m?.[1]) return `https://www.airbnb.com/users/show/${m[1]}/reviews`;
        return establishment.airbnbListingUrl;
      }
      return "https://www.airbnb.com/hosting/reviews";
    case "booking_com":
      return establishment.bookingcomListingId
        ? `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/guests_reviews.html?hotel_id=${encodeURIComponent(establishment.bookingcomListingId)}`
        : "https://admin.booking.com";
    case "facebook":
      return "https://business.facebook.com/latest/reviews";
    case "trustpilot":
      return "https://business.trustpilot.com/reviews";
    default:
      return null;
  }
}
