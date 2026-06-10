import type { IconName } from "@/components/shell/icon";

/**
 * Settings information architecture — single source of truth for the
 * sectioned settings shell (left sub-nav + content pane).
 *
 * Plain module (no "use server", no async exports) so it can be imported by
 * both the client nav and the server sub-pages.
 *
 * Each section maps to a routed sub-page under /settings/<id>. The shell
 * renders this list as a left-nav; the active item is derived from the URL.
 */
export type SettingsSection = {
  id: string;
  href: string;
  icon: IconName;
  label: string;
  group: "workspace" | "account" | "advanced";
  danger?: boolean;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "workspace", href: "/settings/workspace", icon: "building", label: "Workspace", group: "workspace" },
  { id: "team", href: "/settings/team", icon: "users", label: "Team & roles", group: "workspace" },
  { id: "billing", href: "/settings/billing", icon: "card", label: "Billing", group: "workspace" },
  { id: "brand", href: "/settings/brand", icon: "image", label: "Brand", group: "workspace" },
  { id: "notifications", href: "/settings/notifications", icon: "bell", label: "Notifications", group: "account" },
  { id: "security", href: "/settings/security", icon: "lock", label: "Security", group: "account" },
  { id: "api", href: "/settings/api", icon: "plug", label: "API & webhooks", group: "advanced" },
  { id: "data", href: "/settings/data", icon: "download", label: "Data & export", group: "advanced" },
];

export const SETTINGS_GROUP_LABELS: Record<SettingsSection["group"], string> = {
  workspace: "Workspace",
  account: "Account",
  advanced: "Advanced",
};

/** Default landing section when hitting /settings with no sub-route. */
export const DEFAULT_SETTINGS_HREF = "/settings/workspace";

export const COUNTRIES = [
  ["US", "🇺🇸 United States"],
  ["CA", "🇨🇦 Canada"],
  ["GB", "🇬🇧 United Kingdom"],
  ["AU", "🇦🇺 Australia"],
  ["NZ", "🇳🇿 New Zealand"],
  ["DE", "🇩🇪 Germany"],
  ["FR", "🇫🇷 France"],
  ["ES", "🇪🇸 Spain"],
  ["IT", "🇮🇹 Italy"],
  ["NL", "🇳🇱 Netherlands"],
  ["IE", "🇮🇪 Ireland"],
  ["BR", "🇧🇷 Brazil"],
  ["MX", "🇲🇽 Mexico"],
  ["IN", "🇮🇳 India"],
  ["PK", "🇵🇰 Pakistan"],
  ["AE", "🇦🇪 UAE"],
  ["SG", "🇸🇬 Singapore"],
  ["JP", "🇯🇵 Japan"],
  ["KR", "🇰🇷 South Korea"],
  ["OTHER", "Other"],
] as const;

export function prettyPlan(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
