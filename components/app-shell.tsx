"use client";

import { Icon } from "@/components/shell/icon";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { Workspace } from "@/lib/auth/active-org";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette } from "./command-palette";
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
 * Public API: { children, topBar?, orgName, planLabel, crumbs?, workspaces?, allowedTabs? }.
 *   - topBar      — right-aligned actions area (notifications, sign-out, etc.).
 *   - crumbs      — array of strings rendered into the topbar's breadcrumb trail
 *                   (last entry is bold, earlier entries muted). Falls back to
 *                   nothing.
 *   - workspaces  — every org the signed-in user belongs to; renders the
 *                   top-left workspace switcher (see workspace-switcher.tsx).
 *   - allowedTabs — this member's tab whitelist (lib/access/tabs.ts); empty
 *                   means unrestricted. Locks the matching sidebar items.
 */
export function AppShell({
  children,
  topBar,
  orgName,
  planLabel,
  workspaces,
  allowedTabs,
  variant,
  centerBar,
}: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  orgName: string;
  planLabel: string;
  crumbs?: string[];
  dateLabels?: Record<string, string>;
  workspaces?: Workspace[];
  allowedTabs?: string[];
  /**
   * Visual skin for the shell. Glass is the DEFAULT across the whole app — the
   * root gets `app--glass glass-theme` + `data-glass-mode`, and the global
   * chrome skin in app/glass-chrome.css renders the frosted floating sidebar +
   * navbar on every tab. Pass "plain" to opt a page back out to the legacy chrome.
   */
  variant?: "glass" | "plain";
  /** Page-specific content for the navbar CENTER (e.g. the dashboard metric
   *  strip). Omitted on pages that don't need it, so the center stays empty. */
  centerBar?: React.ReactNode;
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

  const isGlass = variant !== "plain";

  return (
    <div
      className={`app app--responsive app--canvas${isGlass ? " app--glass glass-theme" : ""}`}
      data-glass-mode={isGlass ? "light" : undefined}
    >
      {/* Desktop sidebar */}
      <div className="app__sb-desktop">
        <SidebarNav orgName={orgName} planLabel={planLabel} allowedTabs={allowedTabs} />
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
              allowedTabs={allowedTabs}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <main className="main">
        <header className="tb">
          <div className="tb__left">
            <button
              type="button"
              className="tb__iconbtn app__menu"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" size={18} />
            </button>

            {workspaces && workspaces.length > 0 && (
              <WorkspaceSwitcher workspaces={workspaces} />
            )}
          </div>

          {centerBar && <div className="tb__center">{centerBar}</div>}

          <div className="tb__right">{topBar}</div>
        </header>

        <div className="scroll">{children}</div>
      </main>

      <CommandPalette />
    </div>
  );
}
