import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Autopilot weekly digest (Module 15) — builder + idempotent sender.
 *
 * Mocks: prisma, the ledger summarize/list, ROI headline, config view, Resend,
 * and runAiAssist. Asserts: disabled / nothing-happened → null; composes
 * did/needs-you/ROI; idempotent across re-runs (AutopilotDigestRun claim);
 * no ANTHROPIC_API_KEY → deterministic intro (runAiAssist NOT called).
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/secrets", () => ({
  getUnsubscribeSecret: () => "test-secret",
}));

// ---- prisma mock ----
const organizationFindUnique = vi.fn();
const membershipFindMany = vi.fn();
const unsubscribeFindMany = vi.fn();
const digestRunCreate = vi.fn();
const digestRunUpdate = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => organizationFindUnique(...a) },
    membership: { findMany: (...a: unknown[]) => membershipFindMany(...a) },
    unsubscribe: { findMany: (...a: unknown[]) => unsubscribeFindMany(...a) },
    autopilotDigestRun: {
      create: (...a: unknown[]) => digestRunCreate(...a),
      update: (...a: unknown[]) => digestRunUpdate(...a),
    },
  },
}));

// ---- collaborators ----
const summarizeMock = vi.fn();
const listMock = vi.fn();
vi.mock("@/lib/autopilot/ledger", () => ({
  summarizeAutopilotActions: (...a: unknown[]) => summarizeMock(...a),
  listAutopilotActions: (...a: unknown[]) => listMock(...a),
}));

const configMock = vi.fn();
vi.mock("@/lib/autopilot/queries", () => ({
  getAutopilotConfig: (...a: unknown[]) => configMock(...a),
}));

const roiMock = vi.fn();
vi.mock("@/lib/roi/summary", () => ({
  getRoiHeadline: (...a: unknown[]) => roiMock(...a),
}));

// ---- Resend ----
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => sendMock(...a) };
  },
}));

// ---- runAiAssist (dynamic import target) ----
const aiMock = vi.fn();
vi.mock("@/lib/ai/assist", () => ({
  runAiAssist: (...a: unknown[]) => aiMock(...a),
}));

import {
  buildAutopilotDigest,
  sendAutopilotDigestForOrg,
} from "@/lib/autopilot/digest";

const ORG = "11111111-1111-4111-8111-111111111111";
const WEEK = new Date("2026-06-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";

  organizationFindUnique.mockResolvedValue({ id: ORG, name: "Acme Dental" });
  configMock.mockResolvedValue({ enabled: true, weeklyDigestEnabled: true });
  summarizeMock.mockResolvedValue({
    total: 14,
    byLoop: { auto_reply: 12, review_request: 2 },
    byAction: { published: 12, scheduled_request: 2 },
    requiresHuman: 1,
  });
  listMock.mockResolvedValue([
    { id: "a1", loop: "escalation", action: "escalated", status: "pending", requiresHuman: true, resourceType: "review", resourceId: "rev1", detail: { reviewId: "rev1" }, createdAt: new Date() },
  ]);
  roiMock.mockResolvedValue({
    estimatedRevenue: 1840,
    currency: "USD",
    topDriver: "Bookings",
    reviews: 14,
    calls: 9,
    bookings: 6,
  });
  membershipFindMany.mockResolvedValue([{ user: { email: "owner@acme.test", name: "Owner" } }]);
  unsubscribeFindMany.mockResolvedValue([]);
  digestRunCreate.mockResolvedValue({ id: "run1" });
  digestRunUpdate.mockResolvedValue({});
  sendMock.mockResolvedValue({ error: null });
});

describe("buildAutopilotDigest", () => {
  it("returns null when Autopilot is disabled", async () => {
    configMock.mockResolvedValue({ enabled: false, weeklyDigestEnabled: true });
    expect(await buildAutopilotDigest(ORG, WEEK)).toBeNull();
  });

  it("returns null when the weekly digest is disabled", async () => {
    configMock.mockResolvedValue({ enabled: true, weeklyDigestEnabled: false });
    expect(await buildAutopilotDigest(ORG, WEEK)).toBeNull();
  });

  it("returns null when nothing happened and nothing needs a human", async () => {
    summarizeMock.mockResolvedValue({ total: 0, byLoop: {}, byAction: {}, requiresHuman: 0 });
    listMock.mockResolvedValue([]);
    expect(await buildAutopilotDigest(ORG, WEEK)).toBeNull();
  });

  it("composes what-I-did + needs-you + ROI headline", async () => {
    const d = await buildAutopilotDigest(ORG, WEEK);
    expect(d).not.toBeNull();
    expect(d?.totalActions).toBe(14);
    expect(d?.whatIDid[0]).toEqual({ label: "Replied to reviews", count: 12 });
    expect(d?.needsYouCount).toBe(1);
    expect(d?.roi.estimatedRevenue).toBe(1840);
    expect(d?.recipients).toEqual([{ email: "owner@acme.test", name: "Owner" }]);
  });

  it("uses a deterministic intro and does NOT call runAiAssist without ANTHROPIC_API_KEY", async () => {
    const d = await buildAutopilotDigest(ORG, WEEK);
    expect(aiMock).not.toHaveBeenCalled();
    expect(d?.intro).toContain("Acme Dental");
    expect(d?.intro).toContain("14 actions");
  });

  it("filters out unsubscribed recipients", async () => {
    unsubscribeFindMany.mockResolvedValue([{ emailOrPhone: "owner@acme.test" }]);
    const d = await buildAutopilotDigest(ORG, WEEK);
    expect(d?.recipients).toEqual([]);
  });
});

describe("sendAutopilotDigestForOrg", () => {
  it("sends to recipients and records the run", async () => {
    const r = await sendAutopilotDigestForOrg(ORG, WEEK);
    expect(r.sent).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(digestRunUpdate).toHaveBeenCalled();
    const sendArg = sendMock.mock.calls[0]![0] as { headers: Record<string, string> };
    expect(sendArg.headers["List-Unsubscribe"]).toContain("https://app.test/u");
  });

  it("is idempotent — a second run for the same week is skipped (P2002)", async () => {
    digestRunCreate.mockRejectedValueOnce({ code: "P2002" });
    const r = await sendAutopilotDigestForOrg(ORG, WEEK);
    expect(r).toEqual({ sent: 0, skipped: 1, errors: [] });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips cleanly when the run table is unmigrated (42P01)", async () => {
    digestRunCreate.mockRejectedValueOnce({ code: "42P01" });
    const r = await sendAutopilotDigestForOrg(ORG, WEEK);
    expect(r.skipped).toBe(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("completes the run with zero sent when there are no recipients", async () => {
    membershipFindMany.mockResolvedValue([]);
    const r = await sendAutopilotDigestForOrg(ORG, WEEK);
    expect(r.sent).toBe(0);
    expect(digestRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientsSent: 0 }) }),
    );
  });

  it("calls runAiAssist for the intro when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    aiMock.mockResolvedValue({ options: [{ text: "Custom AI intro.", blocked: false }] });
    const d = await buildAutopilotDigest(ORG, WEEK);
    expect(aiMock).toHaveBeenCalledTimes(1);
    expect(d?.intro).toBe("Custom AI intro.");
  });
});
