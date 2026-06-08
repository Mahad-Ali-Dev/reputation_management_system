import { redirect } from "next/navigation";

/**
 * Legacy /support/dms — folded into the unified inbox (Module 09, Wave 3c).
 * DMs are the Conversations tab of /support. Kept as a redirect so old links +
 * bookmarks resolve.
 */
export const dynamic = "force-dynamic";

export default function DmsRedirect() {
  redirect("/support?tab=conversations");
}
