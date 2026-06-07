import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { sendKbUpdateEmail } from "@/lib/email/kb-update";
import { isMissingRelationError } from "./confidence";
import { crawlSite } from "./crawl";
import { extractBusinessProfile } from "./extract-profile";
import { ingestDocument } from "./ingest";
import { mergeProfile } from "./auto-setup";

/**
 * Weekly Auto-Updater service (Module 05).
 *
 * refreshOrgKb(orgId): load the profile; if there's no tracked sourceUrl, skip
 * (no paid call). Otherwise re-crawl → extract → diff each field vs the stored
 * value; on any change, update the profile (same merge rules as auto-setup) and
 * re-ingest the refreshed source doc, returning the changed field list. The
 * caller emails the owner on change.
 *
 * refreshAllOrgs(): iterate entitled orgs (trial/pro), call refreshOrgKb in
 * try/catch per org, and on change send the "your AI updated itself" email.
 * Cost-bounded: one crawl + one Haiku extract per org that HAS a sourceUrl.
 *
 * Fail-soft: the new AiTrainingProfile columns + audit may not be migrated yet
 * — a missing-relation error is treated as "skip this org", never a throw.
 */

const DOC_TITLE = "Website (auto-setup)";

export type RefreshResult = { changed: boolean; fields: string[]; skipped?: "no_source_url" | "table_missing" };

export async function refreshOrgKb(orgId: string): Promise<RefreshResult> {
  let profile:
    | {
        sourceUrl: string | null;
        businessOverview: string | null;
        servicesProducts: string | null;
        pricingDetails: string | null;
        locations: string | null;
        operatingHours: unknown;
      }
    | null;
  try {
    profile = await withTenant(orgId, async (tx) =>
      tx.aiTrainingProfile.findUnique({
        where: { organizationId: orgId },
        select: {
          sourceUrl: true,
          businessOverview: true,
          servicesProducts: true,
          pricingDetails: true,
          locations: true,
          operatingHours: true,
        },
      }),
    );
  } catch (err) {
    if (isMissingRelationError(err)) return { changed: false, fields: [], skipped: "table_missing" };
    throw err;
  }

  if (!profile?.sourceUrl) {
    return { changed: false, fields: [], skipped: "no_source_url" };
  }
  const sourceUrl = profile.sourceUrl;

  // Re-crawl + extract (the only paid work; bounded per org).
  const crawl = await crawlSite(sourceUrl, { maxDepth: 3, maxPages: 20 });
  if ("error" in crawl) {
    logger.warn({ event: "kb.refresh.crawl_failed", orgId, error: crawl.error });
    return { changed: false, fields: [] };
  }
  const corpus = crawl.result.text;
  const extracted = await extractBusinessProfile(corpus, { orgId });

  // Diff via the shared merge logic — fields[] lists what actually changed.
  const merged = mergeProfile(extracted, profile);
  if (merged.fields.length === 0) {
    // No meaningful change; still stamp lastAutoUpdatedAt so the owner can see
    // the AI checked. Best-effort.
    try {
      await withTenant(orgId, async (tx) => {
        await tx.aiTrainingProfile.update({
          where: { organizationId: orgId },
          data: { lastAutoUpdatedAt: new Date() },
        });
      });
    } catch (err) {
      if (!isMissingRelationError(err)) {
        logger.warn({ event: "kb.refresh.stamp_failed", orgId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { changed: false, fields: [] };
  }

  // Persist the changed fields + refresh the source doc.
  let docId: string | null = null;
  await withTenant(orgId, async (tx) => {
    await tx.aiTrainingProfile.update({
      where: { organizationId: orgId },
      data: { ...merged.data, lastAutoUpdatedAt: new Date() },
    });

    const contentHash = createHash("sha256").update(corpus).digest("hex");
    const existingDoc = await tx.aiDocument.findFirst({
      where: { organizationId: orgId, establishmentId: null, title: DOC_TITLE },
      select: { id: true },
    });
    const doc = existingDoc
      ? await tx.aiDocument.update({
          where: { id: existingDoc.id },
          data: {
            content: corpus,
            contentHash,
            sourceType: "url",
            sourceUri: sourceUrl,
            sourceMetadata: { pagesCrawled: crawl.result.pagesCrawled, fetchedAt: crawl.result.fetchedAt.toISOString(), auto: true },
            status: "indexing",
          },
          select: { id: true },
        })
      : await tx.aiDocument.create({
          data: {
            organizationId: orgId,
            establishmentId: null,
            title: DOC_TITLE,
            content: corpus,
            contentHash,
            sourceType: "url",
            sourceUri: sourceUrl,
            sourceMetadata: { pagesCrawled: crawl.result.pagesCrawled, fetchedAt: crawl.result.fetchedAt.toISOString(), auto: true },
            status: "indexing",
          },
          select: { id: true },
        });
    docId = doc.id;

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "system",
        // System events have no human actor — codebase convention is to set
        // actorId to the orgId so the row satisfies the NOT NULL constraint
        // while staying clearly system-attributable (actorType disambiguates).
        actorId: orgId,
        action: "ai.kb.auto_updated",
        resourceType: "ai_training_profile",
        resourceId: orgId,
        afterData: { sourceUrl, fields: merged.fields },
      },
    });
  });

  if (docId) {
    try {
      await ingestDocument({ documentId: docId, organizationId: orgId, establishmentId: null, content: corpus });
    } catch (err) {
      logger.warn({ event: "kb.refresh.ingest_failed", orgId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { changed: true, fields: merged.fields };
}

export type RefreshAllResult = {
  orgsProcessed: number;
  changed: number;
  emailed: number;
  errors: { orgId: string; error: string }[];
};

export async function refreshAllOrgs(): Promise<RefreshAllResult> {
  // Mirror daily-digest's org selection: only entitled (trial/pro), non-deleted.
  const orgs = await prisma.organization.findMany({
    where: { plan: { in: ["trial", "pro"] }, deletedAt: null },
    select: { id: true, name: true },
    take: 2000,
  });

  let orgsProcessed = 0;
  let changed = 0;
  let emailed = 0;
  const errors: { orgId: string; error: string }[] = [];

  for (const org of orgs) {
    try {
      const result = await refreshOrgKb(org.id);
      orgsProcessed += 1;
      if (result.changed) {
        changed += 1;
        // Notify the owner+admins. Reuse the same recipient rule as the digest.
        const recipients = await prisma.membership.findMany({
          where: { organizationId: org.id, role: { in: ["owner", "admin"] } },
          select: { user: { select: { email: true } } },
        });
        for (const r of recipients) {
          const to = r.user?.email;
          if (!to) continue;
          const sent = await sendKbUpdateEmail({
            orgId: org.id,
            to,
            businessName: org.name,
            changedFields: result.fields,
          });
          if (sent.sent) emailed += 1;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ orgId: org.id, error: msg });
      logger.error({ event: "kb.refresh.org_failed", orgId: org.id, error: msg });
    }
  }

  logger.info(
    { event: "kb.refresh.complete", orgsProcessed, changed, emailed, errorCount: errors.length },
    "weekly KB refresh complete",
  );

  return { orgsProcessed, changed, emailed, errors };
}
