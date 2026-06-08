import Link from "next/link";
import { EmptyIllustration } from "@/components/empty-state";
import { Icon } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { getThreadWithMessages, listThreads, type ThreadListItem } from "@/lib/inbox/queries";
import { softInbox } from "@/lib/inbox/fail-soft";
import { ConversationsWorkspace } from "./conversations-workspace";

/**
 * Conversations tab (server). Fetches the thread list (filtered by channel /
 * status / search) + the selected thread with its messages + the org's
 * teammates (for the assignee picker), then renders the 3-column
 * <ConversationsWorkspace/> client island with serialized props.
 *
 * RSC-safe: DB reads only. Shows an empty / connect-a-channel state when there
 * are no threads at all and nothing is connected.
 */

type Teammate = { id: string; name: string };

async function loadTeammates(orgId: string): Promise<Teammate[]> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const rows = await tx.membership.findMany({
          where: { role: { in: ["owner", "admin", "manager", "member"] } },
          select: { user: { select: { id: true, name: true, email: true } } },
          take: 50,
        });
        return rows
          .map((r) => ({
            id: r.user.id,
            name: r.user.name || r.user.email || "Teammate",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }),
    [],
    { event: "inbox.loadTeammates.failed", swallowAll: true, context: { orgId } },
  );
}

export async function ConversationsPanel({
  orgId,
  channel,
  status,
  q,
  threadId,
  openCount,
  perChannel,
  entitled,
}: {
  orgId: string;
  channel?: string;
  status?: string;
  q?: string;
  threadId?: string;
  openCount: number;
  perChannel: Record<string, number>;
  entitled: boolean;
}) {
  const [threads, teammates] = await Promise.all([
    listThreads({ orgId, channel, status, q, take: 100 }),
    loadTeammates(orgId),
  ]);

  // Resolve the selected thread: explicit ?thread= wins; else the first in list.
  const selectedId = threadId && threads.some((t) => t.id === threadId)
    ? threadId
    : threads[0]?.id;

  const selected = selectedId
    ? await getThreadWithMessages({ orgId, threadId: selectedId })
    : null;

  // Empty state: nothing at all + no active filter/search → connect-a-channel.
  const noFilters = !channel && (!status || status === "open") && !q;
  if (threads.length === 0 && noFilters) {
    return <ConversationsEmpty />;
  }

  return (
    <ConversationsWorkspace
      threads={threads as ThreadListItem[]}
      selectedThreadId={selectedId ?? null}
      selectedThread={selected?.thread ?? null}
      selectedMessages={selected?.messages ?? []}
      teammates={teammates}
      filters={{ channel: channel ?? "all", status: status ?? "open", q: q ?? "" }}
      perChannel={perChannel}
      openCount={openCount}
      aiEnabled={entitled}
    />
  );
}

function ConversationsEmpty() {
  return (
    <div className="ds-card">
      <div className="ds-card__body dim" style={{ textAlign: "center", padding: 56 }}>
        <EmptyIllustration name="messages-empty" />
        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 14, color: "var(--ink)" }}>
          No conversations yet
        </h3>
        <p style={{ fontSize: 13, marginTop: 6, maxWidth: 460, marginInline: "auto" }}>
          Connect Facebook, Instagram, email, or embed the website chat widget to start
          receiving messages. Every DM, chat, and callback lands in this one queue.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 18 }}>
          <Link href="/connections" className="btn btn--pri" style={{ textDecoration: "none" }}>
            <Icon name="plug" size={13} />
            Connect channels
          </Link>
          <Link href="/support?tab=live-chat" className="btn btn--sm" style={{ textDecoration: "none" }}>
            Set up website chat
          </Link>
        </div>
      </div>
    </div>
  );
}
