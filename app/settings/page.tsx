import { redirect } from "next/navigation";
import { DEFAULT_SETTINGS_HREF } from "./_lib/sections";

/**
 * /settings → redirects to the default Workspace section. The sectioned shell
 * lives in layout.tsx; every section is its own routed sub-page.
 */
export const dynamic = "force-dynamic";

export default function SettingsIndexPage() {
  redirect(DEFAULT_SETTINGS_HREF);
}
