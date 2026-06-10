import { redirect } from "next/navigation";

/**
 * Legacy /support/analytics — folded into the unified inbox (Module 09).
 *
 * Support analytics is now the "Analytics" view of /support, rendered inline by
 * <AnalyticsPanel/> (the page body moved there verbatim). Kept as a deep-link
 * redirect so old links + the prior sub-tab targets resolve into the unified
 * workspace.
 */
export const dynamic = "force-dynamic";

export default function SupportAnalyticsRedirect() {
  redirect("/support?tab=analytics");
}
