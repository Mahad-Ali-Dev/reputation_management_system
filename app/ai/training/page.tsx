import { redirect } from "next/navigation";

/**
 * Legacy AI Knowledge Base hub — RETIRED.
 *
 * The AI Knowledge Base now lives at /ai (the delivered kit design with the
 * Knowledge / Behaviour / Test tabs). This old route is kept only as a permanent
 * redirect so any stale bookmark, deep link, or external reference lands on the
 * current page instead of the old design. Tab deep-links were repointed to
 * /ai?tab=… at their call sites.
 */
export const dynamic = "force-dynamic";

export default function LegacyAiTrainingRedirect() {
  redirect("/ai");
}
