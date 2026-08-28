import { Suspense } from "react";
import "../support-kit.css";
import { withTenant } from "@/lib/db/with-tenant";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { ProGate } from "@/components/pro-gate";
import { channelCounts, countNeedsAttention, countOpenThreads } from "@/lib/inbox/queries";
import { softInbox } from "@/lib/inbox/fail-soft";
import { commentStatusCounts, listComments } from "@/lib/inbox/comments";
import { getModerationConfig } from "@/lib/moderation/rules";
import { listModerationQueue, moderationQueueCounts } from "@/lib/moderation/queue";
import { listAutomationRules } from "@/lib/chat/automation-actions";
import { InboxTabsBar } from "./inbox-tabs-bar";
import { ConversationsPanel } from "./conversations-panel";
import { CommentsPanel, type CommentRowView } from "./comments-panel";
import { ModerationPanel, type QueueItemView } from "./moderation-panel";
import { LiveChatPanel } from "./livechat-panel";
import { AutomationsPanel } from "./automations-panel";
import { MeetingsPanel, type MeetingRowView } from "./meetings-panel";
import { AnalyticsPanel } from "./analytics-panel";
import { countNewMeetingRequests } from "@/lib/inbox/meetings";
import { isMissingRelation } from "@/lib/inbox/fail-soft";
import { MEETING_STATUSES, type MeetingStatus } from "../meetings/constants";
import type {
  KeywordRuleView,
  ModerationConfigView,
} from "./moderation-rule-form";

/**
 * Inbox shell (server) — the persistent six-tab hub.
 *
 * Renders the client <InboxTabsBar> (interactive nav with badges, driven by
 * `?tab=`) and the active tab's panel. Conversations is my (this coder's) server
 * panel. Comments + Moderation are the sibling coder's CLIENT islands, which take
 * already-serialized data — so the shell does the RSC data-fetch here and feeds
 * them their view-shaped props (keeping the page RSC-safe; interactivity lives in
 * those islands). Live Chat / Automation / Analytics deep-link to the existing
 * standalone pages for now (phase 3 builds Live Chat fully).
 *
 * All loaders are fail-soft (a not-yet-migrated relation degrades to empty rather
 * than 500-ing the inbox).
 */

export type InboxSearchParams = {
  tab?: string;
  sub?: string;
  channel?: string;
  status?: string;
  q?: string;
  thread?: string;
  /** Live Chat tab: the selected webchat session (AiConversation id). */
  session?: string;
  /** Comments tab: source filter — "ad" (boosted-post comments) | "organic". */
  source?: string;
};

const VALID_TABS = new Set([
  "conversations",
  "comments",
  "live-chat",
  "moderation",
  "automation",
  "meetings",
  "analytics",
]);

