/**
 * Contact-sync engine (module 14_connections, Wave 3a).
 *
 * `syncConnectionContacts(orgId, connectionId)` pulls last-30-days customers
 * from a single connection's provider into the Contact directory (Step 12).
 * `syncAllDueConnections()` is the cron drain: it iterates every active
 * connection whose adapter `syncs === "contacts"`, each inside `withTenant`.
 *
 * Safety properties (all required by the spec):
 *  - **No paid/external call unless a real token is present.** The adapter
 *    self-gates (returns `[]` with zero fetches when unconfigured); the engine
 *    additionally skips when availability is false.
 *  - **Fail-soft.** Any per-connection error is caught, logged, recorded as a
 *    `ConnectionSyncLog{status:"error"}`, and does NOT abort the whole run or
 *    bubble a 500 to the cron.
 *  - **Defensive dedupe.** Upsert is find-then-write on
 *    `(organizationId, source, externalId)` so it is correct BEFORE the manual
 *    partial-unique index exists and after.
 *  - **Token refresh is isolated + fail-safe** (see `./adapters/refresh`).
 */

import { getAdapter } from "@/lib/connections/adapters";
import { decryptAccessToken, refreshConnectionToken } from "@/lib/connections/adapters/refresh";
import { DEFAULT_SINCE_DAYS, type NormalizedContact } from "@/lib/connections/adapters/types";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export type SyncOutcome = {
  connectionId: string;
  provider: string;
  status: "ok" | "error" | "skipped";
  contactsCreated: number;
  contactsUpdated: number;
  error?: string;
  durationMs: number;
};

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** Record a sync log row. Fail-soft — pre-migration the table may be absent. */
async function writeSyncLog(
  orgId: string,
  row: {
    connectionId: string;
    provider: string;
    status: string;
    contactsCreated: number;
    contactsUpdated: number;
    error?: string | null;
    durationMs: number;
  },
): Promise<void> {
  try {
    await withTenant(orgId, async (tx) => {
      await tx.connectionSyncLog.create({
        data: {
          organizationId: orgId,
          connectionId: row.connectionId,
          provider: row.provider,
          status: row.status,
          contactsCreated: row.contactsCreated,
          contactsUpdated: row.contactsUpdated,
          error: row.error ?? null,
          durationMs: row.durationMs,
        },
      });
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        event: "connection.sync.log_write_failed",
        orgId,
        connectionId: row.connectionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Upsert normalized contacts for one tenant. Defensive find-then-write so it
 * does not assume the partial unique index exists. Returns created/updated
 * counts.
 */
async function upsertContacts(
  orgId: string,
  source: string,
  establishmentId: string | null,
  contacts: NormalizedContact[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  await withTenant(orgId, async (tx) => {
    for (const c of contacts) {
      const existing = await tx.contact.findFirst({
        where: { organizationId: orgId, source, externalId: c.externalId },
        select: { id: true },
      });
      if (existing) {
        await tx.contact.update({
          where: { id: existing.id },
          data: {
            name: c.name ?? undefined,
            email: c.email ?? undefined,
            phone: c.phone ?? undefined,
            lastActivityAt: new Date(),
          },
        });
        updated++;
      } else {
        await tx.contact.create({
          data: {
            organizationId: orgId,
            establishmentId,
            source,
            externalId: c.externalId,
            name: c.name,
            email: c.email,
            phone: c.phone,
            lastActivityAt: new Date(),
          },
        });
        created++;
      }
    }
  });
  return { created, updated };
}

/** Mark a connection's live sync state. Fail-soft on missing sync_* columns. */
async function setSyncState(
  connectionId: string,
  data: { syncStatus?: string; syncError?: string | null; lastSyncedAt?: Date },
): Promise<void> {
  try {
    await prisma.connection.update({ where: { id: connectionId }, data });
  } catch (err) {
    if (isMissingRelation(err) && data.lastSyncedAt) {
      // Retry with only the always-present column.
      try {
        await prisma.connection.update({
          where: { id: connectionId },
          data: { lastSyncedAt: data.lastSyncedAt },
        });
      } catch {
        /* ignore — best effort */
      }
    }
  }
}

type ConnectionLite = {
  id: string;
  organizationId: string;
  provider: string;
  establishmentId: string | null;
  externalId: string | null;
  accountLabel: string | null;
  status: string;
  tokenExpiresAt: Date | null;
  accessTokenCt: Uint8Array;
  refreshTokenCt: Uint8Array | null;
  iv: Uint8Array;
  keyVersion: number;
  dekCiphertext: Uint8Array;
  encryptionCtx: unknown;
  scopes: string[];
};

const CONN_SELECT = {
  id: true,
  organizationId: true,
  provider: true,
  establishmentId: true,
  externalId: true,
  accountLabel: true,
  status: true,
  tokenExpiresAt: true,
  accessTokenCt: true,
  refreshTokenCt: true,
  iv: true,
  keyVersion: true,
  dekCiphertext: true,
  encryptionCtx: true,
  scopes: true,
} as const;

/**
 * Sync one connection. Loads the row, resolves a usable (refreshed if needed)
 * token, runs the adapter, upserts contacts, bumps lastSyncedAt, and writes a
 * sync log. Never throws.
 */
export async function syncConnectionContacts(
  orgId: string,
  connectionId: string,
): Promise<SyncOutcome> {
  const t0 = Date.now();
  const base = {
    connectionId,
    provider: "unknown",
    contactsCreated: 0,
    contactsUpdated: 0,
  };

  let conn: ConnectionLite | null;
  try {
    conn = (await prisma.connection.findFirst({
      where: { id: connectionId, organizationId: orgId },
      select: CONN_SELECT,
    })) as ConnectionLite | null;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ...base, status: "error", error, durationMs: Date.now() - t0 };
  }
  if (!conn) {
    return { ...base, status: "skipped", error: "connection_not_found", durationMs: Date.now() - t0 };
  }

  const provider = conn.provider;
  const adapter = getAdapter(provider);

  // Only contact-syncing providers do work here.
  if (adapter.syncs !== "contacts") {
    return {
      ...base,
      provider,
      status: "skipped",
      error: "not_a_contact_provider",
      durationMs: Date.now() - t0,
    };
  }

  if (conn.status !== "active") {
    return { ...base, provider, status: "skipped", error: "connection_inactive", durationMs: Date.now() - t0 };
  }

  // Availability: adapter must be configured/env-enabled before any call.
  const availability = await adapter.availability();
  if (!availability.available) {
    await writeSyncLog(orgId, {
      connectionId,
      provider,
      status: "skipped",
      contactsCreated: 0,
      contactsUpdated: 0,
      error: availability.reason,
      durationMs: Date.now() - t0,
    });
    return {
      ...base,
      provider,
      status: "skipped",
      error: availability.reason ?? "not_configured",
      durationMs: Date.now() - t0,
    };
  }

  // Resolve a usable token. Refresh (isolated + fail-safe) when expired.
  let accessToken: string | null;
  const expired = conn.tokenExpiresAt != null && conn.tokenExpiresAt.getTime() <= Date.now();
  if (expired) {
    const refreshed = await refreshConnectionToken(connectionId);
    accessToken = refreshed.ok ? refreshed.accessToken : null;
    if (!refreshed.ok) {
      await writeSyncLog(orgId, {
        connectionId,
        provider,
        status: "error",
        contactsCreated: 0,
        contactsUpdated: 0,
        error: refreshed.reason,
        durationMs: Date.now() - t0,
      });
      return { ...base, provider, status: "error", error: refreshed.reason, durationMs: Date.now() - t0 };
    }
  } else {
    accessToken = decryptAccessToken(conn);
  }
  if (!accessToken) {
    await setSyncState(connectionId, { syncStatus: "error", syncError: "no_usable_token" });
    await writeSyncLog(orgId, {
      connectionId,
      provider,
      status: "error",
      contactsCreated: 0,
      contactsUpdated: 0,
      error: "no_usable_token",
      durationMs: Date.now() - t0,
    });
    return { ...base, provider, status: "error", error: "no_usable_token", durationMs: Date.now() - t0 };
  }

  // Run the adapter (self-gated; makes the only network call here).
  let fetched: NormalizedContact[];
  try {
    await setSyncState(connectionId, { syncStatus: "syncing", syncError: null });
    fetched = await adapter.fetchRecentContacts({
      orgId,
      establishmentId: conn.establishmentId,
      accessToken,
      sinceDays: DEFAULT_SINCE_DAYS,
      externalId: conn.externalId,
      accountLabel: conn.accountLabel,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setSyncState(connectionId, { syncStatus: "error", syncError: error.slice(0, 500) });
    await writeSyncLog(orgId, {
      connectionId,
      provider,
      status: "error",
      contactsCreated: 0,
      contactsUpdated: 0,
      error,
      durationMs: Date.now() - t0,
    });
    return { ...base, provider, status: "error", error, durationMs: Date.now() - t0 };
  }

  // No contacts → record a skipped run (still bump lastSyncedAt so the UI shows
  // the connection was checked).
  if (fetched.length === 0) {
    await setSyncState(connectionId, { syncStatus: "idle", syncError: null, lastSyncedAt: new Date() });
    await writeSyncLog(orgId, {
      connectionId,
      provider,
      status: "skipped",
      contactsCreated: 0,
      contactsUpdated: 0,
      error: null,
      durationMs: Date.now() - t0,
    });
    return { ...base, provider, status: "skipped", durationMs: Date.now() - t0 };
  }

  let counts = { created: 0, updated: 0 };
  try {
    counts = await upsertContacts(orgId, provider, conn.establishmentId, fetched);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setSyncState(connectionId, { syncStatus: "error", syncError: error.slice(0, 500) });
    await writeSyncLog(orgId, {
      connectionId,
      provider,
      status: "error",
      contactsCreated: 0,
      contactsUpdated: 0,
      error,
      durationMs: Date.now() - t0,
    });
    return { ...base, provider, status: "error", error, durationMs: Date.now() - t0 };
  }

  await setSyncState(connectionId, { syncStatus: "idle", syncError: null, lastSyncedAt: new Date() });
  await writeSyncLog(orgId, {
    connectionId,
    provider,
    status: "ok",
    contactsCreated: counts.created,
    contactsUpdated: counts.updated,
    durationMs: Date.now() - t0,
  });

  logger.info({
    event: "connection.sync.ok",
    orgId,
    connectionId,
    provider,
    created: counts.created,
    updated: counts.updated,
  });

  return {
    ...base,
    provider,
    status: "ok",
    contactsCreated: counts.created,
    contactsUpdated: counts.updated,
    durationMs: Date.now() - t0,
  };
}

export type SyncRunSummary = {
  total: number;
  ok: number;
  errored: number;
  skipped: number;
  contactsCreated: number;
  contactsUpdated: number;
  outcomes: SyncOutcome[];
};

/**
 * Cron drain. Reads ALL active connections across tenants (system-tier read,
 * like sync-reviews), filters to contact-syncing providers, and syncs each
 * inside its own tenant context. Fail-soft per connection.
 */
export async function syncAllDueConnections(): Promise<SyncRunSummary> {
  let connections: Array<{ id: string; organizationId: string; provider: string }> = [];
  try {
    connections = await prisma.connection.findMany({
      where: { status: "active" },
      select: { id: true, organizationId: true, provider: true },
    });
  } catch (err) {
    logger.error({
      event: "connection.sync.list_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      total: 0,
      ok: 0,
      errored: 0,
      skipped: 0,
      contactsCreated: 0,
      contactsUpdated: 0,
      outcomes: [],
    };
  }

  // Only providers whose adapter actually syncs contacts — everything else is a
  // no-op we don't even attempt (no paid calls).
  const due = connections.filter((c) => getAdapter(c.provider).syncs === "contacts");

  const outcomes: SyncOutcome[] = [];
  for (const c of due) {
    try {
      outcomes.push(await syncConnectionContacts(c.organizationId, c.id));
    } catch (err) {
      // syncConnectionContacts never throws, but belt-and-suspenders.
      outcomes.push({
        connectionId: c.id,
        provider: c.provider,
        status: "error",
        contactsCreated: 0,
        contactsUpdated: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      });
    }
  }

  return {
    total: outcomes.length,
    ok: outcomes.filter((o) => o.status === "ok").length,
    errored: outcomes.filter((o) => o.status === "error").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    contactsCreated: outcomes.reduce((s, o) => s + o.contactsCreated, 0),
    contactsUpdated: outcomes.reduce((s, o) => s + o.contactsUpdated, 0),
    outcomes,
  };
}
