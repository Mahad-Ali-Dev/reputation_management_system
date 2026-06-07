import { redirect } from "next/navigation";

/**
 * The standalone Send page was merged into the /outreach hub (Send tab). Kept as
 * a redirect so old bookmarks/links resolve. The composer now lives in
 * app/outreach/_components/send-composer.tsx.
 */
export const dynamic = "force-dynamic";

export default function SendOneOffPage() {
  redirect("/outreach?tab=send");
}
