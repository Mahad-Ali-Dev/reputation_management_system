import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";

/**
 * Connections route-level loading skeleton. Mirrors the page's chrome (header +
 * KPI row + accordion-shaped cards) using the v3 design system + AppShell so
 * the layout doesn't jump when the server-rendered page streams in. Pure
 * markup, no client JS.
 */
export default function ConnectionsLoading() {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "App Connections"]}>
      <PageHeader
        title="Connections"
        description="Pull customer data from your CRM and POS, listen on social, and let repulabs ship review requests at the moment of truth."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ds-card" style={{ height: 108 }}>
            <div className="stat">
              <div
                style={{ width: 70, height: 12, borderRadius: 6, background: "var(--surface-3)" }}
              />
              <div
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 7,
                  background: "var(--surface-3)",
                  marginTop: 12,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="col" style={{ gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ds-card" style={{ height: 64 }}>
            <div className="ds-card__head" style={{ borderBottom: "none" }}>
              <div className="row" style={{ gap: 12 }}>
                <div
                  style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-3)" }}
                />
                <div
                  style={{ width: 160, height: 14, borderRadius: 6, background: "var(--surface-3)" }}
                />
              </div>
              <div
                style={{ width: 100, height: 22, borderRadius: 999, background: "var(--surface-3)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </AppShellServer>
  );
}
