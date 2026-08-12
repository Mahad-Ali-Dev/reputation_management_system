import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import Link from "next/link";

/**
 * /restricted?feature=<label>
 *
 * Landing spot for a member whose `Membership.allowedTabs` doesn't include the
 * section they tried to open — either by clicking a locked sidebar item or by
 * navigating straight to a URL under it. The actual gate is server-side (see
 * `getOrgContext` in lib/auth/org-context.ts, which redirects here); this page
 * is just the explanation, same relationship the Pro "coming soon" lock has to
 * its own gate.
 *
 * Unlike a Pro lock, there's no upgrade CTA — the fix is a workspace admin
 * changing the member's access, not a purchase.
 */
export const dynamic = "force-dynamic";

export default async function RestrictedPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  const label = feature?.trim() || "This section";

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Restricted"]}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "48px 20px",
        }}
      >
        <div className="ds-card" style={{ maxWidth: 520, width: "100%", padding: "36px 32px" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--surface-3)",
              color: "var(--rl-muted)",
              marginBottom: 18,
            }}
          >
            <Icon name="lock" size={22} />
          </span>

          <h1
            style={{
              margin: "0 0 8px",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            You don&rsquo;t have access to {label}
          </h1>

          <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: 1.6, color: "var(--rl-muted)" }}>
            Your role in this workspace is limited to a specific set of tabs. If you need this
            one, ask a workspace owner or admin to update your access from{" "}
            <strong style={{ color: "var(--ink)" }}>Settings → Team</strong>.
          </p>

          <div
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: 18,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link href="/dashboard" className="btn btn--pri btn--sm" style={{ display: "inline-flex" }}>
              <Icon name="arrowR" size={13} />
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}
