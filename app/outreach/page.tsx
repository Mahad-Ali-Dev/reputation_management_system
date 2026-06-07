import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { AutomationTab } from "./_components/automation-tab";
import { HistoryTab } from "./_components/history-tab";
import { HubTabs } from "./_components/hub-tabs";
import { SendTab } from "./_components/send-tab";
import { TemplatesTab } from "./_components/templates-tab";

/**
 * Review Requests hub — one route, 4 tabs (verifier fix #3: TabBar primitive).
 *
 * Send Request · Templates · Automation Rules · Sent History — selected via
 * `?tab=`. Each panel is server-rendered; the `TabBar` writes the query param.
 * No "Go Back" affordance (AC). Old /outreach/send + /outreach/templates index
 * routes redirect here; the per-template editor lives at /outreach/templates/[id].
 */

export const dynamic = "force-dynamic";

const VALID = new Set(["send", "templates", "automation", "history"]);
const TAB_META: Record<string, { title: string; description: string }> = {
  send: {
    title: "Review requests",
    description: "Send a personalized review request by email or SMS — one-off or in bulk.",
  },
  templates: {
    title: "Templates",
    description: "Reusable email + SMS bodies with merge tags.",
  },
  automation: {
    title: "Automation rules",
    description: "Automatically request reviews after a purchase or appointment.",
  },
  history: {
    title: "Sent history",
    description: "Every request — manual and automated — with live delivery statuses.",
  },
};

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const tab = sp.tab && VALID.has(sp.tab) ? sp.tab : "send";
  const meta = TAB_META[tab] ?? {
    title: "Review requests",
    description: "Send a personalized review request by email or SMS.",
  };

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Review Requests"]}>
      <PageHeader kicker="Outreach" title={meta.title} description={meta.description} />
      <HubTabs active={tab} />

      {tab === "send" && <SendTab orgId={orgId} />}
      {tab === "templates" && <TemplatesTab orgId={orgId} />}
      {tab === "automation" && <AutomationTab orgId={orgId} />}
      {tab === "history" && <HistoryTab orgId={orgId} />}
    </AppShellServer>
  );
}
