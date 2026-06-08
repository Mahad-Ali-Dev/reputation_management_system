import { redirect } from "next/navigation";

/**
 * Legacy /support/chat-automation — folded into the unified inbox (Module 09,
 * Wave 3c). Automation rules are now the Automation tab of /support. Kept as a
 * redirect so old links resolve.
 */
export const dynamic = "force-dynamic";

export default function ChatAutomationRedirect() {
  redirect("/support?tab=automation");
}
