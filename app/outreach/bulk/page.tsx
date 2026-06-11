import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { BulkSendForm } from "./bulk-send-form";

export const dynamic = "force-dynamic";

export default async function BulkOutreachPage() {
  const { orgId } = await getOrgContext();

  const establishments = await withTenant(orgId, async (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer topBar={<TopBar title="Bulk Send" />}>
      <PageHeader
        title="Bulk Send"
        description="Upload a CSV of past customers."
        breadcrumb={[{ label: "Review Requests", href: "/outreach" }, { label: "Bulk" }]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload recipients</CardTitle>
            <CardDescription>
              One recipient per line, or CSV with header (<code>phone,name</code> or{" "}
              <code>email,name</code>). Max 5,000 rows per upload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BulkSendForm establishments={establishments} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suppression rules</CardTitle>
            <CardDescription>What gets skipped automatically</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>✓ Recipients who replied STOP to a previous SMS</li>
              <li>✓ Recipients who clicked unsubscribe in a previous email</li>
              <li>✓ Recipients you've contacted in the last 30 days (any channel)</li>
              <li>✓ Invalid phone numbers (non-E.164) or malformed email addresses</li>
              <li>✓ Duplicates within the upload</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
