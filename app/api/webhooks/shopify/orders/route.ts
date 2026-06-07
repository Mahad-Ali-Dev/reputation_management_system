import { createHmac, timingSafeEqual } from "node:crypto";
import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { evaluateTrigger } from "@/lib/outreach/automation";
import { isProductionRuntime } from "@/lib/secrets";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/shopify/orders
 *
 * Shopify `orders/create` webhook → schedules an automated review request via
 * the Automation engine.
 *
 * Trust + guardrails (env-gated paid integration):
 *   - HMAC verify `X-Shopify-Hmac-Sha256` (base64) over the RAW body using the
 *     Shopify app secret (`loadProviderApp("shopify").clientSecret`),
 *     constant-time. Fail CLOSED (401) when Shopify IS configured or in prod.
 *   - When the app/secret is ABSENT, no-op with 200 `{skipped:"shopify_not_configured"}`
 *     — never a live paid path in default code.
 *   - Resolve the org via `X-Shopify-Shop-Domain` → Connection.externalId
 *     (provider:"shopify", status:"active"). No connection → 200 `{skipped:"no_connection"}`.
 *   - Idempotent on the order id (replayed delivery → no-op).
 *   - The ONLY side effect is enqueuing a scheduled ReviewRequest (no outbound
 *     send here — the dispatch cron sends it later, gated by entitlement).
 *
 * Always returns 200 for delivered-but-skipped so Shopify doesn't retry-storm.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const app = await loadProviderApp("shopify").catch(() => null);
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain");

  // Not configured → graceful no-op (NO evaluateTrigger, proving no side effects).
  if (!app?.clientSecret) {
    if (isProductionRuntime()) {
      // In prod a Shopify webhook arriving with no configured app is suspicious,
      // but we still must not 500. Log + 200-skip.
      logger.warn({ event: "webhook.shopify.not_configured", shopDomain });
    }
    return NextResponse.json({ ok: true, skipped: "shopify_not_configured" });
  }

  // HMAC verify (fail closed — app is configured).
  if (!hmacHeader || !verifyShopifyHmac(rawBody, hmacHeader, app.clientSecret)) {
    logger.warn({ event: "webhook.shopify.bad_signature", shopDomain });
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!shopDomain) {
    return NextResponse.json({ ok: true, skipped: "no_shop_domain" });
  }

  // Resolve org by the shop domain. Cross-tenant lookup (webhook has no session).
  let connection: { organizationId: string; establishmentId: string | null } | null = null;
  try {
    connection = await prisma.connection.findFirst({
      where: { provider: "shopify", status: "active", externalId: shopDomain },
      select: { organizationId: true, establishmentId: true },
    });
  } catch (err) {
    // connections is a long-existing table; if it's somehow unavailable, ACK so
    // Shopify doesn't retry-storm, but log.
    logger.error({
      event: "webhook.shopify.connection_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: true, skipped: "connection_lookup_error" });
  }
  if (!connection) {
    return NextResponse.json({ ok: true, skipped: "no_connection" });
  }
  const orgId = connection.organizationId;

  // Extract recipient: prefer email; fall back to a verified phone (E.164).
  const recipient = pickRecipient(order);
  if (!recipient) {
    return NextResponse.json({ ok: true, skipped: "no_recipient" });
  }
  const recipientName = pickName(order);
  const orderId = String(order.id ?? order.admin_graphql_api_id ?? "");
  if (!orderId) {
    return NextResponse.json({ ok: true, skipped: "no_order_id" });
  }

  // Idempotent: only evaluate the trigger once per order id.
  let evalResult: Awaited<ReturnType<typeof evaluateTrigger>> | undefined;
  const idem = await handleIdempotent("shopify", orderId, rawBody, async () => {
    evalResult = await evaluateTrigger({
      orgId,
      // Maps to the DB CHECK-allowed trigger value (After Purchase).
      trigger: "post_purchase",
      recipient,
      recipientName,
      establishmentId: connection?.establishmentId ?? null,
    });
  });

  return NextResponse.json({
    ok: true,
    idempotent: idem === "replay",
    result: evalResult ?? (idem === "replay" ? "replayed" : undefined),
  });
}

/** Constant-time base64 HMAC-SHA256 verify over the raw body. */
function verifyShopifyHmac(rawBody: string, header: string, secret: string): boolean {
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type ShopifyOrder = {
  id?: number | string;
  admin_graphql_api_id?: string;
  email?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  customer?: {
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
};

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;

function pickRecipient(order: ShopifyOrder): string | null {
  const email = (order.email ?? order.contact_email ?? order.customer?.email ?? "").trim();
  if (email) return email.toLowerCase();
  const phone = (order.phone ?? order.customer?.phone ?? "").trim();
  if (phone && PHONE_RE.test(phone)) return phone;
  return null;
}

function pickName(order: ShopifyOrder): string | null {
  const first = order.customer?.first_name?.trim() ?? "";
  const last = order.customer?.last_name?.trim() ?? "";
  const full = [first, last].filter(Boolean).join(" ");
  return full || null;
}
