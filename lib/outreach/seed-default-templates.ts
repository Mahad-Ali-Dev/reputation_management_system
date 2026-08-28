/**
 * Idempotent default-template seeder (07_review_requests).
 *
 * `ensureDefaultTemplates(orgId)` creates the spec's two starter
 * `OutreachTemplate` rows the FIRST time an org opens the Templates tab (a cheap
 * `count` guard means every org gets them without a data migration). Bodies use
 * the CANONICAL double-brace `{{...}}` merge-tag syntax (verifier fix #2).
 *
 * Fail-soft: this is best-effort cosmetic seeding. If the table isn't migrated
 * yet (42P01) we swallow and return — never 500 the hub.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

const POST_PURCHASE_BODY = `Hi {{first_name}},

Thanks for choosing {{business_name}}! We'd love to hear about your experience.

If you have a moment, please leave us a quick review, it really helps:
{{review_link}}

Thank you!
The {{business_name}} team`;

const QUICK_SMS_BODY = `Hi {{first_name}}, thanks for visiting {{business_name}}! Mind leaving us a quick review? {{review_link}}`;

/**
 * Create the two default templates if the org has none. Returns the number
 * created (0 when they already exist or the table isn't ready).
 */
export async function ensureDefaultTemplates(orgId: string): Promise<number> {
  try {
    return await withTenant(orgId, async (tx) => {
      const existing = await tx.outreachTemplate.count();
      if (existing > 0) return 0;

      await tx.outreachTemplate.createMany({
        data: [
          {
            organizationId: orgId,
            channel: "email",
            name: "Post-Purchase Follow-Up",
            subject: "How was your experience at {{business_name}}?",
            body: POST_PURCHASE_BODY,
            isDefault: true,
          },
          {
            organizationId: orgId,
            channel: "sms",
            name: "Quick Review Request",
            body: QUICK_SMS_BODY,
            isDefault: true,
          },
        ],
      });
      logger.info({ orgId, event: "outreach.default_templates.seeded" });
      return 2;
    });
  } catch (err) {
    if (isMissingRelation(err)) return 0;
    // Non-fatal: log and continue so the Templates tab still renders.
    logger.warn({
      orgId,
      event: "outreach.default_templates.seed_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || code === "42P01" || code === "42703";
}
