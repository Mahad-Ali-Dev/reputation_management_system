import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { ChecklistStep } from "@/components/getting-started";
import type { OnboardingFacts } from "@/components/onboarding-banner";

/**
 * Onboarding facts — the single server-side source of truth for "which
 * onboarding steps are done", derived from REAL rows (never stored booleans).
 *
 * Background: `OnboardingBanner` (the single-next-step dashboard banner) and the
 * new `<GettingStarted>` checklist both decide step completion the same way —
 * a step is "done" because the establishment / connection / device / reply
 * actually exists. Today the dashboard assembles a bespoke list inline; this
 * module hoists that derivation into one reusable, tenant-scoped query batch so
 * every surface agrees on the same facts.
 *
 * `OnboardingFacts` is intentionally re-exported from `onboarding-banner.tsx`
 * (where it was first defined) so existing callers keep working unchanged.
 */
export type { OnboardingFacts } from "@/components/onboarding-banner";

/**
 * A fully empty/"nothing configured" fact set. Returned when the tenant query
 * batch fails for ANY reason (including a not-yet-migrated table/column on a
 * fresh deploy) so onboarding surfaces fail-soft to "you still have steps left"
 * rather than throwing a 500. This is the conservative direction: showing the
 * checklist again is harmless; crashing the page is not.
 */
const EMPTY_FACTS: OnboardingFacts = {
  hasEstablishment: false,
  hasGoogleConnection: false,
  hasReviewReply: false,
  hasWidgetKey: false,
  hasHardware: false,
};

/**
 * Derive the onboarding facts for an org from live tenant data in ONE batched,
 * tenant-scoped transaction. All reads go through `withTenant` so RLS applies.
 *
 * Fail-soft: any error (transient DB issue, or a table/column absent before the
 * founder runs the migration — Postgres `42P01`/`42703`) is logged and degraded
 * to {@link EMPTY_FACTS}; this function never throws.
 *
 * Notes on what each fact means (matched to `OnboardingBanner`'s semantics):
 * - `hasEstablishment`  — at least one non-deleted establishment exists.
 * - `hasGoogleConnection` — an active `google_business` connection exists.
 * - `hasReviewReply`    — a reply that was published OR human-approved
 *                          (`status: published` OR `approvedBy` set).
 * - `hasWidgetKey`      — an active chatbot/widget key exists.
 * - `hasHardware`       — at least one ordered Review Stand device exists.
 */
export async function getOnboardingFacts(orgId: string): Promise<OnboardingFacts> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [
        establishmentCount,
        googleConnectionCount,
        approvedReplyCount,
        widgetKeyCount,
        deviceCount,
      ] = await Promise.all([
        tx.establishment.count({ where: { deletedAt: null } }),
        tx.connection.count({
          where: { provider: "google_business", status: "active" },
        }),
        tx.reviewReply.count({
          where: {
            OR: [{ status: "published" }, { approvedBy: { not: null } }],
          },
        }),
        tx.widgetKey.count({ where: { status: "active" } }),
        tx.device.count(),
      ]);

      return {
        hasEstablishment: establishmentCount > 0,
        hasGoogleConnection: googleConnectionCount > 0,
        hasReviewReply: approvedReplyCount > 0,
        hasWidgetKey: widgetKeyCount > 0,
        hasHardware: deviceCount > 0,
      } satisfies OnboardingFacts;
    });
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "onboarding.facts.failed",
    });
    return EMPTY_FACTS;
  }
}

/**
 * The canonical ordered onboarding checklist, expressed as `<GettingStarted>`
 * steps with `done` derived from {@link OnboardingFacts}. Modules that want the
 * full account-setup checklist can drop this straight into `<GettingStarted>`;
 * module-specific checklists build their own `ChecklistStep[]` from their own
 * fact getters (per the foundation contract).
 *
 * The copy + ordering mirror `OnboardingBanner`'s single-next-step flow so the
 * banner and the checklist never disagree about what comes next.
 */
export function buildOnboardingChecklist(facts: OnboardingFacts): ChecklistStep[] {
  return [
    {
      key: "establishment",
      title: "Add your first listing",
      body: "Tell us about the listing you're managing — name, address, hours. Takes 30 seconds.",
      done: facts.hasEstablishment,
      cta: { label: "Add listing", href: "/establishments" },
    },
    {
      key: "google",
      title: "Connect Google Business Profile",
      body: "Pulls in your reviews automatically. We never write to your listing without your approval.",
      done: facts.hasGoogleConnection,
      cta: { label: "Connect Google", href: "/establishments" },
    },
    {
      key: "first-reply",
      title: "Approve your first AI-drafted reply",
      body: "We've already drafted a response in your tone. Review it, tweak if needed, hit publish.",
      done: facts.hasReviewReply,
      cta: { label: "Review queue", href: "/reviews" },
    },
    {
      key: "chatbot",
      title: "Embed the AI chatbot on your website",
      body: "Upload your FAQ once. Your customers get instant answers 24/7. Two lines of HTML.",
      done: facts.hasWidgetKey,
      cta: { label: "Set up chatbot", href: "/ai" },
    },
    {
      key: "hardware",
      title: "Order Review Stands for your front desk",
      body: "Physical QR + NFC stands that turn happy walk-ins into Google reviews.",
      done: facts.hasHardware,
      cta: { label: "Order stands", href: "/hardware" },
    },
  ];
}
