"use server";

import { type SocialPlatform } from "@/lib/social/connections";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Best-time-to-post service (Module 10, Wave 3d).
 *
 * `recommendTimes(orgId, platforms)` returns exactly THREE upcoming ISO
 * datetimes to schedule a post. It engagement-weights the org's own history
 * (`SocialPostMetric` joined to `SocialPost.postedAt`) by weekday+hour; when
 * there's too little data it falls back to per-platform industry-default slots.
 *
 * Pure reads + logic, no external calls. FAIL SOFT: any DB error (incl.
 * pre-migration 42P01/42703) degrades to the industry defaults so the "Best
 * times" button always returns something useful.
 */

/** Postgres 42P01 / 42703 → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703" || code === "P2021" || code === "P2022";
}

/**
 * Industry-default high-engagement slots as { weekday(0=Sun..6=Sat), hour } in
 * the org's local time. A small, sensible table per platform.
 */
const DEFAULT_SLOTS: Record<SocialPlatform | "default", Array<{ weekday: number; hour: number }>> = {
  facebook: [
    { weekday: 3, hour: 13 }, // Wed 1pm
    { weekday: 4, hour: 15 }, // Thu 3pm
    { weekday: 2, hour: 12 }, // Tue noon
  ],
  instagram: [
    { weekday: 3, hour: 11 }, // Wed 11am
    { weekday: 5, hour: 10 }, // Fri 10am
    { weekday: 2, hour: 14 }, // Tue 2pm
  ],
  twitter: [
    { weekday: 3, hour: 9 }, // Wed 9am
    { weekday: 1, hour: 12 }, // Mon noon
    { weekday: 4, hour: 17 }, // Thu 5pm
  ],
  linkedin: [
    { weekday: 2, hour: 10 }, // Tue 10am
    { weekday: 3, hour: 9 }, // Wed 9am
    { weekday: 4, hour: 11 }, // Thu 11am
  ],
  default: [
    { weekday: 2, hour: 12 },
    { weekday: 3, hour: 13 },
    { weekday: 4, hour: 11 },
  ],
};

const MIN_HISTORY = 5;

/**
 * Returns 3 recommended ISO datetimes (next occurrences, strictly in the
 * future). `platforms` chooses the default table; the first selected platform
 * wins for defaults (multi-platform posts schedule together).
 */
export async function recommendTimes(
  orgId: string,
  platforms: string[],
): Promise<string[]> {
  const primary = (platforms[0]?.toLowerCase() ?? "default") as SocialPlatform;
  const defaults = DEFAULT_SLOTS[primary] ?? DEFAULT_SLOTS.default;

  let weighted: Array<{ weekday: number; hour: number }> | null = null;
  try {
    weighted = await topSlotsFromHistory(orgId);
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        event: "social.best_time.history_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    weighted = null;
  }

  const slots = weighted && weighted.length >= 3 ? weighted : defaults;
  const now = new Date();
  return slots.slice(0, 3).map((s) => nextOccurrence(now, s.weekday, s.hour).toISOString());
}

/**
 * Aggregate the org's history into the top engagement weekday+hour buckets.
 * Returns up to 3 buckets, or null when there isn't enough signal.
 */
async function topSlotsFromHistory(
  orgId: string,
): Promise<Array<{ weekday: number; hour: number }> | null> {
  const rows = await withTenant(orgId, async (tx) => {
    // Pull published posts (with postedAt) + their latest metric snapshots.
    const posts = await tx.socialPost.findMany({
      where: { status: "published", postedAt: { not: null } },
      select: {
        postedAt: true,
        metrics: { select: { likes: true, comments: true, shares: true, reach: true } },
      },
      take: 500,
      orderBy: { postedAt: "desc" },
    });
    return posts;
  });

  if (rows.length < MIN_HISTORY) return null;

  // weekday*24 + hour → summed engagement.
  const buckets = new Map<number, number>();
  let totalEngagement = 0;
  for (const p of rows) {
    if (!p.postedAt) continue;
    const when = p.postedAt;
    const key = when.getDay() * 24 + when.getHours();
    let engagement = 0;
    for (const m of p.metrics) {
      engagement += m.likes + m.comments * 2 + m.shares * 3 + Math.round(m.reach / 100);
    }
    // A post with zero metrics still counts as a small positive signal so we
    // don't ignore times the org actually uses.
    engagement = Math.max(engagement, 1);
    buckets.set(key, (buckets.get(key) ?? 0) + engagement);
    totalEngagement += engagement;
  }

  if (buckets.size === 0 || totalEngagement === 0) return null;

  const sorted = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => ({ weekday: Math.floor(key / 24), hour: key % 24 }));

  return sorted.length >= 3 ? sorted : null;
}

/** The next future date matching weekday (0=Sun) + hour, minutes zeroed. */
function nextOccurrence(from: Date, weekday: number, hour: number): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  // Days until the target weekday.
  let delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= from.getTime()) delta = 7; // already passed today
  d.setDate(d.getDate() + delta);
  return d;
}
