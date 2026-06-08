import Link from "next/link";
import { Icon, type IconName } from "@/components/shell/icon";

/**
 * Persistent 3-tab nav for the Contacts directory (server `<Link>` row).
 *
 * Renders the design-system `.tabs` / `.tabs__t` bar, driven by `?tab=` on
 * `/contacts` (`contacts` default | `segments` | `import`). Always visible (AC:
 * "3 persistent tabs"). Mirrors the `app/support/comments/page.tsx` tab markup
 * so this stays a pure server component (no client island needed — each tab is a
 * server-rendered panel and a full navigation is fine here).
 */

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: "contacts", label: "Contacts", icon: "users" },
  { key: "segments", label: "Segments", icon: "filter" },
  { key: "import", label: "Import & Export", icon: "upload" },
];

export function ContactsTabs({ active }: { active: string }) {
  const current = TABS.some((t) => t.key === active) ? active : "contacts";
  return (
    <div className="tabs" role="tablist" aria-label="Contacts views" style={{ marginBottom: 16 }}>
      {TABS.map((t) => {
        const isActive = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === "contacts" ? "/contacts" : `/contacts?tab=${t.key}`}
            role="tab"
            aria-selected={isActive}
            className={`tabs__t${isActive ? " is-active" : ""}`}
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
