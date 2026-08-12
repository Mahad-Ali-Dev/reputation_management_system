import { listUserWorkspaces } from "@/lib/auth/active-org";
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
 *
 * The topbar date pill writes `?range=7|30|90`. Pages that show date-windowed
 * data read it back with `normalizeRangeDays(searchParams.range)` and pass the
 * window into their queries — see /dashboard, /reviews and /analytics.
 */
export async function AppShellServer({
  children,
  topBar,
  crumbs,
}: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  crumbs?: string[];
}) {
  const { org, orgId, userId } = await getOrgContext();

  // One label per selectable window for the topbar date pill, e.g.
  // "May 8 – Jun 7, 2026". Computed server-side (and passed down whole rather
  // than derived in the client island) so the browser's timezone can't produce
  // a different string than the SSR pass did.
  const dateLabels = buildDateRangeLabels(new Date());

  // Every workspace this user belongs to, for the sidebar switcher. Almost
  // always a list of one (rendering nothing extra) — more than one shows up
  // for a user who owns their own workspace AND accepted a team invite into
  // another, since there was previously no way back to their own org once the
  // active-org cookie was pointed at the invited one.
  const workspaces = await listUserWorkspaces(userId, orgId);

  return (
    <AppShell
      orgName={org.name}
      planLabel={org.plan.toUpperCase()}
      topBar={topBar}
      crumbs={crumbs}
      dateLabels={dateLabels}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}
