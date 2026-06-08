import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auto-capture (`upsertContactFromInteraction`) unit tests (Module 12, Wave 3b).
 *
 * The guarantees under test:
 *  - dedupe by strongest identifier first: (org,source,externalId) → email →
 *    phone → socialId, else CREATE.
 *  - never DOWNGRADES a real source (google_review) to a weak one (import).
 *  - writes exactly ONE idempotent ContactActivity "captured" marker; re-running
 *    the same externalRef is a no-op.
 *  - FAIL-SOFT: a thrown prisma error returns null and never propagates.
 *
 * Everything is mocked (withTenant + a fake tx + logger) so this is fully
 * offline and deterministic.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// A programmable fake transaction client. Tests set the find* return values.
type FakeTx = {
  contact: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  contactActivity: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import { normalizeEmail, normalizePhone, upsertContactFromInteraction } from "@/lib/contacts/upsert-from-interaction";

function freshTx(): FakeTx {
  return {
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "new-contact" }),
      update: vi.fn().mockResolvedValue({}),
    },
    contactActivity: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  tx = freshTx();
  withTenantImpl = async (_orgId, fn) => fn(tx);
});

describe("normalizers", () => {
  it("lowercases + validates email", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("normalizes phone toward E.164", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("0044 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("555-1234")).toBeNull(); // no country code
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("dedupe order", () => {
  it("matches by (org,source,externalId) first → updates, does not create", async () => {
    tx.contact.findFirst.mockResolvedValueOnce({ id: "c-ext", source: "shopify", socialIds: null });
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "shopify",
      externalId: "cust_99",
      email: "buyer@shop.com",
    });
    expect(res).toEqual({ contactId: "c-ext", created: false });
    expect(tx.contact.create).not.toHaveBeenCalled();
    expect(tx.contact.update).toHaveBeenCalledOnce();
    // First lookup must be the externalId triple.
    expect(tx.contact.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: ORG, source: "shopify", externalId: "cust_99" },
    });
  });

  it("falls back to email when no externalId is supplied", async () => {
    // No externalId → the email lookup is the FIRST findFirst call.
    tx.contact.findFirst.mockResolvedValueOnce({ id: "c-email", source: "manual", socialIds: null });
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      email: "Person@Example.com",
    });
    expect(res).toEqual({ contactId: "c-email", created: false });
    expect(tx.contact.create).not.toHaveBeenCalled();
    // The single lookup must be the normalized-email query.
    expect(tx.contact.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: ORG, email: "person@example.com" },
    });
  });

  it("matches by externalId triple first, before email, when externalId is supplied", async () => {
    // externalId lookup (1st) → null, email lookup (2nd) → hit.
    tx.contact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "c-email", source: "manual", socialIds: null });
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      externalId: "evt_1",
      email: "Person@Example.com",
    });
    expect(res).toEqual({ contactId: "c-email", created: false });
    expect(tx.contact.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: ORG, source: "survey", externalId: "evt_1" },
    });
  });

  it("creates a new contact when nothing matches", async () => {
    tx.contact.findFirst.mockResolvedValue(null);
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "live_chat",
      email: "new@lead.com",
      name: "New Lead",
    });
    expect(res).toEqual({ contactId: "new-contact", created: true });
    expect(tx.contact.create).toHaveBeenCalledOnce();
    expect(tx.contact.create.mock.calls[0]![0]).toMatchObject({
      data: { organizationId: ORG, source: "live_chat", email: "new@lead.com" },
    });
  });

  it("returns null without any identifier", async () => {
    const res = await upsertContactFromInteraction({ orgId: ORG, source: "manual" });
    expect(res).toBeNull();
    expect(tx.contact.findFirst).not.toHaveBeenCalled();
    expect(tx.contact.create).not.toHaveBeenCalled();
  });
});

describe("no source downgrade", () => {
  it("keeps a strong existing source when a weak interaction arrives", async () => {
    // No externalId → email lookup is the first call; return the existing hit.
    tx.contact.findFirst.mockResolvedValueOnce({ id: "c1", source: "google_review", socialIds: null });
    await upsertContactFromInteraction({
      orgId: ORG,
      source: "import",
      email: "vip@guest.com",
    });
    const updateData = tx.contact.update.mock.calls[0]![0].data;
    expect(updateData.source).toBeUndefined(); // not downgraded
  });

  it("upgrades a weak existing source to a strong incoming one", async () => {
    tx.contact.findFirst.mockResolvedValueOnce({ id: "c2", source: "import", socialIds: null });
    await upsertContactFromInteraction({
      orgId: ORG,
      source: "google_review",
      email: "guest@x.com",
      name: "Guest",
    });
    const updateData = tx.contact.update.mock.calls[0]![0].data;
    expect(updateData.source).toBe("google_review");
  });
});

describe("idempotent capture marker", () => {
  it("writes exactly one marker on first capture", async () => {
    tx.contact.findFirst.mockResolvedValue(null);
    await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      email: "a@b.com",
      activity: { externalRef: "survey-resp-1" },
    });
    expect(tx.contactActivity.findFirst).toHaveBeenCalledOnce();
    expect(tx.contactActivity.create).toHaveBeenCalledOnce();
  });

  it("is a no-op when the same externalRef marker already exists", async () => {
    // Existing contact (matched by email, the first lookup) + an existing marker.
    tx.contact.findFirst.mockResolvedValueOnce({ id: "c3", source: "survey", socialIds: null });
    tx.contactActivity.findFirst.mockResolvedValue({ id: "existing-marker" });
    await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      email: "a@b.com",
      activity: { externalRef: "survey-resp-1" },
    });
    expect(tx.contactActivity.create).not.toHaveBeenCalled();
  });

  it("a marker write failure does not fail the whole capture", async () => {
    tx.contact.findFirst.mockResolvedValue(null);
    tx.contactActivity.findFirst.mockResolvedValue(null);
    tx.contactActivity.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      email: "a@b.com",
    });
    // Contact upsert still succeeded.
    expect(res).toEqual({ contactId: "new-contact", created: true });
  });
});

describe("fail-soft", () => {
  it("returns null (never throws) when the contact query throws", async () => {
    tx.contact.findFirst.mockRejectedValue(Object.assign(new Error("boom"), { code: "XX000" }));
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      email: "a@b.com",
    });
    expect(res).toBeNull();
  });

  it("returns null silently on a not-yet-migrated table (42P01)", async () => {
    withTenantImpl = async () => {
      throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
    };
    const res = await upsertContactFromInteraction({
      orgId: ORG,
      source: "survey",
      email: "a@b.com",
    });
    expect(res).toBeNull();
  });
});
