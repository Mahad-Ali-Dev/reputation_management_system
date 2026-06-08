import type { Connection, Establishment } from "@prisma/client";
import { decrypt, type EncryptionContext } from "@/lib/crypto/envelope";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/actions";

/** Postgres codes for the pre-migration window (undefined_column / check_violation). */
function isPreMigration(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703" || code === "23514";
}

/**
 * Daily dispute status-check service (Module 08) — env-gated Google adapter.
 *
 * GUARDRAIL: this is the ONLY place that would ever talk to Google for a
 * dispute, and it is HARD-GATED. With `GBP_DISPUTE_CHECK_ENABLED !== "true"` OR
 * no active google_business connection it iterates and NO-OPS (counts skips,
 * makes zero external calls). So the default unattended path performs no live
 * paid Google calls. Tests mock `probeReviewExists` — never a real network call.
 *
 * The app never auto-SUBMITS a dispute to Google (the user files manually). This
 * cron only READS whether a disputed review is gone / flagged and records the
 * outcome locally (status + notification + audit). It is idempotent.
 */

export type DisputeProbeOutcome = "gone" | "flagged" | "present" | "unknown";

export type CheckDisputesSummary = {
  checked: number;
  removed: number;
  rejected: number;
  skipped: number;
};

/** Injectable so tests assert behavior without a network call. */
export type ReviewProbe = (args: {
  conn: Connection & { establishment: Establishment | null };
  externalId: string;
}) => Promise<DisputeProbeOutcome>;

function disputeCheckEnabled(): boolean {
  return process.env.GBP_DISPUTE_CHECK_ENABLED === "true";
}

/**
 * The real Google probe. Decrypts the connection token (mirrors google-fetch),
 * fetches the single review resource, and maps the response to an outcome:
 *   - HTTP 404 / not found  → "gone"   (review removed → dispute Removed)
 *   - review present        → "present"
 *   - other / error         → "unknown" (skip; try again next run)
 *
 * Google does not expose a public "this review was flagged/rejected" signal, so
 * `flagged` is reserved for adapters that can determine it; the default probe
 * only ever returns gone/present/unknown. Only invoked when the cron is enabled.
 */
const defaultProbe: ReviewProbe = async ({ conn, externalId }) => {
  if (!conn.establishment?.googlePlaceId) return "unknown";
  if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) return "unknown";

  let accessToken: string;
  try {
    const ctx: EncryptionContext =
      (conn.encryptionCtx as unknown as EncryptionContext) ?? {
        orgId: conn.organizationId,
        provider: "google_business",
        purpose: "oauth",
      };
    accessToken = decrypt({
      ciphertext: Buffer.from(conn.accessTokenCt),
      iv: Buffer.from(conn.iv),
      dekCiphertext: Buffer.from(conn.dekCiphertext),
      keyVersion: conn.keyVersion,
      encryptionContext: ctx,
    });
  } catch {
    return "unknown";
  }

  // `externalId` is the GBP review resource name (accounts/{a}/locations/{l}/reviews/{r}).
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${externalId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return "gone";
  if (!res.ok) return "unknown";
  return "present";
};

async function activeGoogleConn(
  orgId: string,
): Promise<(Connection & { establishment: Establishment | null }) | null> {
  // System-tier read of THIS org's active GBP connection. Mirrors google-fetch.
  return prisma.connection.findFirst({
    where: { organizationId: orgId, provider: "google_business", status: "active" },
    include: { establishment: true },
  });
}

/**
 * Poll for outcomes on every Under-Review dispute, cross-tenant.
 *
 * Candidate select uses plain `prisma` (system tier, mirroring
 * syncAllActiveConnections); every per-dispute mutation runs inside
 * withTenant(orgId) with a `system` audit actor.
 *
 * @param probe injected in tests; defaults to the real (gated) Google probe.
 */
