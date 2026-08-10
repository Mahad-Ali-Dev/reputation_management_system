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
/** Hard stop on the pagination loop — every page costs HasData credits. */
const MAX_PAGES = 60;

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

/**
 * True for a Google MAPS Place ID ("ChIJ…", "GhIJ…", "EiQ…") as opposed to a GBP
 * location id (numeric) or a full resource name.
 *
 * Used to keep the two fetchers from BOTH claiming one establishment. The GBP
 * fetcher selects by Connection row and HasData selects by Place ID, so an
 * establishment with a connection AND a Place ID was picked up twice — which
 * would insert each review under two different external ids (a GBP resource
 * name and a HasData review id) once the GBP API is live. A Maps Place ID is
 * also simply not a valid GBP location, so wrapping it as
 * `accounts/-/locations/ChIJ…` could never have worked.
 */
export function isMapsPlaceId(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("accounts/") || v.includes("/locations/")) return false;
  // GBP location ids are all-digits; a Maps Place ID is a mixed-case token.
  return !/^\d+$/.test(v);
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

/** Pull the next-page cursor out of whichever field this listing returned it in. */
function nextCursor(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p) return null;
  const direct = p.nextPageToken ?? p.next_page_token ?? p.nextPage ?? p.cursor;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const pag = (p.pagination ?? p.meta) as Record<string, unknown> | undefined;
  if (pag) {
    const nested = pag.nextPageToken ?? pag.next_page_token ?? pag.next ?? pag.cursor;
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  return null;
}

/** One page. Separated so the pagination loop stays readable. */
async function fetchPage(
  apiKey: string,
  placeId: string,
  cursor: string | null,
): Promise<{ ok: true; payload: unknown } | { ok: false; error: string }> {
  // HasData's `sortBy` is a strict enum: mostRelevant | newestFirst | ratingHigh
  // | ratingLow. Anything else 422s the whole request.
  const params = new URLSearchParams({ placeId, sortBy: "newestFirst" });
  if (cursor) params.set("nextPageToken", cursor);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${HASDATA_REVIEWS_URL}?${params.toString()}`, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `hasdata_${res.status}: ${text.slice(0, 160)}` };
    }
    try {
      return { ok: true, payload: await res.json() };
    } catch {
      return { ok: false, error: "hasdata_bad_json" };
    }
  } catch (err) {
    clearTimeout(timer);
    const e = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `hasdata_fetch_failed: ${e.slice(0, 160)}` };
  }
}

/**
 * Fetch + ingest public Google reviews for one establishment via HasData.
 * NEVER throws — all failures come back as `{ error }`.
 *
 * PAGINATES: HasData returns one page (~8-20 reviews) per call, so a listing
 * with hundreds of reviews needs the cursor followed. Bounded by
 * HASDATA_MAX_REVIEWS (default 500) and MAX_PAGES because every page costs
 * credits — an unbounded loop on a busy listing is a real bill.
 */
export async function fetchReviewsViaHasData(args: {
  orgId: string;
  establishmentId: string;
  placeId: string;
  /** Override the per-run cap (used by the manual backfill). */
  maxReviews?: number;
}): Promise<HasDataFetchResult> {
  const { orgId, establishmentId, placeId } = args;
  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return { establishmentId, fetched: 0, inserted: 0, error: "not_configured" };
  }

  const envMax = Number.parseInt(process.env.HASDATA_MAX_REVIEWS ?? "", 10);
  const maxReviews = args.maxReviews ?? (Number.isFinite(envMax) && envMax > 0 ? envMax : 500);

  const collected: NormalizedReview[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let firstError: string | null = null;

  while (pages < MAX_PAGES && collected.length < maxReviews) {
    const page: Awaited<ReturnType<typeof fetchPage>> = await fetchPage(apiKey, placeId, cursor);
    if (!page.ok) {
      // A mid-pagination failure keeps whatever we already have rather than
      // throwing the whole run away.
      firstError = page.error;
      break;
    }
    pages++;

    const batch = pickReviews(page.payload)
      .map((r, i) => normalize(r, placeId, collected.length + i))
      .filter((r): r is NormalizedReview => r !== null);
    if (batch.length === 0) break;

    for (const r of batch) {
      if (seen.has(r.externalId)) continue;
      seen.add(r.externalId);
      collected.push(r);
    }

    cursor = nextCursor(page.payload);
    if (!cursor) break; // last page
  }

  if (collected.length === 0) {
    return {
      establishmentId,
      fetched: 0,
      inserted: 0,
      ...(firstError ? { error: firstError } : {}),
    };
  }

  const normalized = collected.slice(0, maxReviews);

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

  logger.info({
    event: "reviews.hasdata.synced",
    orgId,
    establishmentId,
    pages,
    fetched,
    inserted,
  });
  return { establishmentId, fetched, inserted, ...(firstError ? { error: firstError } : {}) };
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
