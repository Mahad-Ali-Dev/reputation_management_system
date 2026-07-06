import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { Icon } from "@/components/shell/icon";
import { getOrgContext } from "@/lib/auth/org-context";
import { getContactStats } from "@/lib/contacts/queries";
import Link from "next/link";
import { Suspense } from "react";
import { ContactsTabs } from "./_components/contacts-tabs";
import { ContactsPanel } from "./_components/contacts-panel";
import { ContactsEmpty } from "./_components/contacts-empty";
import { SegmentsPanel } from "./_components/segments-panel";
import { SegmentsRail } from "./_components/segments-rail";
import { ImportExportPanel } from "./_components/import-export-panel";
import { ProfileDrawer, ProfileDrawerPlaceholder } from "./_components/profile-drawer";
import { StatCards } from "./_components/stat-cards";
import "./contacts.css";

/**
 * Contact Directory — the CRM workspace (Module 12), re-skinned to the delivered
 * design kit (designs/contact directory/**). Prefix `.cd-`; flat #FBFCFF canvas.
 *
 * Server component: reads org context + stat counts, then renders the kit header
 * (title + breadcrumb + violet "Import contacts"), the persistent 3-tab
 * underline nav (`?tab=`), and the matching panel:
 *   - contacts (default): kit KPI row + the live 3-column workspace
 *     (Segments rail | Contacts table | Profile drawer). When the directory is
 *     empty it swaps to the kit onboarding panel (`<ContactsEmpty/>`).
 *   - segments: the 7 self-counting segment cards + live custom-segments table.
 *   - import:   CSV import + Shopify sync + export controls.
 * All interactivity (search/filter/select/edit/import/export/modals) lives in
 * `'use client'` islands under `_components/`; this file does DB reads only.
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

  const realStats = await getContactStats(orgId);
  // Dev-only zero-state preview (?cdEmpty=1) — lets QA shoot the empty states
  // without mutating the DB. No effect in production.
  const forceEmpty =
    process.env.NODE_ENV !== "production" &&
    (sp as Record<string, string | undefined>).cdEmpty === "1";
  const stats = forceEmpty ? { total: 0, newThisMonth: 0, active30d: 0, vip: 0 } : realStats;
  const isEmpty = forceEmpty || stats.total === 0;

  return (
    <AppShellServer topBar={<TopBar title="Contacts" />} crumbs={["CRM", "Contacts"]}>
      <div className="cd-page">
        <PageHeader
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

        <ContactsTabs active={tab} />

        <Suspense fallback={<div className="cd-card" style={{ height: 320 }} />}>
          {tab === "contacts" && (
            <>
              <StatCards stats={stats} />
              {isEmpty ? (
                <ContactsEmpty />
              ) : (
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
              )}
            </>
          )}
          {tab === "segments" && <SegmentsPanel orgId={orgId} isEmptyDirectory={isEmpty} />}
          {tab === "import" && <ImportExportPanel orgId={orgId} />}
        </Suspense>
      </div>
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
