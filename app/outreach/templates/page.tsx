import { redirect } from "next/navigation";

/**
 * The standalone Templates list was merged into the /outreach hub (Templates
 * tab). Kept as a redirect so old links resolve. Per-template editing happens at
 * the deeper /outreach/templates/[id] segment (no collision with this redirect).
 */
export const dynamic = "force-dynamic";

export default function OutreachTemplatesPage() {
  redirect("/outreach?tab=templates");
}
