import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * refresh-social-metrics cron (Module 10, Wave 3d).
 *
 * Proves:
 *  - unauthorized → 401.
 *  - env unset → 200 {skipped:"not_configured"} with ZERO adapter calls + no query.
 *  - enabled → upserts one metric per published post (adapter mocked).
 *
 * `verifyCronRequest`, the metrics adapter (`isMetricsRefreshEnabled`,
 * `fetchPostMetrics`, `upsertPostMetric`), and `prisma` are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

let cronAllowed = true;
vi.mock("@/lib/secrets", () => ({
  verifyCronRequest: () => cronAllowed,
}));

let enabled = false;
const fetchPostMetrics = vi.fn();
const upsertPostMetric = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/social/metrics", () => ({
  isMetricsRefreshEnabled: () => enabled,
  fetchPostMetrics: (...a: unknown[]) => fetchPostMetrics(...a),
  upsertPostMetric: (...a: unknown[]) => upsertPostMetric(...a),
}));

const findMany = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { socialPost: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { GET } from "@/app/api/cron/refresh-social-metrics/route";

const ORG = "11111111-1111-4111-8111-111111111111";

function req(): Parameters<typeof GET>[0] {
  return { headers: { get: () => "Bearer test" } } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  cronAllowed = true;
  enabled = false;
  fetchPostMetrics.mockReset();
  upsertPostMetric.mockClear();
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("auth + env gate", () => {
  it("401 when unauthorized", async () => {
    cronAllowed = false;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("env unset → 200 {skipped:'not_configured'} with ZERO adapter calls + no query", async () => {
    enabled = false;
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe("not_configured");
    expect(findMany).not.toHaveBeenCalled();
    expect(fetchPostMetrics).not.toHaveBeenCalled();
  });
});

describe("enabled path", () => {
  it("upserts one metric per published post", async () => {
    enabled = true;
    findMany.mockResolvedValueOnce([
      { id: "p1", organizationId: ORG, platforms: ["facebook"], externalIds: { facebook: "fb1" }, establishmentId: null },
      { id: "p2", organizationId: ORG, platforms: ["facebook"], externalIds: { facebook: "fb2" }, establishmentId: null },
    ]);
    fetchPostMetrics.mockResolvedValue({
      skipped: false,
      snapshots: [{ platform: "facebook", likes: 5, comments: 1, shares: 0, reach: 100, impressions: 0 }],
    });

    const res = await GET(req());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.refreshed).toBe(2);
    expect(upsertPostMetric).toHaveBeenCalledTimes(2);
    // take bound passed.
    const arg = findMany.mock.calls[0]![0];
    expect(arg.take).toBe(200);
    expect(arg.where.status).toBe("published");
  });

  it("a skipped adapter result writes nothing", async () => {
    enabled = true;
    findMany.mockResolvedValueOnce([
      { id: "p1", organizationId: ORG, platforms: ["facebook"], externalIds: { facebook: "fb1" }, establishmentId: null },
    ]);
    fetchPostMetrics.mockResolvedValueOnce({ skipped: true, snapshots: [] });
    const res = await GET(req());
    const body = await res.json();
    expect(body.refreshed).toBe(0);
    expect(upsertPostMetric).not.toHaveBeenCalled();
  });

  it("42P01 query error → 200 {skipped:'not_migrated'}", async () => {
    enabled = true;
    findMany.mockRejectedValueOnce(Object.assign(new Error("no relation"), { code: "42P01" }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe("not_migrated");
  });
});
