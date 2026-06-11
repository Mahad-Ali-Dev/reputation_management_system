/**
 * Pure, serializable derivation for the per-location summary strip that sits
 * ABOVE the establishment card list (mockup: establishments-after.png).
 *
 * Same philosophy as `card-state.ts`: no Prisma, no React — the page fetches
 * raw rows via `listEstablishmentsForCards` (+ `latestRanksByEstablishment`)
 * and passes plain tiles into the `SummaryStrip` server component.
 */

import type { EstablishmentCardData, EstablishmentRank } from "@/lib/establishments/queries";
import { addressLine } from "./card-state";

/** 30 days bucketed into 10 × 3-day points (oldest → newest). */
export const SPARK_BUCKETS = 10;
const BUCKET_MS = 3 * 24 * 60 * 60 * 1000;

export type SummaryTile = {
  id: string;
  name: string;
  /** Average rating to 1dp, or null with no reviews (mirrors the card). */
  avgRating: number | null;
  /** Profile completeness, 0–100, from 4 real fields (25% each). */
  completenessPct: number;
  /** Human label of the next unfilled field, for the caption ("" = complete). */
  nextStep: string;
  /** Review counts per 3-day bucket over the last 30 days, oldest → newest. */
  spark: number[];
  /** Total reviews posted in the last 30 days. */
  reviews30d: number;
  /** Latest local rank, only when real KeywordRank data exists. */
  rank: EstablishmentRank | null;
};

/**
 * Completeness = 4 equally-weighted REAL fields: address, category, timezone,
 * Google connection. Timezone counts only when changed off the schema default
 * ("UTC") — the create form pre-fills UTC, so the bare default is "not set".
 */
export function completeness(est: EstablishmentCardData): { pct: number; nextStep: string } {
  const checks: Array<[label: string, filled: boolean]> = [
    ["add address", addressLine(est.address) !== "—"],
    ["set category", typeof est.category === "string" && est.category.length > 0],
    ["set timezone", typeof est.timezone === "string" && est.timezone !== "" && est.timezone !== "UTC"],
    [
      "connect Google",
      est.connections.some((c) => c.provider === "google_business" && c.status === "active"),
    ],
  ];
  const filled = checks.filter(([, ok]) => ok).length;
  const next = checks.find(([, ok]) => !ok);
  return { pct: Math.round((filled / checks.length) * 100), nextStep: next ? next[0] : "" };
}

/**
 * Bucket real review timestamps (`postedAt`) from the trailing 30 days into
 * `SPARK_BUCKETS` counts, oldest → newest. Reviews without a timestamp (only
 * possible in legacy fixtures — the query always selects it) are skipped.
 */
export function reviewSpark(
  reviews: EstablishmentCardData["reviews"],
  now: Date = new Date(),
): { points: number[]; total: number } {
  const points = new Array<number>(SPARK_BUCKETS).fill(0);
  let total = 0;
  const end = now.getTime();
  const start = end - SPARK_BUCKETS * BUCKET_MS;
  for (const r of reviews) {
    const t = r.postedAt?.getTime();
    if (t === undefined || t <= start || t > end) continue;
    const idx = Math.min(SPARK_BUCKETS - 1, Math.floor((t - start) / BUCKET_MS));
    points[idx] = (points[idx] ?? 0) + 1;
    total += 1;
  }
  return { points, total };
}

/** Assemble one strip tile from a raw row (+ optional real rank reading). */
export function deriveSummaryTile(
  est: EstablishmentCardData,
  rank: EstablishmentRank | null,
  now: Date = new Date(),
): SummaryTile {
  const ratings = est.reviews.map((r) => r.rating);
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;
  const { pct, nextStep } = completeness(est);
  const { points, total } = reviewSpark(est.reviews, now);
  return {
    id: est.id,
    name: est.name,
    avgRating,
    completenessPct: pct,
    nextStep,
    spark: points,
    reviews30d: total,
    rank,
  };
}
