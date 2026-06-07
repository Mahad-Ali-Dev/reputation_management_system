import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Connection status helpers (00_foundation §A6).
 *
 * Server-only. Reads the `Connection` model (tenant-scoped via `withTenant`) and
 * exposes:
 *  - `getConnectedProviders(orgId)` — the Set of provider strings with an ACTIVE
 *    connection (feeds `<ConnectionGate isConnected={...}>` parents).
 *  - `getConnectionStatuses(orgId)` — richer per-provider state (connected?,
 *    lastSync, error) for a "Connected systems" surface.
 *
 * Both FAIL SOFT: the `sync_status`/`sync_error` columns (and, on a brand-new
 * deploy, parts of the row) do not exist in the live DB until the founder runs
 * the master migration. Postgres 42P01 (undefined_table) / 42703
 * (undefined_column) — and any transient DB error — degrade to "nothing
 * connected" instead of throwing a 500. The conservative direction: a gated
 * control stays disabled (safe) rather than the page crashing.
 *
 * Provider strings match the schema's `Connection.provider` values
 * (`google_business | meta | linkedin | x | shopify | woocommerce | square |
 * hubspot | salesforce | quickbooks | xero | ...`).
 */

/** "active" is the only provider state that counts as usable for gating. */
const ACTIVE = "active";

/** Per-provider connection status for a "Connected systems" table/UI. */
export type ConnectionStatus = {
  provider: string;
  /** True when at least one `active` connection exists for this provider. */
  connected: boolean;
  /** Most recent successful sync across this provider's connections, if any. */
  lastSync: Date | null;
  /**
   * A surfaced sync error string when the live `sync_*` columns exist and a
   * connection is in an error state; `null` otherwise (and always `null`
   * pre-migration, since the column is absent).
   */
  error: string | null;
};

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/**
 * The Set of provider strings this org has an ACTIVE connection for.
 *
 * This is the value a server parent passes down as
 * `isConnected={providers.has("meta")}` to a `<ConnectionGate>` (the client gate
 * never queries connection state itself — same server-authoritative pattern as
 * `<ProGate>`).
 *
 * Fail-soft → empty Set on any error (treated as "nothing connected").
 */
export async function getConnectedProviders(orgId: string): Promise<Set<string>> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.connection.findMany({
        where: { status: ACTIVE },
        select: { provider: true },
        distinct: ["provider"],
      });
      return new Set(rows.map((r) => r.provider));
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "connections.status.skipped_unmigrated" });
    } else {
      logger.warn({
        orgId,
        error: err instanceof Error ? err.message : String(err),
        event: "connections.status.failed",
      });
    }
    return new Set<string>();
  }
}

/**
 * Convenience boolean for a single provider. Prefer `getConnectedProviders` when
 * a page gates several controls (one query) — this exists for one-off checks.
 */
export async function isProviderConnected(orgId: string, provider: string): Promise<boolean> {
  const set = await getConnectedProviders(orgId);
  return set.has(provider);
}

/**
 * Rich per-provider status: connected?, most-recent `lastSyncedAt`, and a
 * surfaced `syncError` when present. One tenant-scoped read; collapses multiple
 * connections per provider into a single row (connected if ANY is active; newest
 * `lastSyncedAt` wins; first non-empty `syncError` surfaces).
 *
 * `syncStatus`/`syncError` are NEW columns (Wave-0 schema delta, not yet
 * migrated) — selected defensively and treated as absent on `42703`.
 */
export async function getConnectionStatuses(orgId: string): Promise<ConnectionStatus[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.connection.findMany({
        select: {
          provider: true,
          status: true,
          lastSyncedAt: true,
          syncError: true,
        },
        orderBy: { lastSyncedAt: "desc" },
      });

      const byProvider = new Map<string, ConnectionStatus>();
      for (const r of rows) {
        const prev = byProvider.get(r.provider);
        const isActive = r.status === ACTIVE;
        if (!prev) {
          byProvider.set(r.provider, {
            provider: r.provider,
            connected: isActive,
            lastSync: r.lastSyncedAt ?? null,
            error: r.syncError ?? null,
          });
        } else {
          prev.connected = prev.connected || isActive;
          // Rows are ordered newest-first, so the first lastSync we kept is the
          // most recent; only fill if we hadn't yet.
          if (prev.lastSync == null && r.lastSyncedAt) prev.lastSync = r.lastSyncedAt;
          if (prev.error == null && r.syncError) prev.error = r.syncError;
        }
      }
      return [...byProvider.values()];
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "connections.statuses.skipped_unmigrated" });
    } else {
      logger.warn({
        orgId,
        error: err instanceof Error ? err.message : String(err),
        event: "connections.statuses.failed",
      });
    }
    return [];
  }
}
