import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import {
  disputeStatCards,
  listDisputesByTab,
  type DisputeWithReview,
} from "@/lib/reviews/dispute-queries";
import { statusView, violationLabel, isResubmittable } from "@/lib/reviews/dispute-meta";

export const dynamic = "force-dynamic";

/**
 * Dispute Center — the two-tab (Active / Resolved) list (Module 08).
 *
 * Active tab: four stat cards (Total Filed / Under Review / Removed / Rejected)
 * + a table of in-flight disputes. Resolved tab: the historical table with a
 * Re-submit action on rejected rows. Primary "File New Dispute" → the wizard.
 *
 * Tabs are server-driven via `?tab=active|resolved` (a page-local pill row, the
 * spec's TabBar) so each tab renders server-side without loading both at once.
 * The native review snippet is rendered verbatim (no restyle).
 */
export default async function DisputeCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const tab: "active" | "resolved" = sp.tab === "resolved" ? "resolved" : "active";

  const [stats, rows] = await Promise.all([disputeStatCards(orgId), listDisputesByTab(orgId, tab)]);

  return (
    <AppShellServer topBar={<TopBar title="Dispute Center" />}>
      <PageHeader
        title="Dispute Center"
        description="Challenge fake, off-topic, or policy-violating reviews — with an AI-drafted, Knowledge Base-grounded argument."
        breadcrumb={[{ label: "Reviews", href: "/reviews" }, { label: "Disputes" }]}
        actions={
          <Link href="/reviews/dispute/new" className="btn btn--pri">
            File New Dispute
          </Link>
        }
      />

      <div className="space-y-6">
        {/* Stat cards (shown on both tabs — they describe the whole pipeline). */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total Filed" value={stats.total} />
          <StatCard label="Under Review" value={stats.underReview} tone="warn" />
          <StatCard label="Removed" value={stats.removed} tone="ok" />
          <StatCard label="Rejected" value={stats.rejected} tone="bad" />
        </div>

        {/* Tab pill row (server-driven). */}
        <div className="tabs" role="tablist" aria-label="Dispute status">
          <TabLink label="Active Disputes" tab="active" current={tab} />
          <TabLink label="Resolved" tab="resolved" current={tab} />
        </div>

        {rows.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <DisputeTable rows={rows} tab={tab} />
        )}
      </div>
    </AppShellServer>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  const valueColor =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-[var(--ink)]";
  return (
    <div className="ds-card" style={{ padding: "14px 16px" }}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</div>
    </div>
  );
}

function TabLink({
  label,
  tab,
  current,
}: {
  label: string;
  tab: "active" | "resolved";
  current: "active" | "resolved";
}) {
  const isActive = tab === current;
  return (
    <Link
      href={`/reviews/dispute?tab=${tab}`}
      role="tab"
      aria-selected={isActive}
      className={isActive ? "tabs__t is-active" : "tabs__t"}
    >
      {label}
    </Link>
  );
}

function DisputeTable({ rows, tab }: { rows: DisputeWithReview[]; tab: "active" | "resolved" }) {
  return (
    <div className="ds-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Review</th>
              <th className="px-4 py-3 font-medium">Reviewer</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Violation</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Filed</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const view = statusView(d.status);
              return (
                <tr key={d.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-3 max-w-[260px]">
                    <p className="line-clamp-2 text-muted-foreground">
                      {d.review?.body ?? "(no review text)"}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{d.review?.reviewerName ?? "Anonymous"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-amber-400">
                    {"★".repeat(Math.max(0, Math.min(5, d.review?.rating ?? 0)))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{violationLabel(d.violationType)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${view.badgeClass}`}>
                      {view.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="inline-flex gap-3">
                      <Link href={`/reviews/dispute/${d.id}`} className="text-[var(--pri)] hover:underline">
                        View
                      </Link>
                      {tab === "resolved" && isResubmittable(d.status) && (
                        <Link
                          href={`/reviews/dispute/new?step=argument&reviewId=${d.reviewId}${
                            d.violationType ? `&violationType=${d.violationType}` : ""
                          }&resubmit=1`}
                          className="text-[var(--pri)] hover:underline"
                        >
                          Re-submit
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: "active" | "resolved" }) {
  if (tab === "resolved") {
    return (
      <div className="ds-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <p className="text-sm text-muted-foreground">No resolved disputes yet.</p>
      </div>
    );
  }
  return (
    <div className="ds-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <EmptyIllustration name="disputes-empty" style={{ marginBottom: 12 }} />
      <h3 className="text-base font-semibold text-[var(--ink)]">No disputes yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        When a review is fake, off-topic, or violates Google&apos;s policies, file a dispute to
        request its removal. We&apos;ll help you draft a strong, factual argument.
      </p>
      <div className="mt-4">
        <Link href="/reviews/dispute/new" className="btn btn--pri">
          File your first dispute
        </Link>
      </div>
    </div>
  );
}
