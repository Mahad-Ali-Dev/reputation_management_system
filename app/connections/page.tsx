import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import {
  META_PROVIDER,
  getProviderMeta,
  isLegacyProvider,
} from "@/lib/connections/adapters/meta-overlay";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import type { ConnectionSuggestion } from "@/lib/onboarding/constants";
import { getLatestRun } from "@/lib/onboarding/run-store";
import { PROVIDERS, type ProviderEntry } from "@/lib/providers/registry";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { disconnectConnection, resyncConnection } from "./_components/actions";
import { type ConnectedRow, ConnectedSystemsTable } from "./_components/connected-systems-table";
import { ConnectionsBrowser } from "./_components/connections-browser";
import { CsvImportPanel } from "./_components/csv-import-panel";
import { SuggestedBand, type SuggestedCard } from "./_components/suggested-band";
import "./connections-kit.css";
import {
  type SerializedConnection,
  type SerializedProviderRow,
  type SerializedSection,
  authorizeRouteSlug,
  newestSync,
  prettyProvider,
  relativeTime,
} from "./_lib/format";

/**
 * Connections — hub + browse, redesigned to the delivered design kit.
 *
 * SERVER component: it owns every DB read (tenant-scoped connections + the
 * admin-cached provider_apps) and resolves the provider catalog. All
 * interactivity (category filter, search, connect/disconnect/reauth, the
 * confirm modal) lives in `'use client'` islands under `_components/`, which
 * receive ONLY serialized, JSON-safe props (Date → ISO string) — preserving
 * the server-authoritative pattern and avoiding the RSC onClick crash.
 *
 * Layout (kit): eyebrow → hero header → 4 stat cards w/ sparklines →
 * "Bring your systems together" constellation panel → 3-step explainer →
 * live-status banner → Connected systems (live table) → All integrations
 * (category cards + searchable list). The empty (0-connected) state renders
 * the same shell with zeroed stats + neutral banner copy.
 */

export const dynamic = "force-dynamic";

/** Cached 5-min per pod — provider_apps only changes on an admin creds paste. */
const getProviderApps = unstable_cache(
  async () =>
    prisma.providerApp.findMany({
      select: { provider: true, status: true },
    }),
  ["provider-apps"],
  { revalidate: 300, tags: ["provider-apps"] },
);

type ConnectionRow = {
  id: string;
  provider: string;
  status: string;
  lastSyncedAt: Date | null;
  accountLabel: string | null;
  syncError: string | null;
};

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/**
 * Tenant-scoped connection load, FAIL-SOFT on the not-yet-migrated `sync_error`
 * column (Wave-0 delta). On a brand-new deploy the column is absent (42703) —
 * degrade to a read WITHOUT it; on any other transient DB error, degrade to
 * "nothing connected" (the conservative direction).
 */
