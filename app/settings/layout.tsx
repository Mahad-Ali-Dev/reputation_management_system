import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { SettingsNav } from "./_components/settings-nav";

/**
 * Settings shell — sectioned IA with a sticky left sub-nav and a content pane.
 *
 * Every /settings/<section> route renders inside this shell, so the nav,
 * breadcrumb and page header stay consistent and only the section panel
 * swaps. Sub-pages stay force-dynamic + fail-soft individually.
 */
export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings"]}>
      <PageHeader
        kicker="Workspace settings"
        title="Settings"
        description="Workspace, team, billing, brand, notifications, security and data — all in one place."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px minmax(0, 1fr)",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        <SettingsNav />
        <div className="col" style={{ gap: 16 }}>
          {children}
        </div>
      </div>
    </AppShellServer>
  );
}
