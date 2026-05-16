import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth/org-context";
import { sendSurveyInvite } from "@/lib/surveys/actions";
import { campaignStats, getCampaign } from "@/lib/surveys/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await getOrgContext();

  const [campaign, stats] = await Promise.all([
    getCampaign(orgId, id),
    campaignStats(orgId, id),
  ]);
  if (!campaign) notFound();

  return (
    <AppShellServer topBar={<TopBar title="Survey Campaign" />}>
      <PageHeader
        title="Survey Campaign"
        breadcrumb={[{"label":"Surveys","href":"/surveys"},{"label":"Detail"}]}
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {campaign.type.toUpperCase()} · {campaign.status} ·{" "}
            {campaign._count.tokens} sent · {campaign._count.responses} responses
          </p>
        </div>

        {/* NPS stats */}
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="NPS" value={stats.nps !== null ? stats.nps.toString() : "—"} highlight />
          <StatCard label="Promoters (9-10)" value={stats.promoters.toString()} />
          <StatCard label="Passives (7-8)" value={stats.passives.toString()} />
          <StatCard label="Detractors (0-6)" value={stats.detractors.toString()} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs uppercase text-muted-foreground">Auto review-requests</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.smartRouted}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Promoters routed to leave a Google review
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs uppercase text-muted-foreground">Internal alerts</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{stats.alerted}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Detractors flagged for follow-up
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Send invite */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Send invite</CardTitle>
            <CardDescription>
              Sends a single-use survey link that expires in 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={sendSurveyInvite} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <label className="text-sm flex-1 min-w-[200px]">
                <span className="font-medium">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="customer@example.com"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm w-48">
                <span className="font-medium">Name (optional)</span>
                <input
                  name="recipientName"
                  placeholder="Sarah"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <Button type="submit">Send</Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent responses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent responses</CardTitle>
          </CardHeader>
          <CardContent>
            {campaign.responses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No responses yet.</p>
            ) : (
              <div className="space-y-3">
                {campaign.responses.map((r) => {
                  const npsAnswer = r.answers.find((a) => a.question.type === "nps");
                  const textAnswer = r.answers.find((a) => a.question.type === "text");
                  const score = (npsAnswer?.value as { number?: number })?.number ?? null;
                  const text = (textAnswer?.value as { text?: string })?.text;
                  return (
                    <div key={r.id} className="rounded-md border bg-white p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <ScoreBadge score={score} />
                        <span className="text-muted-foreground">
                          {r.recipient ?? "anon"} · {new Date(r.createdAt).toLocaleString()}
                        </span>
                        {r.smartRouteTo && (
                          <RouteBadge route={r.smartRouteTo} />
                        )}
                      </div>
                      {text && (
                        <p className="mt-2 text-muted-foreground italic">"{text}"</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-3xl font-bold ${highlight ? "text-indigo-700" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const cls =
    score >= 9 ? "bg-emerald-50 text-emerald-700" :
    score >= 7 ? "bg-amber-50 text-amber-700" :
    "bg-red-50 text-red-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>
      {score}/10
    </span>
  );
}

function RouteBadge({ route }: { route: string }) {
  if (route === "review_request") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        → review request sent
      </span>
    );
  }
  if (route === "internal_alert") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        ⚠ alerted
      </span>
    );
  }
  return null;
}