export async function checkDisputeStatuses(probe: ReviewProbe = defaultProbe): Promise<CheckDisputesSummary> {
  const summary: CheckDisputesSummary = { checked: 0, removed: 0, rejected: 0, skipped: 0 };

  // Cross-tenant candidates: disputes the user has filed with Google.
  // Fail-soft on an un-migrated DB (table/columns missing → nothing to check).
  let candidates: Array<{ id: string; organizationId: string; reviewId: string }>;
  try {
    candidates = await prisma.reviewDispute.findMany({
      where: { status: "submitted_to_google" },
      select: { id: true, organizationId: true, reviewId: true },
    });
  } catch (err) {
    if (isPreMigration(err)) {
      logger.warn({ event: "dispute.status_check.pre_migration" }, "review_disputes not ready — skipping");
      return summary;
    }
    throw err;
  }

  // Cache the per-org connection lookup so we don't re-query for every dispute.
  const connCache = new Map<string, (Connection & { establishment: Establishment | null }) | null>();

  for (const cand of candidates) {
    summary.checked++;

    // Hard env gate — no external work at all when disabled.
    if (!disputeCheckEnabled()) {
      summary.skipped++;
      continue;
    }

    let conn = connCache.get(cand.organizationId) ?? null;
    if (!connCache.has(cand.organizationId)) {
      try {
        conn = await activeGoogleConn(cand.organizationId);
      } catch {
        conn = null;
      }
      connCache.set(cand.organizationId, conn);
    }
    if (!conn) {
      summary.skipped++;
      continue;
    }

    // Resolve the review's external id (tenant-scoped).
    let externalId: string | null = null;
    try {
      const review = await withTenant(cand.organizationId, async (tx) =>
        tx.review.findFirst({ where: { id: cand.reviewId }, select: { externalId: true, source: true } }),
      );
      if (review && review.source === "google") externalId = review.externalId;
    } catch {
      externalId = null;
    }
    if (!externalId) {
      summary.skipped++;
      continue;
    }

    let outcome: DisputeProbeOutcome = "unknown";
    try {
      outcome = await probe({ conn, externalId });
    } catch (err) {
      logger.warn(
        { event: "dispute.status_check.probe_failed", orgId: cand.organizationId, error: String(err) },
        "dispute probe failed; will retry next run",
      );
      summary.skipped++;
      continue;
    }

    if (outcome === "present" || outcome === "unknown") {
      summary.skipped++;
      continue;
    }

    const nextStatus = outcome === "gone" ? "removed" : "rejected";
    const notifType = outcome === "gone" ? "dispute.removed" : "dispute.rejected";
    const notifTitle =
      outcome === "gone" ? "A disputed review was removed" : "A dispute was not accepted";

    try {
      await withTenant(cand.organizationId, async (tx) => {
        await tx.reviewDispute.update({
          where: { id: cand.id },
          data: { status: nextStatus, decisionAt: new Date(), resolvedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            organizationId: cand.organizationId,
            actorType: "system",
            // Convention (actions-cron.ts / executor.ts): system events have no
            // human actor → set actorId to the orgId so the NOT NULL UUID column
            // is satisfied; actorType disambiguates this from a user action.
            actorId: cand.organizationId,
            action: outcome === "gone" ? "review.dispute.removed" : "review.dispute.rejected",
            resourceType: "review_dispute",
            resourceId: cand.id,
            afterData: { status: nextStatus, source: "dispute_status_cron" },
          },
        });
      });
    } catch (err) {
      if (isPreMigration(err)) {
        // Pre-migration: `removed` value / decision_at not accepted yet. Skip the
        // transition (don't 500) — re-checked once the migration runs.
        logger.warn(
          { event: "dispute.status_check.pre_migration_skip", orgId: cand.organizationId },
          "cannot record dispute outcome until the dispute_center migration runs — skipping transition",
        );
        summary.skipped++;
        continue;
      }
      logger.warn(
        { event: "dispute.status_check.update_failed", orgId: cand.organizationId, error: String(err) },
        "failed to record dispute outcome",
      );
      summary.skipped++;
      continue;
    }

    // Notify (fail-soft — never let a notification error roll back the outcome).
    try {
      await createNotification(cand.organizationId, {
        type: notifType,
        title: notifTitle,
        resourceType: "review_dispute",
        resourceId: cand.id,
        href: `/reviews/dispute/${cand.id}`,
      });
    } catch (err) {
      logger.warn(
        { event: "dispute.status_check.notify_failed", error: String(err) },
        "dispute outcome notification failed",
      );
    }

    if (outcome === "gone") summary.removed++;
    else summary.rejected++;
  }

  logger.info({ event: "dispute.status_check.done", ...summary }, "dispute status check complete");
  return summary;
}
