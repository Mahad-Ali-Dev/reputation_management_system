import { decrypt, type EncryptionContext } from "@/lib/crypto/envelope";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { gbpPerformanceRun } from "./_transport";

/**
 * GBP Insights adapter (Module 13) — Google Business Profile **Performance** API.
 *
 * The "free-ish" SEO tier: it reuses the EXISTING `google_business` OAuth
 * connection token (same envelope-decrypt path as `lib/reviews/google-fetch.ts`)
 * rather than a new paid provider. Returns business-profile demand metrics
 * (profile views, searches, direction requests, calls) for the Overview/SEO
 * tabs AND for module 15's ROI funnel (reviews → views → calls → bookings).
 *
 * ── HARD CONTRACT (do not change name/shape) ──────────────────────────────
 * `getGbpInsights(orgId)` is imported by module 15 (`lib/roi/*`) for the
 * `gbpViews` funnel stage. It MUST return
 *   { available: boolean; views?; calls?; directions?; searches? }
 * and MUST be `{available:false}`-tolerant (never throw, never a hard dep).
 *
 * ── ENV / CONNECTION GATE ─────────────────────────────────────────────────
 * With no ACTIVE `google_business` connection (or a connection that lacks the
 * Performance scope / has an expired token), this returns `{ available:false }`
 * and makes ZERO network calls. The Performance API may require a scope beyond
 * `business.manage`; insufficient scope ⇒ `{ available:false }` (prompt
 * re-connect) — it never throws and never touches the review-fetch connection.
 *
 * Fail-soft on the unmigrated `connections` table (Postgres 42P01/42703).
 */

/** The metric shape both the funnel (m15) and the SEO panel consume. */
export type GbpInsights = {
  available: boolean;
  views?: number;
  calls?: number;
  directions?: number;
  searches?: number;
};

const PROVIDER = "google_business";

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/**
 * Resolve the decrypted GBP access token + location for an org's active
 * connection. Returns null when there is no usable connection (no row, no
 * establishment/place id, expired token, decrypt failure, or unmigrated table).
 */
async function resolveGbpToken(
  orgId: string,
): Promise<{ accessToken: string; locationName: string } | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const conn = await tx.connection.findFirst({
        where: { provider: PROVIDER, status: "active" },
        include: { establishment: true },
        orderBy: { lastSyncedAt: "desc" },
      });
      if (!conn) return null;
      const placeId = conn.establishment?.googlePlaceId;
      if (!placeId) return null;
      if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) return null;

      const ctx: EncryptionContext = (conn.encryptionCtx as unknown as EncryptionContext) ?? {
        orgId: conn.organizationId,
        provider: PROVIDER,
        purpose: "oauth",
      };
      let accessToken: string;
      try {
        accessToken = decrypt({
          ciphertext: Buffer.from(conn.accessTokenCt),
          iv: Buffer.from(conn.iv),
          dekCiphertext: Buffer.from(conn.dekCiphertext),
          keyVersion: conn.keyVersion,
          encryptionContext: ctx,
        });
      } catch {
        return null; // decrypt failure ⇒ treat as unavailable (never throw)
      }
      const locationName = placeId.startsWith("accounts/")
        ? placeId
        : `accounts/-/locations/${placeId}`;
      return { accessToken, locationName };
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        event: "seo.gbp_insights.resolve_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

/**
 * Internal: fetch insights for an org (+ optional establishment). The
 * establishment arg is accepted for parity with the other adapters and future
 * per-location resolution; today the active connection's location is used.
 */
export async function fetchGbpInsights(args: {
  orgId: string;
  establishmentId?: string | null;
}): Promise<GbpInsights> {
  const resolved = await resolveGbpToken(args.orgId);
  if (!resolved) return { available: false };

  try {
    const data = await gbpPerformanceRun(resolved);
    if (!data) return { available: false };
    return {
      available: true,
      views: data.views,
      calls: data.calls,
      directions: data.directions,
      searches: data.searches,
    };
  } catch (err) {
    logger.warn({
      orgId: args.orgId,
      event: "seo.gbp_insights.fetch_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false };
  }
}

/**
 * HARD CONTRACT entry point (module 15 imports THIS exact name + shape).
 * Thin wrapper over `fetchGbpInsights` keyed only by orgId.
 */
export async function getGbpInsights(orgId: string): Promise<GbpInsights> {
  return fetchGbpInsights({ orgId });
}
