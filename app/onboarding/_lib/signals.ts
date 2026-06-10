import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Setup-hub signals — the real, tenant-scoped facts the /onboarding wizard
 * chrome (step banner + 4-step strip + checklist rail) derives its state from.
 *
 * Mirrors the contract of `lib/onboarding/facts.ts`: every boolean comes from
 * live rows (never a stored flag), reads run in ONE batched `withTenant`
 * transaction so RLS applies, and ANY failure (including a not-yet-migrated
 * table on a fresh deploy — the established isMissingRelation situation)
 * degrades to the all-false conservative set instead of throwing. Showing an
 * unfinished checklist is harmless; crashing the first-run page is not.
 */
export type SetupSignals = {
  /** At least one non-deleted establishment exists (step 1 — Business). */
  hasEstablishment: boolean;
  /** Any active connection exists (step 2 — Connect). */
  hasConnection: boolean;
  /** Specifically an active Google Business connection (checklist row). */
  hasGoogleConnection: boolean;
  /** At least one review request was ever created (step 3 — First request). */
  hasSentRequest: boolean;
  /** A teammate exists beyond the owner, or a pending invite (step 4). */
  hasTeam: boolean;
  /** AI training profile has real brand-voice content (checklist extra). */
  hasBrandVoice: boolean;
};

const EMPTY_SIGNALS: SetupSignals = {
  hasEstablishment: false,
  hasConnection: false,
  hasGoogleConnection: false,
  hasSentRequest: false,
  hasTeam: false,
  hasBrandVoice: false,
};

export async function getSetupSignals(orgId: string): Promise<SetupSignals> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [
        establishmentCount,
        connectionCount,
        googleConnectionCount,
        requestCount,
        membershipCount,
        invitationCount,
        voiceProfileCount,
      ] = await Promise.all([
        tx.establishment.count({ where: { deletedAt: null } }),
        tx.connection.count({ where: { status: "active" } }),
        tx.connection.count({
          where: { provider: "google_business", status: "active" },
        }),
        tx.reviewRequest.count(),
        tx.membership.count(),
        tx.invitation.count(),
        tx.aiTrainingProfile.count({
          where: {
            OR: [{ businessOverview: { not: null } }, { customPrompt: { not: null } }],
          },
        }),
      ]);

      return {
        hasEstablishment: establishmentCount > 0,
        hasConnection: connectionCount > 0,
        hasGoogleConnection: googleConnectionCount > 0,
        hasSentRequest: requestCount > 0,
        // The signup owner always has one membership; "team" means anyone else
        // is in (or has been invited into) the workspace.
        hasTeam: membershipCount > 1 || invitationCount > 0,
        hasBrandVoice: voiceProfileCount > 0,
      } satisfies SetupSignals;
    });
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.signals.failed",
    });
    return EMPTY_SIGNALS;
  }
}
