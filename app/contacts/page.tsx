import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addContact, deleteContact, importContactsCsv } from "@/lib/contacts/actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { orgId } = await getOrgContext();

  const contacts = await withTenant(orgId, async (tx) =>
    tx.contact.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );

  return (
    <AppShellServer topBar={<TopBar title="Contacts" />}>
      <PageHeader
        title="Contacts"
        description="Cross-channel customer pool."
        breadcrumb={[{"label":"Outreach","href":"/outreach"},{"label":"Contacts"}]}
      />

        
      <div className="space-y-6">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add contact manually</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addContact} className="space-y-3">
                <input type="hidden" name="source" value="manual" />
                <label className="block text-sm">
                  <span className="font-medium">Name</span>
                  <input
                    name="name"
                    maxLength={120}
                    placeholder="Alice Smith"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="font-medium">Email</span>
                    <input
                      type="email"
                      name="email"
                      placeholder="alice@example.com"
                      className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Phone</span>
                    <input
                      name="phone"
                      placeholder="+1 555 123 4567"
                      className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="font-medium">Tags</span>
                  <input
                    name="tags"
                    maxLength={500}
                    placeholder="vip, regular, first-time"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">Comma-separated</span>
                </label>
                <Button type="submit">Add contact</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Import from CSV</CardTitle>
              <CardDescription>One contact per line. Header row optional.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={importContactsCsv} className="space-y-3">
                <label className="block text-sm">
                  <span className="font-medium">Channel</span>
                  <select
                    name="channel"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    <option value="email">Emails</option>
                    <option value="sms">Phone numbers</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">CSV content</span>
                  <textarea
                    name="csvText"
                    required
                    rows={6}
                    placeholder={`email,name\nalice@example.com,Alice\nbob@example.com,Bob`}
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
                  />
                </label>
                <Button type="submit" variant="outline">Import</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All contacts ({contacts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Name</th>
                    <th className="text-left py-1">Email</th>
                    <th className="text-left py-1">Phone</th>
                    <th className="text-left py-1">Source</th>
                    <th className="text-left py-1">Tags</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2">{c.name ?? "—"}</td>
                      <td className="text-xs">{c.email ?? "—"}</td>
                      <td className="text-xs font-mono">{c.phone ?? "—"}</td>
                      <td className="text-xs capitalize">{c.source}</td>
                      <td className="text-xs">{c.tags.join(", ")}</td>
                      <td className="text-right">
                        <form action={deleteContact}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button type="submit" variant="ghost" size="sm">Delete</Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
