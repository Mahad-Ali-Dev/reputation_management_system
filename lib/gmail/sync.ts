/**
 * Gmail mailbox sync engine (cron-poll, NOT Pub/Sub — self-contained).
 *
 * For each active `Connection(provider:"gmail")` the cron worker calls
 * `syncGmailConnection`:
 *   1. Ensure a usable access token (refresh via the shared `refreshConnectionToken`
 *      helper when `tokenExpiresAt` is past).
 *   2. List recent inbox message ids (`users.messages.list`, q="in:inbox newer_than:7d").
 *   3. For each id newer than the stored cursor, `users.messages.get` (format=full),
 *      map it with the pure `gmailMessageToInbound` parser, and ingest on the
 *      "email" channel via `ingestInbound` (idempotent on the Gmail message id).
 *   4. Advance the per-connection cursor (`syncCursor` = max internalDate seen).
 *
 * FAIL-SOFT by design: a single bad message never aborts the connection loop, and
 * a single failing connection never aborts the whole-org loop. Errors are logged,
 * counted, and returned in the summary — the cron route stays 200 unless the whole
 * thing throws.
 */

import type { Connection } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ingestInbound } from "@/lib/inbox/ingest";
import { logger } from "@/lib/logger";
import { gmailInternalDate, type GmailMessage, gmailMessageToInbound } from "./parse";
import { getGmailAccessToken } from "./token";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Default lookback window for the list query when there's no cursor yet. */
const LIST_QUERY = "in:inbox newer_than:7d";
/** Cap messages processed per connection per run (keeps the cron bounded). */
const MAX_MESSAGES_PER_RUN = 50;

export interface GmailSyncResult {
  connectionId: string;
  orgId: string;
  mailbox: string | null;
  listed: number;
  ingested: number;
  skipped: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Gmail REST helpers (thin, fail-soft at the call site)
// ---------------------------------------------------------------------------

async function gmailListInboxMessageIds(accessToken: string): Promise<string[]> {
  const url = `${GMAIL_API}/messages?maxResults=${MAX_MESSAGES_PER_RUN}&q=${encodeURIComponent(
    LIST_QUERY,
  )}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gmail_list_${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  return (data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
}

async function gmailGetMessage(
  accessToken: string,
  id: string,
): Promise<GmailMessage> {
  const url = `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gmail_get_${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as GmailMessage;
}

// ---------------------------------------------------------------------------
// Per-connection sync
// ---------------------------------------------------------------------------

export async function syncGmailConnection(conn: Connection): Promise<GmailSyncResult> {
  const base: GmailSyncResult = {
    connectionId: conn.id,
    orgId: conn.organizationId,
    mailbox: conn.accountLabel ?? conn.externalId ?? null,
    listed: 0,
    ingested: 0,
    skipped: 0,
  };

  // Step 1: usable access token (refreshed inline against the env Google app
  // when expired — gmail reuses AUTH_GOOGLE_ID/SECRET, not a provider_apps row).
  const accessToken = await getGmailAccessToken(conn);
  if (!accessToken) return { ...base, error: "token_unavailable" };

  // Step 2: list recent inbox ids.
  let ids: string[];
  try {
    ids = await gmailListInboxMessageIds(accessToken);
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
  base.listed = ids.length;

  // The cursor is the max internalDate (epoch ms) we've already processed.
  const cursorMs = conn.syncCursor ? Number(conn.syncCursor) : 0;
  let maxSeenMs = cursorMs;

  // Step 3: fetch + ingest each message, fail-soft per message.
  for (const id of ids) {
    try {
      const msg = await gmailGetMessage(accessToken, id);
      const internalMs = gmailInternalDate(msg.internalDate)?.getTime() ?? 0;

      // Cursor guard — skip anything at/older than the last processed timestamp.
      // (ingestInbound is also idempotent on the Gmail id, so this is just an
      // efficiency cut, not the correctness guarantee.)
      if (cursorMs > 0 && internalMs > 0 && internalMs <= cursorMs) {
        base.skipped++;
        continue;
      }

      const normalized = gmailMessageToInbound(msg);
      if (!normalized) {
        base.skipped++;
        continue;
      }

      const result = await ingestInbound(conn.organizationId, normalized);
      if (result.ok && result.messageInserted) base.ingested++;
      else base.skipped++;

      if (internalMs > maxSeenMs) maxSeenMs = internalMs;
    } catch (err) {
      base.skipped++;
      logger.warn({
        event: "gmail.sync.message_failed",
        connectionId: conn.id,
        messageId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Step 4: advance the cursor + lastSyncedAt (fail-soft on a pre-migration column).
  if (maxSeenMs > cursorMs) {
    try {
      await prisma.connection.update({
        where: { id: conn.id },
        data: { syncCursor: String(maxSeenMs), lastSyncedAt: new Date() },
      });
    } catch (err) {
      logger.warn({
        event: "gmail.sync.cursor_update_failed",
        connectionId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({
    event: "gmail.sync.connection_done",
    connectionId: conn.id,
    orgId: conn.organizationId,
    listed: base.listed,
    ingested: base.ingested,
    skipped: base.skipped,
  });

  return base;
}

// ---------------------------------------------------------------------------
// All-orgs sweep (cron entrypoint)
// ---------------------------------------------------------------------------

export async function syncAllGmailConnections(): Promise<{
  total: number;
  ingested: number;
  results: GmailSyncResult[];
}> {
  // System-tier read across all tenants (owner role). The ingest itself stays
  // tenant-scoped via `withTenant` inside ingestInbound.
  const connections = await prisma.connection.findMany({
    where: { provider: "gmail", status: "active" },
  });

  const results: GmailSyncResult[] = [];
  let ingested = 0;
  for (const conn of connections) {
    try {
      const r = await syncGmailConnection(conn);
      ingested += r.ingested;
      results.push(r);
    } catch (err) {
      // Defense-in-depth: syncGmailConnection is already fail-soft, but never let
      // one connection abort the sweep.
      results.push({
        connectionId: conn.id,
        orgId: conn.organizationId,
        mailbox: conn.accountLabel ?? conn.externalId ?? null,
        listed: 0,
        ingested: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(
    { event: "cron.gmail.sync_done", total: connections.length, ingested },
    "gmail sync cron complete",
  );

  return { total: connections.length, ingested, results };
}
