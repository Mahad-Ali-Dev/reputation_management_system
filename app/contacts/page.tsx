import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { Icon } from "@/components/shell/icon";
import { getOrgContext } from "@/lib/auth/org-context";
import { getContactStats } from "@/lib/contacts/queries";
import Link from "next/link";
import { Suspense } from "react";
import { ContactsTabs } from "./_components/contacts-tabs";
import { ContactsGettingStarted } from "./_components/getting-started";
import { ContactsPanel } from "./_components/contacts-panel";
import { SegmentsPanel } from "./_components/segments-panel";
import { ImportExportPanel } from "./_components/import-export-panel";

/**
 * Contact Directory — the tabbed CRM shell (Module 12).
 *
 * Server component: reads org context + stat counts, then renders the
 * Getting-Started zero-state (only at 0 contacts), the persistent 3-tab nav,
 * and the matching panel. All interactivity (search/filter/select/edit/modals)
 * lives in `'use client'` islands under `_components/` — this file does DB reads
 * only (RSC-safe).
 */

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  q?: string;
  source?: string;
  tag?: string;
  seg?: string;
  sort?: string;
  page?: string;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const tab = sp.tab === "segments" || sp.tab === "import" ? sp.tab : "contacts";

  const stats = await getContactStats(orgId);
  const isEmpty = stats.total === 0;

  return (
    <AppShellServer topBar={<TopBar title="Contacts" />} crumbs={["CRM", "Contacts"]}>
      <PageHeader
        kicker={`${stats.total.toLocaleString()} contact${stats.total === 1 ? "" : "s"}`}
        title="Contacts"
        description="Your cross-channel customer directory — every person who interacts with your business, in one place."
        breadcrumb={[{ label: "CRM" }, { label: "Contacts" }]}
        actions={
          <Link href="/contacts?tab=import" className="btn btn--sm">
            <Icon name="upload" size={13} />
            Import / Export
          </Link>
        }
      />

      {isEmpty && <ContactsGettingStarted />}

      <ContactsTabs active={tab} />

      <Suspense fallback={<div className="ds-card" style={{ height: 320 }} />}>
        {tab === "contacts" && (
          <ContactsPanel
            orgId={orgId}
            stats={stats}
            q={sp.q}
            source={sp.source}
            tag={sp.tag}
            seg={sp.seg}
            sort={sp.sort}
            page={sp.page}
          />
        )}
        {tab === "segments" && <SegmentsPanel orgId={orgId} />}
        {tab === "import" && <ImportExportPanel orgId={orgId} />}
      </Suspense>
    </AppShellServer>
  );
}
