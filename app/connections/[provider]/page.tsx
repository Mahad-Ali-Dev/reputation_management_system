import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { getAdapter, hasRealAdapter } from "@/lib/connections/adapters";
import {
  META_PROVIDER,
  getProviderMeta,
  isLegacyProvider,
} from "@/lib/connections/adapters/meta-overlay";
import { withTenant } from "@/lib/db/with-tenant";
import {
  getPrimaryWidgetKey,
  getWidgetConfig,
  widgetEmbedSnippet,
} from "@/lib/inbox/widget";
import { PROVIDERS, type ProviderEntry } from "@/lib/providers/registry";
import Link from "next/link";
import { notFound } from "next/navigation";
import { disconnectConnection, resyncConnection } from "../_components/actions";
import { type SerializedConnection, connTypeLabel, syncsLabel } from "../_lib/format";
import { ProviderDetailClient } from "./_components/provider-detail-client";
import { type SerializedSyncLog, WidgetEmbedPanel } from "./_components/widget-embed-panel";
import { generateWidgetKeyForConnections } from "./_components/widget-key-action";

/**
 * Per-provider MANAGE detail (module 14_connections — completeness pass).
 *
 * SERVER component: owns every DB read (tenant-scoped connection rows + recent
 * `ConnectionSyncLog` rows + — for the website widget — the org's
 * `WidgetConfig`/`WidgetKey`). All interactivity (reconnect/disconnect/re-sync,
 * the copy-embed button, the AI-mode chooser) lives in the `'use client'`
 * islands under `_components/`, which receive ONLY serialized, JSON-safe props
 * (Date → ISO string). Preserves the server-authoritative pattern + avoids the
 * RSC onClick crash.
 *
 * Routing: `/connections/<provider>` resolves a provider from the registry ∪
 * the Meta overlay. The accordion's "Manage" / "Get embed code" links land
 * here; unknown providers 404. The website live-chat widget (`website_widget`)
 * gets the embed-snippet panel instead of an OAuth connection view.
 *
 * FAIL-SOFT: the `sync_error` column + the `connection_sync_logs`/widget tables
 * ship via the Wave-0 delta and are applied manually by the founder. Reads
 * degrade (42P01/42703 → empty/defaults) instead of 500-ing — same posture as
 * `lib/connections/status.ts` and the parent page.
 */

export const dynamic = "force-dynamic";

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** The widget provider id (registry `live_chat` tile + its `embed` connType). */
const WIDGET_PROVIDER_ID = "website_widget";

/** Friendly aliases that all resolve to the live-chat widget tile. */
const WIDGET_ALIASES = new Set(["website_widget", "website", "widget", "live_chat", "livechat"]);

/**
 * Map a connection's provider string to the registry tile id where they differ.
 * Two known divergences:
 *   - Square: the OAuth callback writes `square`, the catalog tile is
 *     `square_pos` — mirror the parent page so a `/connections/square` link (the
 *     Connected Systems "Manage" link uses the raw provider string) resolves
 *     instead of 404-ing an active connection.
 *   - Live-chat widget: accept friendly `website`/`widget` aliases for the
 *     `website_widget` embed tile.
 */
function canonicalTileId(id: string): string {
  if (id === "square") return "square_pos";
  if (WIDGET_ALIASES.has(id)) return WIDGET_PROVIDER_ID;
  return id;
}

/** Resolve a provider id to its catalog entry (registry ∪ the Meta overlay). */
function resolveProvider(id: string): ProviderEntry | null {
  if (id === "meta") return META_PROVIDER;
  return PROVIDERS[id] ?? PROVIDERS[canonicalTileId(id)] ?? null;
}

type ConnectionRow = {
  id: string;
  provider: string;
  status: string;
  lastSyncedAt: Date | null;
  accountLabel: string | null;
  syncError: string | null;
};

/**
 * Load the connections for a provider, FAIL-SOFT on the not-yet-migrated
 * `sync_error` column. A registry tile id may differ from the connection's
 * provider string (the Square POS tile is `square_pos`, the callback writes
 * `square`), so we accept both id forms and match either.
 */
