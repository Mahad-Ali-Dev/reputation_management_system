import { prisma } from "@/lib/db/client";
import { isStorableRedirectUrl } from "@/lib/hardware/codes";
import { notFound } from "next/navigation";
import { PickerForm } from "./picker-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Leave a review",
  // No-index — this page is meant for direct scans, not search engines.
  // We don't want Google indexing every host's picker URL.
  robots: { index: false, follow: false },
};

/**
 * Multi-platform review picker.
 *
 * Reached when a guest scans a `productKind="multi_platform"` device. The
 * landing route (`/r/{slug}`) has already validated the slug + emitted the
 * scan event, then redirected here. We don't re-validate the device because
 * the redirect was issued by us moments ago — relying on it is safe.
 *
 * What we render: one button per platform the host has connected, plus the
 * "Book us directly next time" CTA when a direct_booking_url is set. We
 * resolve the platform URLs from the attached Establishment, not the device,
 * so a host can list on three platforms with one QR.
 *
 * Tracking: the buttons POST to `/api/r/pick/{slug}` with the chosen
 * platform; that endpoint inserts a `ReviewPlatformChoice` row and 302s to
 * the platform URL. We intentionally don't track on hover/render — the
 * guest's intent is only clear when they click.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ done?: string }>;
}

export default async function PickerPage({ params, searchParams }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = (rawSlug ?? "").toUpperCase().slice(0, 10);

  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(slug)) {
    notFound();
  }

  const device = await prisma.device.findUnique({
    where: { shortSlug: slug },
    select: {
      id: true,
      productKind: true,
      status: true,
      establishment: {
        select: {
          id: true,
          name: true,
          kind: true,
          airbnbListingUrl: true,
          googlePlaceId: true,
          bookingcomListingId: true,
          directBookingUrl: true,
          // `redirectUrl` on the device acts as the "primary platform" — we
          // fall back to it when the establishment has no listing URLs.
        },
      },
      redirectUrl: true,
    },
  });

  if (!device || device.status !== "active" || device.productKind !== "multi_platform") {
    // Bounce back to /r/[slug] which will route the guest properly.
    // We avoid notFound() here so a stale link still goes somewhere useful.
    return (
      <main style={shellStyle}>
        <div style={panelStyle}>
          <h1 style={titleStyle}>This QR isn&rsquo;t live yet.</h1>
          <p style={bodyStyle}>
            The owner hasn&rsquo;t finished setting up this QR. Please come back in a few minutes.
          </p>
        </div>
      </main>
    );
  }

  const platforms = buildPlatformList(device);

  const sp = await searchParams;
  const justChosen = typeof sp.done === "string" ? sp.done : null;

  return (
    <main style={shellStyle}>
      <div style={panelStyle}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }} aria-hidden>
            ⭐
          </div>
          <h1 style={titleStyle}>Loved your stay?</h1>
          <p style={bodyStyle}>
            Pick where to leave a review for{" "}
            <strong style={{ color: "#0b0d0e" }}>{device.establishment?.name}</strong>.
          </p>
        </div>

        {justChosen && (
          <div role="status" style={justChosenStyle}>
            Opening {prettyPlatform(justChosen)}… if it doesn&rsquo;t load, tap the button again.
          </div>
        )}

        <PickerForm slug={slug} platforms={platforms} />

        <p style={footerStyle}>
          Powered by{" "}
          <a href="/" style={{ color: "#64748b", textDecoration: "none" }}>
            repulabs.com
          </a>{" "}
          — every choice you make routes you straight to the platform&rsquo;s review page.
        </p>
      </div>
    </main>
  );
}

// =========================================================================
// Pure helpers (kept in this file because they're tiny + used only here)
// =========================================================================

export interface PlatformOption {
  platform: "google" | "airbnb" | "tripadvisor" | "booking_com" | "direct";
  label: string;
  url: string;
  accent: string;
  blurb: string;
}

function buildPlatformList(device: {
  redirectUrl: string | null;
  establishment: {
    name: string | null;
    airbnbListingUrl: string | null;
    googlePlaceId: string | null;
    bookingcomListingId: string | null;
    directBookingUrl: string | null;
  } | null;
}): PlatformOption[] {
  const e = device.establishment;
  const options: PlatformOption[] = [];

  // Airbnb first when present — most STR hosts care about it most.
  if (e?.airbnbListingUrl && isStorableRedirectUrl(e.airbnbListingUrl)) {
    options.push({
      platform: "airbnb",
      label: "Leave a review on Airbnb",
      url: e.airbnbListingUrl,
      accent: "#FF385C",
      blurb: "Opens your reservation in the Airbnb app or browser.",
    });
  }

  // Google next — works for any host with a GBP listing.
  if (e?.googlePlaceId) {
    options.push({
      platform: "google",
      label: "Leave a review on Google",
      url: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(e.googlePlaceId)}`,
      accent: "#4285F4",
      blurb: "Help future guests find this place.",
    });
  }

  // Booking.com — they only allow review submission for verified reservations.
  // We deep-link to the listing review page; the guest needs to be logged in.
  if (e?.bookingcomListingId) {
    options.push({
      platform: "booking_com",
      label: "Leave a review on Booking.com",
      url: `https://www.booking.com/hotel/au/${encodeURIComponent(e.bookingcomListingId)}.html#tab-reviews`,
      accent: "#003580",
      blurb: "Routes to your booking on Booking.com.",
    });
  }

  // TripAdvisor — we don't store a listing id but the device's primary
  // redirect_url can be a TripAdvisor URL. If it is, expose it as a choice.
  if (device.redirectUrl && /tripadvisor\.(com|co\.uk|com\.au|ca|de)/i.test(device.redirectUrl)) {
    options.push({
      platform: "tripadvisor",
      label: "Leave a review on TripAdvisor",
      url: device.redirectUrl,
      accent: "#34E0A1",
      blurb: "Particularly useful if guests found you there.",
    });
  }

  // Direct-booking CTA — only when host has configured one. Not a "review"
  // platform but the most common "next-tap" intent for return-bookers.
  if (e?.directBookingUrl && isStorableRedirectUrl(e.directBookingUrl)) {
    options.push({
      platform: "direct",
      label: "Book directly next time",
      url: e.directBookingUrl,
      accent: "#0b0d0e",
      blurb: "Save the Airbnb fee — book through the host directly.",
    });
  }

  return options;
}

function prettyPlatform(p: string): string {
  switch (p) {
    case "airbnb":
      return "Airbnb";
    case "google":
      return "Google";
    case "booking_com":
      return "Booking.com";
    case "tripadvisor":
      return "TripAdvisor";
    case "direct":
      return "the booking site";
    default:
      return "the review page";
  }
}

// =========================================================================
// Styles — kept inline so the page is self-contained and doesn't drag in
// the tenant app shell or stylesheet. This page is hit by complete
// strangers (guests at the property); we want it to render in <1 KB CSS.
// =========================================================================

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.06) 0%, transparent 40%), " +
    "radial-gradient(at 100% 100%, rgba(94, 234, 212, 0.08) 0%, transparent 50%), " +
    "linear-gradient(180deg, #f6f7f4 0%, #ecf1ec 100%)",
  display: "grid",
  placeItems: "center",
  padding: "32px 20px",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#0b0d0e",
};

const panelStyle: React.CSSProperties = {
  maxWidth: 480,
  width: "100%",
};

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  margin: 0,
  lineHeight: 1.18,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 14.5,
  color: "#475569",
  lineHeight: 1.55,
  marginTop: 10,
  maxWidth: 380,
  marginInline: "auto",
};

const footerStyle: React.CSSProperties = {
  marginTop: 22,
  textAlign: "center",
  fontSize: 11,
  color: "#94a3b8",
  lineHeight: 1.55,
};

const justChosenStyle: React.CSSProperties = {
  background: "#fef3c7",
  border: "1px solid #fde68a",
  color: "#92400e",
  borderRadius: 10,
  padding: "10px 14px",
  marginBottom: 14,
  fontSize: 13,
  textAlign: "center",
};
