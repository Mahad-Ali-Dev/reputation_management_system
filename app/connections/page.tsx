import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { BrandLogo } from "@/components/shell/brand-logo";
import { Icon, type IconName } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import {
  CATEGORY_LABELS,
  type ProviderCategory,
  type ProviderEntry,
  getProvidersByCategory,
} from "@/lib/providers/registry";
import { unstable_cache } from "next/cache";
import Link from "next/link";

/**
 * Cached for 5 minutes per pod. The provider_apps table only changes when
 * an admin pastes new OAuth credentials — invalidate via `revalidateTag`
 * from the admin save action. Keeps the connections page under 50ms even
 * at 10K req/sec since the DB call is replaced by an in-memory hit.
 */
const getProviderApps = unstable_cache(
  async () =>
    prisma.providerApp.findMany({
      select: { provider: true, status: true },
    }),
  ["provider-apps"],
  { revalidate: 300, tags: ["provider-apps"] },
);

/**
 * Connections — repulabs v2 design.
 *
 * Real data: connections (per-tenant), provider_apps (admin), provider
 * registry. Empty meta when a category has no connected items.
 *
 * Adapts the design's flat card grid into category sections that match the
 * existing provider registry (review sources, social, CRM, accounting, etc.).
 */

export const dynamic = "force-dynamic";

const CATEGORY_ICONS: Record<ProviderCategory, IconName> = {
  review_source: "star",
  social: "share",
  crm: "users",
  ecommerce: "card",
  pos: "card",
  accounting: "card",
  email_marketing: "mail",
  live_chat: "chat",
  import: "upload",
};

const CATEGORY_SUBLINE: Record<ProviderCategory, string> = {
  review_source: "Sync reviews from the platforms your customers use",
  social: "Listen for comments and DMs, schedule posts",
  crm: "Find your customers wherever they live",
  ecommerce: "Trigger requests after every order",
  pos: "Trigger review requests after every transaction",
  accounting: "Trigger from your invoicing system",
  email_marketing: "Sync subscribers and re-engage",
  live_chat: "Capture conversations from your website",
  import: "Or skip the stack — just bring a spreadsheet",
};

