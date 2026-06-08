import { createHmac } from "node:crypto";
import type { InboundNormalized, NormalizedComment } from "@/lib/inbox/ingest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Inbound channel webhook tests (Module 09, Wave 3c-B) — Meta + GBP.
 *
 * Proves the guardrail branches:
 *   - **Env-gated no-op.** Missing secret → 200 {skipped:"..._not_configured"} and
 *     NO ingest (no live-path side effects before the channel is configured).
 *   - **Signature/token reject.** Configured-but-bad signature/token → 401 and NO
 *     ingest (fail closed).
 *   - **GET verification handshake.** Meta echoes hub.challenge; GBP echoes the
 *     clientToken — both only when configured + token matches.
 *   - **Happy path.** Valid signature → ingestInbound/ingestComment called with
 *     the NORMALISED payload.
 *   - **Idempotent re-delivery.** When the idempotency layer reports "replay", the
 *     processing fn never runs (ingest not called).
 *
 * Fully mocked (ingest, prisma, idempotency, secrets, logger) — offline.
 */

const ingestInbound = vi.fn(async (_orgId: string, _msg: InboundNormalized) => ({
  ok: true,
  threadId: "t1",
  messageInserted: true,
}));
const ingestComment = vi.fn(async (_orgId: string, _comment: NormalizedComment) => ({
  ok: true,
  commentId: "c1",
  commentInserted: true,
}));
const connectionFindFirst = vi.fn(
  async () => ({ organizationId: "org-1" }) as { organizationId: string } | null,
);

// handleIdempotent: by default run the fn once and report "processed". Tests can
// override the implementation to simulate a replay.
let idempotentResult: "processed" | "replay" = "processed";
const handleIdempotent = vi.fn(
  async (_p: string, _id: string, _b: string, fn: () => Promise<void>) => {
    if (idempotentResult === "processed") await fn();
    return idempotentResult;
  },
);

vi.mock("@/lib/inbox/ingest", () => ({ ingestInbound, ingestComment }));
vi.mock("@/lib/webhooks/idempotency", () => ({ handleIdempotent }));
vi.mock("@/lib/db/client", () => ({
  prisma: { connection: { findFirst: connectionFindFirst } },
}));
vi.mock("@/lib/secrets", () => ({ isProductionRuntime: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// ---- request factory: supports text(), headers.get(), nextUrl.searchParams ----
function req(
  body: string,
  opts: { headers?: Record<string, string>; query?: Record<string, string> } = {},
) {
  const headers = opts.headers ?? {};
  const params = new URLSearchParams(opts.query ?? {});
  return {
    text: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { searchParams: params },
  } as unknown as import("next/server").NextRequest;
}

function metaSig(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

beforeEach(() => {
  ingestInbound.mockClear();
  ingestComment.mockClear();
  handleIdempotent.mockClear();
  connectionFindFirst.mockClear();
  connectionFindFirst.mockResolvedValue({ organizationId: "org-1" });
  idempotentResult = "processed";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// =========================================================================
// Meta webhook
// =========================================================================

describe("Meta webhook — POST", () => {
  const fbDmPayload = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "page-100",
        time: 1700000000,
        messaging: [
          {
            sender: { id: "user-9" },
            recipient: { id: "page-100" },
            timestamp: 1700000000000,
            message: { mid: "mid.xyz", text: "Are you open Sunday?" },
          },
        ],
      },
    ],
  });

  it("no-ops (200) and does NOT ingest when META_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "");
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(req(fbDmPayload));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe("meta_not_configured");
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("rejects (401) a bad X-Hub-Signature-256 when configured", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "app-secret");
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(
      req(fbDmPayload, { headers: { "x-hub-signature-256": "sha256=deadbeef" } }),
    );
    expect(res.status).toBe(401);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("ingests a Messenger DM with a valid signature (normalised payload)", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "app-secret");
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(
      req(fbDmPayload, { headers: { "x-hub-signature-256": metaSig(fbDmPayload, "app-secret") } }),
    );
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledTimes(1);
    const [orgId, normalized] = ingestInbound.mock.calls[0]!;
    expect(orgId).toBe("org-1");
    expect(normalized.channel).toBe("facebook_msg");
    expect(normalized.externalId).toBe("mid.xyz");
    expect(normalized.externalThreadId).toBe("page-100:user-9");
    expect(normalized.body).toBe("Are you open Sunday?");
    expect(normalized.participant?.externalId).toBe("user-9");
  });

  it("ingests an Instagram comment as a SocialComment", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "app-secret");
    const igComment = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig-200",
          changes: [
            {
              field: "comments",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "igc_1",
                post_id: "media_1",
                text: "🔥🔥",
                from: { id: "iguser_5", name: "Lee" },
              },
            },
          ],
        },
      ],
    });
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(
      req(igComment, { headers: { "x-hub-signature-256": metaSig(igComment, "app-secret") } }),
    );
    expect(res.status).toBe(200);
    expect(ingestComment).toHaveBeenCalledTimes(1);
    const [orgId, normalized] = ingestComment.mock.calls[0]!;
    expect(orgId).toBe("org-1");
    expect(normalized.platform).toBe("instagram");
    expect(normalized.externalId).toBe("igc_1");
    expect(normalized.authorExternalId).toBe("iguser_5");
  });

  it("skips (200) with no ingest when no Connection resolves the page", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "app-secret");
    connectionFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(
      req(fbDmPayload, { headers: { "x-hub-signature-256": metaSig(fbDmPayload, "app-secret") } }),
    );
    expect(res.status).toBe(200);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("idempotent: a replayed delivery does not re-run ingest", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "app-secret");
    idempotentResult = "replay";
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(
      req(fbDmPayload, { headers: { "x-hub-signature-256": metaSig(fbDmPayload, "app-secret") } }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.idempotent).toBe(true);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("ignores message echoes (messages we sent, reflected back)", async () => {
    vi.stubEnv("META_WEBHOOK_SECRET", "app-secret");
    const echo = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "page-100",
          messaging: [
            {
              sender: { id: "page-100" },
              message: { mid: "mid.echo", text: "auto reply", is_echo: true },
            },
          ],
        },
      ],
    });
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const res = await POST(
      req(echo, { headers: { "x-hub-signature-256": metaSig(echo, "app-secret") } }),
    );
    expect(res.status).toBe(200);
    expect(ingestInbound).not.toHaveBeenCalled();
  });
});

