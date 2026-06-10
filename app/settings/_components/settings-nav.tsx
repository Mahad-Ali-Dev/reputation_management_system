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
 * Settings left sub-nav — routed sections grouped into Workspace / Account /
 * Advanced. The active item is derived from the current pathname (each section
 * is its own /settings/<id> route), so it stays in sync on navigation without
 * scroll-spy bookkeeping. Sticky so it persists while the pane scrolls.
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
    <nav
      className="ds-card"
      style={{ padding: 6, position: "sticky", top: 16 }}
      aria-label="Settings sections"
    >
      {groups.map((g, gi) => (
        <div key={g.group} style={{ marginTop: gi === 0 ? 0 : 10 }}>
          <div
            className="lbl-mono"
            style={{ padding: "6px 10px 4px", fontSize: 10, opacity: 0.7 }}
          >
            {g.label}
          </div>
          {g.items.map((s) => {
            const isActive = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.id}
                href={s.href}
                className="row"
                aria-current={isActive ? "page" : undefined}
                style={{
                  padding: "7px 10px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  textDecoration: "none",
                  transition:
                    "background 120ms var(--ease, ease), color 120ms var(--ease, ease)",
                  background: isActive ? "var(--pri-50)" : "transparent",
                  color: s.danger ? "var(--bad)" : isActive ? "var(--pri)" : "var(--ink-2)",
                }}
              >
                <Icon name={s.icon} size={13} />
                <span style={{ flex: 1, fontWeight: isActive ? 500 : 400 }}>{s.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
