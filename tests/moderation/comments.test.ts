import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Comments tab — Google-exclusion contract + fail-soft reads (Module 09 — Inbox,
 * Wave 3c-A).
 *
 * The single most important inbox guarantee for this surface: FB/IG comments are
 * hideable SOCIAL comments; Google ("google_qa") content is REPLY-ONLY and must
 * NEVER be reported as hideable. `canHide` encodes that and both the UI and the
 * hide action gate on it.
 *
 * We ALSO pin the fail-soft contract on the READ helpers: `SocialComment` ships
 * via the Wave-0 delta and may be unmigrated on a deploy. `listComments` /
 * `commentStatusCounts` must degrade to empty (never 500 the inbox) on a Postgres
 * 42P01 (undefined_table) / 42703 (undefined_column).
 *
 * The module is a `'use server'` file, so its heavy action-only deps (auth,
 * AiAssist, cache, moderation queue) are mocked — we only exercise the pure
 * platform helpers + the fail-soft read paths here.
 */

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/org-context", () => ({ getOrgContext: vi.fn() }));
vi.mock("@/lib/ai/assist", () => ({ assist: vi.fn() }));

// Programmable withTenant: the fail-soft tests make it reject with a coded error.
const withTenantMock = vi.fn();
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: unknown) => unknown) => withTenantMock(orgId, fn),
}));
vi.mock("@/lib/moderation/queue", () => ({ evaluateInbound: vi.fn() }));

import {
  canHide,
  commentSource,
  commentStatusCounts,
  isAdComment,
  listComments,
  platformLabel,
} from "@/lib/inbox/comments";

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  withTenantMock.mockReset();
});

describe("canHide — Google is never hideable", () => {
  it("allows hide for Facebook and Instagram", () => {
    expect(canHide("facebook")).toBe(true);
    expect(canHide("instagram")).toBe(true);
  });

  it("allows hide for FB/IG AD comments (boosted posts are still FB/IG)", () => {
    expect(canHide("facebook_ad")).toBe(true);
    expect(canHide("instagram_ad")).toBe(true);
  });

  it("REFUSES hide for Google Q&A and anything unknown", () => {
    expect(canHide("google_qa")).toBe(false);
    expect(canHide("google")).toBe(false);
    expect(canHide("twitter")).toBe(false);
    expect(canHide("")).toBe(false);
  });
});

describe("ad-comment classification", () => {
  it("isAdComment flags only the *_ad platforms", () => {
    expect(isAdComment("facebook_ad")).toBe(true);
    expect(isAdComment("instagram_ad")).toBe(true);
    expect(isAdComment("facebook")).toBe(false);
    expect(isAdComment("instagram")).toBe(false);
    expect(isAdComment("google_qa")).toBe(false);
  });

  it("commentSource buckets platforms into organic | ad | google", () => {
    expect(commentSource("facebook")).toBe("organic");
    expect(commentSource("instagram")).toBe("organic");
    expect(commentSource("facebook_ad")).toBe("ad");
    expect(commentSource("instagram_ad")).toBe("ad");
    expect(commentSource("google_qa")).toBe("google");
  });
});

describe("platformLabel", () => {
  it("maps known platforms to friendly labels", () => {
    expect(platformLabel("facebook")).toBe("Facebook");
    expect(platformLabel("instagram")).toBe("Instagram");
    expect(platformLabel("facebook_ad")).toBe("Facebook Ad");
    expect(platformLabel("instagram_ad")).toBe("Instagram Ad");
    expect(platformLabel("google_qa")).toBe("Google Q&A");
  });

  it("passes through an unknown platform unchanged", () => {
    expect(platformLabel("tiktok")).toBe("tiktok");
  });
});

describe("listComments — fail-soft on unmigrated SocialComment", () => {
  it("returns [] (no throw) when the table is missing (42P01)", async () => {
    withTenantMock.mockRejectedValue(Object.assign(new Error("no relation"), { code: "42P01" }));
    await expect(listComments({ orgId: ORG })).resolves.toEqual([]);
  });

  it("returns [] (no throw) when a column is missing (42703)", async () => {
    withTenantMock.mockRejectedValue(Object.assign(new Error("no column"), { code: "42703" }));
    await expect(listComments({ orgId: ORG, status: "needs_reply" })).resolves.toEqual([]);
  });

  it("maps rows + precomputes hide flags on the happy path", async () => {
    // withTenant just runs the callback against a fake tx.
    withTenantMock.mockImplementation(async (_org: string, fn: (tx: unknown) => unknown) =>
      fn({
        socialComment: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "c1",
              platform: "google_qa",
              authorName: "Ann",
              authorAvatarUrl: null,
              body: "hi",
              status: "needs_reply",
              aiSuggested: null,
              assignedTo: null,
              externalPostId: null,
              postedAt: new Date(0),
              respondedAt: null,
            },
          ]),
        },
      }),
    );
    const rows = await listComments({ orgId: ORG });
    expect(rows).toHaveLength(1);
    // Google Q&A is never hideable, and is flagged as not-social.
    expect(rows[0]!.isHideable).toBe(false);
    expect(rows[0]!.isSocial).toBe(false);
  });
});

describe("commentStatusCounts — fail-soft on unmigrated SocialComment", () => {
  it("returns {} (no throw) when the table is missing (42P01)", async () => {
    withTenantMock.mockRejectedValue(Object.assign(new Error("no relation"), { code: "42P01" }));
    await expect(commentStatusCounts(ORG)).resolves.toEqual({});
  });
});
