import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SMS handoff + number provisioning — unit tests (Module 09, Wave 3c-B).
 *
 * Guardrail-focused (the paid-integration contract):
 *  - provisionHandoffNumber(): with Twilio UNCONFIGURED, returns
 *    `{ provisioned:false, reason:"twilio_not_configured" }` and makes NO network
 *    call (proves no live paid call in the default path).
 *  - startSmsHandoff(): with Twilio unconfigured, still CREATES an `sms`
 *    InboxThread tagged `startedViaWidget`, copies the transcript, marks the
 *    AiConversation handed off, and reports `smsSent:false` (never throws).
 *  - resolveWidgetMode() / isWithinBusinessHours(): pure mode resolution.
 *
 * Everything mocked + offline. `fetch` is spied so we can assert it is NOT called.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ---- Fake tenant tx ----
type FakeTx = {
  inboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  inboxMessage: { create: ReturnType<typeof vi.fn> };
  aiConversation: { updateMany: ReturnType<typeof vi.fn> };
  phoneNumber: { findFirst: ReturnType<typeof vi.fn> };
};

let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

// Entitled by default; assertEntitled resolves.
vi.mock("@/lib/billing/entitlements", () => ({
  assertEntitled: vi.fn().mockResolvedValue(undefined),
  isOrgEntitled: vi.fn().mockResolvedValue(true),
  PlanInactiveError: class PlanInactiveError extends Error {},
}));

// Suppression: not unsubscribed; consent record is a no-op. Use explicit async
// fns (most reliable in the vi.mock factory).
vi.mock("@/lib/outreach/suppression", () => ({
  isUnsubscribed: async () => false,
  recordSmsConsent: async () => undefined,
}));

// Contact capture spy.
const captureSpy = vi.fn();
vi.mock("@/lib/contacts/upsert-from-interaction", () => ({
  captureContactInBackground: (...a: unknown[]) => captureSpy(...a),
}));

// sendSms spy (should NOT be called when Twilio unconfigured).
const sendSmsSpy = vi.fn();
vi.mock("@/lib/outreach/twilio", () => ({
  sendSms: (...a: unknown[]) => sendSmsSpy(...a),
}));

// Transcript loader → two messages. Explicit async fn (reliable in the factory).
vi.mock("@/lib/inbox/livechat", () => ({
  getSessionTranscript: async () => [
    { id: "m1", role: "user", content: "Hi, are you open?", createdAt: "2026-06-08T10:00:00Z" },
    { id: "m2", role: "assistant", content: "We close at 5.", createdAt: "2026-06-08T10:00:01Z" },
  ],
}));

import { provisionHandoffNumber } from "@/lib/phone/provision-number";
import { startSmsHandoff } from "@/lib/inbox/sms-handoff";
import { isWithinBusinessHours, resolveWidgetMode } from "@/lib/inbox/widget";

const ORG = "11111111-1111-4111-8111-111111111111";

function freshTx(): FakeTx {
  return {
    inboxThread: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "thread-1", participant: {} }),
      update: vi.fn().mockResolvedValue({}),
    },
    inboxMessage: { create: vi.fn().mockResolvedValue({ id: "msg-1" }) },
    aiConversation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    phoneNumber: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

beforeEach(() => {
  tx = freshTx();
  withTenantImpl = async (_orgId, fn) => fn(tx);
  captureSpy.mockReset();
  sendSmsSpy.mockReset();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provisionHandoffNumber — paid-integration guardrail", () => {
  it("no-ops with NO fetch when Twilio is not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await provisionHandoffNumber({ orgId: ORG });
    expect(res).toEqual({ provisioned: false, reason: "twilio_not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("startSmsHandoff", () => {
  it("creates an sms thread, copies transcript, marks the conversation, and skips SMS when Twilio absent", async () => {
    const res = await startSmsHandoff({
      orgId: ORG,
      conversationId: "33333333-3333-4333-8333-333333333333",
      visitorPhone: "(555) 867-5309",
      visitorName: "Jordan",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Thread created as sms + startedViaWidget marker.
    expect(tx.inboxThread.create).toHaveBeenCalledTimes(1);
    const created = tx.inboxThread.create.mock.calls[0]![0];
    expect(created.data.channel).toBe("sms");
    expect(created.data.participant.startedViaWidget).toBe(true);
    expect(created.data.participant.phone).toBe("+15558675309"); // normalized E.164

    // Transcript (2 msgs) copied in as opening messages.
    expect(tx.inboxMessage.create).toHaveBeenCalledTimes(2);

    // Conversation marked handed off.
    expect(tx.aiConversation.updateMany).toHaveBeenCalledTimes(1);
    const convUpd = tx.aiConversation.updateMany.mock.calls[0]![0];
    expect(convUpd.data.handedOffAt).toBeInstanceOf(Date);

    // No SMS sent (Twilio unconfigured) — and sendSms never called.
    expect(sendSmsSpy).not.toHaveBeenCalled();
    expect(res.smsSent).toBe(false);
    expect(res.numberProvisioned).toBe(false);

    // Contact capture fired.
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid phone", async () => {
    const res = await startSmsHandoff({ orgId: ORG, visitorPhone: "nope" });
    expect(res).toEqual({ ok: false, error: "invalid_phone" });
    expect(tx.inboxThread.create).not.toHaveBeenCalled();
  });
});

describe("resolveWidgetMode", () => {
  const cfg = { businessHours: null, smsHandoffEnabled: true };

  it("always_on → ai", () => {
    expect(resolveWidgetMode({ aiMode: "always_on", config: cfg }).decision).toBe("ai");
  });

  it("ai_human_handoff → capture + offers SMS when enabled", () => {
    const r = resolveWidgetMode({ aiMode: "ai_human_handoff", config: cfg });
    expect(r.decision).toBe("capture");
    expect(r.offerSmsHandoff).toBe(true);
  });

  it("after_hours with NO schedule treated as open → ai", () => {
    expect(resolveWidgetMode({ aiMode: "after_hours", config: cfg }).decision).toBe("ai");
  });
});

describe("isWithinBusinessHours", () => {
  it("returns true when no schedule is configured", () => {
    expect(isWithinBusinessHours(null, new Date())).toBe(true);
  });

  it("respects a closed day", () => {
    // Sunday 2026-06-07 12:00 local; schedule only Mon-Fri.
    const sunday = new Date(2026, 5, 7, 12, 0, 0);
    const hours = { days: { sun: null, mon: ["09:00", "17:00"] as [string, string] } };
    expect(isWithinBusinessHours(hours, sunday)).toBe(false);
  });

  it("respects the open window on an open day", () => {
    // Monday 2026-06-08 12:00 local within 09:00-17:00.
    const monday = new Date(2026, 5, 8, 12, 0, 0);
    const hours = { days: { mon: ["09:00", "17:00"] as [string, string] } };
    expect(isWithinBusinessHours(hours, monday)).toBe(true);
    // Before open.
    const early = new Date(2026, 5, 8, 7, 0, 0);
    expect(isWithinBusinessHours(hours, early)).toBe(false);
  });
});
