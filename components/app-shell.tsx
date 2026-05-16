"use client";

import { Icon } from "@/components/shell/icon";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  crumbs,
  biz,
}: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  orgName: string;
  planLabel: string;
  crumbs?: string[];
  biz?: string;
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
    <div className="app app--responsive">
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

          {crumbs && crumbs.length > 0 && (
            <>
              <div className="tb__crumbs">
                {crumbs.map((c, i) =>
                  i === crumbs.length - 1 ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable position in short breadcrumb
                    <b key={`${c}-${i}`}>{c}</b>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable position in short breadcrumb
                    <span key={`${c}-${i}`} className="row" style={{ gap: 8 }}>
                      <span className="dim">{c}</span>
                      <i className="crumb-sep">/</i>
                    </span>
                  ),
                )}
              </div>
              {biz && <div className="tb__divider" />}
            </>
          )}

          {biz && (
            <button type="button" className="tb__loc">
              <Icon name="pin" size={11} style={{ color: "var(--pri)" }} />
              <span style={{ color: "var(--rl-muted)" }}>Viewing</span>
              <b style={{ fontWeight: 500 }}>{biz}</b>
              <Icon name="chevD" size={10} style={{ color: "var(--rl-muted)" }} />
            </button>
          )}

          <div className="tb__right">{topBar}</div>
        </header>

        <div className="scroll">{children}</div>
      </main>
    </div>
  );
}
