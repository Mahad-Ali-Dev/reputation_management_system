import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { createSurveyCampaign } from "@/lib/surveys/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export default async function NewSurveyPage() {
  const { orgId } = await getOrgContext();

  const establishments = await withTenant(orgId, async (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer topBar={<TopBar title="New Survey Campaign" />}>
      <PageHeader
        title="New Survey Campaign"
        breadcrumb={[{"label":"Surveys","href":"/surveys"},{"label":"New"}]}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>New NPS campaign</CardTitle>
            <CardDescription>
              A 2-question NPS survey: score (0–10) + free-text follow-up.{" "}
              <strong>Smart-route is on:</strong> 9-10 scores get an auto-emailed review request,
              0-6 scores trigger an internal alert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createSurveyCampaign} className="space-y-4">
              <label className="block text-sm">
                <span className="font-medium">Name</span>
                <input
                  name="name"
                  required
                  placeholder="Post-visit NPS — Q2 2026"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Establishment</span>
                <select
                  name="establishmentId"
                  required
                  defaultValue={establishments[0]?.id}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                >
                  {establishments.length === 0 && <option value="">Add one first</option>}
                  {establishments.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Follow-up prompt (optional)</span>
                <input
                  name="followUpPrompt"
                  placeholder="What's the main reason for your score?"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Leave blank for the default prompt.
                </span>
              </label>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={establishments.length === 0}>
                  Create campaign
                </Button>
                <Button asChild variant="outline" type="button">
                  <Link href="/surveys">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
