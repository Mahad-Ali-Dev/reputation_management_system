import { logger } from "@/lib/logger";

/**
 * Google Maps business SEARCH via HasData.
 *
 * Powers the in-app location picker: the owner types their business name and
 * picks their listing, instead of hunting for a Place ID in Google's developer
 * tooling and pasting a raw "ChIJ…" string.
 *
 * This is the piece that makes onboarding self-serve WITHOUT Google approval —
 * the GBP equivalent (accounts.locations.list) needs the allow-listing we're
 * still waiting on, whereas Maps search is public.
 *
 * Costs a HasData credit per search, so callers should debounce and enforce a
 * minimum query length. NEVER throws.
 */

const SEARCH_URL = "https://api.hasdata.com/scrape/google-maps/search";
const REQUEST_TIMEOUT_MS = 20_000;

export type PlaceCandidate = {
  placeId: string;
  title: string;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  website: string | null;
  phone: string | null;
};

export type PlaceSearchResult =
  | { ok: true; results: PlaceCandidate[] }
  | { ok: false; error: string };

export function isPlaceSearchEnabled(): boolean {
  return Boolean(process.env.HASDATA_API_KEY);
}

/**
 * HasData's local-results array has appeared under several keys across their
 * Maps endpoints, so probe rather than assume — the same defensive read used by
 * the reviews fetcher.
 */
function pickResults(payload: unknown): Record<string, unknown>[] {
  const p = payload as Record<string, unknown> | null;
  if (!p) return [];
  for (const key of ["localResults", "local_results", "places", "results", "data"]) {
    const v = p[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Review counts arrive as "1,234" on some listings.
    const n = Number.parseFloat(v.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalize(r: Record<string, unknown>): PlaceCandidate | null {
  const placeId = str(r.placeId) ?? str(r.place_id) ?? str(r.dataId) ?? str(r.data_id);
  const title = str(r.title) ?? str(r.name);
  // Without a place id we can't sync anything, so the row is useless to us.
  if (!placeId || !title) return null;
  return {
    placeId,
    title,
    address: str(r.address) ?? str(r.formattedAddress) ?? str(r.formatted_address),
    rating: num(r.rating),
    reviewCount:
      num(r.reviews) ?? num(r.reviewCount) ?? num(r.reviews_count) ?? num(r.userRatingCount),
    category: str(r.type) ?? str(r.category) ?? str(r.primaryType),
    website: str(r.website),
    phone: str(r.phone) ?? str(r.phoneNumber),
  };
}

/**
 * Search Google Maps for a business. `near` biases results (e.g. the org's
 * city) — worth passing, because a bare trade name matches nationwide.
 */
export async function searchGooglePlaces(args: {
  query: string;
  near?: string | null;
  limit?: number;
}): Promise<PlaceSearchResult> {
  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) return { ok: false, error: "not_configured" };

  const q = args.query.trim();
  // Guard the credit spend — a 1-2 char query returns noise anyway.
  if (q.length < 3) return { ok: true, results: [] };

  const params = new URLSearchParams({ q: args.near ? `${q} ${args.near}` : q });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let payload: unknown;
  try {
    const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ event: "places.search.http_error", status: res.status });
      return { ok: false, error: `search_${res.status}: ${text.slice(0, 160)}` };
    }
    payload = await res.json();
  } catch (err) {
    clearTimeout(timer);
    const e = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "places.search.failed", error: e });
    return { ok: false, error: `search_failed: ${e.slice(0, 160)}` };
  }

  const results = pickResults(payload)
    .map(normalize)
    .filter((r): r is PlaceCandidate => r !== null)
    .slice(0, args.limit ?? 8);

  return { ok: true, results };
}
