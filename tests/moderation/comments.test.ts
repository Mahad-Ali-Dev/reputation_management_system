import { describe, expect, it, vi } from "vitest";

/**
 * Comments tab — Google-exclusion contract (Module 09 — Inbox, Wave 3c-A).
 *
 * The single most important inbox guarantee for this surface: FB/IG comments are
 * hideable SOCIAL comments; Google ("google_qa") content is REPLY-ONLY and must
 * NEVER be reported as hideable. `canHide` encodes that and both the UI and the
 * hide action gate on it.
 *
 * The module is a `'use server'` file, so its heavy action-only deps (auth,
 * AiAssist, cache, moderation queue) are mocked — we only exercise the pure
 * platform helpers here.
 */

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/rbac", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/org-context", () => ({ getOrgContext: vi.fn() }));
vi.mock("@/lib/ai/assist", () => ({ assist: vi.fn() }));
vi.mock("@/lib/db/with-tenant", () => ({ withTenant: vi.fn() }));
vi.mock("@/lib/moderation/queue", () => ({ evaluateInbound: vi.fn() }));

import { canHide, platformLabel } from "@/lib/inbox/comments";

describe("canHide — Google is never hideable", () => {
  it("allows hide for Facebook and Instagram", () => {
    expect(canHide("facebook")).toBe(true);
    expect(canHide("instagram")).toBe(true);
  });

  it("REFUSES hide for Google Q&A and anything unknown", () => {
    expect(canHide("google_qa")).toBe(false);
    expect(canHide("google")).toBe(false);
    expect(canHide("twitter")).toBe(false);
    expect(canHide("")).toBe(false);
  });
});

describe("platformLabel", () => {
  it("maps known platforms to friendly labels", () => {
    expect(platformLabel("facebook")).toBe("Facebook");
    expect(platformLabel("instagram")).toBe("Instagram");
    expect(platformLabel("google_qa")).toBe("Google Q&A");
  });

  it("passes through an unknown platform unchanged", () => {
    expect(platformLabel("tiktok")).toBe("tiktok");
  });
});
