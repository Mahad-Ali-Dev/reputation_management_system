import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import {
  countOnlineVisitors,
  getSessionTranscript,
  listLiveSessions,
  type LiveSession,
  type LiveTranscriptMessage,
} from "@/lib/inbox/livechat";
import {
  getPrimaryWidgetKey,
  getWidgetConfig,
  isTwilioProvisioningConfigured,
  listHandoffNumbers,
  widgetEmbedSnippet,
} from "@/lib/inbox/widget";
import { LiveChatSessions, type SessionView } from "./livechat-sessions";
import { WidgetSettings, type WidgetSettingsData } from "./widget-settings";

/**
 * Live Chat tab (server loader) — Module 09, Wave 3c-B.
 *
 * The real-time face of the `webchat` channel. Two sub-views (driven by `?sub=`):
 *   - `sessions` (default): live visitor sessions (LiveChatVisitor + the widget
 *     AiConversation) with a read-only transcript and an "Open in Conversations"
 *     hand-off to reply (the unified composer lives there).
 *   - `widget`: the widget Customize / Deploy / AI / SMS settings.
 *
 * RSC-safe: DB reads only here; interactivity lives in the client islands
 * (<LiveChatSessions/>, <WidgetSettings/>). Everything is fail-soft.
 */

export async function LiveChatPanel({
  orgId,
  sub,
  sessionId,
}: {
  orgId: string;
  sub?: string;
  sessionId?: string;
}) {
  const view = sub === "widget" ? "widget" : "sessions";

  return (
    <div>
      <LiveChatSubTabs active={view} />
      {view === "widget" ? (
        <WidgetSettingsLoader orgId={orgId} />
      ) : (
        <SessionsLoader orgId={orgId} sessionId={sessionId} />
      )}
    </div>
  );
}

/* ----------------------------- Sub-tab nav ------------------------------- */

function LiveChatSubTabs({ active }: { active: "sessions" | "widget" }) {
  const tabs: { key: "sessions" | "widget"; label: string; sub?: string }[] = [
    { key: "sessions", label: "Live sessions" },
    { key: "widget", label: "Widget settings", sub: "widget" },
  ];
  return (
    <div className="tabs" style={{ marginBottom: 14 }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.sub ? `/support?tab=live-chat&sub=${t.sub}` : "/support?tab=live-chat"}
          className={`tabs__t${active === t.key ? " is-active" : ""}`}
          style={{ textDecoration: "none" }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/* ----------------------------- Sessions ---------------------------------- */

async function SessionsLoader({ orgId, sessionId }: { orgId: string; sessionId?: string }) {
  const [sessions, onlineCount] = await Promise.all([
    listLiveSessions({ orgId, take: 50 }),
    countOnlineVisitors(orgId),
  ]);

  const selectedId =
    sessionId && sessions.some((s) => s.conversationId === sessionId)
      ? sessionId
      : sessions[0]?.conversationId;

  const transcript: LiveTranscriptMessage[] = selectedId
    ? await getSessionTranscript({ orgId, conversationId: selectedId })
    : [];

  if (sessions.length === 0) {
    return <SessionsEmpty />;
  }

  const sessionViews: SessionView[] = sessions.map(toSessionView);
  const selected = sessions.find((s) => s.conversationId === selectedId) ?? null;

  return (
    <LiveChatSessions
      sessions={sessionViews}
      selectedId={selectedId ?? null}
      selectedThreadId={selected?.threadId ?? null}
      onlineCount={onlineCount}
      transcript={transcript.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        at: m.createdAt,
      }))}
    />
  );
}

function toSessionView(s: LiveSession): SessionView {
  return {
    conversationId: s.conversationId,
    name: s.displayName || (s.email ?? `Visitor ${s.visitorId.slice(0, 6)}`),
    email: s.email,
    phone: s.phone,
    location: s.location,
    currentUrl: s.currentUrl,
    online: s.online,
    handedOff: s.handedOff,
    lastActivityAt: s.lastActivityAt,
    threadId: s.threadId,
  };
}

function SessionsEmpty() {
  return (
    <div className="ds-card">
      <div className="ds-card__body dim" style={{ textAlign: "center", padding: 48 }}>
        <Icon name="bot" size={28} style={{ color: "var(--pri)" }} />
        <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>
          No website chats yet
        </h3>
        <p style={{ fontSize: 13, marginTop: 6, maxWidth: 460, marginInline: "auto" }}>
          Embed the chat widget on your website and conversations will appear here in real time.
          Customize and grab the embed snippet under Widget settings.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 16 }}>
          <Link
            href="/support?tab=live-chat&sub=widget"
            className="btn btn--pri"
            style={{ textDecoration: "none" }}
          >
            <Icon name="settings" size={13} />
            Set up the widget
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Widget settings --------------------------- */

async function WidgetSettingsLoader({ orgId }: { orgId: string }) {
  const [config, key, handoffNumbers] = await Promise.all([
    getWidgetConfig(orgId),
    getPrimaryWidgetKey(orgId),
    listHandoffNumbers(orgId),
  ]);

  const data: WidgetSettingsData = {
    config,
    key: key
      ? {
          id: key.id,
          publicKey: key.publicKey,
          originAllowlist: key.originAllowlist,
          aiMode: key.aiMode,
          embedSnippet: widgetEmbedSnippet(key.publicKey),
        }
      : null,
    twilioConfigured: isTwilioProvisioningConfigured(),
    handoffNumbers: handoffNumbers.map((n) => ({
      id: n.id,
      phoneE164: n.phoneE164,
      monthlyCostCents: n.monthlyCostCents,
    })),
  };

  // The `sub` param routes to the Widget settings view; the inner Customize /
  // Deploy / AI / SMS sub-tabs are client-side (no extra server round-trips).
  return <WidgetSettings data={data} />;
}
