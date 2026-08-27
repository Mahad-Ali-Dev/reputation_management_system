import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { sendSurveyInvite } from "@/lib/surveys/actions";
import {
  campaignStats,
  getCampaign,
  listResponsesDetailed,
  npsDistribution,
  responseRateOverTime,
} from "@/lib/surveys/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResponsesCharts } from "../_components/responses-charts";
import { ResponsesTable } from "../_components/responses-table";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  draft: "chip--out",
  active: "chip--ok",
  paused: "chip--warn",
  archived: "chip--out",
};

export default async function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getOrgContext();

  const [campaign, stats, distribution, rateOverTime, responses] = await Promise.all([
    getCampaign(orgId, id),
    campaignStats(orgId, id),
    npsDistribution(orgId, id),
    responseRateOverTime(orgId, 30, id),
    listResponsesDetailed(orgId, id, 200),
  ]);
  if (!campaign) notFound();

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Customer Feedback", campaign.name]}>
      <PageHeader
        kicker={`${campaign.type.toUpperCase()} · ${campaign._count.tokens} sent · ${campaign._count.responses} responses`}
        title={campaign.name}
        breadcrumb={[{ label: "Surveys", href: "/surveys" }, { label: campaign.name }]}
        actions={
          <>
            <span className={`chip ${STATUS_TONE[campaign.status] ?? "chip--out"}`}>{campaign.status}</span>
            <Link href={`/surveys/templates/${campaign.id}`} className="btn btn--sm">
              <Icon name="edit" size={12} />
              Edit template
            </Link>
          </>
        }
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
        <Kpi label="NPS" value={stats.nps !== null ? String(stats.nps) : "—"} accent />
        <Kpi label="Promoters" value={String(stats.promoters)} sub="9–10" />
        <Kpi label="Passives" value={String(stats.passives)} sub="7–8" />
        <Kpi label="Detractors" value={String(stats.detractors)} sub="0–6" />
      </div>

      <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
        <div className="ds-card" style={{ padding: 18 }}>
          <div className="lbl-mono">Auto review-requests</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ok)", marginTop: 4 }}>{stats.smartRouted}</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
            Promoters routed to leave a Google review
          </div>
        </div>
        <div className="ds-card" style={{ padding: 18 }}>
          <div className="lbl-mono">Internal alerts</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--warn)", marginTop: 4 }}>{stats.alerted}</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
            Detractors flagged for follow-up
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ResponsesCharts distribution={distribution} rateOverTime={rateOverTime} avgNps={stats.nps} />
      </div>

      {/* Send invite (kept — it works) */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Send invite</div>
        <p className="dim" style={{ fontSize: 12.5, marginTop: 2, marginBottom: 12 }}>
          Sends a single-use survey link that expires in 14 days.
        </p>
        <form action={sendSurveyInvite} className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, flex: 1, minWidth: 200 }}>
            <span className="lbl">Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="customer@example.com"
              className="ds-textarea"
              style={{ fontFamily: "inherit", padding: "8px 10px" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, width: 180 }}>
            <span className="lbl">Name (optional)</span>
            <input name="recipientName" placeholder="Sarah" className="ds-textarea" style={{ fontFamily: "inherit", padding: "8px 10px" }} />
          </label>
          <button type="submit" className="btn btn--pri btn--sm">
            <Icon name="send" size={12} />
            Send
          </button>
        </form>
      </div>

      <ResponsesTable responses={responses} campaignId={campaign.id} />
    </AppShellServer>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{label}</div>
        <div className="stat__value" style={{ fontSize: 28, color: accent ? "var(--pri)" : undefined }}>
          {value}
        </div>
        {sub && <div className="stat__delta">{sub}</div>}
      </div>
    </div>
  );
}
