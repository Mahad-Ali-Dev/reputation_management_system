import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { listCampaigns } from "@/lib/surveys/queries";
import Link from "next/link";

/**
 * Customer Surveys — repulabs v2 design.
 *
 * Real data: SurveyCampaign list with response counts.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  draft: "chip--out",
  active: "chip--ok",
  paused: "chip--warn",
  archived: "chip--out",
};

export default async function SurveysPage() {
  const { orgId } = await getOrgContext();

  const campaigns = await listCampaigns(orgId);
  const active = campaigns.filter((c) => c.status === "active").length;
  const totalResponses = campaigns.reduce((sum, c) => sum + (c._count?.responses ?? 0), 0);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Surveys"]}>
      <PageHeader
        kicker="NPS · CSAT · custom flows"
        title="Surveys"
        description="Send surveys after every interaction. Promoters get a Google review CTA; detractors land in your private inbox so you can fix it before they post."
        actions={
          <>
            <Link href="/surveys/coupons" className="btn">
              <Icon name="bolt" size={12} />
              Coupons
            </Link>
            <Link href="/surveys/new" className="btn btn--pri">
              <Icon name="plus" size={12} />
              New campaign
            </Link>
          </>
        }
      />

      <div className="grid-3" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Active campaigns" v={String(active)} d={`of ${campaigns.length} total`} />
        <Kpi l="Total responses" v={totalResponses.toLocaleString()} d="All campaigns · all time" />
        <Kpi l="Avg NPS" v="—" d="Computed from responses" />
      </div>

      {campaigns.length === 0 ? (
        <div
          className="ds-card"
          style={{ padding: 56, textAlign: "center", maxWidth: 540, marginInline: "auto" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              margin: "0 auto 18px",
              background: "var(--pri-50)",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="survey" size={26} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            No survey campaigns yet
          </h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Start with a 1-question NPS survey. Promoters auto-route to leave a Google review,
            detractors land in your private inbox.
          </p>
          <Link href="/surveys/new" className="btn btn--pri btn--lg" style={{ marginTop: 20 }}>
            <Icon name="plus" size={14} />
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="grid-2" style={{ gap: 14 }}>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/surveys/${c.id}`}
              className="ds-card ds-card--hover"
              style={{ padding: 20, textDecoration: "none", color: "inherit" }}
            >
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="lbl-mono" style={{ margin: 0 }}>
                  {c.type ?? "NPS"}
                </span>
                <span
                  className={`chip ${STATUS_TONE[c.status] ?? "chip--out"}`}
                  style={{ marginLeft: "auto" }}
                >
                  {c.status}
                </span>
              </div>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  margin: 0,
                }}
              >
                {c.name}
              </h3>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
                Created {c.createdAt.toLocaleDateString()}
              </div>
              <div
                className="row"
                style={{
                  marginTop: 18,
                  paddingTop: 12,
                  borderTop: "1px solid var(--line)",
                  gap: 18,
                }}
              >
                <div>
                  <div className="lbl-mono">Responses</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {(c._count?.responses ?? 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="lbl-mono">Tokens sent</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {(c._count?.tokens ?? 0).toLocaleString()}
                  </div>
                </div>
                <Icon
                  name="arrowR"
                  size={14}
                  style={{ marginLeft: "auto", color: "var(--rl-muted-2)" }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShellServer>
  );
}

function Kpi({ l, v, d }: { l: string; v: string; d: string }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div className="stat__value" style={{ fontSize: 30 }}>
          {v}
        </div>
        <div className="stat__delta">{d}</div>
      </div>
    </div>
  );
}
