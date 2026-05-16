import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SendOneOffForm } from "./form";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function SendOneOffPage() {
  const { orgId } = await getOrgContext();

  const [establishments, org] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.organization.findUnique({
        where: { id: orgId },
        select: { name: true, logoUrl: true },
      }),
    ]),
  );

  return (
    <AppShellServer topBar={<TopBar title="Send One-Off Review Request" />}>
      <PageHeader
        title="Send One-Off Review Request"
        description="Live preview as you compose."
        breadcrumb={[{"label":"Outreach","href":"/outreach"},{"label":"Send"}]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-lg">Compose</CardTitle>
            <CardDescription>Live preview updates as you type.</CardDescription>
          </CardHeader>
          <CardContent>
            <SendOneOffForm
              establishments={establishments}
              businessName={org?.name ?? "Your Business"}
              logoUrl={org?.logoUrl ?? null}
            />
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
