import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Content Library CRUD (Module 10, Wave 3d) — `lib/social/library.ts`.
 *
 * Proves: list/create/delete go through `withTenant`, persist the right fields,
 * audit, and FAIL SOFT on the not-migrated table (42P01) — list → [], create →
 * `{ error:"library_not_migrated" }`. Blob delete is best-effort.
 *
 * Auth (`auth`, `requireRole`), `withTenant`, blob `deleteFromBlob`, and
 * `revalidatePath` are mocked — fully offline.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "99999999-9999-4999-8999-999999999999";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ orgId: ORG, user: { id: USER } })),
}));
vi.mock("@/lib/auth/rbac", () => ({
  requireRole: vi.fn(async () => ({ orgId: ORG, userId: USER, role: "admin" })),
}));

const deleteFromBlob = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/uploads/blob", () => ({
  deleteFromBlob: (...a: unknown[]) => deleteFromBlob(...a),
}));

type FakeTx = {
  contentLibraryAsset: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  auditLog: { create: ReturnType<typeof vi.fn> };
};
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import {
  createLibraryUpload,
  deleteLibraryAsset,
  listLibraryAssets,
} from "@/lib/social/library";

function freshTx(): FakeTx {
  return {
    contentLibraryAsset: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "asset-1" }),
      delete: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  tx = freshTx();
  withTenantImpl = async (_orgId, fn) => fn(tx);
  deleteFromBlob.mockClear();
});

describe("listLibraryAssets", () => {
  it("returns rows newest-first, capped take", async () => {
    tx.contentLibraryAsset.findMany.mockResolvedValueOnce([
      { id: "a", url: "u", pathname: "p", kind: "image", createdAt: new Date() },
    ]);
    const rows = await listLibraryAssets(ORG, { take: 999 });
    expect(rows).toHaveLength(1);
    const arg = tx.contentLibraryAsset.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.take).toBeLessThanOrEqual(200); // clamped
  });

  it("filters by folder when provided", async () => {
    await listLibraryAssets(ORG, { folder: "promos" });
    const arg = tx.contentLibraryAsset.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ folder: "promos" });
  });

  it("fail-soft → [] when not migrated (42P01)", async () => {
    withTenantImpl = async () => {
      throw Object.assign(new Error("no relation"), { code: "42P01" });
    };
    const rows = await listLibraryAssets(ORG);
    expect(rows).toEqual([]);
  });
});

describe("createLibraryUpload", () => {
  it("persists the asset + writes an audit log", async () => {
    const res = await createLibraryUpload({
      url: "https://cdn.example.com/x.png",
      pathname: "org/content_library/x.png",
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 1234,
      source: "upload",
    });
    expect(res).toEqual({ id: "asset-1" });

    const createArg = tx.contentLibraryAsset.create.mock.calls[0]![0];
    expect(createArg.data.organizationId).toBe(ORG);
    expect(createArg.data.kind).toBe("image");
    expect(createArg.data.url).toBe("https://cdn.example.com/x.png");
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input (bad url)", async () => {
    const res = await createLibraryUpload({
      url: "not-a-url",
      pathname: "p",
      kind: "image",
    } as never);
    expect(res).toEqual({ error: "invalid_input" });
    expect(tx.contentLibraryAsset.create).not.toHaveBeenCalled();
  });

  it("fail-soft → {error:'library_not_migrated'} when the table is absent", async () => {
    withTenantImpl = async () => {
      throw Object.assign(new Error("no relation"), { code: "42P01" });
    };
    const res = await createLibraryUpload({
      url: "https://cdn.example.com/x.png",
      pathname: "p",
      kind: "image",
      source: "upload",
    });
    expect(res).toEqual({ error: "library_not_migrated" });
  });
});

describe("deleteLibraryAsset", () => {
  it("deletes the row + best-effort blob, audited (admin)", async () => {
    tx.contentLibraryAsset.findFirst.mockResolvedValueOnce({
      pathname: "org/content_library/x.png",
      kind: "image",
    });
    const form = new FormData();
    form.set("id", "33333333-3333-4333-8333-333333333333");
    await deleteLibraryAsset(form);

    expect(tx.contentLibraryAsset.delete).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(deleteFromBlob).toHaveBeenCalledWith("org/content_library/x.png");
  });

  it("no-ops when the asset doesn't exist (no blob delete)", async () => {
    tx.contentLibraryAsset.findFirst.mockResolvedValueOnce(null);
    const form = new FormData();
    form.set("id", "33333333-3333-4333-8333-333333333333");
    await deleteLibraryAsset(form);
    expect(tx.contentLibraryAsset.delete).not.toHaveBeenCalled();
    expect(deleteFromBlob).not.toHaveBeenCalled();
  });
});
