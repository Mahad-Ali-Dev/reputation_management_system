import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Caption generator v2 (Module 10, Wave 3d) — `generateCaptions`.
 *
 * Proves:
 *  - 3 options parsed from the model JSON.
 *  - char limit honoured per platform (X=280 truncates).
 *  - CTA/Emoji/Hashtags toggles reach the prompt; hashtags-off → empty arrays.
 *  - budget-exceeded → `{ ok:false, reason:"budget" }` and NO model call.
 *  - AI unconfigured (no ANTHROPIC_API_KEY) → `{ ok:false, reason:"ai_unconfigured" }`,
 *    NO model call.
 *
 * `auth`, `checkBudget`, the Anthropic client, and `withTenant` are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "99999999-9999-4999-8999-999999999999";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ orgId: ORG, user: { id: USER } })),
}));

let budgetOk = true;
vi.mock("@/lib/ai/budget", () => ({
  checkBudget: vi.fn(async () =>
    budgetOk
      ? { ok: true, spentMicros: 0, capMicros: 4_000_000, remainingMicros: 4_000_000 }
      : { ok: false, spentMicros: 5_000_000, capMicros: 4_000_000, reason: "cap_exceeded" },
  ),
}));

const messagesCreate = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  MODELS: { HAIKU: "claude-haiku-test" },
  anthropic: { messages: { create: (...a: unknown[]) => messagesCreate(...a) } },
}));

type FakeTx = { organization: { findUnique: ReturnType<typeof vi.fn> } };
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (_orgId: string, fn: (tx: FakeTx) => unknown) =>
    fn({ organization: { findUnique: vi.fn().mockResolvedValue({ name: "Summit Dental" }) } }),
}));

import { generateCaptions } from "@/lib/social/captions";

function modelReturns(json: unknown) {
  messagesCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(json) }],
  });
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  budgetOk = true;
  messagesCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("generateCaptions — happy path", () => {
  it("returns exactly 3 options from the model JSON", async () => {
    modelReturns({
      options: [
        { caption: "Option one", hashtags: ["smile", "dental"] },
        { caption: "Option two", hashtags: ["care"] },
        { caption: "Option three", hashtags: [] },
        { caption: "Extra (dropped)", hashtags: [] },
      ],
    });
    const res = await generateCaptions(form({ platforms: "facebook", topic: "teeth whitening" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.options).toHaveLength(3);
      expect(res.options[0]!.caption).toBe("Option one");
      expect(res.options[0]!.hashtags).toEqual(["smile", "dental"]);
    }
  });

  it("truncates each caption to the X 280 limit", async () => {
    const long = "a".repeat(500);
    modelReturns({ options: [{ caption: long, hashtags: [] }, { caption: long, hashtags: [] }, { caption: long, hashtags: [] }] });
    const res = await generateCaptions(form({ platforms: "twitter" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      for (const o of res.options) expect(o.caption.length).toBeLessThanOrEqual(280);
    }
  });

  it("hashtags toggle OFF → empty hashtag arrays + prompt says no hashtags", async () => {
    modelReturns({
      options: [
        { caption: "a", hashtags: ["shouldBeStripped"] },
        { caption: "b", hashtags: ["x"] },
        { caption: "c", hashtags: ["y"] },
      ],
    });
    const res = await generateCaptions(
      form({ platforms: "facebook", includeHashtags: "false" }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      for (const o of res.options) expect(o.hashtags).toEqual([]);
    }
    const system = messagesCreate.mock.calls[0]![0].system[0].text as string;
    expect(system).toMatch(/Do NOT include hashtags/i);
  });

  it("CTA + Emoji toggles ON reach the system prompt", async () => {
    modelReturns({ options: [{ caption: "a" }, { caption: "b" }, { caption: "c" }] });
    await generateCaptions(
      form({ platforms: "instagram", includeCta: "true", includeEmoji: "true" }),
    );
    const system = messagesCreate.mock.calls[0]![0].system[0].text as string;
    expect(system).toMatch(/call-to-action/i);
    expect(system).toMatch(/emoji/i);
  });
});

describe("generateCaptions — gates", () => {
  it("budget exceeded → {ok:false, reason:'budget'} and NO model call", async () => {
    budgetOk = false;
    const res = await generateCaptions(form({ platforms: "facebook" }));
    expect(res).toEqual({ ok: false, reason: "budget" });
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("AI unconfigured → {ok:false, reason:'ai_unconfigured'} and NO model call", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await generateCaptions(form({ platforms: "facebook" }));
    expect(res).toEqual({ ok: false, reason: "ai_unconfigured" });
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("invalid input (no platforms) → {ok:false, reason:'invalid_input'}", async () => {
    const res = await generateCaptions(form({ topic: "x" }));
    expect(res).toEqual({ ok: false, reason: "invalid_input" });
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});
