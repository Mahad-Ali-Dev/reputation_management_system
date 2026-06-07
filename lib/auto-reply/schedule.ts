/**
 * Auto-reply delayed-publish scheduler — the randomized 2–4h window.
 *
 * This is the spec's "delayed-post queue" timing core (Module 06). It is a
 * PURE module — no I/O, no DB, no clock dependency except the `from`/`rng`
 * you pass in — so it is trivially unit-testable and the "reads as human"
 * guarantee lives in exactly one auditable place.
 *
 * Why a randomized window (not a fixed delay):
 *   Posting every 5★ reply at the same deterministic offset after the review
 *   lands reads as a bot — the exact thing Google's review policy and our own
 *   compliance flag warn against. Spreading each reply across a 2–4h window
 *   makes the cadence look human. The durable post time is written to
 *   `review_replies.scheduled_publish_at` at draft time and drained by the
 *   existing `auto-reply-publish` cron.
 *
 * Granularity note: the publish cron runs every 5 minutes, so the actual post
 * instant is the scheduled time rounded up to the next 5-minute tick. That is
 * well within tolerance of "appears natural" and is by design, not a bug.
 */

/** Floor of the randomized auto-publish window: 2 hours. */
export const AUTO_REPLY_MIN_DELAY_MS = 2 * 60 * 60 * 1000;

/** Ceiling of the randomized auto-publish window: 4 hours. */
export const AUTO_REPLY_MAX_DELAY_MS = 4 * 60 * 60 * 1000;

/**
 * Sentinel `delayMinutes` value marking "use the 2–4h randomized window"
 * instead of a fixed per-rule delay. Stored on the managed 5★ toggle rule
 * (and any rule that opts into randomized timing). The executor and the
 * publish cron branch on this so existing fixed-delay rules are untouched.
 *
 * -1 is safe: the rules form clamps `delayMinutes` to [0, 1440], so a real
 * user-authored rule can never collide with the sentinel.
 */
export const AUTO_REPLY_RANDOMIZED_SENTINEL = -1;

/** True when a rule's `delayMinutes` opts into the randomized 2–4h window. */
export function usesRandomizedWindow(delayMinutes: number): boolean {
  return delayMinutes === AUTO_REPLY_RANDOMIZED_SENTINEL;
}

/**
 * A uniform random delay in milliseconds within [MIN, MAX].
 *
 * `rng` is injectable (defaults to `Math.random`) so tests are deterministic:
 *   - rng = 0   → exactly MIN (2h)
 *   - rng → 1   → ~MAX (4h)
 * Inputs are clamped to [0,1) defensively so a misbehaving rng can never push
 * the delay outside the window.
 */
export function computeAutoReplyDelayMs(rng: () => number = Math.random): number {
  const r = clamp01(rng());
  const span = AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS;
  return AUTO_REPLY_MIN_DELAY_MS + Math.round(r * span);
}

/**
 * The durable post time for an auto-publish reply: `from` + a randomized
 * 2–4h delay. Written into `review_replies.scheduled_publish_at`.
 */
export function nextScheduledPublishAt(from: Date = new Date(), rng: () => number = Math.random): Date {
  return new Date(from.getTime() + computeAutoReplyDelayMs(rng));
}

/**
 * The durable post time for a FIXED-delay rule (existing power-user rules
 * with a concrete `delayMinutes`). Kept here so both timing paths live in one
 * module. `delayMinutes` is clamped to ≥0 — a negative (sentinel) value must
 * be routed through `nextScheduledPublishAt` instead, never here.
 */
export function fixedScheduledPublishAt(delayMinutes: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + Math.max(0, delayMinutes) * 60_000);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n >= 1) return 0.999999999;
  return n;
}
