import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Per-org cache helpers.
 *
 * Why: pages render dynamically (cookies → auth → orgId), so Next.js's
 * page-level ISR doesn't apply. But individual sub-queries — establishment
 * list, plan info, sentiment aggregates — change infrequently per org. We
 * memoize those at the function level with a cache key that includes the
 * orgId, so each org has its own cache slot.
 *
 * Cache tags follow `org:{orgId}:{resource}` so a write action can call
 * `bustOrgCache(orgId, "establishments")` and invalidate just that slot.
 *
 * Example:
 *   // Read-heavy: list of establishments per org.
 *   const listOrgEstablishments = orgCached(
 *     "establishments",
 *     async (orgId: string) =>
 *       withTenant(orgId, (tx) => tx.establishment.findMany({ ... })),
 *     { swr: 60, ttl: 30 },
 *   );
 *
 *   // Inside a server action that mutates an establishment:
 *   await prisma.establishment.update({ ... });
 *   bustOrgCache(orgId, "establishments");
 */

export type CacheOptions = {
  /** Stale-while-revalidate window in seconds. Default 60. */
  swr?: number;
  /** Hard TTL in seconds — must refresh after this. Default 30. */
  ttl?: number;
};

/**
 * Wraps a fetcher function with per-org memoization.
 *
 * Pass a unique `resource` name. The cache key is `[resource, orgId]` and
 * the tag is `org:{orgId}:{resource}` — so you can `revalidateTag` either
 * the whole org (`org:{orgId}:all`) or a single resource.
 */
export function orgCached<T>(
  resource: string,
  fetcher: (orgId: string) => Promise<T>,
  opts: CacheOptions = {},
): (orgId: string) => Promise<T> {
  const { swr = 60 } = opts;
  return async (orgId: string) => {
    const cached = unstable_cache(() => fetcher(orgId), [resource, orgId], {
      revalidate: swr,
      tags: [`org:${orgId}:${resource}`, `org:${orgId}:all`],
    });
    return cached();
  };
}

/**
 * Wraps a fetcher with global (cross-tenant) memoization. Use sparingly —
 * only for genuinely shared data like the provider registry or marketing
 * pricing tables.
 */
export function globalCached<T>(
  resource: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions = {},
): () => Promise<T> {
  const { swr = 300 } = opts;
  return unstable_cache(fetcher, [resource], {
    revalidate: swr,
    tags: [`global:${resource}`],
  });
}

/**
 * Invalidate one resource for one org.
 *   bustOrgCache("9f8e...", "establishments")
 */
export function bustOrgCache(orgId: string, resource: string): void {
  revalidateTag(`org:${orgId}:${resource}`);
}

/**
 * Invalidate every cached resource for one org. Use after big-impact
 * actions: plan change, org delete, ownership transfer.
 */
export function bustAllOrgCache(orgId: string): void {
  revalidateTag(`org:${orgId}:all`);
}

/** Invalidate a global cache slot. */
export function bustGlobalCache(resource: string): void {
  revalidateTag(`global:${resource}`);
}