async function loadConnections(orgId: string, providerIds: string[]): Promise<ConnectionRow[]> {
  const where = { provider: { in: providerIds } };
  try {
    return await withTenant(orgId, async (tx) =>
      tx.connection.findMany({
        where,
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
            where,
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

/** Recent sync-result rows for this provider's connections. Fail-soft → []. */
async function loadRecentSyncLogs(
  orgId: string,
  connectionIds: string[],
): Promise<SerializedSyncLog[]> {
  if (connectionIds.length === 0) return [];
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.connectionSyncLog.findMany({
        where: { connectionId: { in: connectionIds } },
        select: {
          id: true,
          status: true,
          contactsCreated: true,
          contactsUpdated: true,
          error: true,
          durationMs: true,
          startedAt: true,
        },
        orderBy: { startedAt: "desc" },
        take: 8,
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        contactsCreated: r.contactsCreated,
        contactsUpdated: r.contactsUpdated,
        error: r.error ?? null,
        durationMs: r.durationMs ?? null,
        startedAt: r.startedAt.toISOString(),
      }));
    });
  } catch {
    // Not migrated (42P01) or any transient error → no history (safe).
    return [];
  }
}

export default async function ConnectionProviderPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;

  // Unknown or legacy (superseded) providers 404 — the accordion never links to
  // a legacy id, but guard anyway so a stale bookmark doesn't render a shell.
  const entry = resolveProvider(provider);
  if (!entry || isLegacyProvider(provider)) notFound();

  const { orgId } = await getOrgContext();
  // Resolve UI/sync hints from the canonical tile id so `/connections/square`
  // and `/connections/square_pos` behave identically.
  const meta = getProviderMeta(canonicalTileId(provider));

  // The website live-chat widget is an EMBED, not an OAuth connection — render
  // the embed-snippet + config panel instead of the connection view.
  if (WIDGET_ALIASES.has(provider) || meta.connType === "embed") {
    const [config, key] = await Promise.all([
      getWidgetConfig(orgId),
      getPrimaryWidgetKey(orgId),
    ]);

    return (
      <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Connections", entry.displayName]}>
        <BackLink />
        <PageHeader
          kicker="Live chat widget"
          title={entry.displayName}
          description={entry.description}
        />
        <WidgetEmbedPanel
          provider={WIDGET_PROVIDER_ID}
          displayName={entry.displayName}
          config={{
            brandColor: config.brandColor,
            headerText: config.headerText,
            greeting: config.greeting,
            position: config.position,
            agentPresence: config.agentPresence,
          }}
          widgetKey={
            key
              ? {
                  publicKey: key.publicKey,
                  aiMode: key.aiMode,
                  originAllowlist: key.originAllowlist,
                  embedSnippet: widgetEmbedSnippet(key.publicKey),
                }
              : null
          }
          generateKeyAction={generateWidgetKeyForConnections}
        />
      </AppShellServer>
    );
  }

  // ── OAuth / API-key / CSV connection view ────────────────────────────────
  // Accept both id forms so the Square POS tile (`square_pos`) and the raw
  // callback provider (`square`) surface the same rows from either URL.
  const providerIds =
    provider === "square_pos" || provider === "square"
      ? ["square_pos", "square"]
      : [provider];
  const connections = await loadConnections(orgId, providerIds);

  const serializedConns: SerializedConnection[] = connections.map((c) => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    accountLabel: c.accountLabel ?? null,
    syncError: c.syncError ?? null,
  }));

  const syncLogs = await loadRecentSyncLogs(
    orgId,
    connections.map((c) => c.id),
  );

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Connections", entry.displayName]}>
      <BackLink />
      <PageHeader
        kicker={connTypeLabel(meta.connType)}
        title={entry.displayName}
        description={entry.description}
        actions={
          entry.docsUrl ? (
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <Icon name="ext" size={13} />
              Developer docs
            </a>
          ) : undefined
        }
      />

      <ProviderDetailClient
        provider={{
          id: entry.id,
          displayName: entry.displayName,
          description: entry.description,
          ready: entry.ready,
          blockerNote: entry.blockerNote ?? null,
          docsUrl: entry.docsUrl ?? null,
          connType: meta.connType,
          syncs: meta.syncs,
          syncsLabel: syncsLabel(meta.syncs),
          hasRealAdapter: hasRealAdapter(getAdapter(provider).id),
        }}
        connections={serializedConns}
        syncLogs={syncLogs}
        disconnectAction={disconnectConnection}
        resyncAction={resyncConnection}
      />
    </AppShellServer>
  );
}

function BackLink() {
  return (
    <Link
      href="/connections"
      className="row"
      style={{
        gap: 6,
        fontSize: 12.5,
        color: "var(--rl-muted)",
        textDecoration: "none",
        marginBottom: 10,
        width: "fit-content",
      }}
    >
      <Icon name="chevL" size={14} />
      All connections
    </Link>
  );
}
