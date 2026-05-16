import { withTenant } from "@/lib/db/with-tenant";

/**
 * Returns true if the recipient is suppressed (unsubscribed) for this channel + org.
 */
export async function isUnsubscribed(args: {
  channel: "sms" | "email";
  recipient: string;
  organizationId: string;
}): Promise<boolean> {
  return withTenant(args.organizationId, async (tx) => {
    const row = await tx.unsubscribe.findUnique({
      where: {
        channel_emailOrPhone_organizationId: {
          channel: args.channel,
          emailOrPhone: args.recipient,
          organizationId: args.organizationId,
        },
      },
      select: { channel: true },
    });
    return !!row;
  });
}

/**
 * Insert an unsubscribe row idempotently. Called from STOP-SMS webhook + email
 * one-click unsubscribe handler + manual API.
 *
 * organizationId is required — we always know which org sent the message.
 * If org can't be determined (orphan STOP), the caller should skip.
 */
export async function recordUnsubscribe(args: {
  channel: "sms" | "email";
  recipient: string;
  organizationId: string;
  source: "one_click_email" | "sms_stop" | "manual" | "api";
}): Promise<void> {
  await withTenant(args.organizationId, async (tx) => {
    await tx.unsubscribe.upsert({
      where: {
        channel_emailOrPhone_organizationId: {
          channel: args.channel,
          emailOrPhone: args.recipient,
          organizationId: args.organizationId,
        },
      },
      create: {
        channel: args.channel,
        emailOrPhone: args.recipient,
        organizationId: args.organizationId,
        source: args.source,
      },
      update: {},
    });
  });
}

/**
 * Returns true if the phone has prior express written consent for this org.
 * Per TCPA, consent MUST be on file before any non-emergency SMS marketing.
 */
export async function hasSmsConsent(args: {
  organizationId: string;
  phoneE164: string;
}): Promise<boolean> {
  return withTenant(args.organizationId, async (tx) => {
    const row = await tx.smsConsent.findFirst({
      where: {
        organizationId: args.organizationId,
        phoneE164: args.phoneE164,
        revokedAt: null,
      },
      select: { id: true },
    });
    return !!row;
  });
}

/**
 * Record TCPA consent. The `consentText` is hashed (SHA-256) and stored — proves what
 * the contact saw when they agreed.
 */
export async function recordSmsConsent(args: {
  organizationId: string;
  phoneE164: string;
  consentText: string;
  source: "web_form" | "qr_intake" | "imported_with_attestation" | "api" | "smart_route";
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(args.consentText).digest("hex");
  await withTenant(args.organizationId, async (tx) => {
    await tx.smsConsent.upsert({
      where: {
        organizationId_phoneE164: {
          organizationId: args.organizationId,
          phoneE164: args.phoneE164,
        },
      },
      create: {
        organizationId: args.organizationId,
        phoneE164: args.phoneE164,
        consentTextHash: hash,
        consentSource: args.source,
        consentIp: args.ip ?? null,
        consentUa: args.userAgent ?? null,
        consentedAt: new Date(),
      },
      update: {
        // Re-affirm: refresh consent timestamp + hash if text changed
        consentTextHash: hash,
        consentSource: args.source,
        consentedAt: new Date(),
        revokedAt: null,
      },
    });
  });
}
