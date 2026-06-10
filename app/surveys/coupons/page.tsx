import { redirect } from "next/navigation";

/**
 * Legacy `/surveys/coupons` route. The coupons workspace is now the
 * **Incentives** tab inside the Surveys workspace (lifecycle relayout), so this
 * route permanently redirects there — keeping every old deep-link working.
 */
export const dynamic = "force-dynamic";

export default function CouponsRedirectPage() {
  redirect("/surveys?tab=incentives");
}
