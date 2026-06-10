import { describe, expect, it, vi } from "vitest";

/**
 * Meta AD / promoted-post comment moderation — pure normalisation contract.
 *
 * `normalizeAdComment` maps a raw Graph comment on a boosted/ad post into the
 * canonical `NormalizedComment` the inbox ingest understands, tagged
 * `kind:"ad"` + `platform:"facebook_ad"`/`"instagram_ad"` so it flows into the
 * SAME Comments inbox pipeline as organic comments (deduped on
 * `(platform, externalId)`) and powers the "Ad comments" filter — all without a
 * schema migration.
 *
 * We mock the leaf logger so `fetch-util` (transitively imported) stays quiet,
 * and we never touch the network here — these are pure-mapping assertions.
 */
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { type GraphComment, normalizeAdComment } from "@/lib/connections/adapters/meta-ad-comments";

const baseComment: GraphComment = {
  id: "1789_456",
  message: "Loved this offer!",
  created_time: "2026-06-01T12:00:00+0000",
  from: { id: "user-42", name: "Dana Q" },
};

describe("normalizeAdComment — pure graph→SocialComment mapping", () => {
  it("maps a Facebook ad comment, tagging platform + kind as ad", () => {
    const out = normalizeAdComment(baseComment, {
      objectStoryId: "page_123_post_789",
      platform: "facebook",
    });
    expect(out).not.toBeNull();
    expect(out).toMatchObject({
      platform: "facebook_ad",
      kind: "ad",
      externalId: "1789_456",
      externalPostId: "page_123_post_789",
      body: "Loved this offer!",
      authorName: "Dana Q",
      authorExternalId: "user-42",
    });
    expect(out?.postedAt).toBeInstanceOf(Date);
    expect(out?.postedAt?.toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });

  it("maps an Instagram ad comment to platform instagram_ad", () => {
    const out = normalizeAdComment(baseComment, { platform: "instagram" });
    expect(out?.platform).toBe("instagram_ad");
    expect(out?.kind).toBe("ad");
  });

  it("defaults to facebook_ad when no platform is supplied", () => {
    const out = normalizeAdComment(baseComment);
    expect(out?.platform).toBe("facebook_ad");
    expect(out?.externalPostId).toBeNull();
  });

  it("returns null for a comment with no id", () => {
    expect(normalizeAdComment({ message: "hi" })).toBeNull();
    expect(normalizeAdComment({ id: "   ", message: "hi" })).toBeNull();
  });

  it("returns null for a comment with no body (a like/reaction node)", () => {
    expect(normalizeAdComment({ id: "x1" })).toBeNull();
    expect(normalizeAdComment({ id: "x1", message: "" })).toBeNull();
  });

  it("returns null for null/undefined input (fail-soft)", () => {
    expect(normalizeAdComment(null)).toBeNull();
    expect(normalizeAdComment(undefined)).toBeNull();
  });

  it("tolerates a missing author (anonymous → null fields)", () => {
    const out = normalizeAdComment({ id: "x2", message: "ok", from: null });
    expect(out?.authorName).toBeNull();
    expect(out?.authorExternalId).toBeNull();
  });

  it("falls back to now() when created_time is missing/invalid", () => {
    const before = Date.now();
    const out = normalizeAdComment({ id: "x3", message: "ok", created_time: "not-a-date" });
    expect(out?.postedAt).toBeInstanceOf(Date);
    expect(out?.postedAt?.getTime() ?? 0).toBeGreaterThanOrEqual(before);
  });

  it("accepts epoch-seconds created_time", () => {
    const out = normalizeAdComment({
      id: "x4",
      message: "ok",
      // @ts-expect-error — graph usually sends a string; we tolerate numbers too.
      created_time: 1_700_000_000,
    });
    expect(out?.postedAt?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });
});
