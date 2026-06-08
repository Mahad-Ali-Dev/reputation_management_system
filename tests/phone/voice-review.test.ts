import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `maybeEnqueueVoiceReview` (Module 15) — the Voice→Review funnel.
 *
 * All deps mocked. Asserts: enqueues exactly once for a resolved booking call
 * with contact + consent; the full no-enqueue branch matrix; channel preference;
 * dedupe; and the never-throws guarantee. The enqueue seam is mocked so we test
 * THIS file's decision logic, not the outreach mechanics.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const enqueueMock = vi.fn();
vi.mock("@/lib/outreach/enqueue", () => ({
  enqueueReviewRequest: (...a: unknown[]) => enqueueMock(...a),
}));

const ledgerMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/autopilot/ledger", () => ({
  recordAutopilotAction: (...a: unknown[]) => ledgerMock(...a),
}));

let hasConsent = true;
let unsubscribed = false;
const hasSmsConsentMock = vi.fn(async (..._a: unknown[]) => hasConsent);
const isUnsubscribedMock = vi.fn(async (..._a: unknown[]) => unsubscribed);
vi.mock("@/lib/outreach/suppression", () => ({
  hasSmsConsent: (...a: unknown[]) => hasSmsConsentMock(...a),
  isUnsubscribed: (...a: unknown[]) => isUnsubscribedMock(...a),
}));

// ---- fake tenant tx ----
type CallRow = {
  id: string;
  status: string;
  durationSeconds: number | null;
  intent: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadName: string | null;
  fromE164: string;
  phoneNumberId: string | null;
};
let callRow: CallRow | null;
let cfgRow: { voiceToReviewEnabled: boolean } | null;
let estabRow: { id: string } | null;
let pnRow: { establishmentId: string | null } | null;
let dupRow: { id: string } | null;

type FakeTx = {
  phoneCall: { findFirst: ReturnType<typeof vi.fn> };
  autopilotConfig: { findUnique: ReturnType<typeof vi.fn> };
  phoneNumber: { findFirst: ReturnType<typeof vi.fn> };
  establishment: { findFirst: ReturnType<typeof vi.fn> };
  reviewRequest: { findFirst: ReturnType<typeof vi.fn> };
};
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import { maybeEnqueueVoiceReview, MIN_RESOLVE_SECONDS } from "@/lib/phone/voice-review";

const ORG = "11111111-1111-4111-8111-111111111111";
const CALL = "22222222-2222-4222-8222-222222222222";

function makeCall(overrides: Partial<CallRow> = {}): CallRow {
  return {
    id: CALL,
    status: "completed",
    durationSeconds: 120,
    intent: "booking",
    leadPhone: "+15551234567",
    leadEmail: "caller@example.com",
    leadName: "Jordan",
    fromE164: "+15551234567",
    phoneNumberId: "pn1",
    ...overrides,
  };
}

beforeEach(() => {
  enqueueMock.mockReset().mockResolvedValue({ ok: true, reviewRequestId: "rr1", status: "scheduled" });
  ledgerMock.mockClear();
  hasSmsConsentMock.mockClear();
  isUnsubscribedMock.mockClear();
  hasConsent = true;
  unsubscribed = false;
  callRow = makeCall();
  cfgRow = { voiceToReviewEnabled: true };
  estabRow = { id: "est1" };
  pnRow = { establishmentId: "est1" };
  dupRow = null;

  const tx: FakeTx = {
    phoneCall: { findFirst: vi.fn(async () => callRow) },
    autopilotConfig: { findUnique: vi.fn(async () => cfgRow) },
    phoneNumber: { findFirst: vi.fn(async () => pnRow) },
    establishment: { findFirst: vi.fn(async () => estabRow) },
    reviewRequest: { findFirst: vi.fn(async () => dupRow) },
  };
  withTenantImpl = (_orgId, fn) => Promise.resolve(fn(tx));
});

