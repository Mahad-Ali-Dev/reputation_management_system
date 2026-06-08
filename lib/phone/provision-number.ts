/**
 * Twilio number auto-provisioning for inbox SMS handoff (Module 09, Wave 3c —
 * phase 3). ENV-GATED PAID INTEGRATION.
 *
 * ⚠ GUARDRAIL: NO live paid call in default/test code paths. When Twilio is not
 * configured (`isTwilioConfigured()` false) this is a pure no-op returning
 * `{ provisioned:false, reason:"twilio_not_configured" }` — it never reaches the
 * network. It only buys a number when the account creds are explicitly set, and
 * it is mocked in tests.
 *
 * When configured it:
 *   1. GET AvailablePhoneNumbers/US/Local.json (SMS-capable, optional area code)
 *   2. POST IncomingPhoneNumbers.json (buy it; set the SMS webhook to our
 *      inbound-sms route)
 *   3. persist a `PhoneNumber` row tagged `inbox-handoff`
 *
 * Reuses the `lib/phone/twilio-client.ts` Basic-auth + timeout convention. The
 * persisted row is the same shape the AI-Phone product uses, so handoff numbers
 * live alongside receptionist numbers (distinguished by `friendlyName`).
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { isTwilioConfigured } from "./twilio-client";
import { HANDOFF_NUMBER_TAG, widgetBaseUrl } from "@/lib/inbox/widget";

const TWILIO_API = "https://api.twilio.com/2010-04-01";
const TWILIO_TIMEOUT_MS = 15_000;

export type ProvisionResult =
  | {
      provisioned: true;
      phoneNumberId: string;
      phoneE164: string;
      reused: boolean;
    }
  | {
      provisioned: false;
      reason: "twilio_not_configured" | "no_numbers_available" | "purchase_failed" | "persist_failed";
      detail?: string;
    };

function creds(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return { sid, token };
}

async function twilioFetch(url: string, init: RequestInit, auth: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Basic ${auth}`,
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Provision (or reuse) a handoff number for an org.
 *
 * If a handoff number already exists for the org we reuse it (one is plenty for
 * MVP — every visitor SMS thread can share the org's handoff number, keyed by the
 * visitor's phone). Pass `forceNew:true` to always buy a fresh number.
 */
export async function provisionHandoffNumber(args: {
  orgId: string;
  areaCode?: string;
  forceNew?: boolean;
}): Promise<ProvisionResult> {
  // GUARDRAIL: no live call without creds. This is the default/test path.
  if (!isTwilioConfigured()) {
    return { provisioned: false, reason: "twilio_not_configured" };
  }
  const c = creds();
  if (!c) return { provisioned: false, reason: "twilio_not_configured" };

  // Reuse an existing handoff number unless told otherwise.
  if (!args.forceNew) {
    const existing = await withTenant(args.orgId, async (tx) =>
      tx.phoneNumber.findFirst({
        where: { friendlyName: HANDOFF_NUMBER_TAG, status: "active" },
        orderBy: { createdAt: "desc" },
        select: { id: true, phoneE164: true },
      }),
    ).catch(() => null);
    if (existing) {
      return {
        provisioned: true,
        phoneNumberId: existing.id,
        phoneE164: existing.phoneE164,
        reused: true,
      };
    }
  }

  const auth = Buffer.from(`${c.sid}:${c.token}`).toString("base64");

  // 1. Find an SMS-capable local US number.
  let candidate: string;
  try {
    const params = new URLSearchParams({ SmsEnabled: "true", PageSize: "1" });
    if (args.areaCode && /^\d{3}$/.test(args.areaCode)) params.set("AreaCode", args.areaCode);
    const res = await twilioFetch(
      `${TWILIO_API}/Accounts/${c.sid}/AvailablePhoneNumbers/US/Local.json?${params.toString()}`,
      { method: "GET" },
      auth,
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      logger.error({ event: "phone.provision.search_failed", status: res.status, detail });
      return { provisioned: false, reason: "no_numbers_available", detail };
    }
    const data = (await res.json()) as { available_phone_numbers?: { phone_number?: string }[] };
    const num = data.available_phone_numbers?.[0]?.phone_number;
    if (!num) return { provisioned: false, reason: "no_numbers_available" };
    candidate = num;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ event: "phone.provision.search_error", detail });
    return { provisioned: false, reason: "no_numbers_available", detail };
  }

  // 2. Buy it + point the SMS webhook at our inbound-sms route.
  const smsUrl = `${widgetBaseUrl()}/api/webhooks/twilio/inbound-sms`;
  let twilioSid: string;
  let purchasedE164: string;
  try {
    const body = new URLSearchParams({
      PhoneNumber: candidate,
      FriendlyName: HANDOFF_NUMBER_TAG,
      SmsUrl: smsUrl,
      SmsMethod: "POST",
    });
    const res = await twilioFetch(
      `${TWILIO_API}/Accounts/${c.sid}/IncomingPhoneNumbers.json`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      auth,
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      logger.error({ event: "phone.provision.purchase_failed", status: res.status, detail });
      return { provisioned: false, reason: "purchase_failed", detail };
    }
    const data = (await res.json()) as { sid?: string; phone_number?: string };
    if (!data.sid || !data.phone_number) {
      return { provisioned: false, reason: "purchase_failed", detail: "missing_sid" };
    }
    twilioSid = data.sid;
    purchasedE164 = data.phone_number;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ event: "phone.provision.purchase_error", detail });
    return { provisioned: false, reason: "purchase_failed", detail };
  }

  // 3. Persist the PhoneNumber row.
  try {
    const row = await withTenant(args.orgId, async (tx) =>
      tx.phoneNumber.create({
        data: {
          organizationId: args.orgId,
          phoneE164: purchasedE164,
          twilioSid,
          friendlyName: HANDOFF_NUMBER_TAG,
          status: "active",
          capabilities: { sms: true, voice: false, mms: true },
          monthlyCostCents: 115,
        },
        select: { id: true, phoneE164: true },
      }),
    );
    logger.info({
      event: "phone.provision.success",
      orgId: args.orgId,
      phoneE164: row.phoneE164,
    });
    return { provisioned: true, phoneNumberId: row.id, phoneE164: row.phoneE164, reused: false };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ event: "phone.provision.persist_failed", orgId: args.orgId, detail });
    return { provisioned: false, reason: "persist_failed", detail };
  }
}
