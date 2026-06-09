import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

/**
 * Outbound webhooks.
 *
 * Customers configure an endpoint + signing secret in Account → API & webhooks
 * (stored on `organization.settings.api`). When a subscribed event fires we POST
 * a signed JSON payload to that endpoint.
 *
 * Payload shape:
 *   { event, created, organizationId, data }
 * Signature: HMAC-SHA256(body, webhookSecret), sent as
 *   X-Repulabs-Signature: sha256=<hex>
 * plus X-Repulabs-Event: <event>.
 *
 * Dispatch is ALWAYS fail-soft: a missing endpoint is a no-op, and any network /
 * non-2xx error is logged and swallowed so it can never break or slow the action
 * that triggered it. Use `dispatchWebhookInBackground` from hot paths.
 */

export type WebhookEvent =
  | "review.created"
  | "review.reply_posted"
  | "campaign.completed"
  | "survey.response_received";

const TIMEOUT_MS = 8000;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function dispatchWebhook(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const api = asObject(asObject(org?.settings)?.api);
    const url = typeof api?.webhookUrl === "string" ? api.webhookUrl : null;
    const secret = typeof api?.webhookSecret === "string" ? api.webhookSecret : null;
    if (!url) return; // not configured → no-op

    const body = JSON.stringify({
      event,
      created: new Date().toISOString(),
      organizationId: orgId,
      data,
    });
    const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Repulabs-Webhooks/1",
          "X-Repulabs-Event": event,
          ...(signature ? { "X-Repulabs-Signature": `sha256=${signature}` } : {}),
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn(
          { event: "webhook.dispatch.non_2xx", orgId, hook: event, status: res.status },
          "webhook endpoint returned non-2xx",
        );
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn(
      { event: "webhook.dispatch.failed", orgId, hook: event, err: String(err) },
      "webhook dispatch failed (ignored)",
    );
  }
}

/** Fire-and-forget: never awaited by, never throws into, the caller. */
export function dispatchWebhookInBackground(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void {
  void dispatchWebhook(orgId, event, data).catch(() => {});
}
