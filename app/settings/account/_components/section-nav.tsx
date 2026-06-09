"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { useEffect, useState } from "react";

type Section = { id: string; icon: IconName; t: string; danger?: boolean };

/**
 * Account-settings left nav with scroll-spy: the link for the section currently
 * in view is highlighted, and clicking a link highlights it immediately. Sticky
 * so it stays in view while the long settings column scrolls.
 */
export function SettingsSectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      className="ds-card"
      style={{ padding: 6, position: "sticky", top: 16 }}
      aria-label="Account sections"
    >
      {sections.map((s) => {
        const isActive = s.id === active;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
            className="row"
            aria-current={isActive ? "true" : undefined}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 12.5,
              cursor: "pointer",
              textDecoration: "none",
              transition: "background 120ms var(--ease, ease), color 120ms var(--ease, ease)",
              background: isActive ? "var(--pri-50)" : "transparent",
              color: s.danger ? "var(--bad)" : isActive ? "var(--pri)" : "var(--ink-2)",
            }}
          >
            <Icon name={s.icon} size={13} />
            <span style={{ flex: 1, fontWeight: isActive ? 500 : 400 }}>{s.t}</span>
          </a>
        );
      })}
    </nav>
  );
}
