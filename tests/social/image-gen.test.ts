import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI Image Creatives (Module 10, Wave 3d) — `lib/social/image-gen.ts`.
 *
 * The hardest guardrail: **never a live paid call by default**, and Pro-gated.
 *  - non-Pro org → `PlanInactiveError` (assertEntitled throws) BEFORE any
 *    provider/network call.
 *  - Pro but `IMAGE_GEN_PROVIDER` unset → `ImageGenNotConfiguredError`, NO call.
 *  - Pro + provider env → returns N blob URLs (provider fetch mocked).
 *  - `imageGenAvailability` reports not_configured / not_pro / ok without throwing.
 *
 * `assertEntitled`/`isOrgEntitled`, `uploadToBlob`, and `fetch` are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const ORG = "11111111-1111-4111-8111-111111111111";

// Hoisted so the vi.mock factory (itself hoisted) can safely reference these.
const h = vi.hoisted(() => {
  class PlanInactiveError extends Error {
    readonly code = "plan_inactive";
    constructor() {
      super("plan_inactive");
      this.name = "PlanInactiveError";
    }
  }
  return {
    PlanInactiveError,
    state: { entitled: true },
    assertEntitled: vi.fn(),
    isOrgEntitled: vi.fn(),
  };
});

h.assertEntitled.mockImplementation(async () => {
  if (!h.state.entitled) throw new h.PlanInactiveError();
});
h.isOrgEntitled.mockImplementation(async () => h.state.entitled);

const PlanInactiveError = h.PlanInactiveError;
const assertEntitled = h.assertEntitled;
const isOrgEntitled = h.isOrgEntitled;

vi.mock("@/lib/billing/entitlements", () => ({
  assertEntitled: (...a: unknown[]) => h.assertEntitled(...a),
  isOrgEntitled: (...a: unknown[]) => h.isOrgEntitled(...a),
  PlanInactiveError: h.PlanInactiveError,
}));

const uploadToBlob = vi.fn(async (..._a: unknown[]) => ({ url: "https://cdn/creative.png", pathname: "p/creative.png" }));
vi.mock("@/lib/uploads/blob", () => ({
  uploadToBlob: (...a: unknown[]) => uploadToBlob(...a),
}));

import {
  generateCreatives,
  imageGenAvailability,
  ImageGenNotConfiguredError,
  isImageGenEnabled,
} from "@/lib/social/image-gen";

const fetchSpy = vi.fn();

const ENV_KEYS = ["IMAGE_GEN_PROVIDER", "OPENAI_API_KEY", "STABILITY_API_KEY", "IMAGE_GEN_MODEL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  h.state.entitled = true;
  assertEntitled.mockClear();
  isOrgEntitled.mockClear();
  uploadToBlob.mockClear();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isImageGenEnabled", () => {
  it("false by default (no provider)", () => {
    expect(isImageGenEnabled()).toBe(false);
  });
  it("false when provider set but no key", () => {
    process.env.IMAGE_GEN_PROVIDER = "openai";
    expect(isImageGenEnabled()).toBe(false);
  });
  it("true with provider + key", () => {
    process.env.IMAGE_GEN_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-x";
    expect(isImageGenEnabled()).toBe(true);
  });
});

describe("generateCreatives — gates (no paid call by default)", () => {
  it("non-Pro org → PlanInactiveError BEFORE any provider call", async () => {
    h.state.entitled = false;
    await expect(
      generateCreatives({ orgId: ORG, brief: "a cozy cafe", count: 2 }),
    ).rejects.toBeInstanceOf(PlanInactiveError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(uploadToBlob).not.toHaveBeenCalled();
  });

  it("Pro but provider unset → ImageGenNotConfiguredError, NO call", async () => {
    h.state.entitled = true; // env still unset
    await expect(
      generateCreatives({ orgId: ORG, brief: "a cozy cafe" }),
    ).rejects.toBeInstanceOf(ImageGenNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(uploadToBlob).not.toHaveBeenCalled();
  });
});

describe("generateCreatives — enabled + Pro", () => {
  it("returns N blob URLs (provider fetch + upload mocked)", async () => {
    process.env.IMAGE_GEN_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-x";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from("img1").toString("base64") }, { b64_json: Buffer.from("img2").toString("base64") }] }),
    });

    const out = await generateCreatives({ orgId: ORG, brief: "a cozy cafe", count: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]!.url).toBe("https://cdn/creative.png");
    expect(uploadToBlob).toHaveBeenCalledTimes(2);
    // Uploaded under the ai_creative context.
    expect((uploadToBlob.mock.calls[0]![0] as { context?: string }).context).toBe("ai_creative");
    expect(assertEntitled).toHaveBeenCalledWith(ORG);
  });

  it("empty brief → throws before any call", async () => {
    process.env.IMAGE_GEN_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-x";
    await expect(generateCreatives({ orgId: ORG, brief: "   " })).rejects.toThrow(/brief_required/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("imageGenAvailability", () => {
  it("not_configured when no provider", async () => {
    const av = await imageGenAvailability(ORG);
    expect(av).toEqual({ available: false, reason: "not_configured" });
  });

  it("not_pro when configured but org not entitled", async () => {
    process.env.IMAGE_GEN_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-x";
    h.state.entitled = false;
    const av = await imageGenAvailability(ORG);
    expect(av).toEqual({ available: false, reason: "not_pro" });
  });

  it("ok when configured + entitled", async () => {
    process.env.IMAGE_GEN_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-x";
    h.state.entitled = true;
    const av = await imageGenAvailability(ORG);
    expect(av).toEqual({ available: true, reason: "ok" });
  });
});
