/**
 * Shopify customer-sync adapter (module 12, Wave 3b) — env-gated paid integration.
 *
 * GUARDRAIL: this NEVER makes an outbound paid call in default/test code paths.
 * It no-ops + returns `{ synced: 0, skipped: "shopify_not_configured" }` when the
 * Shopify `Connection` is absent OR credentials are missing. A live sync only
 * runs when a connected Shopify store + access token are present, which requires
 * Module 14's connection plumbing + the founder configuring credentials.
 *
 * When configured, it pages the Shopify Admin `customers.json` API and upserts
 * each customer via the self-contained `upsertContactFromInteraction` hook with
 * `source: "shopify"`. Mocked in tests; not exercised in default paths.
 */

import { decryptAccessToken } from "@/lib/connections/adapters/refresh";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { softQuery } from "./fail-soft";
import { upsertContactFromInteraction } from "./upsert-from-interaction";

export type ShopifySyncResult = {
  synced: number;
  skipped?: "shopify_not_configured" | "shopify_disabled";
};

/**
 * The encrypted-connection columns `decryptAccessToken` needs, plus the
 * identifiers we derive the shop domain from. (`Connection` has no `metadata`
 * column — the Shopify shop domain rides on `accountLabel` / `externalId`.)
 */
type ShopifyConnRow = {
  id: string;
  organizationId: string;
  provider: string;
  externalId: string | null;
  accountLabel: string | null;
  establishmentId: string | null;
  accessTokenCt: Uint8Array;
  refreshTokenCt: Uint8Array | null;
  iv: Uint8Array;
  keyVersion: number;
  dekCiphertext: Uint8Array;
  encryptionCtx: unknown;
  tokenExpiresAt: Date | null;
  scopes: string[];
};

/** Pull the active Shopify connection for an org, fail-soft on un-migrated table. */
async function loadShopifyConnection(orgId: string): Promise<ShopifyConnRow | null> {
  return softQuery(
    () =>
      withTenant(orgId, async (tx) =>
        tx.connection.findFirst({
          where: { provider: "shopify", status: "active" },
          select: {
            id: true,
            organizationId: true,
            provider: true,
            externalId: true,
            accountLabel: true,
            establishmentId: true,
            accessTokenCt: true,
            refreshTokenCt: true,
            iv: true,
            keyVersion: true,
            dekCiphertext: true,
            encryptionCtx: true,
            tokenExpiresAt: true,
            scopes: true,
          },
        }),
      ) as Promise<ShopifyConnRow | null>,
    null,
    { event: "contacts.shopify.connection.failed", swallowAll: true, context: { orgId } },
  );
}

/**
 * Derive the `*.myshopify.com` shop domain from the connection's identifiers.
 * The OAuth flow stores it as `accountLabel` (preferred) or `externalId`. A bare
 * store handle is expanded to its `.myshopify.com` host. Returns null when no
 * plausible domain is present (→ the sync no-ops).
 */
function shopDomainOf(conn: ShopifyConnRow): string | null {
  const raw = (conn.accountLabel ?? conn.externalId ?? "").trim();
  if (!raw) return null;
  if (/\.myshopify\.com$/i.test(raw)) return raw.toLowerCase();
  // Plain handle like "mystore" → "mystore.myshopify.com".
  if (/^[a-z0-9][a-z0-9-]*$/i.test(raw)) return `${raw.toLowerCase()}.myshopify.com`;
  return null;
}

type ShopifyCustomer = {
  id?: number | string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/**
 * Sync customers from a connected Shopify store into Contacts.
 *
 * No-op (returns `skipped`) unless an active Shopify connection with an access
 * token + shop domain is present — so default/test runs make NO outbound call.
 */
export async function syncShopifyCustomers(args: { orgId: string }): Promise<ShopifySyncResult> {
  const { orgId } = args;
  const conn = await loadShopifyConnection(orgId);
  const shopDomain = conn ? shopDomainOf(conn) : null;
  // Decrypt the stored token; null when creds are absent/undecryptable.
  const accessToken = conn ? decryptAccessToken(conn) : null;

  // Default/safe path: nothing connected or no creds → no outbound call.
  if (!conn || !accessToken || !shopDomain) {
    return { synced: 0, skipped: "shopify_not_configured" };
  }

  let synced = 0;
  try {
    // Page the Admin API. Bounded page count to keep an unattended sync cheap.
    let url: string | null = `https://${shopDomain}/admin/api/2024-01/customers.json?limit=250`;
    let pages = 0;
    while (url && pages < 20) {
      pages++;
      const res: Response = await fetch(url, {
        headers: { "X-Shopify-Access-Token": accessToken, Accept: "application/json" },
      });
      if (!res.ok) {
        logger.warn({ event: "contacts.shopify.fetch_failed", orgId, status: res.status });
        break;
      }
      const data = (await res.json()) as { customers?: ShopifyCustomer[] };
      const customers = data.customers ?? [];
      for (const c of customers) {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
        await upsertContactFromInteraction({
          orgId,
          source: "shopify",
          email: c.email ?? undefined,
          phone: c.phone ?? undefined,
          name: name ?? undefined,
          externalId: c.id != null ? String(c.id) : undefined,
        });
        synced++;
      }
      // Cursor pagination via the Link header (rel="next").
      url = parseNextLink(res.headers.get("link"));
    }
  } catch (err) {
    logger.warn({
      event: "contacts.shopify.sync_failed",
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { synced };
}

/** Extract the `rel="next"` URL from a Shopify `Link` header, if present. */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1] ?? null;
  }
  return null;
}
