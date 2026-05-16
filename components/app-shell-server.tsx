import { getOrgContext } from "@/lib/auth/org-context";
import { AppShell } from "./app-shell";

/**
 * Server-side wrapper around <AppShell>. Reads the per-request memoized org
 * context (see lib/auth/org-context.ts) so we don't re-query Postgres for the
 * same org row on every page that uses this shell.
 *
 * Redirects to /login if there's no session.
 *
 * Usage:
 *   <AppShellServer topBar={<PageTitle title="Dashboard" />}>
 *     ...page content...
 *   </AppShellServer>
 */
export async function AppShellServer({
  children,
  topBar,
  crumbs,
  biz,
}: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  crumbs?: string[];
  biz?: string;
}) {
  const { org } = await getOrgContext();

  return (
    <AppShell
      orgName={org.name}
      planLabel={org.plan.toUpperCase()}
      topBar={topBar}
      crumbs={crumbs}
      biz={biz ?? org.name}
    >
      {children}
    </AppShell>
  );
}
