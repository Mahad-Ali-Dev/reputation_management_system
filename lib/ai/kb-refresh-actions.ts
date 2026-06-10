"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { assertRateLimit } from "@/lib/ratelimit";
import { refreshOrgKb } from "./kb-refresh";

/**
 * User-triggered "Re-scan" for the Knowledge tab (Module 05).
 *
 * Reuses the SAME pipeline the weekly auto-updater cron runs (refreshOrgKb):
 * re-crawl the tracked sourceUrl → extract → diff → on change update the profile
 * + re-ingest the source doc. Gated exactly like scanAndBuild — entitlement +
 * rate-limit before any external fetch or model call — so a budget/plan failure
 * short-circuits with a friendly message rather than spending.
 *
 * Returns a `{ ok }` shape the Knowledge tab renders (never throws a raw error).
 * On success it revalidates /ai/training so the source list + "last refreshed"
 * status + readiness ribbon reflect the fresh crawl.
 */

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

export type RescanResult =
  | { ok: true; changed: boolean; fields: string[] }
  | { ok: false; error: string; reason?: "no_source_url" };

export async function rescanKb(): Promise<RescanResult> {
  const { orgId } = await requireOrg();

  // Paid AI feature — gate before any external fetch or model call.
  try {
    await assertEntitled(orgId);
  } catch {
    return { ok: false, error: "Re-scanning isn't included on your current plan. Upgrade in Settings → Subscription." };
  }

  try {
    await assertRateLimit("url_crawl", orgId);
  } catch {
    return { ok: false, error: "You've scanned a few times recently. Please wait a couple of minutes and try again." };
  }

  let result: Awaited<ReturnType<typeof refreshOrgKb>>;
  try {
    result = await refreshOrgKb(orgId);
  } catch {
    return { ok: false, error: "Something went wrong re-scanning your site. Try again in a moment." };
  }

  if (result.skipped === "no_source_url") {
    return {
      ok: false,
      reason: "no_source_url",
      error: "No website is linked yet. Run a scan from the empty-state setup first to track a source.",
    };
  }
  if (result.skipped === "table_missing") {
    return { ok: false, error: "Your knowledge base isn't set up yet. Try again after setup completes." };
  }

  revalidatePath("/ai/training");
  revalidatePath("/ai");
  return { ok: true, changed: result.changed, fields: result.fields };
}
