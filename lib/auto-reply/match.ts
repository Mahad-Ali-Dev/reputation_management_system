/**
 * Auto-reply rule matching.
 *
 * Two-tier model:
 *   1. `matchRule(review, rule)` — pure decision. No I/O, no DB. Returns a
 *      verdict object that explains both the boolean outcome AND the reason
 *      so the admin UI can show "didn't match because the rating fell
 *      outside 4-5" instead of a silent skip. Trivially unit-testable.
 *   2. `pickRule(review, rules)` — applies `matchRule` in ingest order
 *      (first match wins) so hosts can layer "specific → broad" without
 *      accidentally trip-firing the broader catch-all.
 *
 * Why first-match wins (not best-match scoring):
 *   - Predictable. Hosts read their rule list top-to-bottom and can reason
 *     about it without staring at a relevance algorithm. Same model as
 *     mail filters / firewall ACLs / nginx try_files.
 *   - The UI lets the host reorder rules. That's the only "priority" knob.
 *
 * Keyword semantics:
 *   - Case-insensitive substring (NOT word-boundary). "great breakfast"
 *     matches "the breakfast was great" AND "Greatness incarnate". Hosts
 *     can use punctuation/spacing to tighten ("great breakfast " with a
 *     trailing space) if they really need to. We deliberately don't ship
 *     regex — it's a foot-gun for non-technical hosts and a DoS vector
 *     (catastrophic backtracking).
 *   - Any-of semantics: if the rule lists ["amazing", "perfect", "loved"],
 *     ONE substring hit is enough. "All of" would be too brittle for
 *     short reviews.
 */

import type { ReviewSource } from "@/lib/reviews/queries";

export interface MatchableReview {
  rating: number;
  body: string | null;
  source: ReviewSource | string;
}

export interface MatchableRule {
  id: string;
  enabled: boolean;
  matchMinRating: number;
  matchMaxRating: number;
  matchKeywords: string[];
  matchSources: string[];
}

export type MatchVerdict =
  | { matched: true }
  | { matched: false; reason: MatchSkipReason; detail?: string };

export type MatchSkipReason =
  | "disabled"
  | "rating_out_of_range"
  | "source_not_in_allowlist"
  | "no_keyword_hit";

/**
 * Pure decision. No side effects. Safe to call thousands of times in a
 * tight loop — the heaviest op is a couple of `toLowerCase()` + `indexOf()`
 * passes over the review body.
 */
export function matchRule(review: MatchableReview, rule: MatchableRule): MatchVerdict {
  if (!rule.enabled) {
    return { matched: false, reason: "disabled" };
  }

  if (review.rating < rule.matchMinRating || review.rating > rule.matchMaxRating) {
    return {
      matched: false,
      reason: "rating_out_of_range",
      detail: `review rating ${review.rating} not in [${rule.matchMinRating}, ${rule.matchMaxRating}]`,
    };
  }

  // Empty `matchSources` = applies to all sources. Non-empty = strict allowlist.
  if (rule.matchSources.length > 0 && !rule.matchSources.includes(review.source)) {
    return {
      matched: false,
      reason: "source_not_in_allowlist",
      detail: `source "${review.source}" not in [${rule.matchSources.join(", ")}]`,
    };
  }

  // Empty `matchKeywords` = no keyword constraint. Non-empty = at-least-one match.
  if (rule.matchKeywords.length > 0) {
    const haystack = (review.body ?? "").toLowerCase();
    // Short-circuit on first hit. Keywords are tiny (≤ ~5 typical) so a
    // naive scan is faster than building an Aho-Corasick automaton.
    const hit = rule.matchKeywords.some((k) => {
      const needle = k.toLowerCase().trim();
      // Empty strings in the array (user typed only commas) are skipped —
      // treating "" as "always matches" would silently break rules.
      return needle.length > 0 && haystack.includes(needle);
    });
    if (!hit) {
      return {
        matched: false,
        reason: "no_keyword_hit",
        detail: `body didn't contain any of [${rule.matchKeywords.slice(0, 4).join(", ")}${rule.matchKeywords.length > 4 ? ", …" : ""}]`,
      };
    }
  }

  return { matched: true };
}

/**
 * First-match-wins over an already-ordered rule list. Callers MUST pass
 * `rules` in the order the host wants them evaluated (typically the order
 * they were created — `ORDER BY created_at ASC`).
 *
 * Returns `null` if no rule matched. We deliberately do NOT return any
 * partial-match info here; the diagnostic detail lives in `matchRule` and
 * is mostly only useful in the admin UI's "test this review" tool.
 */
export function pickRule<R extends MatchableRule>(
  review: MatchableReview,
  rules: ReadonlyArray<R>,
): R | null {
  for (const rule of rules) {
    if (matchRule(review, rule).matched) return rule;
  }
  return null;
}
