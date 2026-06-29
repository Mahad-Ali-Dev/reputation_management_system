import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import Link from "next/link";
import { AutomationTab } from "./_components/automation-tab";
import { HistoryTab } from "./_components/history-tab";
import { HubTabs } from "./_components/hub-tabs";
import { OverviewTab } from "./_components/overview-tab";
import { SendTab } from "./_components/send-tab";
import { TemplatesTab } from "./_components/templates-tab";
import "./outreach.css";

/**
 * Review Requests hub — one route, 5 tabs (verifier fix #3: TabBar primitive),
 * rebuilt to the delivered design kit (designs/Review Request/**).
 *
 * Overview (campaign hub: programs · template studio · deliverability · next
 * send queue) · Send Request · Templates · Automation Rules · Sent History —
 * selected via `?tab=`. Each panel is server-rendered; the `TabBar` writes the
 * query param. Old /outreach/send + /outreach/templates index routes redirect
 * here; the per-template editor lives at /outreach/templates/[id].
 *
 * All page content sits under a `.rr` scope so the kit's purple palette + flat
 * canvas (outreach.css) never leak into the shared design system.
 */

export const dynamic = "force-dynamic";

const VALID = new Set(["overview", "send", "templates", "automation", "history"]);

/** Per-tab page-header copy + decorative hero, mapped from each kit mockup. */
const TAB_META: Record<
  string,
  { title: string; description: string; hero?: { src: string; w: number } }
> = {
  overview: {
    title: "Send the right request at the right moment",
    description: "Campaigns, templates, and deliverability in one review request hub.",
    hero: { src: "/assets/repulabs/review-request/hero-overview.svg", w: 200 },
  },
  send: {
    title: "Review requests",
    description: "Send a personalized review request by email or SMS — one-off or in bulk.",
    hero: { src: "/assets/repulabs/review-request/send-review.svg", w: 230 },
  },
  templates: {
    title: "Templates",
    description: "Reusable email + SMS bodies with merge tags.",
    hero: { src: "/assets/repulabs/review-request/hero-templates.svg", w: 260 },
  },
  automation: {
    title: "Automation rules",
    description: "Automate tasks and workflows to save time and stay consistent.",
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
  const tab = sp.tab && VALID.has(sp.tab) ? sp.tab : "overview";
  const meta = TAB_META[tab] ?? {
    title: "Review requests",
    description: "Send a personalized review request by email or SMS.",
  };

  const actions =
    tab === "overview" ? (
      <Link href="/outreach?tab=send" className="btn btn--pri">
        <Icon name="plus" size={13} />
        Create campaign
      </Link>
    ) : tab === "templates" ? (
      <Link href="/outreach/templates/new" className="btn btn--pri btn--pill">
        <Icon name="plus" size={13} />
        New template
      </Link>
    ) : tab === "automation" ? (
      <Link href="/outreach?tab=automation#create" className="btn btn--pri">
        <Icon name="plus" size={13} />
        Create automation
      </Link>
    ) : undefined;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Review Requests"]}>
      <div className="rr">
        <div className="rr-hero">
          <PageHeader
            kicker="Outreach"
            title={meta.title}
            description={meta.description}
            actions={
              <div className="row" style={{ gap: 14, alignItems: "center" }}>
                {meta.hero && (
                  // biome-ignore lint/performance/noImgElement: static brand SVG (decorative hero)
                  <img
                    src={meta.hero.src}
                    alt=""
                    aria-hidden="true"
                    width={meta.hero.w}
                    className="rr-hero__art"
                    style={{ width: meta.hero.w }}
                  />
                )}
                {actions}
              </div>
            }
          />
        </div>

        <HubTabs active={tab} />

        {tab === "overview" && <OverviewTab orgId={orgId} />}
        {tab === "send" && <SendTab orgId={orgId} />}
        {tab === "templates" && <TemplatesTab orgId={orgId} />}
        {tab === "automation" && <AutomationTab orgId={orgId} />}
        {tab === "history" && <HistoryTab orgId={orgId} />}
      </div>
    </AppShellServer>
  );
}
