import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook guardrail tests — the env-gated no-op branches that prove no live paid
 * side effects in default code paths:
 *   - Shopify: missing app/secret → 200 {skipped:"shopify_not_configured"} and
 *     evaluateTrigger is NOT called.
 *   - Resend: unset RESEND_WEBHOOK_SECRET → 200 {skipped:...} no-op.
 */

const evaluateTrigger = vi.fn();
const recordUnsubscribe = vi.fn();
const loadProviderApp = vi.fn();
const handleIdempotent = vi.fn(async (_p: string, _id: string, _b: string, fn: () => Promise<void>) => {
  await fn();
  return "processed" as const;
});

vi.mock("@/lib/outreach/automation", () => ({ evaluateTrigger }));
vi.mock("@/lib/outreach/suppression", () => ({ recordUnsubscribe }));
vi.mock("@/lib/connections/oauth-helpers", () => ({ loadProviderApp }));
vi.mock("@/lib/webhooks/idempotency", () => ({ handleIdempotent }));
vi.mock("@/lib/db/client", () => ({ prisma: { reviewRequest: { findMany: vi.fn(async () => []), updateMany: vi.fn() }, connection: { findFirst: vi.fn(async () => null) } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function req(body: string, headers: Record<string, string> = {}) {
  return {
    text: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  evaluateTrigger.mockReset();
  recordUnsubscribe.mockReset();
  loadProviderApp.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Shopify orders webhook", () => {
  it("no-ops (200) and does NOT call evaluateTrigger when Shopify is not configured", async () => {
    loadProviderApp.mockResolvedValue(null);
    const { POST } = await import("@/app/api/webhooks/shopify/orders/route");
    const res = await POST(req(JSON.stringify({ id: 1, email: "a@b.com" })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe("shopify_not_configured");
    expect(evaluateTrigger).not.toHaveBeenCalled();
  });

  it("rejects (401) a bad HMAC when Shopify IS configured", async () => {
    loadProviderApp.mockResolvedValue({ clientId: "x", clientSecret: "secret", scopes: [] });
    const { POST } = await import("@/app/api/webhooks/shopify/orders/route");
    const res = await POST(
      req(JSON.stringify({ id: 1 }), {
        "x-shopify-hmac-sha256": "not-the-right-signature",
        "x-shopify-shop-domain": "shop.myshopify.com",
      }),
    );
    expect(res.status).toBe(401);
    expect(evaluateTrigger).not.toHaveBeenCalled();
  });
});

describe("Resend events webhook", () => {
  it("no-ops (200) when RESEND_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const res = await POST(req(JSON.stringify({ type: "email.opened", data: { email_id: "m1" } })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe("resend_webhook_not_configured");
    expect(recordUnsubscribe).not.toHaveBeenCalled();
  });
});