describe("Meta webhook — GET verification", () => {
  it("404 when no verify token configured", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "");
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const res = GET(
      req("", {
        query: { "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "123" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("echoes hub.challenge when the verify token matches", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "secret-token");
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const res = GET(
      req("", {
        query: {
          "hub.mode": "subscribe",
          "hub.verify_token": "secret-token",
          "hub.challenge": "challenge-42",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("challenge-42");
  });

  it("403 when the verify token does not match", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "secret-token");
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const res = GET(
      req("", {
        query: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" },
      }),
    );
    expect(res.status).toBe(403);
  });
});

// =========================================================================
// GBP webhook
// =========================================================================

describe("GBP webhook — POST", () => {
  const gbpPayload = (token: string) =>
    JSON.stringify({
      clientToken: token,
      agent: "brands/123/agents/456",
      conversationId: "conv-9",
      message: { messageId: "gbpm_1", text: "Do you deliver?", createTime: "2026-06-08T10:00:00Z" },
      context: { userInfo: { displayName: "Pat" }, placeId: "brands/123/agents/456" },
    });

  it("no-ops (200) and does NOT ingest when GBP_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "");
    const { POST } = await import("@/app/api/webhooks/gbp/route");
    const res = await POST(req(gbpPayload("anything")));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe("gbp_not_configured");
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("rejects (401) a bad clientToken when configured", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "real-token");
    const { POST } = await import("@/app/api/webhooks/gbp/route");
    const res = await POST(req(gbpPayload("wrong-token")));
    expect(res.status).toBe(401);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("ingests a Business Message with a valid clientToken (channel gbp_qa)", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "real-token");
    const { POST } = await import("@/app/api/webhooks/gbp/route");
    const res = await POST(req(gbpPayload("real-token")));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledTimes(1);
    const [orgId, normalized] = ingestInbound.mock.calls[0]!;
    expect(orgId).toBe("org-1");
    expect(normalized.channel).toBe("gbp_qa");
    expect(normalized.externalId).toBe("gbpm_1");
    expect(normalized.externalThreadId).toBe("conv-9");
    expect(normalized.body).toBe("Do you deliver?");
  });

  it("skips (200) with no ingest when no Connection resolves the agent", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "real-token");
    connectionFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/webhooks/gbp/route");
    const res = await POST(req(gbpPayload("real-token")));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe("no_connection");
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("idempotent: a replayed delivery does not re-run ingest", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "real-token");
    idempotentResult = "replay";
    const { POST } = await import("@/app/api/webhooks/gbp/route");
    const res = await POST(req(gbpPayload("real-token")));
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(ingestInbound).not.toHaveBeenCalled();
  });
});

describe("GBP webhook — GET verification", () => {
  it("404 when not configured", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "");
    const { GET } = await import("@/app/api/webhooks/gbp/route");
    const res = GET(req("", { query: { secret: "x" } }));
    expect(res.status).toBe(404);
  });

  it("echoes the clientToken when it matches", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "real-token");
    const { GET } = await import("@/app/api/webhooks/gbp/route");
    const res = GET(req("", { query: { secret: "real-token" } }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("real-token");
  });

  it("403 when the token does not match", async () => {
    vi.stubEnv("GBP_WEBHOOK_SECRET", "real-token");
    const { GET } = await import("@/app/api/webhooks/gbp/route");
    const res = GET(req("", { query: { secret: "nope" } }));
    expect(res.status).toBe(403);
  });
});
