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
import { SegmentsRail } from "./_components/segments-rail";
import { ImportExportPanel } from "./_components/import-export-panel";
import { ProfileDrawer, ProfileDrawerPlaceholder } from "./_components/profile-drawer";
import { StatCards } from "./_components/stat-cards";
import "./contacts.css";

/**
 * Contact Directory — the CRM workspace (Module 12).
 *
 * Server component: reads org context + stat counts, then renders the
 * Getting-Started zero-state (only at 0 contacts), the persistent 3-tab nav,
 * and the matching panel. The default Contacts tab is a 3-column workspace:
 * Segments rail (live, self-counting filters → `?seg=`) | Contacts table |
 * Profile drawer (driven by `?contact=<id>`, server-rendered). All
 * interactivity (search/filter/select/edit/modals) lives in `'use client'`
 * islands under `_components/` — this file does DB reads only (RSC-safe).
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
  contact?: string;
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
          <Link href="/contacts?tab=import" className="btn btn--pri btn--sm">
            <Icon name="upload" size={13} />
            Import contacts
          </Link>
        }
      />

      {isEmpty && <ContactsGettingStarted />}

      <ContactsTabs active={tab} />

      <Suspense fallback={<div className="ds-card" style={{ height: 320 }} />}>
        {tab === "contacts" && (
          <>
            <StatCards stats={stats} />
            <div className="crm-workspace">
              <div className="crm-rail-col">
                <SegmentsRail
                  orgId={orgId}
                  total={stats.total}
                  currentSeg={sp.seg}
                  baseParams={{ q: sp.q, source: sp.source, tag: sp.tag, contact: sp.contact }}
                />
              </div>
              <div className="crm-main">
                <ContactsPanel
                  orgId={orgId}
                  q={sp.q}
                  source={sp.source}
                  tag={sp.tag}
                  seg={sp.seg}
                  sort={sp.sort}
                  page={sp.page}
                />
              </div>
              <div className="crm-drawer-col">
                {sp.contact ? (
                  <ProfileDrawer
                    orgId={orgId}
                    contactId={sp.contact}
                    closeHref={buildCloseHref(sp)}
                  />
                ) : (
                  <ProfileDrawerPlaceholder />
                )}
              </div>
            </div>
          </>
        )}
        {tab === "segments" && <SegmentsPanel orgId={orgId} />}
        {tab === "import" && <ImportExportPanel orgId={orgId} />}
      </Suspense>
    </AppShellServer>
  );
}

/** The current URL with the `contact` param removed (drawer close link). */
function buildCloseHref(sp: SearchParams): string {
  const p = new URLSearchParams();
  for (const key of ["q", "source", "tag", "seg", "sort", "page"] as const) {
    const v = sp[key];
    if (v) p.set(key, v);
  }
  const qs = p.toString();
  return qs ? `/contacts?${qs}` : "/contacts";
}
