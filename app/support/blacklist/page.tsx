import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import {
  addBlacklistKeyword,
  removeBlacklistKeyword,
  toggleBlacklistKeyword,
} from "@/lib/moderation/blacklist-actions";

export const dynamic = "force-dynamic";

export default async function BlacklistPage() {
  const { orgId } = await getOrgContext();

  const keywords = await withTenant(orgId, async (tx) =>
    tx.commentBlacklist.findMany({ orderBy: { createdAt: "desc" } }),
  );
  const totalHidden = keywords.reduce((s, k) => s + k.hiddenCount, 0);

  return (
    <AppShellServer topBar={<TopBar title="Keyword Blacklist" />}>
      <PageHeader
        title="Keyword Blacklist"
        description="Comments matching active keywords are auto-hidden."
        breadcrumb={[{"label":"Customer Hub"},{"label":"Blacklist"}]}
      />

        
      <div className="space-y-6">
<div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total keywords</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{keywords.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {keywords.filter((k) => k.isActive).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Comments hidden (total)</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{totalHidden}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add keyword</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addBlacklistKeyword} className="flex flex-wrap gap-3 items-end">
              <label className="block text-sm flex-1 min-w-[200px]">
                <span className="font-medium">Keyword or phrase</span>
                <input
                  name="keyword"
                  required
                  maxLength={120}
                  placeholder="scam, fraud, ripoff"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Match mode</span>
                <select
                  name="matchMode"
                  defaultValue="contains"
                  className="mt-1 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact word</option>
                  <option value="regex">Regex</option>
                </select>
              </label>
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Keywords ({keywords.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {keywords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No keywords yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Keyword</th>
                    <th className="text-left py-1">Mode</th>
                    <th className="text-left py-1">Status</th>
                    <th className="text-right py-1">Hidden</th>
                    <th className="text-right py-1">Added</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((k) => (
                    <tr key={k.id} className="border-t">
                      <td className="py-2 font-mono text-xs">{k.keyword}</td>
                      <td className="capitalize">{k.matchMode}</td>
                      <td>
                        <form action={toggleBlacklistKeyword}>
                          <input type="hidden" name="id" value={k.id} />
                          <button
                            type="submit"
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              k.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {k.isActive ? "Active" : "Inactive"}
                          </button>
                        </form>
                      </td>
                      <td className="text-right tabular-nums">{k.hiddenCount}</td>
                      <td className="text-right text-xs text-muted-foreground">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        <form action={removeBlacklistKeyword}>
                          <input type="hidden" name="id" value={k.id} />
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
