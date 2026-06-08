import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";

/**
 * `<HubTabs>` (Module 10) — the server-rendered 4-tab nav for the Social Studio.
 *
 * Create Post · Calendar · Post History · Content Library. Create/History/Library
 * stay in-page on `/social/posts?tab=…`; Calendar links to the existing
 * `/social/calendar` route (no URL migration — guardrail). Uses the global
 * `.tabs` / `.tabs__t` design-system classes so it reads identically to every
 * other tabbed surface. Pure `<Link>` markup → no client JS, RSC-safe.
 */

type HubTab = "create" | "calendar" | "history" | "library";

const TABS: { key: HubTab; label: string; icon: IconName; href: string }[] = [
  { key: "create", label: "Create post", icon: "edit", href: "/social/posts?tab=create" },
  { key: "calendar", label: "Calendar", icon: "cal", href: "/social/calendar" },
  { key: "history", label: "Post history", icon: "clock", href: "/social/posts?tab=history" },
  { key: "library", label: "Content library", icon: "image", href: "/social/posts?tab=library" },
];

export function HubTabs({ active }: { active: HubTab }) {
  return (
    <div className="tabs" role="tablist" aria-label="Social studio" style={{ marginBottom: 16 }}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={isActive ? "tabs__t is-active" : "tabs__t"}
            style={{ textDecoration: "none" }}
          >
            <Icon name={t.icon} size={14} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
