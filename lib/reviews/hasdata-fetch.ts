import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { type NormalizedReview, ingestReviews } from "./ingest";

/**
 * HasData Google Maps review fetcher.
 *
 * WHY THIS EXISTS: the Google Business Profile API path (lib/reviews/
 * google-fetch.ts) needs a per-tenant OAuth connect AND Google's allow-listing
 * of our Cloud project, which is a multi-week approval. HasData scrapes the
 * PUBLIC Google Maps listing, so it needs only a Place ID — no OAuth, no
 * approval — which lets reviews flow for any business immediately.
 *
 * TRADEOFFS vs the GBP API (both paths stay; this does not replace it):
 *   - Read-only. Publishing a reply still requires the GBP API.
 *   - Public data only, and typically a capped window of recent reviews.
 *   - Costs credits per call, so the sync cadence matters.
 *
 * Reviews are written through the shared `ingestReviews` seam, so rows,
 * webhooks and contact captures are identical to the OAuth path — a review is
 * a review regardless of how it arrived.
 *
 * Enabled by setting HASDATA_API_KEY. Absent, every call returns a
 * `not_configured` result and NOTHING throws.
 */

const HASDATA_REVIEWS_URL = "https://api.hasdata.com/scrape/google-maps/reviews";
const REQUEST_TIMEOUT_MS = 30_000;

export type HasDataFetchResult = {
  establishmentId: string;
  fetched: number;
  inserted: number;
  error?: string;
};

export function isHasDataEnabled(): boolean {
  return Boolean(process.env.HASDATA_API_KEY);
}

/**
 * A GBP resource name ("accounts/{a}/locations/{l}") belongs to the OAuth
 * fetcher. HasData needs the public Maps Place ID (typically "ChIJ…"), so we
 * route on the stored value's shape rather than adding a schema column.
 */
export function looksLikePlaceId(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("accounts/") || v.includes("/locations/")) return false;
  return v.length >= 10;
}

/** HasData's payload varies by listing; every field is treated as optional. */
type HasDataReview = {
  reviewId?: string;
  review_id?: string;
  link?: string;
  rating?: number | string;
  snippet?: string;
  text?: string;
  date?: string;
  iso_date?: string;
  isoDate?: string;
  publishedAtDate?: string;
  user?: { name?: string; link?: string; thumbnail?: string };
  reviewer?: { name?: string; displayName?: string };
  name?: string;
};

function pickReviews(payload: unknown): HasDataReview[] {
  const p = payload as Record<string, unknown> | null;
  if (!p) return [];
  for (const key of ["reviews", "data", "results"]) {
    const v = p[key];
    if (Array.isArray(v)) return v as HasDataReview[];
  }
  return [];
}

function toRating(v: number | string | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function toDate(r: HasDataReview): Date {
  for (const raw of [r.iso_date, r.isoDate, r.publishedAtDate, r.date]) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Relative strings ("2 months ago") aren't parseable — fall back to now so the
  // review still lands rather than being dropped.
  return new Date();
}

function normalize(r: HasDataReview, placeId: string, index: number): NormalizedReview | null {
  const rating = toRating(r.rating);
  if (!rating) return null;
  // Prefer a provider id; fall back to the permalink, then a deterministic
  // composite so re-syncs still upsert onto the same row instead of duplicating.
  const externalId =
    r.reviewId ??
    r.review_id ??
    r.link ??
    `hasdata:${placeId}:${(r.user?.name ?? r.reviewer?.name ?? "anon").slice(0, 40)}:${index}`;
  return {
    externalId,
    reviewerName: r.user?.name ?? r.reviewer?.name ?? r.reviewer?.displayName ?? r.name ?? null,
    rating,
    body: r.snippet ?? r.text ?? null,
    postedAt: toDate(r),
    raw: r,
  };
}

/**
 * Fetch + ingest public Google reviews for one establishment via HasData.
 * NEVER throws — all failures come back as `{ error }`.
 */
export async function fetchReviewsViaHasData(args: {
  orgId: string;
  establishmentId: string;
  placeId: string;
}): Promise<HasDataFetchResult> {
  const { orgId, establishmentId, placeId } = args;
  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return { establishmentId, fetched: 0, inserted: 0, error: "not_configured" };
  }

  const url = `${HASDATA_REVIEWS_URL}?placeId=${encodeURIComponent(placeId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "reviews.hasdata.fetch_failed", orgId, establishmentId, error: e });
    return {
      establishmentId,
      fetched: 0,
      inserted: 0,
      error: `hasdata_fetch_failed: ${e.slice(0, 160)}`,
    };
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({
      event: "reviews.hasdata.http_error",
      orgId,
      establishmentId,
      status: res.status,
    });
    return {
      establishmentId,
      fetched: 0,
      inserted: 0,
      error: `hasdata_${res.status}: ${text.slice(0, 160)}`,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { establishmentId, fetched: 0, inserted: 0, error: "hasdata_bad_json" };
  }

  const normalized = pickReviews(payload)
    .map((r, i) => normalize(r, placeId, i))
    .filter((r): r is NormalizedReview => r !== null);

  if (normalized.length === 0) {
    return { establishmentId, fetched: 0, inserted: 0 };
  }

  const { fetched, inserted } = await ingestReviews({
    orgId,
    establishmentId,
    source: "google",
    reviews: normalized,
    activityTitle: "Left a Google review",
  });

  await prisma.establishment
    .update({ where: { id: establishmentId }, data: { updatedAt: new Date() } })
    .catch(() => {});

  logger.info({ event: "reviews.hasdata.synced", orgId, establishmentId, fetched, inserted });
  return { establishmentId, fetched, inserted };
}

/**
 * Sync every establishment that has a Place ID stored, via HasData.
 * Independent of Connection rows — no OAuth involved.
 */
export async function syncAllViaHasData(): Promise<{
  total: number;
  results: HasDataFetchResult[];
}> {
  if (!isHasDataEnabled()) return { total: 0, results: [] };

  const establishments = await prisma.establishment.findMany({
    where: { deletedAt: null, googlePlaceId: { not: null } },
    select: { id: true, organizationId: true, googlePlaceId: true },
  });

  const results: HasDataFetchResult[] = [];
  for (const e of establishments) {
    if (!looksLikePlaceId(e.googlePlaceId)) continue; // GBP resource name → OAuth path
    results.push(
      await fetchReviewsViaHasData({
        orgId: e.organizationId,
        establishmentId: e.id,
        placeId: (e.googlePlaceId as string).trim(),
      }),
    );
  }
  return { total: results.length, results };
}
