"use client";

/**
 * Glass app shell — the authed-page frame for the glassmorphism redesign.
 *
 * Composes the glass foundation (GlassCanvas + GlassBar) into a reusable
 * sidebar + top-bar layout so every restructured screen shares one frame.
 * Preview-only for now; mock nav. Mode (light/dark) is owned by the page and
 * passed in so the whole shell re-skins on toggle.
 */

import {
  GlassBar,
  GlassCanvas,
  type GlassMode,
  GlassModeToggle,
} from "@/components/repulabs-ui/glass";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Bell,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  MapPin,
  Megaphone,
  MessageSquareText,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import * as React from "react";

export type NavSlug =
  | "dashboard"
  | "reviews"
  | "campaigns"
  | "sentiment"
  | "analytics"
  | "widgets"
  | "locations"
  | "team"
  | "settings";

const NAV: Array<{ slug: NavSlug; label: string; icon: LucideIcon }> = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { slug: "reviews", label: "Reviews", icon: MessageSquareText },
  { slug: "campaigns", label: "Campaigns", icon: Megaphone },
  { slug: "sentiment", label: "Sentiment", icon: Activity },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
  { slug: "widgets", label: "Widgets", icon: LayoutGrid },
  { slug: "locations", label: "Locations", icon: MapPin },
  { slug: "team", label: "Team", icon: Users },
  { slug: "settings", label: "Settings", icon: Settings },
];

function NavList({
  active,
  onNavigate,
}: {
  active: NavSlug;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV.map(({ slug, label, icon: Icon }) => {
        const isActive = slug === active;
        return (
          <button
            key={slug}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors",
              isActive
                ? "text-[var(--glass-accent)]"
                : "glass-muted hover:text-[var(--glass-text)]",
            )}
            style={isActive ? { background: "var(--glass-accent-soft)" } : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 font-semibold text-[var(--glass-text)]">
      <span
        className="grid h-8 w-8 place-items-center rounded-xl text-[var(--glass-accent-contrast)]"
        style={{ background: "var(--glass-accent)" }}
      >
        <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      Repulabs
    </div>
  );
}

function UserCard() {
  return (
    <div className="glass-surface glass-surface--subtle flex items-center gap-3 rounded-2xl p-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
        style={{ background: "var(--glass-accent-soft)", color: "var(--glass-accent)" }}
      >
        SD
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--glass-text)]">Summit Dental</p>
        <p className="truncate text-[12px] glass-subtle">Owner · 3 locations</p>
      </div>
    </div>
  );
}

export function GlassShell({
  active,
  mode,
  onModeChange,
  children,
}: {
  active: NavSlug;
  mode: GlassMode;
  onModeChange: (mode: GlassMode) => void;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <GlassCanvas mode={mode}>
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="glass-surface glass-surface--flush sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-0 border-r border-[var(--glass-border)] p-4 lg:flex">
          <div className="px-2 py-2">
            <Brand />
          </div>
          <div className="mt-4 flex-1 overflow-y-auto">
            <NavList active={active} />
          </div>
          <UserCard />
        </aside>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0"
              style={{ background: "rgba(8,12,24,0.5)" }}
              onClick={() => setDrawerOpen(false)}
            />
            <div className="glass-surface absolute inset-y-0 left-0 flex w-72 flex-col rounded-none border-0 border-r border-[var(--glass-border)] p-4">
              <div className="flex items-center justify-between px-2 py-2">
                <Brand />
                <button
                  type="button"
                  aria-label="Close menu"
                  className="glass-muted"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 flex-1 overflow-y-auto">
                <NavList active={active} onNavigate={() => setDrawerOpen(false)} />
              </div>
              <UserCard />
            </div>
          </div>
        ) : null}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <GlassBar>
            <div className="flex h-16 items-center gap-3 px-4 md:px-6">
              <button
                type="button"
                aria-label="Open menu"
                className="glass-muted lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <PanelLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div className="relative hidden min-w-0 flex-1 md:block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--glass-text-subtle)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <input
                  className="glass-input max-w-md pl-9"
                  placeholder="Search reviews, campaigns…"
                  aria-label="Search"
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <GlassModeToggle mode={mode} onChange={onModeChange} />
                <button
                  type="button"
                  aria-label="Notifications"
                  className="glass-btn h-10 w-10 px-0"
                >
                  <Bell strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          </GlassBar>

          <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </GlassCanvas>
  );
}
