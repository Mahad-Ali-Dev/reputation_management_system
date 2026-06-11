"use client";

import { Icon } from "@/components/shell/icon";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { SidebarNav } from "./sidebar-nav";

/**
 * Top-level app shell — repulabs v2 design.
 *
 * Desktop (>= lg): 244px glass sidebar (left) + main column. Both sidebar and
 * topbar use backdrop-filter blur over the page's teal+gold radial gradient.
 *
 * Mobile (< lg): sidebar hidden behind a hamburger; slides in as a drawer.
 * Esc closes the drawer; navigation auto-closes it.
 *
 * Public API: { children, topBar?, orgName, planLabel, crumbs?, biz? }.
 *   - topBar  — right-aligned actions area (notifications, sign-out, etc.).
 *   - crumbs  — array of strings rendered into the topbar's breadcrumb trail
 *               (last entry is bold, earlier entries muted). Falls back to
 *               nothing.
 *   - biz     — text shown inside the location pill (e.g. business name).
 */
export function AppShell({
  children,
  topBar,
  orgName,
  planLabel,
  biz,
  dateLabel,
}: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  orgName: string;
  planLabel: string;
  crumbs?: string[];
  biz?: string;
  dateLabel?: string;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  return (
    <div className="app app--responsive app--canvas">
      {/* Desktop sidebar */}
      <div className="app__sb-desktop">
        <SidebarNav orgName={orgName} planLabel={planLabel} />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <button
            type="button"
            className="app__scrim"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <div className="app__sb-drawer">
            <SidebarNav
              orgName={orgName}
              planLabel={planLabel}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <main className="main">
        <header className="tb">
          <button
            type="button"
            className="tb__iconbtn app__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={18} />
          </button>

          {biz && (
            <button type="button" className="tb__loc">
              <Icon name="building" size={13} style={{ color: "var(--pri)" }} />
              <b style={{ fontWeight: 600 }}>{biz}</b>
              <Icon name="chevD" size={11} style={{ color: "var(--rl-muted)" }} />
            </button>
          )}

          <button
            type="button"
            className="tb__search"
            onClick={openCommandPalette}
            aria-label="Search and navigate (Command or Control + K)"
            style={{ cursor: "pointer", font: "inherit", textAlign: "left", width: "100%" }}
          >
            <Icon name="search" size={14} />
            <span style={{ flex: 1 }}>Search reviews, customers, topics…</span>
            <kbd
              style={{
                fontSize: 10.5,
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "1px 6px",
                color: "var(--rl-muted)",
              }}
            >
              ⌘K
            </kbd>
          </button>

          {dateLabel && (
            <button type="button" className="tb__date">
              <Icon name="cal" size={13} style={{ color: "var(--rl-muted)" }} />
              <span>{dateLabel}</span>
              <Icon name="chevD" size={11} style={{ color: "var(--rl-muted)" }} />
            </button>
          )}

          <div className="tb__right">{topBar}</div>
        </header>

        <div className="scroll">{children}</div>
      </main>

      <CommandPalette />
    </div>
  );
}
