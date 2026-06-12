import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
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
import { PROVIDERS, type ProviderEntry } from "@/lib/providers/registry";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { getLatestRun } from "@/lib/onboarding/run-store";
import type { ConnectionSuggestion } from "@/lib/onboarding/constants";
import { disconnectConnection, resyncConnection } from "./_components/actions";
import { ConnectionsAccordion } from "./_components/connections-accordion";
import { CsvImportPanel } from "./_components/csv-import-panel";
import { type ConnectedRow, ConnectedSystemsTable } from "./_components/connected-systems-table";
import { GetStartedCard } from "./_components/get-started-card";
import { type SuggestedCard, SuggestedBand } from "./_components/suggested-band";
import {
  type SerializedConnection,
  type SerializedProviderRow,
  type SerializedSection,
  newestSync,
  prettyProvider,
  relativeTime,
} from "./_lib/format";

/**
 * Connections — accordion layout (module 14_connections, Wave 3a).
 *
 * SERVER component: it owns every DB read (tenant-scoped connections + the
 * admin-cached provider_apps) and resolves the provider catalog. All
 * interactivity (accordion toggles, connect/disconnect/re-sync, the confirm
 * modal) lives in the `'use client'` islands under `_components/`, which
 * receive ONLY serialized, JSON-safe props (Date → ISO string) — preserving
 * the server-authoritative pattern and avoiding the RSC onClick crash.
 *
 * Layout: four grouped accordion sections (Reviews · Social · POS · Email &
 * CRM), an always-visible Connected Systems table, and a Get-Started empty
 * state when nothing is connected.
 */

export const dynamic = "force-dynamic";

/**
 * Cached 5-min per pod — provider_apps only changes when an admin pastes creds
 * (invalidated via `revalidateTag("provider-apps")` from the admin save).
 */
const getProviderApps = unstable_cache(
  async () =>
    prisma.providerApp.findMany({
      select: { provider: true, status: true },
    }),
  ["provider-apps"],
  { revalidate: 300, tags: ["provider-apps"] },
);

/** The connection row shape this page consumes (DB Dates kept until serialize). */
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
 * column (Wave-0 delta). Mirrors `lib/connections/status.ts`: on a brand-new
 * deploy the column is absent (42703) — degrade to a read WITHOUT it instead of
 * 500-ing the page; on any other transient DB error, degrade to "nothing
 * connected" (the conservative direction).
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
      // The `sync_error` column doesn't exist yet — retry without it.
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
 * The accordion's four groups, each a curated list of provider ids in display
 * order. `meta` is the combined entry from the overlay (not the registry).
 * Anything connected but outside these groups still surfaces in the Connected
 * Systems table, so no live connection is ever hidden.
 */
type SectionDef = {
  key: string;
  label: string;
  subline: string;
  icon: string;
  providerIds: string[];
};

const SECTION_DEFS: SectionDef[] = [
  {
    key: "reviews",
    label: "Reviews & Google",
    subline: "Sync reviews and post AI-drafted replies where customers leave them.",
    icon: "star",
    providerIds: ["google_business"],
  },
  {
    key: "social",
    label: "Social — Meta",
    subline: "One connection for Facebook Pages + Instagram: comments, DMs, and posts.",
    icon: "share",
    providerIds: ["meta", "whatsapp", "linkedin", "twitter"],
  },
  {
    key: "pos",
    label: "Point of sale",
    subline: "Trigger a review request after every transaction.",
    icon: "card",
    providerIds: ["square_pos", "toast_pos", "clover_pos", "lightspeed_pos"],
  },
  {
    key: "crm",
    label: "Email & CRM",
    subline: "Find your customers wherever they live and sync them automatically.",
    icon: "users",
    providerIds: [
      "hubspot",
      "salesforce",
      "zoho",
      "shopify",
      "quickbooks",
      "xero",
      "mailchimp",
      "klaviyo",
      // API-key paste providers — connectable today via the manage-page form.
      "activecampaign",
      "brevo",
      "convertkit",
      "getresponse",
      "omnisend",
      "squarespace",
    ],
  },
];

/** Resolve a provider id to its catalog entry (registry ∪ the Meta overlay). */
function resolveProvider(id: string): ProviderEntry | null {
  if (id === "meta") return META_PROVIDER;
  return PROVIDERS[id] ?? null;
}

/**
 * Map a raw orchestrator suggestion `provider` string (google | yelp | facebook
 * | …) to the catalog provider id the Connections UI connects through. The
 * orchestrator emits short slugs; the UI tiles use fuller ids (`google` →
 * `google_business`, `facebook`/`instagram` → the combined `meta` entry).
 * Returns null for slugs we can't yet connect (the suggestion is then dropped).
 */
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
      // Anything that already matches a catalog tile (e.g. linkedin) passes
      // through; unknown slugs (yelp, tripadvisor — no tile yet) are dropped.
      return resolveProvider(s) ? s : null;
  }
}

/**
 * Resolve the connect destination for a suggested provider, mirroring the
 * accordion's RowAction precedence so a "Connect" click lands in the same flow:
 *   - api-key / embed providers   → the manage detail page (secure form)
 *   - configured OAuth providers  → the authorize route (no prefetch)
 *   - everything else             → the manage detail page (admin/setup hint)
 * `prefetch` is false for the authorize route since it redirects.
 */
