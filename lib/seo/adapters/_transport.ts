/**
 * Single outbound transport seam for ALL SEO adapters (Module 13).
 *
 * WHY ONE FILE: every adapter (ga4, pagespeed, gbp-insights, rank-tracker,
 * citation-audit) funnels its ONE network/provider call through a function here.
 * That gives the test suite a single, reliable place to spy and assert the
 * load-bearing guardrail: **when an adapter's creds are unset it returns
 * `{available:false}` and NONE of these transports are ever invoked** (zero
 * live/paid calls in the default code path). Tests `vi.mock` this module.
 *
 * Every function defaults to a no-op-safe stub returning `null` ("no data"), so
 * even a misconfiguration cannot produce a live call from the shipped default.
 * Wiring a real `fetch`/SDK call here (behind the adapter's existing cred check)
 * is the single change needed to go live — the adapters and UI do not change.
 */

import type { ProviderOp, RankTrackerProvider } from "./rank-tracker";

/** GA4 Data API (runReport). */
export async function ga4RunReport(_args: {
  clientEmail: string;
  privateKey: string;
  propertyId: string;
}): Promise<{
  sessions?: number;
  bounceRate?: number;
  topPages?: { path: string; views: number }[];
} | null> {
  return null;
}

/** PageSpeed Insights. */
export async function pageSpeedRun(_args: {
  apiKey: string;
  url: string;
}): Promise<{
  performanceScore?: number;
  lcpSeconds?: number;
  cls?: number;
  inpMs?: number;
} | null> {
  return null;
}

/** GBP Performance API (reuses the existing google_business OAuth token). */
export async function gbpPerformanceRun(_args: {
  accessToken: string;
  locationName: string;
}): Promise<{
  views?: number;
  calls?: number;
  directions?: number;
  searches?: number;
} | null> {
  return null;
}

/** Rank-tracking provider dispatch (dataforseo | brightlocal), all ops. */
export async function rankProviderCall(_args: {
  provider: RankTrackerProvider;
  apiKey: string;
  op: ProviderOp | "citations";
  params: Record<string, unknown>;
}): Promise<unknown | null> {
  return null;
}
