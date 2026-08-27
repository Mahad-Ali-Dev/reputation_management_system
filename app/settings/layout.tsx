import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import "./settings-kit.css";

/**
 * Settings shell — repulabs design-kit surface (designs/settings/**).
 *
 * A shared hero banner (title + subtitle + kit illustration) sits above the
 * section body. The whole tree is wrapped in .set-shell so the flat-lavender
 * canvas override (.app--canvas:has(.set-shell)) and the kit tokens apply
 * across every /settings sub-page.
 *
 * The overview hub (/settings) renders full-width beneath the hero; each
 * routed sub-page wraps its own content in <SettingsFrame> (sub-nav rail +
 * pane). This split matches the kit: the hub has no rail, sub-pages do.
 *
 * Sub-pages stay force-dynamic + fail-soft individually.
 */
export const dynamic = "force-dynamic";

const HERO_ART = "/assets/repulabs/settings/hero.svg";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Account"]}>
      <div className="set-shell">
        {/* ── Hero banner (shared across every settings page) ─────────── */}
        <header className="set-hero">
          <div className="set-hero__copy">
            <p className="set-hero__eyebrow">Workspace settings</p>
            <h1 className="set-hero__title">Settings</h1>
            <p className="set-hero__sub">
              Workspace, team, billing, brand, notifications, security and data — all in one place.
            </p>
          </div>
          {/* Decorative kit hero scene (baked bg → multiply blend). */}
          {/* biome-ignore lint/a11y/useAltText: decorative, aria-hidden below */}
          <img src={HERO_ART} alt="" aria-hidden="true" className="set-hero__art" />
        </header>

        {children}
      </div>
    </AppShellServer>
  );
}
