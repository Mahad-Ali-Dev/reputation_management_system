import { prisma } from "@/lib/db/client";
import { isStorableRedirectUrl } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { publicUrl } from "@/lib/url";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/r/pick/{slug}
 *
 * Receives the platform-choice form from the multi-platform picker page.
 * Records the choice in `review_platform_choices` (for the host's
 * attribution dashboard), then 302s the guest to the chosen platform URL.
 *
 * Why it's a POST not a GET: we want each tap to be a recorded event, not
 * a cacheable URL. A guest sharing the picker URL with a friend shouldn't
 * pollute the host's attribution stats.
 *
 * Idempotency: we deliberately don't dedupe choices — if the same guest
 * taps twice (e.g. their first browser was logged-out and they retried),
 * we count both. The host can normalize in the analytics layer if they
 * want. The signal value is in the *click* not the unique-click.
 *
 * Validation:
 *   - slug must be valid Crockford-base32 10-char
 *   - platform must be one of the 5 allowed values
 *   - device must be active + product_kind="multi_platform"
 *   - target URL must pass isStorableRedirectUrl (defense vs javascript:/data:/IP)
 */

const PICKER_BODY = z.object({
  platform: z.enum(["google", "airbnb", "tripadvisor", "booking_com", "direct"]),
  email: z.string().email().max(254).optional().or(z.literal("")),
  // Optional last-4 of Airbnb confirmation code — surfaced as a future
  // attribution signal. Tolerant to whitespace + casing.
  reservationHint: z.string().max(16).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = (rawSlug ?? "").toUpperCase().slice(0, 10);

  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(slug)) {
    return new NextResponse("invalid_slug", { status: 400 });
  }

  // Light per-IP rate limit. Picker is hit by real guests, not bots — 30
  // req/min/IP is generous. Reuse the existing scan_redirect limiter so we
  // don't add yet another bucket.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit("scan_redirect", `pick:${ip}:${slug}`);
  if (!rl.success) {
    return new NextResponse("rate_limited", {
      status: 429,
      headers: { "retry-after": String(rl.retryAfterSeconds) },
    });
  }

  // Parse form-encoded body (the picker page uses a regular <form>).
  const fd = await req.formData();
  const parsed = PICKER_BODY.safeParse({
    platform: fd.get("platform"),
    email: fd.get("email") ?? undefined,
    reservationHint: fd.get("reservationHint") ?? undefined,
  });
  if (!parsed.success) {
    return new NextResponse("invalid_body", { status: 400 });
  }

  const device = await prisma.device.findUnique({
    where: { shortSlug: slug },
    select: {
      id: true,
      productKind: true,
      status: true,
      organizationId: true,
      establishmentId: true,
      redirectUrl: true,
      establishment: {
        select: {
          id: true,
          airbnbListingUrl: true,
          googlePlaceId: true,
          bookingcomListingId: true,
          directBookingUrl: true,
        },
      },
    },
  });

  if (!device || device.status !== "active" || device.productKind !== "multi_platform") {
    return NextResponse.redirect(publicUrl(`/not-activated?slug=${slug}`, req));
  }
  if (!device.organizationId || !device.establishment || !device.establishmentId) {
    return NextResponse.redirect(publicUrl(`/not-activated?slug=${slug}`, req));
  }

  // Resolve the actual destination URL by platform. We never trust client-
  // supplied URLs — only the host-configured value on the establishment.
  const targetUrl = resolveTargetUrl(
    parsed.data.platform,
    device.establishment,
    device.redirectUrl,
  );
  if (!targetUrl || !isStorableRedirectUrl(targetUrl)) {
    return new NextResponse(`platform_not_configured:${parsed.data.platform}`, { status: 400 });
  }

  // Fire-and-forget the choice insert + scan-count bump. We don't await it
  // because the guest is staring at a loading spinner — a 200ms DB write
  // delay translates to a perceptible "is this broken?" pause.
  prisma.reviewPlatformChoice
    .create({
      data: {
        organizationId: device.organizationId,
        deviceId: device.id,
        establishmentId: device.establishmentId,
        platform: parsed.data.platform,
        guestEmail: parsed.data.email && parsed.data.email.length > 0 ? parsed.data.email : null,
        reservationHint: parsed.data.reservationHint?.trim() || null,
        ip: ip !== "unknown" ? ip : null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    })
    .catch((err) => {
      logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          slug,
          platform: parsed.data.platform,
          event: "picker.choice_write_failed",
        },
        "failed to record picker choice",
      );
    });

  // 303 because we're redirecting from a POST to a GET resource (the
  // external platform). 302 would technically also work but 303 is the
  // correct semantic for POST-then-GET.
  return NextResponse.redirect(targetUrl, { status: 303 });
}

// =========================================================================
// Helpers
// =========================================================================

type EstablishmentLite = {
  airbnbListingUrl: string | null;
  googlePlaceId: string | null;
  bookingcomListingId: string | null;
  directBookingUrl: string | null;
};

function resolveTargetUrl(
  platform: z.infer<typeof PICKER_BODY>["platform"],
  est: EstablishmentLite,
  fallback: string | null,
): string | null {
  switch (platform) {
    case "airbnb":
      return est.airbnbListingUrl;
    case "google":
      return est.googlePlaceId
        ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(est.googlePlaceId)}`
        : null;
    case "booking_com":
      return est.bookingcomListingId
        ? `https://www.booking.com/hotel/au/${encodeURIComponent(est.bookingcomListingId)}.html#tab-reviews`
        : null;
    case "direct":
      return est.directBookingUrl;
    case "tripadvisor":
      // TripAdvisor uses the device's primary redirect_url when configured
      // (we don't store a TripAdvisor listing id separately yet).
      return fallback && /tripadvisor\.(com|co\.uk|com\.au|ca|de)/i.test(fallback)
        ? fallback
        : null;
    default:
      return null;
  }
}
