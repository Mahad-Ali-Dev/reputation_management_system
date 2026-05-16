import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function LiveChatInboxPage() {
  const { orgId } = await getOrgContext();

  const recentConversations = await withTenant(orgId, async (tx) =>
    tx.aiConversation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );

  return (
    <AppShellServer topBar={<TopBar title="LiveChat Inbox" />}>
      <PageHeader
        title="LiveChat Inbox"
        description="Real-time conversations from your website chatbot widget."
        breadcrumb={[{"label":"Customer Hub"},{"label":"Live Chat"}]}
      />

        
      <div className="space-y-6">
<div className="flex gap-2 border-b">
          <Link href="/support/comments" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-slate-900">
            Comments
          </Link>
          <Link href="/support/dms" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-slate-900">
            DMs
          </Link>
          <Link href="/support/live-chat" className="px-3 py-2 text-sm font-medium border-b-2 border-slate-900 text-slate-900">
            Live Chat
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent conversations ({recentConversations.length})</CardTitle>
            <CardDescription>From the chatbot widget on your website.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentConversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground mb-4">
                  No chatbot conversations yet. Embed the widget on your website to start collecting.
                </p>
                <Link
                  href="/ai"
                  className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium inline-block"
                >
                  Set up the chatbot →
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {recentConversations.map((c) => (
                  <li key={c.id} className="rounded-md border bg-white p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium font-mono text-xs">{c.visitorId.slice(0, 12)}…</span>
                        {c.leadEmail && <span className="ml-2 text-muted-foreground">{c.leadEmail}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="capitalize text-muted-foreground">{c.channel}</span>
                      {c.handedOffAt && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          handed off
                        </span>
                      )}
                      {c.terminatedReason && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          terminated: {c.terminatedReason.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
