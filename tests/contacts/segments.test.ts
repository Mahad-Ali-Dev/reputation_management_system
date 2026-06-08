import { describe, expect, it, vi } from "vitest";

/**
 * Dynamic-segment unit tests (Module 12, Wave 3b).
 *
 * Segments are code-defined saved-filter predicates (no ContactSegment table).
 * Under test: every segment's `where()` is well-formed; `segmentWhere(key)`
 * resolves/ignores keys; `evaluateSegment` runs `count` with that predicate; and
 * counting is fail-soft → 0 on a not-yet-migrated column.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: vi.fn(),
}));

import { SEGMENTS, evaluateSegment, getSegment, segmentWhere } from "@/lib/contacts/segments";

describe("segment catalog", () => {
  it("includes the AC-named segments", () => {
    const keys = SEGMENTS.map((s) => s.key);
    expect(keys).toContain("recent");
    expect(keys).toContain("vip");
    expect(keys).toContain("new_this_month");
    expect(keys).toContain("has_phone");
    expect(keys).toContain("shopify");
  });

  it("every segment's where() returns a plain object predicate", () => {
    for (const s of SEGMENTS) {
      const w = s.where();
      expect(w).toBeTypeOf("object");
      expect(w).not.toBeNull();
    }
  });

  it("VIP segment matches the vip flag OR the 'vip' tag", () => {
    const vip = getSegment("vip")!;
    expect(JSON.stringify(vip.where())).toContain("\"vip\":true");
    expect(JSON.stringify(vip.where())).toContain("\"has\":\"vip\"");
  });

  it("shopify segment declares a connection requirement", () => {
    expect(getSegment("shopify")?.requiresConnection).toBe("shopify");
    expect(getSegment("vip")?.requiresConnection).toBeUndefined();
  });
});

describe("segmentWhere", () => {
  it("resolves a known key to its predicate", () => {
    expect(segmentWhere("has_phone")).toMatchObject({ phone: { not: null } });
  });
  it("returns null for unknown / 'all' / empty", () => {
    expect(segmentWhere("nope")).toBeNull();
    expect(segmentWhere("all")).toBeNull();
    expect(segmentWhere(null)).toBeNull();
    expect(segmentWhere(undefined)).toBeNull();
  });
});

describe("evaluateSegment", () => {
  it("calls count() with the segment's predicate", async () => {
    const count = vi.fn().mockResolvedValue(7);
    const tx = { contact: { count } } as never;
    const def = getSegment("has_email")!;
    const n = await evaluateSegment(tx, def);
    expect(n).toBe(7);
    expect(count).toHaveBeenCalledWith({ where: def.where() });
  });

  it("returns 0 (fail-soft) when count throws a missing-column error", async () => {
    const count = vi.fn().mockRejectedValue(Object.assign(new Error("no col"), { code: "42703" }));
    const tx = { contact: { count } } as never;
    const n = await evaluateSegment(tx, getSegment("vip")!);
    expect(n).toBe(0);
  });

  it("re-throws a real (non-missing) error", async () => {
    const count = vi.fn().mockRejectedValue(Object.assign(new Error("deadlock"), { code: "40P01" }));
    const tx = { contact: { count } } as never;
    await expect(evaluateSegment(tx, getSegment("recent")!)).rejects.toThrow("deadlock");
  });
});