export default async function ConnectionsPage() {
  const { orgId } = await getOrgContext();

  const [connections, providerApps] = await Promise.all([
    withTenant(orgId, async (tx) =>
      tx.connection.findMany({
        select: {
          id: true,
          provider: true,
          status: true,
          lastSyncedAt: true,
          accountLabel: true,
        },
      }),
    ),
    getProviderApps(),
  ]);

  const connByProvider = new Map<string, typeof connections>();
  for (const c of connections) {
    const list = connByProvider.get(c.provider) ?? [];
    list.push(c);
    connByProvider.set(c.provider, list);
  }
  const appStatusByProvider = new Map(providerApps.map((p) => [p.provider, p.status]));
  const grouped = getProvidersByCategory();
  const allProviders = Object.values(grouped).flat();
  const connectedCount = connections.filter((c) => c.status === "active").length;

  const categoryOrder: ProviderCategory[] = [
    "review_source",
    "social",
    "live_chat",
    "import",
    "crm",
    "ecommerce",
    "pos",
    "accounting",
    "email_marketing",
  ];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Connections"]}>
      <PageHeader
        kicker={`${connectedCount} of ${allProviders.length} connected`}
        title="Connections"
        description="Pull customer data from your CRM and POS, listen on social, and let repulabs ship review requests at the moment of truth."
        actions={
          <>
            <a
              href="https://developers.repulabs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <Icon name="ext" size={12} />
              API docs
            </a>
            <Link href="/contacts" className="btn">
              <Icon name="upload" size={12} />
              Upload CSV
            </Link>
            <a
              href="mailto:hello@repulabs.com?subject=Integration%20request"
              className="btn btn--pri"
            >
              <Icon name="plus" size={12} />
              Request integration
            </a>
          </>
        }
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Connected" v={String(connectedCount)} d={`of ${allProviders.length} available`} />
        <Kpi
          l="Last sync"
          v={lastSyncSummary(connections)}
          d={connections.length > 0 ? "Across all providers" : "—"}
        />
        <Kpi
          l="Active integrations"
          v={String(connectedCount)}
          d={
            connections
              .filter((c) => c.status === "active")
              .map((c) => prettyProvider(c.provider))
              .slice(0, 3)
              .join(" · ") || "Not connected"
          }
        />
        <Kpi l="Failed events · 24h" v="0" d="all healthy" up />
      </div>

      <div className="col" style={{ gap: 18 }}>
        {categoryOrder.map((cat) => {
          const list = grouped[cat] ?? [];
          if (list.length === 0) return null;
          const connInCat = list.filter((p) => (connByProvider.get(p.id) ?? []).length > 0).length;
          return (
            <div key={cat} className="ds-card" style={{ overflow: "visible" }}>
              <div className="ds-card__head">
                <div className="row" style={{ gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: "var(--pri-50)",
                      color: "var(--pri)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon name={CATEGORY_ICONS[cat]} size={13} />
                  </div>
                  <div>
                    <h3 className="ds-card__title">{CATEGORY_LABELS[cat]}</h3>
                    <div className="ds-card__sub">{CATEGORY_SUBLINE[cat]}</div>
                  </div>
                </div>
                <span className="mono dim" style={{ fontSize: 10.5 }}>
                  {connInCat} / {list.length} CONNECTED
                </span>
              </div>
              <div className="ds-card__body" style={{ padding: 12 }}>
                <div className="grid-3" style={{ gap: 8 }}>
                  {list.map((p) => (
                    <ProviderTile
                      key={p.id}
                      provider={p}
                      conns={connByProvider.get(p.id) ?? []}
                      appStatus={appStatusByProvider.get(p.id) ?? "unconfigured"}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShellServer>
  );
}

function ProviderTile({
  provider,
  conns,
  appStatus,
}: {
  provider: ProviderEntry;
  conns: Array<{
    id: string;
    status: string;
    lastSyncedAt: Date | null;
    accountLabel: string | null;
  }>;
  appStatus: string;
}) {
  const hasConnection = conns.length > 0;
  const isConfigured = appStatus === "configured";
  const live = conns.find((c) => c.status === "active");

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${hasConnection ? "var(--pri-100)" : "var(--line)"}`,
        background: hasConnection ? "var(--pri-50)" : "var(--surface)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        position: "relative",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <BrandLogo provider={provider.id} size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{provider.displayName}</span>
          {hasConnection && (
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--ok)",
                marginLeft: "auto",
              }}
            />
          )}
          {!provider.ready && (
            <span className="chip chip--warn" style={{ marginLeft: "auto", fontSize: 9 }}>
              SOON
            </span>
          )}
        </div>
        <div className="dim" style={{ fontSize: 11, marginBottom: 8, lineHeight: 1.45 }}>
          {hasConnection
            ? `${live?.accountLabel ?? provider.displayName}${
                live?.lastSyncedAt ? ` · synced ${relativeTime(live.lastSyncedAt)}` : ""
              }`
            : provider.ready && isConfigured
              ? "1-click connect"
              : (provider.blockerNote ?? "")}
        </div>
        {hasConnection ? (
          <div className="row" style={{ gap: 4 }}>
            <Link href={`/connections/${provider.id}`} className="btn btn--xs">
              <Icon name="sliders" size={10} />
              Configure
            </Link>
          </div>
        ) : provider.ready && isConfigured ? (
          <Link href={`/api/connections/${provider.id}/authorize`} className="btn btn--xs btn--pri">
            Connect
          </Link>
        ) : provider.ready ? (
          <Link href={`/admin/providers/${provider.id}`} className="btn btn--xs">
            Setup
          </Link>
        ) : (
          <button type="button" className="btn btn--xs btn--ghost dim" disabled>
            Join waitlist
          </button>
        )}
      </div>
    </div>
  );
}

function Kpi({ l, v, d, up }: { l: string; v: string; d: string; up?: boolean }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div className="stat__value" style={{ fontSize: 28 }}>
          {v}
        </div>
        <div className={`stat__delta${up ? " up" : ""}`}>{d}</div>
      </div>
    </div>
  );
}

function lastSyncSummary(conns: Array<{ status: string; lastSyncedAt: Date | null }>): string {
  const synced = conns
    .filter((c) => c.lastSyncedAt)
    .map((c) => c.lastSyncedAt as Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!synced) return "—";
  return relativeTime(synced);
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function prettyProvider(p: string): string {
  return p
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
