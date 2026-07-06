import Link from "next/link";
import { Icon, type IconName } from "@/components/shell/icon";

/**
 * Persistent 3-tab nav for the Contacts directory (kit underline style).
 *
 * Renders the `.cd-tabs` / `.cd-tab` bar, driven by `?tab=` on `/contacts`
 * (`contacts` default | `segments` | `import`). Always visible (AC: "3
 * persistent tabs"). Pure server component (each tab is a server-rendered panel,
 * so a full navigation is fine here — no client island needed).
 */

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: "contacts", label: "Contacts", icon: "users" },
  { key: "segments", label: "Segments", icon: "filter" },
  { key: "import", label: "Import & Export", icon: "upload" },
];

export function ContactsTabs({ active }: { active: string }) {
  const current = TABS.some((t) => t.key === active) ? active : "contacts";
  return (
    <div className="cd-tabs" role="tablist" aria-label="Contacts views">
      {TABS.map((t) => {
        const isActive = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === "contacts" ? "/contacts" : `/contacts?tab=${t.key}`}
            role="tab"
            aria-selected={isActive}
            className={`cd-tab${isActive ? " is-active" : ""}`}
          >
            <span className="cd-tab__ico">
              <Icon name={t.icon} size={15} />
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
