"use server";

import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { fetchReviewsViaHasData } from "@/lib/reviews/hasdata-fetch";
import {
  type PlaceCandidate,
  isPlaceSearchEnabled,
  searchGooglePlaces,
} from "@/lib/reviews/hasdata-places";
import { revalidatePath } from "next/cache";

/**
 * In-app Google Maps location picker.
 *
 * Replaces "go find your Place ID in Google's developer tools and paste the
 * ChIJ… string" with: type your business name, pick your listing, reviews start
 * syncing. Works without any Google approval because HasData reads public Maps
 * data (the GBP equivalent, accounts.locations.list, needs the allow-listing
 * we're still waiting on).
 *
 * Both actions RETURN their errors — they're called from client islands, and a
 * throw would be masked into a generic message by Next in production.
 */

export type PlaceSearchState =
  | { ok: true; results: PlaceCandidate[] }
  | { ok: false; error: string };

export async function searchPlacesForEstablishment(
  query: string,
  near?: string | null,
): Promise<PlaceSearchState> {
  try {
    await requireRole("manager");
    if (!isPlaceSearchEnabled()) {
      return {
        ok: false,
        error: "Business search isn't configured on this deployment yet (missing HASDATA_API_KEY).",
      };
    }
    const res = await searchGooglePlaces({ query, near });
    if (!res.ok) {
      return { ok: false, error: "Couldn't search Google right now. Try again in a moment." };
    }
    return { ok: true, results: res.results };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "You need manager access to link a Google listing." };
    }
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
    logger.error({
      event: "places.search_action_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Search failed. Try again." };
  }
}

export type LinkPlaceState =
  | { ok: true; fetched: number; inserted: number }
  | { ok: false; error: string };

/**
 * Link a chosen listing to an establishment and pull its reviews immediately,
 * so the owner sees them right away instead of waiting for the hourly cron.
 */
export async function linkGooglePlace(args: {
  establishmentId: string;
  placeId: string;
  title?: string;
}): Promise<LinkPlaceState> {
  try {
    const { orgId, userId } = await requireRole("manager");

    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(args.placeId)) {
      return { ok: false, error: "That listing has an unrecognized id. Pick another result." };
    }
    if (!/^[0-9a-f-]{36}$/i.test(args.establishmentId)) {
      return { ok: false, error: "Invalid establishment." };
    }

    // One Google listing per establishment, and not one already claimed by a
    // DIFFERENT establishment in this org — two businesses pointing at the same
    // listing would double-ingest the same reviews under both.
    const clash = await withTenant(orgId, (tx) =>
      tx.establishment.findFirst({
        where: {
          googlePlaceId: args.placeId,
          id: { not: args.establishmentId },
          deletedAt: null,
        },
        select: { name: true },
      }),
    );
    if (clash) {
      return {
        ok: false,
        error: `That Google listing is already linked to "${clash.name}".`,
      };
    }

    await withTenant(orgId, async (tx) => {
      await tx.establishment.update({
        where: { id: args.establishmentId },
        data: { googlePlaceId: args.placeId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "establishment.google_place_linked",
          resourceType: "establishment",
          resourceId: args.establishmentId,
          afterData: { google_place_id: args.placeId, title: args.title ?? null, via: "picker" },
        },
      });
    });

    // Immediate first pull. Full walk, since this establishment has nothing yet.
    const sync = await fetchReviewsViaHasData({
      orgId,
      establishmentId: args.establishmentId,
      placeId: args.placeId,
      fullSync: true,
    });

    revalidatePath(`/establishments/${args.establishmentId}`);
    revalidatePath("/establishments");
    revalidatePath("/reviews");
    revalidatePath("/dashboard");

    if (sync.error && sync.fetched === 0) {
      // The link SAVED — only the first pull failed, and the cron will retry.
      return {
        ok: false,
        error:
          "Listing linked, but we couldn't pull reviews just now. They'll sync automatically within the hour.",
      };
    }
    return { ok: true, fetched: sync.fetched, inserted: sync.inserted };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "You need manager access to link a Google listing." };
    }
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
    logger.error({
      event: "places.link_action_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Couldn't link that listing. Try again." };
  }
}