export async function InboxShell({
  orgId,
  searchParams,
}: {
  orgId: string;
  searchParams: InboxSearchParams;
}) {
  const tab = searchParams.tab && VALID_TABS.has(searchParams.tab) ? searchParams.tab : "conversations";

  const [openCount, needsAttention, newMeetings, entitled] = await Promise.all([
    countOpenThreads(orgId),
    countNeedsAttention(orgId),
    countNewMeetingRequests(orgId),
    isOrgEntitled(orgId),
  ]);

  // ENTITLEMENT GATE (QA BUG-044). The Unified Inbox is a paid feature
  // (`advanced_inbox`), but nothing enforced it: entitlement was read only
  // inside ConversationsTab, and purely to toggle `aiEnabled`. Every other tab
  // — meetings, live-chat, comments, moderation, automation, analytics —
  // rendered in full on any plan. And because /support/{meetings,dms,live-chat,
  // comments,analytics,blacklist,chat-automation,customers} all redirect into
  // `/support?tab=…`, each of those was a way in.
  //
  // Gating HERE covers every tab and every one of those redirects in one place,
  // so a new tab or sub-route can't silently reopen the hole.
  if (!entitled) {
    return (
      <div className="uinbox">
        <ProGate
          feature="advanced_inbox"
          hasAccess={false}
          mode="replace"
          title="Message Center is a Pro feature"
          description="Upgrade to bring reviews, DMs, comments, live chat and meeting requests into one workspace with AI replies and automation."
        >
          <span />
        </ProGate>
      </div>
    );
  }

  return (
    <div className="uinbox">
      <InboxTabsBar
        active={tab}
        needsAttention={needsAttention}
        openCount={openCount}
        newMeetings={newMeetings}
      />

      {tab === "conversations" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <ConversationsTab orgId={orgId} searchParams={searchParams} openCount={openCount} />
        </Suspense>
      )}

      {tab === "comments" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <CommentsTab orgId={orgId} status={searchParams.status} source={searchParams.source} />
        </Suspense>
      )}

      {tab === "moderation" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <ModerationTab orgId={orgId} sub={searchParams.sub} status={searchParams.status} />
        </Suspense>
      )}

      {tab === "live-chat" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <LiveChatPanel
            orgId={orgId}
            sub={searchParams.sub}
            sessionId={searchParams.session}
          />
        </Suspense>
      )}

      {tab === "automation" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <AutomationTab orgId={orgId} />
        </Suspense>
      )}

      {tab === "meetings" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <MeetingsTab orgId={orgId} status={searchParams.status} />
        </Suspense>
      )}

      {tab === "analytics" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <AnalyticsPanel orgId={orgId} />
        </Suspense>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Tab loaders (server) — each fetches the data its panel needs and maps it to
 * the panel's view shape. Conversations is my own panel; Comments / Moderation
 * feed the sibling islands.
 * ------------------------------------------------------------------------ */

async function ConversationsTab({
  orgId,
  searchParams,
  openCount,
}: {
  orgId: string;
  searchParams: InboxSearchParams;
  openCount: number;
}) {
  const [perChannel, entitled] = await Promise.all([
    channelCounts(orgId),
    isOrgEntitled(orgId),
  ]);
  return (
    <ConversationsPanel
      orgId={orgId}
      channel={searchParams.channel}
      status={searchParams.status}
      q={searchParams.q}
      threadId={searchParams.thread}
      openCount={openCount}
      perChannel={perChannel}
      entitled={entitled}
    />
  );
}

async function CommentsTab({
  orgId,
  status,
  source,
}: {
  orgId: string;
  status?: string;
  source?: string;
}) {
  const sourceFilter = source === "ad" || source === "organic" ? source : "all";
  const [rows, counts] = await Promise.all([
    softInbox(() => listComments({ orgId, status, source: sourceFilter }), [], {
      event: "inbox.shell.comments.list_failed",
      swallowAll: true,
      context: { orgId },
    }),
    softInbox(() => commentStatusCounts(orgId), {} as Record<string, number>, {
      event: "inbox.shell.comments.counts_failed",
      swallowAll: true,
      context: { orgId },
    }),
  ]);

  // Map CommentRow (Date) → CommentRowView (ISO; only the fields the island uses).
  const view: CommentRowView[] = rows.map((c) => ({
    id: c.id,
    platform: c.platform,
    isHideable: c.isHideable,
    isSocial: c.isSocial,
    isAd: c.isAd,
    authorName: c.authorName,
    authorAvatarUrl: c.authorAvatarUrl,
    body: c.body,
    status: c.status,
    aiSuggested: c.aiSuggested,
    externalPostId: c.externalPostId,
    postedAt: c.postedAt.toISOString(),
  }));

  return (
    <CommentsPanel
      rows={view}
      counts={counts}
      activeStatus={status ?? "all"}
      activeSource={sourceFilter}
    />
  );
}

async function ModerationTab({
  orgId,
  sub,
  status,
}: {
  orgId: string;
  sub?: string;
  status?: string;
}) {
  const queueStatus = status ?? "pending";
  const [items, counts, keywords, config] = await Promise.all([
    softInbox(() => listModerationQueue({ orgId, status: queueStatus }), [], {
      event: "inbox.shell.moderation.queue_failed",
      swallowAll: true,
      context: { orgId },
    }),
    softInbox(() => moderationQueueCounts(orgId), {} as Record<string, number>, {
      event: "inbox.shell.moderation.counts_failed",
      swallowAll: true,
      context: { orgId },
    }),
    loadKeywordRows(orgId),
    softInbox<ModerationConfigView>(
      () => getModerationConfig(orgId),
      {
        enabled: true,
        blockProfanity: true,
        flagNegativity: true,
        autoHideSpam: false,
        negativityThreshold: 0.7,
      },
      { event: "inbox.shell.moderation.config_failed", swallowAll: true, context: { orgId } },
    ),
  ]);

  const itemView: QueueItemView[] = items.map((it) => ({
    id: it.id,
    source: it.source,
    sourceType: it.sourceType,
    authorName: it.authorName,
    body: it.body,
    reason: it.reason,
    matchedKeyword: it.matchedKeyword,
    aiConfidence: it.aiConfidence,
    suggestedAction: it.suggestedAction,
    status: it.status,
    createdAt: it.createdAt.toISOString(),
  }));

  const configView: ModerationConfigView = {
    enabled: config.enabled,
    blockProfanity: config.blockProfanity,
    flagNegativity: config.flagNegativity,
    autoHideSpam: config.autoHideSpam,
    negativityThreshold: config.negativityThreshold,
  };

  return (
    <ModerationPanel
      sub={sub}
      items={itemView}
      counts={counts}
      status={queueStatus}
      keywords={keywords}
      config={configView}
    />
  );
}

/**
 * Automation tab (server) — reads the org's ChatAutomationRule rows (fail-soft →
 * [] pre-migration) and feeds the <AutomationsPanel/> client island, which owns
 * the list + create/edit form. Writes are RBAC-gated inside the server actions.
 */
async function AutomationTab({ orgId: _orgId }: { orgId: string }) {
  // `listAutomationRules` derives the org from the session internally (it is a
  // client-callable "use server" action and must not accept a client orgId).
  const rules = await listAutomationRules();
  return <AutomationsPanel rules={rules} />;
}

/**
 * Meeting requests tab (server) — reads the org's MeetingRequest rows (fail-soft
 * → [] pre-migration) + status counts and feeds the <MeetingsPanel/> client
 * island (which owns row selection + the detail panel). Status writes use the
 * `updateMeetingRequestStatus` "use server" action (RBAC-gated) via inline forms.
 */
async function MeetingsTab({ orgId, status }: { orgId: string; status?: string }) {
  const active: "all" | MeetingStatus =
    status && (MEETING_STATUSES as readonly string[]).includes(status)
      ? (status as MeetingStatus)
      : "all";

  const rows = await withTenant(orgId, async (tx) =>
    tx.meetingRequest.findMany({
      where: active === "all" ? {} : { status: active },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        message: true,
        preferredTime: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return [];
    throw err;
  });

  const counts: Record<string, number> = await withTenant(orgId, async (tx) => {
    const grouped = await tx.meetingRequest.groupBy({ by: ["status"], _count: { _all: true } });
    const out: Record<string, number> = {};
    for (const g of grouped) out[g.status] = g._count._all;
    return out;
  }).catch((err: unknown) => {
    if (isMissingRelation(err)) return {} as Record<string, number>;
    throw err;
  });

  const view: MeetingRowView[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    message: r.message,
    preferredTime: r.preferredTime,
    source: r.source,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  return <MeetingsPanel rows={view} counts={counts} activeFilter={active} />;
}

/**
 * Full keyword-blacklist rows for the Rules sub-tab. `loadKeywordRules` only
 * returns `{keyword, matchMode}` for the evaluation path, so we read the full
 * CommentBlacklist rows here. Fail-soft → [].
 */
async function loadKeywordRows(orgId: string): Promise<KeywordRuleView[]> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const rows = await tx.commentBlacklist.findMany({
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            keyword: true,
            matchMode: true,
            isActive: true,
            hiddenCount: true,
            createdAt: true,
          },
        });
        return rows.map((r) => ({
          id: r.id,
          keyword: r.keyword,
          matchMode: r.matchMode,
          isActive: r.isActive,
          hiddenCount: r.hiddenCount,
          createdAt: r.createdAt.toISOString(),
        }));
      }),
    [],
    { event: "inbox.shell.keyword_rows_failed", swallowAll: true, context: { orgId } },
  );
}
