import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * evaluateTrigger — the automation entry the webhook calls. We mock withTenant
 * with an in-memory store of automation rules + review requests + establishments,
 * and mock suppression, to assert: no_rule when disabled/absent, frequency_cap at
 * the cap, suppression skips, and a correct scheduled ReviewRequest on the happy
 * path (triggerSource:"automation", status:"scheduled", scheduledFor=now+delay,
 * templateId stays null per FK correctness).
 */

type Rule = {
  id: string;
  trigger: string;
  enabled: boolean;
  delayHours: number;
  frequencyCapPerCustomer: number;
  frequencyCapWindowDays: number;
  establishmentId: string | null;
  createdAt: Date;
};
type RR = {
  id: string;
  recipient: string;
  createdAt: Date;
  status: string;
  triggerSource: string | null;
  templateId: string | null;
  scheduledFor: Date;
  establishmentId: string;
  channel: string;
};

const store: {
  rules: Rule[];
  requests: RR[];
  establishments: Array<{ id: string; createdAt: Date }>;
  failWith: Error | null;
} = { rules: [], requests: [], establishments: [], failWith: null };

const suppression = { unsubscribed: new Set<string>(), consented: new Set<string>() };

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
    if (store.failWith) throw store.failWith;
    let seq = store.requests.length;
    const tx = {
      automationRule: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          store.rules.find(
            (r) =>
              (where.trigger === undefined || r.trigger === where.trigger) &&
              (where.enabled === undefined || r.enabled === where.enabled),
          ) ?? null,
      },
      reviewRequest: {
        count: async ({ where }: { where: { recipient: string; createdAt: { gte: Date } } }) =>
          store.requests.filter(
            (r) => r.recipient === where.recipient && r.createdAt >= where.createdAt.gte,
          ).length,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const rr: RR = {
            id: `rr${++seq}`,
            recipient: data.recipient as string,
            createdAt: new Date(),
            status: data.status as string,
            triggerSource: (data.triggerSource as string) ?? null,
            templateId: (data.templateId as string) ?? null,
            scheduledFor: data.scheduledFor as Date,
            establishmentId: data.establishmentId as string,
            channel: data.channel as string,
          };
          store.requests.push(rr);
          return rr;
        },
      },
      establishment: {
        findFirst: async () =>
          store.establishments.length > 0 ? { id: store.establishments[0]!.id } : null,
      },
    };
    return fn(tx);
  },
}));

vi.mock("@/lib/outreach/suppression", () => ({
  isUnsubscribed: async ({ recipient }: { recipient: string }) => suppression.unsubscribed.has(recipient),
  hasSmsConsent: async ({ phoneE164 }: { phoneE164: string }) => suppression.consented.has(phoneE164),
}));

// evaluateTrigger doesn't use auth/entitlements, but automation.ts imports them
// at module top (for upsertAutomationRule). Stub to avoid pulling next-auth into
// the vitest node environment.
vi.mock("@/lib/auth/config", () => ({ auth: async () => null }));
vi.mock("@/lib/billing/entitlements", () => ({ assertEntitled: async () => undefined }));
vi.mock("@/lib/logger", () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }));

import { evaluateTrigger } from "@/lib/outreach/automation";

const ORG = "00000000-0000-0000-0000-000000000001";

function seedRule(over: Partial<Rule> = {}) {
  store.rules.push({
    id: "rule1",
    trigger: "post_purchase",
    enabled: true,
    delayHours: 72,
    frequencyCapPerCustomer: 1,
    frequencyCapWindowDays: 30,
    establishmentId: null,
    createdAt: new Date(),
    ...over,
  });
}

beforeEach(() => {
  store.rules = [];
  store.requests = [];
  store.establishments = [{ id: "estab1", createdAt: new Date() }];
  store.failWith = null;
  suppression.unsubscribed.clear();
  suppression.consented.clear();
});

describe("evaluateTrigger", () => {
  it("returns no_rule when no enabled rule exists", async () => {
    const r = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "a@b.com" });
    expect(r).toEqual({ skipped: "no_rule" });
  });

  it("returns no_rule when the rule is disabled", async () => {
    seedRule({ enabled: false });
    const r = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "a@b.com" });
    expect(r).toEqual({ skipped: "no_rule" });
  });

  it("schedules a ReviewRequest on the happy path (email)", async () => {
    seedRule({ delayHours: 48 });
    const before = Date.now();
    const r = await evaluateTrigger({
      orgId: ORG,
      trigger: "post_purchase",
      recipient: "a@b.com",
      recipientName: "Jordan Smith",
    });
    expect("scheduled" in r && r.scheduled).toBe(true);
    const rr = store.requests[0]!;
    expect(rr.status).toBe("scheduled");
    expect(rr.triggerSource).toBe("automation");
    expect(rr.channel).toBe("email");
    // FK correctness: never persist a template id onto ReviewRequest.templateId.
    expect(rr.templateId).toBeNull();
    // scheduledFor ≈ now + 48h.
    const delta = rr.scheduledFor.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(48 * 3600 * 1000 - 5000);
    expect(delta).toBeLessThanOrEqual(48 * 3600 * 1000 + 5000);
  });

  it("returns frequency_cap when recent count >= cap", async () => {
    seedRule({ frequencyCapPerCustomer: 1, frequencyCapWindowDays: 30 });
    store.requests.push({
      id: "old",
      recipient: "a@b.com",
      createdAt: new Date(),
      status: "sent",
      triggerSource: "manual",
      templateId: null,
      scheduledFor: new Date(),
      establishmentId: "estab1",
      channel: "email",
    });
    const r = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "a@b.com" });
    expect(r).toEqual({ skipped: "frequency_cap" });
    // No new row created.
    expect(store.requests.length).toBe(1);
  });

  it("skips unsubscribed recipients", async () => {
    seedRule();
    suppression.unsubscribed.add("a@b.com");
    const r = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "a@b.com" });
    expect(r).toEqual({ skipped: "unsubscribed" });
  });

  it("requires SMS consent for phone recipients", async () => {
    seedRule();
    const r = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "+15551234567" });
    expect(r).toEqual({ skipped: "no_consent" });
    // With consent on file → schedules an SMS request.
    suppression.consented.add("+15551234567");
    const r2 = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "+15551234567" });
    expect("scheduled" in r2 && r2.scheduled).toBe(true);
    expect(store.requests.at(-1)!.channel).toBe("sms");
  });

  it("fails soft to table_not_ready when the relation is missing", async () => {
    store.failWith = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    const r = await evaluateTrigger({ orgId: ORG, trigger: "post_purchase", recipient: "a@b.com" });
    expect(r).toEqual({ skipped: "table_not_ready" });
  });
});
