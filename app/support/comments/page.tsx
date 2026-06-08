import { redirect } from "next/navigation";

/**
 * Legacy /support/comments — folded into the unified inbox (Module 09, Wave 3c).
 * Comments are now the Comments tab of /support. Kept as a redirect so old links
 * + the prior sidebar target resolve.
 */
export const dynamic = "force-dynamic";

export default function CommentsRedirect() {
  redirect("/support?tab=comments");
}
