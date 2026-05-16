import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { commitBulkReviewRequests } from "@/lib/outreach/bulk-actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

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
        breadcrumb={[{"label":"Outreach","href":"/outreach"},{"label":"Bulk"}]}
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
            <form action={commitBulkReviewRequests} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Establishment</span>
                  <select
                    name="establishmentId"
                    required
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Channel</span>
                  <select
                    name="channel"
                    required
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="font-medium">CSV content</span>
                <textarea
                  name="csvText"
                  required
                  rows={10}
                  placeholder={`phone,name\n+15551234567,Alice Smith\n+15559876543,Bob Jones\n+15550001111,`}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Phone numbers must be E.164 format (e.g. +15551234567). Email addresses are lowercased.
                </span>
              </label>

              <label className="block text-sm">
                <span className="font-medium">Send delay (hours)</span>
                <input
                  type="number"
                  name="scheduleHours"
                  min={0}
                  max={720}
                  defaultValue={0}
                  className="mt-1 w-32 rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  0 = send immediately. 24 = wait one day. Max 30 days.
                </span>
              </label>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>TCPA / CAN-SPAM compliance.</strong> For SMS sends, you must attest that
                every recipient has previously given prior express written consent to receive
                marketing texts from your business. Unsubscribe headers are added automatically.
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="consentAttested" className="mt-1" />
                <span>
                  I attest that every recipient in this list has given prior consent to receive
                  marketing messages from us (required for SMS, recommended for email).
                </span>
              </label>

              <Button type="submit">Queue bulk send</Button>
            </form>
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
