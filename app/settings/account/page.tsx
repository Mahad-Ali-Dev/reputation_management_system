import { redirect } from "next/navigation";
import { DEFAULT_SETTINGS_HREF } from "../_lib/sections";

/**
 * Legacy route. The monolithic account-settings page was split into the
 * sectioned settings shell (see app/settings/layout.tsx + the routed
 * sub-pages). Kept as a redirect so old links / bookmarks still resolve.
 */
export const dynamic = "force-dynamic";

export default function AccountSettingsRedirect() {
  redirect(DEFAULT_SETTINGS_HREF);
}
