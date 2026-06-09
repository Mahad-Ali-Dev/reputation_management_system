/**
 * WooCommerce customers adapter.
 *
 * WooCommerce is a self-hosted WordPress plugin, so there is no central OAuth
 * host: each store exposes its own REST API at `{storeUrl}/wp-json/wc/v3` and
 * authenticates with a consumer key + secret pair via HTTP Basic auth. The
 * store URL is read from the connection's `externalId` (set at connect time),
 * and the `consumer_key:consumer_secret` credential pair is carried in
 * `ctx.accessToken` (the engine decrypts it before calling us), mirroring how
 * Shopify reads its shop domain from `externalId`.
 *
 * `fetchRecentContacts` pages `GET .../customers?per_page=100&page=N` until a
 * page comes back empty (or the page cap is hit), and maps each customer's
 * first/last name, email, billing phone and id into a NormalizedContact.
 *
 * ENV/CREDENTIAL GATED: returns `[]` with ZERO network calls when no provider
 * app is configured, the store URL is missing/invalid, or the credential is
 * missing. Never throws — `safeJson` degrades flaky/4xx responses to "no
 * contacts this run".
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import {
  type SafeJsonResult,
  buildName,
  cleanEmail,
  cleanPhone,
  safeJson,
} from "./fetch-util";

/** A single customer as returned by `GET /wp-json/wc/v3/customers`. */
export type WooCommerceCustomer = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  billing?: {
    phone?: string | null;
  } | null;
};

/**
 * PURE mapping: WooCommerce customers → NormalizedContact[]. No network, no I/O
 * — safe to unit test directly. Records with neither a usable email nor phone
 * are dropped (same rule the other adapters use). The display name is built
 * from `first_name` + `last_name`, the phone comes from `billing.phone`, and
 * `id` becomes the `externalId` (stringified for the `(source, externalId)`
 * dedupe key).
 */
export function mapWooCommerceCustomers(
  customers: WooCommerceCustomer[] | undefined | null,
): NormalizedContact[] {
  const out: NormalizedContact[] = [];
  for (const c of customers ?? []) {
    if (!c || c.id === undefined || c.id === null) continue;
    const email = cleanEmail(c.email);
    const phone = cleanPhone(c.billing?.phone);
    if (!email && !phone) continue;
    out.push({
      externalId: String(c.id),
      name: buildName({ first: c.first_name, last: c.last_name }),
      email,
      phone,
      raw: c,
    });
  }
  return out;
}

/** Validate + normalize a store URL to an `https://host` origin, or null. */
export function normalizeStoreUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // Tolerate a bare host ("shop.example.com") by defaulting to https.
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    // Drop any path/query — we only want the origin to build the API base.
    return url.origin;
  } catch {
    return null;
  }
}

/** Hard cap on pages we follow, so a runaway store can never loop forever. */
const MAX_PAGES = 50;

/** Page size requested per query (WooCommerce caps `per_page` at 100). */
const PAGE_LIMIT = 100;

export const woocommerceAdapter: ConnectionAdapter = defineAdapter({
  id: "woocommerce",
  kind: "api_key",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("woocommerce")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("woocommerce")) === null) return [];
    // The credential carries the `consumer_key:consumer_secret` Basic-auth pair.
    if (!ctx.accessToken || !ctx.accessToken.includes(":")) return [];
    const store = normalizeStoreUrl(ctx.externalId);
    if (!store) return [];

    const authHeader = `Basic ${Buffer.from(ctx.accessToken).toString("base64")}`;
    const headers = {
      authorization: authHeader,
      accept: "application/json",
    };

    const out: NormalizedContact[] = [];

    // WooCommerce uses 1-based page numbers; page until a page comes back empty.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${store}/wp-json/wc/v3/customers?per_page=${PAGE_LIMIT}&page=${page}`;
      const res: SafeJsonResult<WooCommerceCustomer[]> = await safeJson(
        url,
        { headers },
        { provider: "woocommerce", op: "list_customers" },
      );
      if (!res.ok) break;

      const customers = Array.isArray(res.data) ? res.data : [];
      if (customers.length === 0) break;

      out.push(...mapWooCommerceCustomers(customers));

      // A short page means we've reached the end — stop before an empty fetch.
      if (customers.length < PAGE_LIMIT) break;
    }

    return out;
  },
});
