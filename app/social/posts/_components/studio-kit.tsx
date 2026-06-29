import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";

/**
 * Shared Social Studio design-kit primitives — the KPI strip + underline tabs
 * used across the composer hub, the calendar page and (the KPI strip) anywhere
 * the studio's 3 metric cards appear. Server-safe (pure markup, no client JS).
 *
 * Styles live in app/social/posts/social-compose.css (prefix .sk-).
 */

type KpiTone = "pri" | "green" | "orange";

export type StudioKpi = {
  label: string;
  value: string;
  helper: string;
  icon: IconName;
  tone: KpiTone;
  /** Pale decorative illustration (kit asset) peeking from the card corner. */
  art: string;
};

/** Scheduled / Published / Drafts strip — drives all three studio surfaces. */
export function StudioKpis({ items }: { items: StudioKpi[] }) {
  return (
    <div className="sk-kpis">
      {items.map((k) => (
        <div key={k.label} className="sk-kpi">
          <div className="sk-kpi__top">
            <span className={`sk-kpi__tile sk-kpi__tile--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </span>
            <div>
              <div className="sk-kpi__label">{k.label}</div>
            </div>
          </div>
          <div className="sk-kpi__value">{k.value}</div>
          <div className="sk-kpi__helper">{k.helper}</div>
          <span className="sk-kpi__art" aria-hidden>
            {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
            <img src={k.art} alt="" loading="lazy" />
          </span>
        </div>
      ))}
    </div>
  );
}

type HubTab = "create" | "calendar" | "history" | "library";

const TABS: { key: HubTab; label: string; icon: IconName; href: string }[] = [
  { key: "create", label: "Create post", icon: "edit", href: "/social/posts?tab=create" },
  { key: "calendar", label: "Calendar", icon: "cal", href: "/social/calendar" },
  { key: "history", label: "Post history", icon: "clock", href: "/social/posts?tab=history" },
  { key: "library", label: "Content library", icon: "image", href: "/social/posts?tab=library" },
];

/** Underline section tabs (Create / Calendar / Post history / Content library). */
export function StudioTabs({ active }: { active: HubTab }) {
  return (
    <div className="sk-tabs" role="tablist" aria-label="Social studio">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={isActive ? "sk-tabs__t is-active" : "sk-tabs__t"}
          >
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
