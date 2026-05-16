import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";

/**
 * Feature flag client.
 *
 * Read flow:
 *   1. Look up org-specific row (key, organization_id = orgId)
 *   2. If not found, look up global row (key, organization_id = NULL)
 *   3. If neither found, return the supplied `defaultValue`
 *
 * Rollout percentage:
 *   When `rollout_pct < 100`, deterministically hash (orgId|key) → 0..99
 *   and enable when the hash is below the rollout pct. Same org always gets
 *   the same answer for the same flag — no flicker.
 *
 * Caching:
 *   This is the hot path on every request that gates behavior. We cache
 *   per-process for 30s to avoid DB round-trips on every page hit. Cache
 *   key is `${orgId}:${key}`. TTL is short so admin flag changes propagate
 *   quickly without polling.
 */

type CacheEntry = { value: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(orgId: string | null, key: string): string {
  return `${orgId ?? "_global"}:${key}`;
}

function rolloutHash(orgId: string, key: string): number {
  const h = createHash("sha256").update(`${orgId}:${key}`).digest();
  // First 4 bytes → 32-bit unsigned int → mod 100.
  // `>>> 0` coerces the signed result of `|` into an unsigned 32-bit int so
  // high-bit values don't bias the modulo toward 0.
  const n = (((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0);
  return n % 100;
}

export type FlagEvalResult = {
  value: boolean;
  source: "org" | "global" | "default";
  rolloutPct?: number;
};

export async function evaluateFlag(args: {
  orgId: string | null;
  key: string;
  defaultValue?: boolean;
}): Promise<FlagEvalResult> {
  const cKey = cacheKey(args.orgId, args.key);
  const cached = cache.get(cKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { value: cached.value, source: "default" };
  }

  // Look up org-specific then global
  const rows = await prisma.featureFlag.findMany({
    where: {
      key: args.key,
      OR: [
        ...(args.orgId ? [{ organizationId: args.orgId }] : []),
        { organizationId: null },
      ],
    },
    select: { organizationId: true, enabled: true, rolloutPct: true },
  });

  const orgRow = rows.find((r) => r.organizationId === args.orgId);
  const globalRow = rows.find((r) => r.organizationId === null);
  const chosen = orgRow ?? globalRow;

  let value: boolean;
  let source: FlagEvalResult["source"];

  if (chosen) {
    source = chosen === orgRow ? "org" : "global";
    if (!chosen.enabled) {
      value = false;
    } else if (chosen.rolloutPct >= 100) {
      value = true;
    } else if (chosen.rolloutPct <= 0) {
      value = false;
    } else {
      // Rollout — need orgId to be deterministic. If no orgId (anonymous request),
      // treat rollout < 100 as off.
      value = args.orgId ? rolloutHash(args.orgId, args.key) < chosen.rolloutPct : false;
    }
  } else {
    value = args.defaultValue ?? false;
    source = "default";
  }

  cache.set(cKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });

  return { value, source, rolloutPct: chosen?.rolloutPct };
}

/** Shorthand: just the bool. */
export async function isFlagEnabled(
  orgId: string | null,
  key: string,
  defaultValue = false,
): Promise<boolean> {
  const r = await evaluateFlag({ orgId, key, defaultValue });
  return r.value;
}

/** Clear cache for one flag (called after a successful admin update). */
export function invalidateFlagCache(key: string): void {
  for (const k of cache.keys()) {
    if (k.endsWith(`:${key}`)) cache.delete(k);
  }
}
