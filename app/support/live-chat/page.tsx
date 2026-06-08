import { redirect } from "next/navigation";

/**
 * Legacy /support/live-chat — folded into the unified inbox (Module 09, Wave 3c).
 * Live website chat is now the Live Chat tab of /support. Kept as a redirect so
 * old links resolve.
 */
export const dynamic = "force-dynamic";

export default function LiveChatRedirect() {
  redirect("/support?tab=live-chat");
}
