import type { Connection, Establishment, Prisma } from "@prisma/client";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { decrypt, type EncryptionContext } from "@/lib/crypto/envelope";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { dispatchWebhookInBackground } from "@/lib/notifications/webhook";
import { isMapsPlaceId } from "./hasdata-fetch";

/**
 * Google Business Profile review fetcher.
 *
 * Called by the cron worker every 15 min for each active GBP connection.
 * Upserts on (establishment_id, source, external_id) so it's safe to re-run.
 *
 * Day 3 v1 limitation: does NOT auto-refresh expired tokens — the publish path does that
 * inline; for fetch we just log + skip if token expired. Token-refresh worker = Day 11.
 */

type GbpReview = {
  name: string; // accounts/{a}/locations/{l}/reviews/{r}
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime: string };
};

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export type FetchResult = {
  establishmentId: string;
  fetched: number;
  inserted: number;
  error?: string;
};

export async function fetchReviewsForConnection(
  conn: Connection & { establishment: Establishment | null },
): Promise<FetchResult> {
  const establishmentId = conn.establishmentId;
  if (!establishmentId || !conn.establishment) {
    return {
      establishmentId: "",
      fetched: 0,
      inserted: 0,
      error: "connection_has_no_establishment",
    };
  }
  if (!conn.establishment.googlePlaceId) {
    return {
      establishmentId,
      fetched: 0,
      inserted: 0,
      error: "no_google_place_id",
    };
  }
  if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) {
    return { establishmentId, fetched: 0, inserted: 0, error: "token_expired" };
  }

  // Decrypt access token
  const ctx: EncryptionContext = (conn.encryptionCtx as unknown as EncryptionContext) ?? {
    orgId: conn.organizationId,
    provider: "google_business",
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
  } catch (err) {
    return {
      establishmentId,
      fetched: 0,
      inserted: 0,
      error: `decrypt_failed: ${String(err)}`,
    };
  }

  // A Google MAPS Place ID ("ChIJ…") belongs to the HasData fetcher, not here:
  // it is not a GBP location, so `accounts/-/locations/ChIJ…` can never resolve.
  // Skipping it also stops BOTH fetchers claiming one establishment — which
  // would store each review twice, once per source's external id.
  if (isMapsPlaceId(conn.establishment.googlePlaceId)) {
    return { establishmentId, fetched: 0, inserted: 0, error: "place_id_handled_by_hasdata" };
  }

  // googlePlaceId is what the tenant pasted. The GBP API needs accounts/{aId}/locations/{lId}.
  // For Day 3 v1 we assume the place id IS the location resource. Refinement: list accounts + locations
  // and store the full resource path during the OAuth flow (Day 11 hardening).
  const locationName = conn.establishment.googlePlaceId.startsWith("accounts/")
    ? conn.establishment.googlePlaceId
    : `accounts/-/locations/${conn.establishment.googlePlaceId}`;

  const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      establishmentId,
      fetched: 0,
      inserted: 0,
      error: `gbp_${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as { reviews?: GbpReview[] };
  const reviews = data.reviews ?? [];

  let inserted = 0;
  await withTenant(conn.organizationId, async (tx) => {
    for (const r of reviews) {
      const rating = r.starRating ? STAR_MAP[r.starRating] : null;
      const postedAt = r.createTime ? new Date(r.createTime) : new Date();
      if (!rating) continue;

      const result = await tx.review.upsert({
        where: {
          establishmentId_source_externalId: {
            establishmentId,
            source: "google",
            externalId: r.name,
          },
        },
        create: {
          organizationId: conn.organizationId,
          establishmentId,
          source: "google",
          externalId: r.name,
          reviewerName: r.reviewer?.displayName ?? null,
          rating,
          body: r.comment ?? null,
          postedAt,
          raw: r as unknown as Prisma.InputJsonValue,
        },
        update: {
          body: r.comment ?? null,
          // posted_at and rating shouldn't change, but we update other fields
        },
      });
      if (result.fetchedAt.getTime() >= Date.now() - 2000) {
        inserted++;
        // Fire the review.created webhook for genuinely new reviews. Fire-and-
        // forget + fail-soft so a customer endpoint can never slow/break ingest.
        dispatchWebhookInBackground(conn.organizationId, "review.created", {
          reviewId: result.id,
          establishmentId,
          source: "google",
          rating,
          reviewerName: r.reviewer?.displayName ?? null,
          body: r.comment ?? null,
          postedAt: postedAt.toISOString(),
        });
      }

      // Auto-capture the review author into the Contact directory. Fire-and-
      // forget + fail-soft: the hook never throws and dedupes internally, so a
      // capture failure can never break / slow review ingest. Google reviews
      // carry no email/phone, so we dedupe on (org, "review", externalId) and
      // record the reviewer's display name.
      const reviewerName = r.reviewer?.displayName ?? null;
      if (reviewerName) {
        captureContactInBackground({
          orgId: conn.organizationId,
          source: "review",
          externalId: r.name,
          name: reviewerName,
          establishmentId,
          occurredAt: postedAt,
          activity: {
            title: "Left a Google review",
            externalRef: `review:${r.name}`,
          },
        });
      }
    }
  });

  // Update connection's last_synced_at
  await prisma.connection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date() },
  });

  return { establishmentId, fetched: reviews.length, inserted };
}

/**
 * Fetch all active google_business connections and pull reviews.
 * Called by /api/cron/sync-reviews on a Vercel Cron schedule.
 */
export async function syncAllActiveConnections(): Promise<{
  total: number;
  results: FetchResult[];
}> {
  // Read across all tenants — uses owner role (not withTenant) since cron is system-tier.
  // The fetch itself stays tenant-scoped via withTenant inside fetchReviewsForConnection.
  const connections = await prisma.connection.findMany({
    where: { provider: "google_business", status: "active" },
    include: { establishment: true },
  });

  const results: FetchResult[] = [];
  for (const conn of connections) {
    try {
      results.push(await fetchReviewsForConnection(conn));
    } catch (err) {
      results.push({
        establishmentId: conn.establishmentId ?? "",
        fetched: 0,
        inserted: 0,
        error: String(err),
      });
    }
  }

  logger.info(
    { total: connections.length, results, event: "cron.reviews.sync_done" },
    "review sync cron complete",
  );

  return { total: connections.length, results };
}
