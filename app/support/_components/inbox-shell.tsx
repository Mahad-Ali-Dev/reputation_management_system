import { Suspense } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { channelCounts, countNeedsAttention, countOpenThreads } from "@/lib/inbox/queries";
import { softInbox } from "@/lib/inbox/fail-soft";
import { commentStatusCounts, listComments } from "@/lib/inbox/comments";
import { getModerationConfig } from "@/lib/moderation/rules";
import { listModerationQueue, moderationQueueCounts } from "@/lib/moderation/queue";
import { InboxTabsBar } from "./inbox-tabs-bar";
import { ConversationsPanel } from "./conversations-panel";
import { CommentsPanel, type CommentRowView } from "./comments-panel";
import { ModerationPanel, type QueueItemView } from "./moderation-panel";
import { LiveChatPanel } from "./livechat-panel";
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
};

const VALID_TABS = new Set([
  "conversations",
  "comments",
  "live-chat",
  "moderation",
  "automation",
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

  const [openCount, needsAttention] = await Promise.all([
    countOpenThreads(orgId),
    countNeedsAttention(orgId),
  ]);

  return (
    <>
      <InboxTabsBar active={tab} needsAttention={needsAttention} openCount={openCount} />

      {tab === "conversations" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <ConversationsTab orgId={orgId} searchParams={searchParams} openCount={openCount} />
        </Suspense>
      )}

      {tab === "comments" && (
        <Suspense fallback={<div className="ds-card" style={{ height: 480 }} />}>
          <CommentsTab orgId={orgId} status={searchParams.status} />
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
        <StubPanel
          icon="bolt"
          title="Automations"
          body="Auto-reply and AI-handoff rules for your channels. The full rule builder is being assembled; manage existing presets in the meantime."
          ctas={[{ label: "Open automations", href: "/support/chat-automation", primary: true }]}
        />
      )}

      {tab === "analytics" && (
        <StubPanel
          icon="pie"
          title="Support analytics"
          body="Volume, response time, SLA and sentiment across your support channels."
          ctas={[{ label: "Open analytics", href: "/support/analytics", primary: true }]}
        />
      )}
    </>
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

async function CommentsTab({ orgId, status }: { orgId: string; status?: string }) {
  const [rows, counts] = await Promise.all([
    softInbox(() => listComments({ orgId, status }), [], {
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
    authorName: c.authorName,
    authorAvatarUrl: c.authorAvatarUrl,
    body: c.body,
    status: c.status,
    aiSuggested: c.aiSuggested,
    externalPostId: c.externalPostId,
    postedAt: c.postedAt.toISOString(),
  }));

  return <CommentsPanel rows={view} counts={counts} activeStatus={status ?? "all"} />;
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

/**
 * A simple connected/deep-link placeholder for tabs whose full build is a later
 * phase. Keeps the shell honest (every tab renders something) without faking
 * functionality. Server component — pure links, no interactivity.
 */
function StubPanel({
  icon,
  title,
  body,
  ctas,
}: {
  icon: IconName;
  title: string;
  body: string;
  ctas: { label: string; href: string; primary?: boolean }[];
}) {
  return (
    <div className="ds-card">
      <div className="ds-card__body dim" style={{ textAlign: "center", padding: 48 }}>
        <Icon name={icon} size={28} style={{ color: "var(--pri)" }} />
        <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>{title}</h3>
        <p style={{ fontSize: 13, marginTop: 6, maxWidth: 460, marginInline: "auto" }}>{body}</p>
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 16 }}>
          {ctas.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={c.primary ? "btn btn--pri" : "btn btn--sm"}
              style={{ textDecoration: "none" }}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
