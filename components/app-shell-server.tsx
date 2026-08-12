import { getOrgContext } from "@/lib/auth/org-context";
import { buildDateRangeLabels } from "@/lib/date-range";
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

  // One label per selectable window for the topbar date pill, e.g.
  // "May 8 – Jun 7, 2026". Computed server-side (and passed down whole rather
  // than derived in the client island) so the browser's timezone can't produce
  // a different string than the SSR pass did.
  const dateLabels = buildDateRangeLabels(new Date());

  return (
    <AppShell
      orgName={org.name}
      planLabel={org.plan.toUpperCase()}
      topBar={topBar}
      crumbs={crumbs}
      biz={biz ?? org.name}
      dateLabels={dateLabels}
    >
      {children}
    </AppShell>
  );
}
