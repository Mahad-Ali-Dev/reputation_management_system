import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { orgId } = await getOrgContext();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [todayChats, avgRating, recentVisitors, activeNow] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.aiConversation.count({ where: { createdAt: { gte: since24h } } }),
      tx.liveChatVisitor.aggregate({
        where: { satisfaction: { not: null } },
        _avg: { satisfaction: true },
      }),
      tx.liveChatVisitor.findMany({
        orderBy: { lastActivityAt: "desc" },
        take: 50,
      }),
      tx.liveChatVisitor.findMany({
        where: {
          lastActivityAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },  // active in last 5 min
        },
        orderBy: { lastActivityAt: "desc" },
        take: 20,
      }),
    ]),
  );

  return (
    <AppShellServer topBar={<TopBar title="Live Chat Visitors" />}>
      <PageHeader
        title="Live Chat Visitors"
        description="Track chatbot visitors in real time."
        breadcrumb={[{"label":"Customer Hub"},{"label":"Visitors"}]}
      />

        
      <div className="space-y-6">
<div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Chats handled today</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{todayChats}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg satisfaction</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {avgRating._avg.satisfaction
                  ? `${Number(avgRating._avg.satisfaction).toFixed(1)} ★`
                  : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active now</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{activeNow.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Real-time activity</CardTitle>
            <CardDescription>Visitors active in the last 5 minutes</CardDescription>
          </CardHeader>
          <CardContent>
            {activeNow.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active visitors right now.</p>
            ) : (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Visitor</th>
                    <th className="text-left py-1">Current URL</th>
                    <th className="text-left py-1">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {activeNow.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="py-2 font-mono text-xs">{v.visitorId.slice(0, 12)}…</td>
                      <td className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {v.currentUrl ?? "—"}
                      </td>
                      <td className="text-xs">
                        {[v.city, v.country].filter(Boolean).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All visitors ({recentVisitors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {recentVisitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No visitor data yet. Visitors are tracked automatically when they interact with your chatbot widget.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Visitor</th>
                    <th className="text-left py-1">Contact</th>
                    <th className="text-left py-1">Tags</th>
                    <th className="text-left py-1">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVisitors.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="py-2 font-mono text-xs">{v.visitorId.slice(0, 12)}…</td>
                      <td className="text-xs">{v.email ?? v.phone ?? "—"}</td>
                      <td className="text-xs">{v.tags.join(", ") || "—"}</td>
                      <td className="text-xs text-muted-foreground">
                        {new Date(v.lastActivityAt).toLocaleString()}
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
