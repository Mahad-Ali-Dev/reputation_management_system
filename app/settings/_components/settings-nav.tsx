"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SETTINGS_GROUP_LABELS,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "../_lib/sections";

/**
 * Settings left sub-nav — kit rail (designs/settings/**). Routed sections
 * grouped into Workspace / Account / Advanced. The active item is derived from
 * the current pathname (each section is its own /settings/<id> route), so it
 * stays in sync on navigation without scroll-spy bookkeeping. Sticky so it
 * persists while the pane scrolls.
 */
export function SettingsNav() {
  const pathname = usePathname();

  const groups = (Object.keys(SETTINGS_GROUP_LABELS) as Array<SettingsSection["group"]>).map(
    (group) => ({
      group,
      label: SETTINGS_GROUP_LABELS[group],
      items: SETTINGS_SECTIONS.filter((s) => s.group === group),
    }),
  );

  return (
    <nav className="set-nav" aria-label="Settings sections">
      {groups.map((g) => (
        <div key={g.group} className="set-nav__group">
          <div className="set-nav__label">{g.label}</div>
          {g.items.map((s) => {
            const isActive = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.id}
                href={s.href}
                className={`set-nav__item${s.danger ? " set-nav__item--danger" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon name={s.icon} size={16} className="set-nav__ic" />
                <span>{s.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
