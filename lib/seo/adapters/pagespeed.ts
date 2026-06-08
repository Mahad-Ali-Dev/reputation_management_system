import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { pageSpeedRun } from "./_transport";

/**
 * PageSpeed Insights adapter (Module 13) — Core Web Vitals.
 *
 * Returns the Lighthouse performance score + the three CWV metrics for the SEO
 * & Visibility tab. Env-gated on `PAGESPEED_API_KEY`: no key ⇒
 * `{ available:false }` and ZERO network calls. The outbound `callPageSpeed`
 * seam is the single point a test stubs to prove the no-call guarantee.
 */

export type CoreWebVitals = {
  available: boolean;
  /** Lighthouse performance score 0..100. */
  performanceScore?: number;
  /** Largest Contentful Paint, seconds. */
  lcpSeconds?: number;
  /** Cumulative Layout Shift, unitless. */
  cls?: number;
  /** Interaction to Next Paint, ms. */
  inpMs?: number;
  url?: string;
};

/** True when the PageSpeed API key is present. */
export function pageSpeedConfigured(): boolean {
  return Boolean(env.PAGESPEED_API_KEY);
}

export async function fetchCoreWebVitals(args: { url: string }): Promise<CoreWebVitals> {
  if (!pageSpeedConfigured()) return { available: false };
  if (!args.url || args.url.trim().length === 0) return { available: false };

  try {
    const data = await pageSpeedRun({ apiKey: env.PAGESPEED_API_KEY, url: args.url });
    if (!data) return { available: false };
    return {
      available: true,
      performanceScore: data.performanceScore,
      lcpSeconds: data.lcpSeconds,
      cls: data.cls,
      inpMs: data.inpMs,
      url: args.url,
    };
  } catch (err) {
    logger.warn({
      event: "seo.pagespeed.fetch_failed",
      url: args.url,
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false };
  }
}