async function loadConnections(orgId: string): Promise<ConnectionRow[]> {
  try {
    return await withTenant(orgId, async (tx) =>
      tx.connection.findMany({
        select: {
          id: true,
          provider: true,
          status: true,
          lastSyncedAt: true,
          accountLabel: true,
          syncError: true,
        },
        orderBy: { lastSyncedAt: "desc" },
      }),
    );
  } catch (err) {
    if (isMissingRelation(err)) {
      try {
        const rows = await withTenant(orgId, async (tx) =>
          tx.connection.findMany({
            select: {
              id: true,
              provider: true,
              status: true,
              lastSyncedAt: true,
              accountLabel: true,
            },
            orderBy: { lastSyncedAt: "desc" },
          }),
        );
        return rows.map((r) => ({ ...r, syncError: null }));
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * The browse view's category groups, each a curated list of provider ids in
 * display order. `meta` is the combined entry from the overlay (not registry).
 * Anything connected but outside these groups still surfaces in the Connected
 * table, so no live connection is ever hidden.
 */
type SectionDef = {
  key: string;
  providerIds: string[];
};

/**
 * SCOPED CATALOG (2026-08). Trimmed to what the product actually ships:
 * Google reviews + the content-publishing channels + email.
 *
 * POS, CRM, ecommerce and accounting tiles were removed from the UI. Their
 * registry entries and adapters are UNTOUCHED on disk (lib/providers/registry.ts,
 * lib/connections/adapters/*) — re-listing one is a single line here. WhatsApp
 * was dropped too; its tile 404'd (QA BUG-038).
 *
 * Anything a tenant already connected still appears in the Connected table
 * below, so trimming this list never hides a live connection.
 */
const SECTION_DEFS: SectionDef[] = [
  { key: "reviews", providerIds: ["google_business"] },
  // X/Twitter delisted 2026-08: not shipping in this launch. Registry entry,
  // adapter and OAuth routes are UNTOUCHED on disk — re-add "twitter" here to
  // bring the tile back.
  { key: "social", providerIds: ["meta", "linkedin"] },
  // Gmail delisted 2026-08 for the same reason. Note its restricted scopes are
  // also what would force a paid CASA audit on the main OAuth client, so this
  // stays off until that's a deliberate decision.
  // { key: "email", providerIds: ["gmail"] },
];

/** Resolve a provider id to its catalog entry (registry ∪ the Meta overlay). */
function resolveProvider(id: string): ProviderEntry | null {
  if (id === "meta") return META_PROVIDER;
  return PROVIDERS[id] ?? null;
}

/** Map an orchestrator suggestion slug to the catalog provider id we connect. */
function suggestionToProviderId(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  switch (s) {
    case "google":
    case "google_business":
    case "gbp":
      return "google_business";
    case "facebook":
    case "instagram":
    case "meta":
      return "meta";
    default:
      return resolveProvider(s) ? s : null;
  }
}

function suggestionConnectHref(
  providerId: string,
  connType: string,
  ready: boolean,
  configured: boolean,
): { href: string; prefetch: boolean } {
  if (connType === "oauth" && ready && configured) {
    return {
      href: `/api/connections/${authorizeRouteSlug(providerId)}/authorize`,
      prefetch: false,
    };
  }
  return { href: `/connections/${providerId}`, prefetch: true };
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ import?: string; connect_error?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = (await searchParams) ?? {};
  const showImport = sp.import === "1";
  const connectError =
    sp.connect_error === "google_not_configured"
      ? "Google connection isn't configured on this server yet (missing OAuth client). Contact support nothing is wrong with your account."
      : null;

  const [connections, providerApps, latestRun] = await Promise.all([
    loadConnections(orgId),
    getProviderApps(),
    getLatestRun(orgId).catch(() => null),
  ]);

  // ── Serialize connections (Date → ISO) and bucket by provider. ───────────
  const connByProvider = new Map<string, SerializedConnection[]>();
  for (const c of connections) {
    const serialized: SerializedConnection = {
      id: c.id,
      provider: c.provider,
      status: c.status,
      lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
      accountLabel: c.accountLabel ?? null,
      syncError: c.syncError ?? null,
    };
    const list = connByProvider.get(c.provider) ?? [];
    list.push(serialized);
    connByProvider.set(c.provider, list);
  }

  const configuredSet = new Set(
    providerApps.filter((p) => p.status === "configured").map((p) => p.provider),
  );

  // ── Band 1: "Suggested for you" — orchestrator-detected candidates. ───────
  const rawSuggestions: ConnectionSuggestion[] = latestRun?.suggestions ?? [];
  const suggestedCards: SuggestedCard[] = [];
  const seenSuggested = new Set<string>();
  for (const sug of rawSuggestions) {
    const providerId = suggestionToProviderId(sug.provider);
    if (!providerId || seenSuggested.has(providerId)) continue;
    const entry = resolveProvider(providerId);
    if (!entry) continue;
    seenSuggested.add(providerId);
    const meta = getProviderMeta(providerId);
    const configured = configuredSet.has(entry.id);
    const conns = connByProvider.get(providerId) ?? connByProvider.get(entry.id) ?? [];
    const { href, prefetch } = suggestionConnectHref(
      providerId,
      meta.connType,
      // Admin-configured DB-backed providers (meta) are connectable even though
      // their static `ready` flag is false.
      entry.ready || configured,
      configured,
    );
    suggestedCards.push({
      providerId,
      displayName: entry.displayName,
      source: sug.source ?? null,
      detectedUrl: sug.url ?? null,
      connectHref: href,
      prefetch,
      alreadyConnected: conns.some((c) => c.status === "active"),
    });
  }

  // A registry id may differ from the connection's provider string (Square POS
  // tile is `square_pos`, the callback writes `square`). Surface both.
  const connsForProvider = (providerId: string): SerializedConnection[] => {
    const direct = connByProvider.get(providerId) ?? [];
    if (providerId === "square_pos") {
      return [...direct, ...(connByProvider.get("square") ?? [])];
    }
    return direct;
  };

  const buildRow = (providerId: string): SerializedProviderRow | null => {
    const entry = resolveProvider(providerId);
    if (!entry) return null;
    const meta = getProviderMeta(providerId);
    return {
      id: entry.id,
      displayName: entry.displayName,
      description: entry.description,
      ready: entry.ready || configuredSet.has(entry.id),
      configured: configuredSet.has(entry.id),
      blockerNote: entry.blockerNote ?? null,
      connType: meta.connType,
      syncs: meta.syncs,
      connections: connsForProvider(providerId),
    };
  };

  // ── Build the browse sections. ───────────────────────────────────────────
  const sections: SerializedSection[] = SECTION_DEFS.map((def) => {
    const providers = def.providerIds
      .filter((id) => !isLegacyProvider(id))
      .map(buildRow)
      .filter((r): r is SerializedProviderRow => r !== null);
    const connectedCount = providers.filter((p) =>
      p.connections.some((c) => c.status === "active"),
    ).length;
    return {
      key: def.key,
      label: def.key,
      subline: "",
      icon: "grid",
      providers,
      connectedCount,
      total: providers.length,
    };
  });

  // ── Flatten ALL active/known connections into the Connected table. ───────
  const knownProviderIds = new Set(SECTION_DEFS.flatMap((d) => d.providerIds));
  const tableRows: ConnectedRow[] = connections
    .filter((c) => c.status !== "revoked")
    .map((c) => {
      const tileId = c.provider === "square" ? "square_pos" : c.provider;
      const entry = resolveProvider(tileId) ?? resolveProvider(c.provider);
      const meta = getProviderMeta(c.provider);
      return {
        connectionId: c.id,
        provider: c.provider,
        providerLabel: entry?.displayName ?? prettyProvider(c.provider),
        accountLabel: c.accountLabel ?? null,
        connType: meta.connType,
        syncs: meta.syncs,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
        syncError: c.syncError ?? null,
      };
    });
  tableRows.sort((a, b) => {
    const ak = knownProviderIds.has(a.provider) ? 0 : 1;
    const bk = knownProviderIds.has(b.provider) ? 0 : 1;
    return ak - bk;
  });

  const activeConns = connections.filter((c) => c.status === "active");
  const connectedCount = activeConns.length;
  const errorCount = connections.filter((c) => c.status === "error").length;
  const totalAvailable = SECTION_DEFS.reduce(
    (sum, d) => sum + d.providerIds.filter((id) => !isLegacyProvider(id)).length,
    0,
  );
  const newest = newestSync(
    connections.map((c) => ({
      lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    })),
  );
  const isEmpty = connectedCount === 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Account", "App Connections"]}>
      <div className="conn-page">
        {/* ── Hero header ─────────────────────────────────────────────── */}
        <div className="ph">
          <div style={{ minWidth: 0 }}>
            <div className="conn-eyebrow">
              <span className="conn-eyebrow__dot" aria-hidden="true" />
              <b>{connectedCount}</b> OF <b>{totalAvailable}</b> CONNECTED
            </div>
            <h1 className="ph__title">Connections</h1>
            <p className="ph__sub">
              Pull customer data from your CRM and POS, listen on social, and let repulabs ship
              review requests at the moment of truth.
            </p>
          </div>
          <div className="row" style={{ flexShrink: 0, gap: 10, flexWrap: "wrap" }}>
            {/* <Link href="/connections?import=1#csv-import" className="conn-btn">
              <Icon name="upload" size={15} />
              Import CSV
            </Link> */}
            <a
              href="mailto:info@repulabs.com?subject=Integration%20request"
              className="conn-btn conn-btn--pri"
            >
              <Icon name="plus" size={15} />
              Request integration
            </a>
          </div>
        </div>

        {connectError && (
          <div
            className="conn-card row"
            role="alert"
            style={{
              padding: "12px 16px",
              marginBottom: 20,
              gap: 8,
              borderColor: "var(--bad)",
              background: "var(--bad-soft, #fee2e2)",
              fontSize: 13,
            }}
          >
            <Icon name="alert" size={14} style={{ color: "var(--bad)" }} />
            {connectError}
          </div>
        )}

        {/* ── Row A · 4 stat cards with sparklines ────────────────────── */}
        <div className="conn-stats">
          <StatCard
            tile="violet"
            asset="connection-plug.svg"
            label="Connected"
            value={String(connectedCount)}
            sub={`of ${totalAvailable} available`}
            spark="violet"
          />
          <StatCard
            tile="green"
            asset="calendar-icon.svg"
            label="Last sync"
            value={isEmpty ? "—" : relativeTime(newest)}
            valueMuted={isEmpty}
            pill={isEmpty ? undefined : { tone: "green", label: "Synced just now" }}
            sub={isEmpty ? "—" : undefined}
            smallValue={!isEmpty}
            spark="green"
          />
          <StatCard
            tile="violet"
            asset="puzzle-icon.svg"
            label="Active integrations"
            value={String(connectedCount)}
            pill={
              isEmpty
                ? { tone: "grey", label: "Not connected" }
                : { tone: "indigo", label: "All connected" }
            }
            spark="blue"
          />
          <StatCard
            tile="green"
            asset="shield-icon.svg"
            label="Sync health"
            value={isEmpty ? "0" : String(connectedCount)}
            pill={
              errorCount > 0
                ? { tone: "grey", label: "Needs attention" }
                : isEmpty
                  ? { tone: "grey", label: "No data" }
                  : { tone: "green", label: "All healthy" }
            }
            spark="green"
          />
        </div>

        {/* ── "Bring your systems together" constellation panel ──────── */}
        <div className="conn-panel">
          <div style={{ minWidth: 0 }}>
            <h2 className="conn-panel__title">Bring your systems together</h2>
            <p className="conn-panel__text">
              Connect the tools you already use. We&apos;ll sync your customers and send review
              requests automatically at the right moment.
            </p>
            <div className="conn-panel__cta">
              <a
                href="mailto:info@repulabs.com?subject=Integration%20request"
                className="conn-btn conn-btn--pri"
              >
                <Icon name="plus" size={15} />
                Request integration
              </a>
              <a href="#browse" className="conn-btn">
                <Icon name="grid" size={15} />
                Browse all sources
              </a>
            </div>
          </div>
          <Constellation />
        </div>

        {/* ── 3-step explainer ────────────────────────────────────────── */}
        <div className="conn-card conn-steps">
          <Step
            n={1}
            tone="violet"
            asset="link-icon.svg"
            title="Connect a source"
            body="Link your CRM, POS, e-commerce, or accounting tool or just bring a CSV. This is where customer contacts come from."
          />
          <Step
            n={2}
            tone="green"
            asset="lock-icon.svg"
            title="Authorize securely"
            body="A one-time OAuth consent (tokens are encrypted at rest). Social platforms like Meta connect Facebook + Instagram in a single step."
          />
          <Step
            n={3}
            tone="violet"
            asset="paper-plane-icon.svg"
            title="Requests fire automatically"
            body="New customers sync every 15 minutes and flow into review requests at the perfect moment no manual work."
          />
        </div>

        {/* ── Live-status banner ──────────────────────────────────────── */}
        <StatusBanner empty={isEmpty} hasError={errorCount > 0} activeCount={connectedCount} />

        {/* ── CSV import pre-flight (opened via ?import=1) ────────────── */}
        {showImport && (
          <div id="csv-import" style={{ marginBottom: 20, scrollMarginTop: 24 }}>
            <CsvImportPanel />
          </div>
        )}

        {/* ── Bands ───────────────────────────────────────────────────── */}
        <div id="browse" className="col" style={{ gap: 20, scrollMarginTop: 24 }}>
          {/* Suggested for you (hidden entirely when no suggestions). */}
          {suggestedCards.length > 0 && <SuggestedBand cards={suggestedCards} />}

          {/* Connected — the org's live connection rows (kept, live table). */}
          <ConnectedSystemsTable
            rows={tableRows}
            disconnectAction={disconnectConnection}
            resyncAction={resyncConnection}
          />

          {/* All integrations — category cards + searchable list. */}
          <ConnectionsBrowser sections={sections} disconnectAction={disconnectConnection} />
        </div>
      </div>
    </AppShellServer>
  );
}

/* ── Presentational, server-safe hub pieces ──────────────────────────────── */

const SPARKS = {
  violet: {
    d: "M2 32 L18 28 L34 30 L50 20 L66 24 L82 14 L98 18 L116 8",
    color: "#6366f1",
  },
  green: {
    d: "M2 30 L18 26 L34 28 L50 22 L66 24 L82 16 L98 18 L116 10",
    color: "#10b981",
  },
  blue: {
    d: "M2 34 L18 24 L34 26 L50 28 L66 18 L82 20 L98 12 L116 14",
    color: "#3b82f6",
  },
} satisfies Record<string, { d: string; color: string }>;

function Sparkline({ kind }: { kind: keyof typeof SPARKS }) {
  const s = SPARKS[kind];
  const id = `conn-spark-${kind}`;
  return (
    <svg className="conn-stat__spark" viewBox="0 0 118 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.color} stopOpacity="0.18" />
          <stop offset="1" stopColor={s.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${s.d} L116 40 L2 40 Z`} fill={`url(#${id})`} />
      <path d={s.d} stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({
  tile,
  icon,
  asset,
  label,
  value,
  valueMuted,
  smallValue,
  sub,
  pill,
  spark,
}: {
  tile: "violet" | "green";
  icon?: string;
  /** Kit glyph asset under /assets/repulabs/connections (preferred). */
  asset?: string;
  label: string;
  value: string;
  valueMuted?: boolean;
  smallValue?: boolean;
  sub?: string;
  pill?: { tone: "green" | "indigo" | "grey"; label: string };
  spark: keyof typeof SPARKS;
}) {
  return (
    <div className="conn-card conn-stat">
      <div className={`conn-stat__tile conn-stat__tile--${tile}`} aria-hidden="true">
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/assets/repulabs/connections/${asset}`} alt="" />
        ) : (
          // biome-ignore lint/suspicious/noExplicitAny: Icon name union is exhaustive at call sites.
          <Icon name={icon as any} size={22} />
        )}
      </div>
      <div className="conn-stat__label">{label}</div>
      <div
        className={`conn-stat__value${valueMuted ? " conn-stat__value--muted" : ""}${
          smallValue ? " conn-stat__value--sm" : ""
        }`}
      >
        {value}
      </div>
      {pill ? (
        <span className={`conn-stat__pill conn-stat__pill--${pill.tone}`}>{pill.label}</span>
      ) : (
        sub && <div className="conn-stat__sub">{sub}</div>
      )}
      {sub && pill && <div className="conn-stat__sub">{sub}</div>}
      <Sparkline kind={spark} />
    </div>
  );
}

/** Central plug + 4 orbiting brand cards (Shopify, Zapier, Salesforce, Sheets). */
function Constellation() {
  const B = "/assets/repulabs/connections/";
  return (
    <div className="conn-constel" aria-hidden="true">
      <span className="conn-constel__orbit conn-constel__orbit--2" />
      <span className="conn-constel__orbit conn-constel__orbit--1" />
      <span className="conn-constel__node conn-constel__node--green" />
      <span className="conn-constel__node conn-constel__node--blue" />
      <span className="conn-constel__node conn-constel__node--orange" />
      <span className="conn-constel__core">
        <Icon name="plug" size={52} />
      </span>
      <span className="conn-constel__logo conn-constel__logo--tl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${B}shopify.svg`} alt="" />
      </span>
      <span className="conn-constel__logo conn-constel__logo--tr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${B}salesforce.svg`} alt="" />
      </span>
      <span className="conn-constel__logo conn-constel__logo--bl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${B}hubspot.svg`} alt="" />
      </span>
      <span className="conn-constel__logo conn-constel__logo--br">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${B}mailchimp.svg`} alt="" />
      </span>
    </div>
  );
}

function Step({
  n,
  tone,
  asset,
  title,
  body,
}: {
  n: number;
  tone: "violet" | "green";
  asset: string;
  title: string;
  body: string;
}) {
  return (
    <div className="conn-step">
      <span className={`conn-step__ico conn-step__ico--${tone}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/assets/repulabs/connections/${asset}`} alt="" />
        <span className="conn-step__badge">{n}</span>
      </span>
      <div style={{ minWidth: 0 }}>
        <h3 className="conn-step__title">{title}</h3>
        <p className="conn-step__body">{body}</p>
      </div>
    </div>
  );
}

function StatusBanner({
  empty,
  hasError,
  activeCount,
}: {
  empty: boolean;
  hasError: boolean;
  activeCount: number;
}) {
  // Guard the success language on activeCount>0 so the empty state stays
  // neutral (per the file-17 QA flag — no green "Connected" while 0 connected).
  const neutral = empty || hasError;
  return (
    <div className={`conn-banner${neutral ? " conn-banner--neutral" : ""}`} role="status">
      <div className="conn-banner__top">
        <span className="conn-banner__check" aria-hidden="true">
          {neutral ? (
            <Icon name="plug" size={26} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/assets/repulabs/connections/connected.svg" alt="" />
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="conn-banner__title">
            {empty ? "Not connected yet" : hasError ? "Attention needed" : "Connected"}
          </div>
          <div className="conn-banner__sub">
            Everything currently feeding your data spine status and last sync.
          </div>
        </div>
        <span className="conn-banner__active">
          {!neutral && <span className="conn-banner__active-dot" aria-hidden="true" />}
          {activeCount} ACTIVE
        </span>
      </div>
      <div className="conn-banner__inner">
        <span className="conn-banner__box" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/repulabs/connections/open-box.svg" alt="" />
        </span>
        {empty
          ? "No systems connected yet. Connect one above and it will appear here with live status."
          : hasError
            ? "A source needs attention. Reconnect it above to resume live syncing."
            : "All systems connected and syncing live. New data will appear here with real-time updates."}
      </div>
    </div>
  );
}
