"use client";

import { Icon } from "@/components/shell/icon";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { Workspace } from "@/lib/auth/active-org";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette } from "./command-palette";
import { SidebarNav } from "./sidebar-nav";
import { useTheme } from "./theme-provider";

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
  const { theme } = useTheme();

  return (
    <div
      className={`app app--responsive app--canvas${isGlass ? " app--glass app--frame glass-theme" : ""}`}
      data-glass-mode={isGlass ? theme : undefined}
    >
      {/* Full-width top bar: logo far left, page actions far right. */}
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

          <Link href="/dashboard" className="tb__brand" aria-label="repulabs home">
            <Image
              src="/favicon.png"
              alt=""
              width={30}
              height={30}
              priority
              style={{ borderRadius: 8, objectFit: "contain", flex: "0 0 30px" }}
            />
            <span className="tb__brandname">
              repu<span>labs</span>
            </span>
          </Link>

          {workspaces && workspaces.length > 0 && <WorkspaceSwitcher workspaces={workspaces} />}
        </div>

        {centerBar && <div className="tb__center">{centerBar}</div>}

        <div className="tb__right">{topBar}</div>
      </header>

      {/* One rounded frosted sheet under the top bar holds the sidebar and the
          page; the page scrolls inside it (Hostinger-style frame). */}
      <div className="app__body">
        <div className="app__sb-desktop">
          <SidebarNav orgName={orgName} planLabel={planLabel} allowedTabs={allowedTabs} />
        </div>

        <main className="main">
          <div className="scroll">{children}</div>
        </main>
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

      <CommandPalette />
    </div>
  );
}
