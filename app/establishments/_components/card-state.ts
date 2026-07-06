/**
 * Pure, serializable state-derivation for the My Establishments redesign.
 *
 * The list page (`app/establishments/page.tsx`) fetches rows via
 * `listEstablishmentsForCards` and passes the derived shapes here as plain
 * props into the server components in this folder. Keeping the logic pure (no
 * Prisma, no React) means the empty-vs-connected branch and the device-prompt
 * visibility rule are covered by fast unit tests
 * (`tests/establishments/card-state.test.ts`) without mocking the DB —
 * matching the repo's "test the pure core" style.
 */

import type { EstablishmentCardData } from "@/lib/establishments/queries";

/** Plain device summary used by both the prompt-banner logic and the row. */
export type DeviceSummary = {
  id: string;
  productKind: string;
  productSku: string;
  status: string;
  scanCount: number;
  lastScanAt: Date | null;
};

/**
 * Fully-resolved props for one establishment. Everything the list-page server
 * components (`SummaryCards`, `BusinessList`, `DevicesStrip`) need is
 * precomputed here so they never touch Prisma and stay server components.
 */
export type EstablishmentCardState = {
  id: string;
  name: string;
  category: string | null;
  imageUrl: string | null;
  googlePlaceId: string | null;
  /** One-line address rendered next to the pin icon ("—" when unknown). */
  addressLine: string;
  phone: string | null;
  /** True when an active Google Business connection exists. */
  connected: boolean;
  /** The active Google connection id (for the disconnect form), if any. */
  connectionId: string | null;
  totalReviews: number;
  /** Average rating rounded to 1dp, or null when there are no reviews. */
  avgRating: number | null;
  /** lastSyncedAt of the active Google connection, if any. */
  lastSyncedAt: Date | null;
  devices: DeviceSummary[];
};

type AddressLike = {
  line1?: string;
  street?: string;
  city?: string;
  region?: string;
  postal?: string;
  postcode?: string;
  country?: string;
} | null;

/**
 * Compose a single-line address from the JSON `address` blob. Tolerates both
 * the create-form shape (`line1`/`postal`) and the legacy shape
 * (`street`/`postcode`) seen elsewhere in the codebase.
 */
export function addressLine(addr: unknown): string {
  const a = (addr ?? null) as AddressLike;
  if (!a || typeof a !== "object") return "—";
  const parts = [a.line1 ?? a.street, a.city, a.region, a.postal ?? a.postcode].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : "—";
}

/** Compact "x ago" relative time used in the "Last synced" line. */
export function relativeTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString();
}

/**
 * Human label for a linked device, derived from its kind/sku — mirrors the
 * spirit of `app/hardware/page.tsx`'s `titleFromSku`, but resilient to either
 * field being the descriptive one.
 */
export function titleFromKind(device: { productKind: string; productSku: string }): string {
  const hay = `${device.productKind} ${device.productSku}`.toLowerCase();
  if (hay.includes("plaque")) return "Wall Plaque";
  if (hay.includes("stand")) return "Counter Stand";
  if (hay.includes("card") && hay.includes("wifi")) return "WiFi Card";
  if (hay.includes("card")) return "Counter Card";
  if (hay.includes("nfc")) return "NFC Tag";
  if (hay.includes("multi")) return "Multi-Platform QR";
  return "QR Device";
}

/**
 * Derive the fully-resolved card state from a raw query row. Pure: counts the
 * active Google connection, averages the review ratings, and normalizes the
 * address — no DB, no React.
 */
export function deriveCardState(est: EstablishmentCardData): EstablishmentCardState {
  // The query already filters connections to the active Google Business one,
  // but be defensive: only treat a `google_business`/`active` row as connected.
  const googleConn = est.connections.find(
    (c) => c.provider === "google_business" && c.status === "active",
  );
  const ratings = est.reviews.map((r) => r.rating);
  const totalReviews = ratings.length;
  const avgRating =
    totalReviews > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / totalReviews) * 10) / 10
      : null;

  return {
    id: est.id,
    name: est.name,
    category: est.category,
    imageUrl: est.imageUrl,
    googlePlaceId: est.googlePlaceId,
    addressLine: addressLine(est.address),
    phone: est.phone,
    connected: !!googleConn,
    connectionId: googleConn?.id ?? null,
    totalReviews,
    avgRating,
    lastSyncedAt: googleConn?.lastSyncedAt ?? null,
    devices: est.devices.map((d) => ({
      id: d.id,
      productKind: d.productKind,
      productSku: d.productSku,
      status: d.status,
      scanCount: d.scanCount,
      lastScanAt: d.lastScanAt,
    })),
  };
}

/**
 * The device-prompt banner shows ONLY when an establishment has zero linked
 * devices. Otherwise the page renders the linked-devices summary row instead.
 */
export function shouldShowDevicePrompt(est: { devices: { length: number } }): boolean {
  return est.devices.length === 0;
}

/** Kit avatar/tile tints, cycled by list position (mockup order). */
export const EST_TINTS = ["violet", "peach", "teal", "indigo"] as const;
export type EstTint = (typeof EST_TINTS)[number];

/** Deterministic tile tint for an establishment at a given index. */
export function tintForIndex(i: number): EstTint {
  return EST_TINTS[i % EST_TINTS.length] as EstTint;
}

/** Two-letter avatar initials (e.g. "Bloom & Co." → "BC"). */
export function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Signed review-volume trend, this trailing 30 days vs the prior 30 days.
 * Returns null when there is no prior-period baseline to compare against
 * (avoids a misleading "+100%" when a business is brand-new). Positive =
 * more reviews recently.
 */
export function reviewTrendPct(
  reviews: Array<{ postedAt?: Date }>,
  now: Date = new Date(),
): number | null {
  const end = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const mid = end - 30 * day;
  const start = end - 60 * day;
  let recent = 0;
  let prior = 0;
  for (const r of reviews) {
    const t = r.postedAt?.getTime();
    if (t === undefined) continue;
    if (t > mid && t <= end) recent += 1;
    else if (t > start && t <= mid) prior += 1;
  }
  if (prior === 0) return null;
  return Math.round(((recent - prior) / prior) * 100);
}
