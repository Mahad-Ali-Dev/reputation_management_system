import { withTenant } from "@/lib/db/with-tenant";

/**
 * Tiny read helper for the reviews empty state (Module 06).
 *
 * Drives whether the feed shows "Connect Google Business" vs "No reviews yet
 * (syncing)". Mirrors the `provider: "google_business", status: "active"`
 * query already used by `lib/reviews/google-fetch.ts` / `google-publish.ts`.
 *
 * Kept as a plain (non-"use server") read module so the reviews page can
 * import it without dragging a server-actions boundary into its tree.
 *
 * Fail-soft: never throw out of the page's data fetch. If the `connections`
 * relation/column is somehow unavailable we report `false` (→ show the
 * connect prompt) rather than 500-ing the whole feed.
 */
export async function hasActiveGoogleConnection(orgId: string): Promise<boolean> {
  try {
    return await withTenant(orgId, async (tx) => {
      const count = await tx.connection.count({
        where: { provider: "google_business", status: "active" },
      });
      return count > 0;
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703") return false;
    throw err;
  }
}