describe("maybeEnqueueVoiceReview — happy path", () => {
  it("enqueues exactly once for a resolved booking call with phone + consent (prefers SMS)", async () => {
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.enqueued).toBe(true);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const arg = enqueueMock.mock.calls[0]![0] as { channel: string; recipient: string; triggerSource: string; establishmentId: string };
    expect(arg.channel).toBe("sms");
    expect(arg.recipient).toBe("+15551234567");
    expect(arg.triggerSource).toBe("voice_call");
    expect(arg.establishmentId).toBe("est1");
    expect(ledgerMock).toHaveBeenCalledTimes(1);
  });

  it("prefers email when SMS consent is absent", async () => {
    hasConsent = false;
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.enqueued).toBe(true);
    const arg = enqueueMock.mock.calls[0]![0] as { channel: string; recipient: string; triggerSource: string; establishmentId: string };
    expect(arg.channel).toBe("email");
    expect(arg.recipient).toBe("caller@example.com");
  });

  it("falls back to the org's primary establishment when the number has none", async () => {
    pnRow = { establishmentId: null };
    estabRow = { id: "primary-est" };
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.enqueued).toBe(true);
    expect((enqueueMock.mock.calls[0]![0] as { establishmentId: string }).establishmentId).toBe("primary-est");
  });
});

describe("maybeEnqueueVoiceReview — no-enqueue branches", () => {
  it("does NOT enqueue for complaint intent", async () => {
    callRow = makeCall({ intent: "complaint" });
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r).toEqual({ enqueued: false, reason: "negative_intent" });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue for a short call", async () => {
    callRow = makeCall({ durationSeconds: MIN_RESOLVE_SECONDS - 1 });
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("too_short");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when the call is not completed", async () => {
    callRow = makeCall({ status: "no-answer" });
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("not_completed");
  });

  it("does NOT enqueue with no usable contact", async () => {
    callRow = makeCall({ leadPhone: null, leadEmail: null });
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("no_contact");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when the Voice→Review toggle is off", async () => {
    cfgRow = { voiceToReviewEnabled: false };
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("voice_review_disabled");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when both channels are unsubscribed", async () => {
    unsubscribed = true; // both sms + email suppressed
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("no_consented_channel");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue on a duplicate within the dedupe window", async () => {
    dupRow = { id: "existing-rr" };
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("duplicate");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when no establishment can be resolved", async () => {
    pnRow = { establishmentId: null };
    estabRow = null;
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("no_establishment");
  });

  it("returns call_not_found when the call row is missing", async () => {
    callRow = null;
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.reason).toBe("call_not_found");
  });
});

describe("maybeEnqueueVoiceReview — resilience", () => {
  it("never throws — a DB error returns { enqueued:false, reason:'error' }", async () => {
    withTenantImpl = () => Promise.reject(new Error("db exploded"));
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r).toEqual({ enqueued: false, reason: "error" });
  });

  it("defaults the toggle ON when autopilot_configs is unmigrated (42P01)", async () => {
    const tx: FakeTx = {
      phoneCall: { findFirst: vi.fn(async () => makeCall()) },
      autopilotConfig: {
        findUnique: vi.fn(async () => {
          throw { code: "42P01", message: "relation autopilot_configs does not exist" };
        }),
      },
      phoneNumber: { findFirst: vi.fn(async () => ({ establishmentId: "est1" })) },
      establishment: { findFirst: vi.fn(async () => ({ id: "est1" })) },
      reviewRequest: { findFirst: vi.fn(async () => null) },
    };
    withTenantImpl = (_o, fn) => Promise.resolve(fn(tx));
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r.enqueued).toBe(true);
  });

  it("surfaces the seam's skip reason without throwing", async () => {
    enqueueMock.mockResolvedValue({ ok: false, reason: "no_sms_consent" });
    const r = await maybeEnqueueVoiceReview({ orgId: ORG, callId: CALL });
    expect(r).toEqual({ enqueued: false, reason: "no_sms_consent" });
  });
});
