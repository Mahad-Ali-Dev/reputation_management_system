import { redirect } from "next/navigation";

/**
 * Legacy /support/customers — folded into the unified inbox (Module 09, Wave 3c).
 * Visitor/customer data now surfaces in the Conversations customer panel + the
 * Live Chat sessions view. Kept as a redirect so old links resolve.
 */
export const dynamic = "force-dynamic";

export default function CustomersRedirect() {
  redirect("/support?tab=conversations");
}
