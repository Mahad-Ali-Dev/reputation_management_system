import {
  AUTO_REPLY_MAX_DELAY_MS,
  AUTO_REPLY_MIN_DELAY_MS,
  AUTO_REPLY_RANDOMIZED_SENTINEL,
  computeAutoReplyDelayMs,
  fixedScheduledPublishAt,
  nextScheduledPublishAt,
  usesRandomizedWindow,
} from "@/lib/auto-reply/schedule";
import { describe, expect, it } from "vitest";

/**
 * Auto-reply randomized-delay scheduler tests.
 *
 * This module is the single auditable home of the "reads as human" 2–4h
 * window. The contract the executor + publish cron rely on:
 *   - every computed delay is strictly within [2h, 4h]
 *   - the rng is injectable so the bounds are deterministic
 *   - the sentinel (-1) is recognized as "randomized", and can't collide with
 *     a real user-authored delay (clamped to [0,1440] by the rules form)
 */

const TWO_HOURS = 2 * 60 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;

describe("window constants", () => {
  it("pins the 2–4h window", () => {
    expect(AUTO_REPLY_MIN_DELAY_MS).toBe(TWO_HOURS);
    expect(AUTO_REPLY_MAX_DELAY_MS).toBe(FOUR_HOURS);
  });
});

describe("computeAutoReplyDelayMs — bounds with injected rng", () => {
  it("rng=0 yields exactly the 2h floor", () => {
    expect(computeAutoReplyDelayMs(() => 0)).toBe(AUTO_REPLY_MIN_DELAY_MS);
  });

  it("rng→1 yields approximately the 4h ceiling (never above it)", () => {
    const d = computeAutoReplyDelayMs(() => 0.9999999);
    expect(d).toBeLessThanOrEqual(AUTO_REPLY_MAX_DELAY_MS);
    expect(d).toBeGreaterThan(AUTO_REPLY_MAX_DELAY_MS - 1000);
  });

  it("rng=0.5 lands at the 3h midpoint", () => {
    expect(computeAutoReplyDelayMs(() => 0.5)).toBe(3 * 60 * 60 * 1000);
  });

  it("stays strictly within [min,max] across the full unit interval", () => {
    for (let i = 0; i <= 100; i++) {
      const d = computeAutoReplyDelayMs(() => i / 100);
      expect(d).toBeGreaterThanOrEqual(AUTO_REPLY_MIN_DELAY_MS);
      expect(d).toBeLessThanOrEqual(AUTO_REPLY_MAX_DELAY_MS);
    }
  });

  it("clamps a misbehaving rng below 0 to the floor", () => {
    expect(computeAutoReplyDelayMs(() => -5)).toBe(AUTO_REPLY_MIN_DELAY_MS);
  });

  it("clamps a misbehaving rng at/above 1 to just under the ceiling", () => {
    const d = computeAutoReplyDelayMs(() => 2);
    expect(d).toBeLessThanOrEqual(AUTO_REPLY_MAX_DELAY_MS);
    expect(d).toBeGreaterThan(AUTO_REPLY_MAX_DELAY_MS - 1000);
  });

  it("treats a non-finite rng as the floor (never NaN out)", () => {
    expect(computeAutoReplyDelayMs(() => Number.NaN)).toBe(AUTO_REPLY_MIN_DELAY_MS);
  });

  it("the default rng (Math.random) still lands in-window", () => {
    for (let i = 0; i < 50; i++) {
      const d = computeAutoReplyDelayMs();
      expect(d).toBeGreaterThanOrEqual(AUTO_REPLY_MIN_DELAY_MS);
      expect(d).toBeLessThanOrEqual(AUTO_REPLY_MAX_DELAY_MS);
    }
  });
});

describe("nextScheduledPublishAt — adds the delay to `from`", () => {
  it("rng=0 schedules exactly 2h after `from`", () => {
    const from = new Date("2026-06-07T12:00:00.000Z");
    const at = nextScheduledPublishAt(from, () => 0);
    expect(at.getTime()).toBe(from.getTime() + TWO_HOURS);
  });

  it("rng→1 schedules ~4h after `from`", () => {
    const from = new Date("2026-06-07T12:00:00.000Z");
    const at = nextScheduledPublishAt(from, () => 0.9999999);
    expect(at.getTime()).toBeLessThanOrEqual(from.getTime() + FOUR_HOURS);
    expect(at.getTime()).toBeGreaterThan(from.getTime() + FOUR_HOURS - 1000);
  });

  it("is always in the future relative to `from`", () => {
    const from = new Date();
    const at = nextScheduledPublishAt(from, () => 0.3);
    expect(at.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("fixedScheduledPublishAt — legacy fixed-delay rules", () => {
  it("adds delayMinutes to `from`", () => {
    const from = new Date("2026-06-07T12:00:00.000Z");
    const at = fixedScheduledPublishAt(30, from);
    expect(at.getTime()).toBe(from.getTime() + 30 * 60_000);
  });

  it("clamps a negative (sentinel) delay to now — never schedules in the past", () => {
    const from = new Date("2026-06-07T12:00:00.000Z");
    const at = fixedScheduledPublishAt(AUTO_REPLY_RANDOMIZED_SENTINEL, from);
    expect(at.getTime()).toBe(from.getTime());
  });
});

describe("usesRandomizedWindow — sentinel recognition", () => {
  it("recognizes the sentinel", () => {
    expect(usesRandomizedWindow(AUTO_REPLY_RANDOMIZED_SENTINEL)).toBe(true);
  });

  it("rejects real fixed delays (which the form clamps to [0,1440])", () => {
    for (const m of [0, 5, 30, 120, 1440]) {
      expect(usesRandomizedWindow(m)).toBe(false);
    }
  });
});