function suggestionConnectHref(
  providerId: string,
  connType: string,
  ready: boolean,
  configured: boolean,
): { href: string; prefetch: boolean } {
  if (connType === "oauth" && ready && configured) {
    return { href: `/api/connections/${providerId}/authorize`, prefetch: false };
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
  // The Google authorize route redirects here with ?connect_error= when the
  // OAuth client isn't configured — previously nothing rendered it (silent).
  const connectError =
    sp.connect_error === "google_not_configured"
      ? "Google connection isn't configured on this server yet (missing OAuth client). Contact support — nothing is wrong with your account."
      : null;

  const [connections, providerApps, latestRun] = await Promise.all([
    loadConnections(orgId),
    getProviderApps(),
    // Band 1 source. FAIL-SOFT: getLatestRun already swallows the unmigrated
    // onboarding_runs table (returns null) — Band 1 is then simply omitted.
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
  // Resolve each suggestion to a connectable catalog tile, de-dupe by provider
  // id (a site may link both FB + IG → one Meta card), and drop unknown slugs.
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
      entry.ready,
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

  // A registry id may differ from the connection's provider string (the Square
  // POS tile is `square_pos`, the callback writes `square`). Surface both.
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
      ready: entry.ready,
      configured: configuredSet.has(entry.id),
      blockerNote: entry.blockerNote ?? null,
      connType: meta.connType,
      syncs: meta.syncs,
      connections: connsForProvider(providerId),
    };
  };

  // ── Build the accordion sections. ────────────────────────────────────────
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
      label: def.label,
      subline: def.subline,
      icon: def.icon,
      providers,
      connectedCount,
      total: providers.length,
    };
  });

  // ── Flatten ALL active/known connections into the table (one row each). ──
  const knownProviderIds = new Set(SECTION_DEFS.flatMap((d) => d.providerIds));
  const tableRows: ConnectedRow[] = connections
    // The table mirrors live systems: show active/error/expired rows (hide the
    // ones the user explicitly revoked — those live only in audit history).
    .filter((c) => c.status !== "revoked")
    .map((c) => {
      // Map the connection's provider string to a catalog entry for labelling.
      // `square` (callback) resolves via the `square_pos` tile.
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
  // Keep deterministic ordering: known providers first, then the rest.
  tableRows.sort((a, b) => {
    const ak = knownProviderIds.has(a.provider) ? 0 : 1;
    const bk = knownProviderIds.has(b.provider) ? 0 : 1;
    return ak - bk;
  });

  const activeConns = connections.filter((c) => c.status === "active");
  const connectedCount = activeConns.length;
  const totalAvailable = SECTION_DEFS.reduce(
    (sum, d) => sum + d.providerIds.filter((id) => !isLegacyProvider(id)).length,
    0,
  );
  const newest = newestSync(
    connections.map((c) => ({
      lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    })),
  );

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Connections"]}>
      <PageHeader
        kicker={`${connectedCount} of ${totalAvailable} connected`}
        title="Connections"
        description="Pull customer data from your CRM and POS, listen on social, and let repulabs ship review requests at the moment of truth."
        actions={
          <>
            <Link href="/connections?import=1#csv-import" className="btn">
              <Icon name="upload" size={13} />
              Import CSV
            </Link>
            <a
              href="mailto:hello@repulabs.com?subject=Integration%20request"
              className="btn btn--pri"
            >
              <Icon name="plus" size={13} />
              Request integration
            </a>
          </>
        }
      />

      {connectError && (
        <div
          className="ds-card row"
          role="alert"
          style={{
            padding: "10px 14px",
            marginBottom: 14,
            gap: 8,
            borderColor: "var(--bad)",
            background: "var(--bad-soft, #fee2e2)",
            fontSize: 13,
          }}
        >
          <Icon name="alert" size={13} style={{ color: "var(--bad)" }} />
          {connectError}
        </div>
      )}

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Connected" v={String(connectedCount)} d={`of ${totalAvailable} available`} />
        <Kpi
          l="Last sync"
          v={relativeTime(newest)}
          d={connectedCount > 0 ? "Across all providers" : "—"}
        />
        <Kpi
          l="Active integrations"
          v={String(connectedCount)}
          d={
            activeConns
              .map((c) => prettyProvider(c.provider))
              .slice(0, 3)
              .join(" · ") || "Not connected"
          }
        />
        <Kpi
          l="Sync errors"
          v={String(connections.filter((c) => c.status === "error").length)}
          d={connections.some((c) => c.status === "error") ? "Needs attention" : "All healthy"}
          up={!connections.some((c) => c.status === "error")}
        />
      </div>

      {connectedCount === 0 && (
        <div style={{ marginBottom: 18 }}>
          <GetStartedCard />
        </div>
      )}

      {showImport && (
        <div id="csv-import" style={{ marginBottom: 18, scrollMarginTop: 24 }}>
          <CsvImportPanel />
        </div>
      )}

      <div id="connection-sources" className="col" style={{ gap: 18, scrollMarginTop: 24 }}>
        {/* Band 1 — Suggested for you (hidden entirely when no suggestions). */}
        {suggestedCards.length > 0 && <SuggestedBand cards={suggestedCards} />}

        {/* Band 2 — Connected (the org's live connection rows). */}
        <ConnectedSystemsTable
          rows={tableRows}
          disconnectAction={disconnectConnection}
          resyncAction={resyncConnection}
        />

        {/* Band 3 — All integrations (full catalog, by category + search). */}
        <ConnectionsAccordion sections={sections} disconnectAction={disconnectConnection} />
      </div>
    </AppShellServer>
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
