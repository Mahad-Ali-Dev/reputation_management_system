import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const FOLDERS = [
  { key: "open", label: "Open" },
  { key: "unread", label: "Unread" },
  { key: "starred", label: "Starred" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
  { key: "spam", label: "Spam" },
] as const;

export default async function DmsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { orgId } = await getOrgContext();

  const { folder } = await searchParams;
  const active = (folder ?? "open") as (typeof FOLDERS)[number]["key"];

  const where =
    active === "all"
      ? {}
      : active === "unread"
        ? { unreadCount: { gt: 0 } }
        : { status: active };

  const threads = await withTenant(orgId, async (tx) =>
    tx.inboxThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    }),
  );

  return (
    <AppShellServer topBar={<TopBar title="DM Inbox" />}>
      <PageHeader
        title="DM Inbox"
        description="Direct messages from Facebook, Instagram, email."
        breadcrumb={[{"label":"Customer Hub"},{"label":"DMs"}]}
      />

        
      <div className="space-y-6">
<div className="flex gap-2 border-b">
          <Link href="/support/comments" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-slate-900">
            Comments
          </Link>
          <Link href="/support/dms" className="px-3 py-2 text-sm font-medium border-b-2 border-slate-900 text-slate-900">
            DMs
          </Link>
          <Link href="/support/live-chat" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-slate-900">
            Live Chat
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
          <aside className="space-y-1">
            {FOLDERS.map((f) => (
              <Link
                key={f.key}
                href={`/support/dms?folder=${f.key}`}
                className={`block rounded-md px-3 py-2 text-sm ${
                  active === f.key ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </aside>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{FOLDERS.find((f) => f.key === active)?.label} ({threads.length})</CardTitle>
              <CardDescription>
                {threads.length === 0
                  ? "No conversations yet. Connect a channel to start receiving DMs."
                  : "Tap a conversation to view the full thread."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {threads.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground mb-4">
                    Once you connect Facebook / Instagram / Email, conversations appear here.
                  </p>
                  <Link
                    href="/connections"
                    className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium inline-block"
                  >
                    Connect channels →
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {threads.map((t) => (
                    <li key={t.id} className="rounded-md border bg-white p-3 hover:shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold capitalize">{t.channel}</span>
                            {t.subject && <span className="text-muted-foreground">· {t.subject}</span>}
                          </div>
                          {t.lastMessageBody && (
                            <p className="mt-1 text-sm line-clamp-2 text-slate-700">{t.lastMessageBody}</p>
                          )}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {new Date(t.lastMessageAt).toLocaleString()}
                          </p>
                        </div>
                        {t.unreadCount > 0 && (
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {t.unreadCount}
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
      </div>
    </AppShellServer>
  );
}
