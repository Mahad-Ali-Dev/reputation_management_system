import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { BulkScheduleForm } from "./bulk-form";

export const dynamic = "force-dynamic";

export default async function BulkSocialPostsPage() {
  const { orgId } = await getOrgContext();

  const establishments = await withTenant(orgId, async (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Engagement", "Social Studio", "Bulk schedule"]}
    >
      <PageHeader
        kicker="Plan a week in one paste"
        title="Bulk schedule"
        description="Paste one caption per line. We'll queue them across your selected platforms at fixed intervals."
      />

      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Queue captions</h3>
          <div className="ds-card__sub">
            One post per line. Each is scheduled relative to the start time using the interval below.
          </div>
        </div>
        <div className="ds-card__body">
          <BulkScheduleForm establishments={establishments} />
        </div>
      </div>
    </AppShellServer>
  );
}
