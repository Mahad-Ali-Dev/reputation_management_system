import { env } from "@/lib/env";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { ga4RunReport } from "./_transport";

/**
 * GA4 adapter (Module 13) — Google Analytics Data API (runReport).
 *
 * Returns website-traffic cards (sessions, bounce rate, top pages) for the SEO
 * & Visibility tab + Overview "Website Sessions" KPI.
 *
 * ── ENV / CONNECTION GATE ─────────────────────────────────────────────────
 * Needs BOTH the global service-account creds (`GA4_CLIENT_EMAIL` +
 * `GA4_PRIVATE_KEY`) AND a per-org `Ga4Connection` property id (or the global
 * `GA4_PROPERTY_ID` fallback). Missing either ⇒ `{ available:false }` and ZERO
 * network calls. The provider seam (`callGa4`) is the single outbound point so
 * tests can assert the no-call guarantee.
 *
 * Fail-soft on the unmigrated `ga4_connections` table (Postgres 42P01/42703).
 */

export type Ga4Summary = {
  available: boolean;
  sessions?: number;
  bounceRate?: number; // 0..1
  topPages?: { path: string; views: number }[];
  propertyId?: string;
};

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** True when the global GA4 service-account creds are present. */
export function ga4CredsConfigured(): boolean {
  return Boolean(env.GA4_CLIENT_EMAIL && env.GA4_PRIVATE_KEY);
}

/** Resolve the GA4 property id for an org/establishment (or global fallback). */
async function resolvePropertyId(
  orgId: string,
  establishmentId?: string | null,
): Promise<string | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const conn = await tx.ga4Connection.findFirst({
        where: {
          status: "active",
          ...(establishmentId ? { establishmentId } : {}),
        },
        orderBy: { lastSyncedAt: "desc" },
        select: { propertyId: true },
      });
      return conn?.propertyId ?? (env.GA4_PROPERTY_ID || null);
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        event: "seo.ga4.resolve_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Even when the table is missing, a global property id can still work.
    return env.GA4_PROPERTY_ID ? env.GA4_PROPERTY_ID : null;
  }
}

export async function fetchGa4Summary(args: {
  orgId: string;
  establishmentId?: string | null;
}): Promise<Ga4Summary> {
  if (!ga4CredsConfigured()) return { available: false };

  const propertyId = await resolvePropertyId(args.orgId, args.establishmentId);
  if (!propertyId) return { available: false };

  try {
    const data = await ga4RunReport({
      clientEmail: env.GA4_CLIENT_EMAIL,
      privateKey: env.GA4_PRIVATE_KEY,
      propertyId,
    });
    if (!data) return { available: false };
    return {
      available: true,
      sessions: data.sessions,
      bounceRate: data.bounceRate,
      topPages: data.topPages ?? [],
      propertyId,
    };
  } catch (err) {
    logger.warn({
      orgId: args.orgId,
      event: "seo.ga4.fetch_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false };
  }
}
