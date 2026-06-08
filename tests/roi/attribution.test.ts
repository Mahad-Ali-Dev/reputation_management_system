import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `buildRoiFunnel` (Module 15) — attribution split + empty-table tolerance.
 *
 * `withTenant` is mocked to drive a fake tenant `tx`; the GBP adapter import is
 * absent in this wave, so `gbpViews` must be null with zero hard dependency.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

type FakeTx = {
  review: { count: ReturnType<typeof vi.fn> };
  reviewRequest: { findMany: ReturnType<typeof vi.fn> };
  deviceScan: { count: ReturnType<typeof vi.fn> };
  device: { findMany: ReturnType<typeof vi.fn> };
  phoneCall: { count: ReturnType<typeof vi.fn> };
  phoneBooking: { findMany: ReturnType<typeof vi.fn> };
};
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import { buildRoiFunnel } from "@/lib/roi/attribution";

const ORG = "11111111-1111-4111-8111-111111111111";
const RANGE = { start: new Date("2026-05-01T00:00:00Z"), end: new Date("2026-06-01T00:00:00Z") };

beforeEach(() => {
  tx = {
    review: { count: vi.fn().mockResolvedValue(0) },
    reviewRequest: { findMany: vi.fn().mockResolvedValue([]) },
    deviceScan: { count: vi.fn().mockResolvedValue(0) },
    device: { findMany: vi.fn().mockResolvedValue([]) },
    phoneCall: { count: vi.fn().mockResolvedValue(0) },
    phoneBooking: { findMany: vi.fn().mockResolvedValue([]) },
  };
  withTenantImpl = (_orgId, fn) => Promise.resolve(fn(tx));
});

describe("buildRoiFunnel", () => {
  it("tolerates all-zero / empty tables and returns a fully-formed funnel", async () => {
    const f = await buildRoiFunnel(ORG, { range: RANGE });
    expect(f.reviews.total).toBe(0);
    expect(f.scans).toBe(0);
    expect(f.calls).toBe(0);
    expect(f.bookings.total).toBe(0);
    expect(f.gbpViews).toBeNull(); // adapter absent → optional stage off
    expect(f.establishmentId).toBeNull();
  });

  it("splits reviews into QR / outreach / voice / organic correctly", async () => {
    // count() is called in this order:
    //  1. total, 2. qr (attributedDeviceId), 3. outreach (attributedRequestId),
    //  then later 4. fromVoice (attributedRequestId in voiceIds).
    tx.review.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3) // QR
      .mockResolvedValueOnce(5) // request-attributed (outreach+voice)
      .mockResolvedValueOnce(2); // voice subset
    tx.reviewRequest.findMany.mockResolvedValue([{ id: "rq1" }, { id: "rq2" }]);
    tx.deviceScan.count.mockResolvedValue(40);
    tx.phoneCall.count.mockResolvedValue(8);
    tx.phoneBooking.findMany.mockResolvedValue([
      { status: "confirmed" },
      { status: "completed" },
      { status: "pending" },
    ]);

    const f = await buildRoiFunnel(ORG, { range: RANGE });
    expect(f.reviews.total).toBe(10);
    expect(f.reviews.fromQr).toBe(3);
    expect(f.reviews.fromVoice).toBe(2);
    expect(f.reviews.fromOutreach).toBe(3); // 5 request-attributed − 2 voice
    expect(f.reviews.organic).toBe(2); // 10 − 3 QR − 5 request
    expect(f.scans).toBe(40);
    expect(f.calls).toBe(8);
    expect(f.bookings.total).toBe(3);
    expect(f.bookings.confirmed).toBe(2);
  });

  it("does not query the voice subset when no voice requests exist", async () => {
    tx.review.count
      .mockResolvedValueOnce(4) // total
      .mockResolvedValueOnce(1) // QR
      .mockResolvedValueOnce(2); // outreach
    tx.reviewRequest.findMany.mockResolvedValue([]); // no voice requests
    const f = await buildRoiFunnel(ORG, { range: RANGE });
    expect(f.reviews.fromVoice).toBe(0);
    expect(f.reviews.fromOutreach).toBe(2);
    // review.count called exactly 3 times (no 4th voice-subset query)
    expect(tx.review.count).toHaveBeenCalledTimes(3);
  });

  it("degrades to zeros (never throws) when a table is unmigrated (42P01)", async () => {
    withTenantImpl = () => Promise.reject({ code: "42P01", message: "relation does not exist" });
    const f = await buildRoiFunnel(ORG, { range: RANGE });
    expect(f.reviews.total).toBe(0);
    expect(f.calls).toBe(0);
    expect(f.gbpViews).toBeNull();
  });

  it("filters scans by establishment via the device list", async () => {
    tx.device.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    tx.deviceScan.count.mockResolvedValue(12);
    const f = await buildRoiFunnel(ORG, { establishmentId: "est1", range: RANGE });
    expect(f.establishmentId).toBe("est1");
    expect(tx.device.findMany).toHaveBeenCalled();
    expect(f.scans).toBe(12);
  });
});
