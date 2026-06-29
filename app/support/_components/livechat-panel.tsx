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
 * Live Chat tab (server loader) — rebuilt to the delivered live-chat kit.
 *
 * Five sub-views (driven by `?sub=`) shown as kit underline sub-tabs:
 *   - `sessions` (default): live visitor sessions + read-only transcript +
 *     "Reply in Conversations" hand-off. Empty → the kit live-chat empty state.
 *   - `customize` | `deploy` | `ai` | `sms`: the widget setup forms (the kit's
 *     four "active state" screens), all client-side from the same loader data.
 *
 * RSC-safe: DB reads only here; interactivity lives in the client islands.
 * Everything is fail-soft.
 */

const SUB_TABS = [
  { key: "sessions", label: "Live sessions" },
  { key: "customize", label: "Customize" },
  { key: "deploy", label: "Deploy" },
  { key: "ai", label: "AI Settings" },
  { key: "sms", label: "SMS Handoff" },
] as const;

type SubKey = (typeof SUB_TABS)[number]["key"];

export async function LiveChatPanel({
  orgId,
  sub,
  sessionId,
}: {
  orgId: string;
  sub?: string;
  sessionId?: string;
}) {
  const view: SubKey = (SUB_TABS.some((t) => t.key === sub) ? sub : "sessions") as SubKey;

  return (
    <div>
      <div className="uik-subtabs">
        {SUB_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "sessions" ? "/support?tab=live-chat" : `/support?tab=live-chat&sub=${t.key}`}
            className={`uik-subtab${view === t.key ? " is-active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {view === "sessions" ? (
        <SessionsLoader orgId={orgId} sessionId={sessionId} />
      ) : (
        <WidgetSettingsLoader orgId={orgId} initialSub={view} />
      )}
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
    <div className="uik-card">
      <div className="uik-empty">
        <div>
          <img
            src="/assets/repulabs/unified-inbox/livechat-empty.svg"
            alt=""
            aria-hidden="true"
            className="uik-empty__illus"
            style={{ maxWidth: 540, mixBlendMode: "multiply" }}
          />
        </div>
        <div>
          <h3 className="uik-empty__title">No live chat sessions yet</h3>
          <p className="uik-empty__body">
            When visitors start a chat on your website or connected channels, they&apos;ll appear here.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Link href="/connections" className="uik-btn uik-btn--purple">
              <Icon name="chat" size={13} />
              Connect channels
            </Link>
            <Link href="/support?tab=live-chat&sub=deploy" className="uik-btn">
              <Icon name="settings" size={13} />
              Install website chat
            </Link>
          </div>

          <div className="uik-benefits">
            <Benefit icon="chat" title="Live chat, made simple" body="Talk to your website visitors in real time and close more conversations." />
            <Benefit icon="plug" title="Connect your website" body="Add the live chat widget to your site in a couple of minutes." />
            <Benefit icon="bot" title="Proactive chat" body="Automatically start conversations based on rules and behavior." />
          </div>
        </div>
      </div>
    </div>
  );
}

function Benefit({ icon, title, body }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; body: string }) {
  return (
    <div className="uik-benefit">
      <span className="uik-benefit__icon">
        <Icon name={icon} size={15} />
      </span>
      <div>
        <p className="uik-benefit__title">{title}</p>
        <p className="uik-benefit__body">{body}</p>
      </div>
    </div>
  );
}

/* ----------------------------- Widget settings --------------------------- */

async function WidgetSettingsLoader({
  orgId,
  initialSub,
}: {
  orgId: string;
  initialSub: "customize" | "deploy" | "ai" | "sms";
}) {
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

  return <WidgetSettings data={data} sub={initialSub} />;
}
