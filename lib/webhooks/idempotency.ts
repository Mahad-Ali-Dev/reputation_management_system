import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

/**
 * Webhook idempotency middleware.
 *
 * Pattern: insert (provider, external_id) with ON CONFLICT DO NOTHING; if 0 rows, it's a replay.
 * See INFRASTRUCTURE.md §5.9 for the per-provider signature contract.
 *
 * Usage:
 *   const result = await handleIdempotent('stripe', event.id, rawBody, async () => {
 *     // your processing logic — runs only once even if Stripe retries
 *     await reconcileSubscription(event);
 *   });
 *   if (result === 'replay') return new Response('OK', { status: 200 });
 */

export type IdempotencyResult = "processed" | "replay";

export async function handleIdempotent(
  provider: string,
  externalId: string,
  rawBody: string,
  process: () => Promise<void>,
): Promise<IdempotencyResult> {
  const sha = createHash("sha256").update(rawBody).digest("hex");

  // Race-free claim: INSERT ON CONFLICT DO NOTHING.
  const { rowCount } = (await prisma.$executeRawUnsafe(
    `
    INSERT INTO webhook_deliveries (provider, external_id, payload_sha256, status, received_at)
    VALUES ($1, $2, $3, 'accepted', now())
    ON CONFLICT (provider, external_id) DO NOTHING
    `,
    provider,
    externalId,
    sha,
  )) as unknown as { rowCount: number };

  // Prisma's $executeRaw returns affected rows count directly — guard for both shapes
  const inserted =
    typeof rowCount === "number" ? rowCount > 0 : (rowCount as unknown as number) > 0;

  if (!inserted) {
    logger.info({ provider, externalId, event: "webhook.replay" }, "webhook replay dropped");
    return "replay";
  }

  try {
    await process();
    await prisma.webhookDelivery.update({
      where: { provider_externalId: { provider, externalId } },
      data: { status: "processed", processedAt: new Date() },
    });
    return "processed";
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ provider, externalId, error, event: "webhook.process_error" });
    await prisma.webhookDelivery.update({
      where: { provider_externalId: { provider, externalId } },
      data: { status: "error", error, processedAt: new Date() },
    });
    throw err;
  }
}
