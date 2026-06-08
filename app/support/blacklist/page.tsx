import { redirect } from "next/navigation";

/**
 * Legacy /support/blacklist — folded into the unified inbox (Module 09, Wave 3c).
 * The keyword blacklist is now the Moderation tab (Rules sub-tab) of /support.
 * Kept as a redirect so old links resolve.
 */
export const dynamic = "force-dynamic";

export default function BlacklistRedirect() {
  redirect("/support?tab=moderation&sub=rules");
}
