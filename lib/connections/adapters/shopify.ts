/**
 * Shopify customers adapter.
 *
 * `fetchRecentContacts` pulls customers updated in the last `sinceDays` via the
 * Admin REST API. The shop domain is read from the connection's `externalId`
 * (set at connect time by the Shopify callback). ENV/CREDENTIAL GATED: returns
 * `[]` with zero network calls when no provider app is configured or the shop
 * domain is missing.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type ShopifyCustomer = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

const SHOP_RE = /^[a-z0-9-]+\.myshopify\.com$/i;

export const shopifyAdapter: ConnectionAdapter = defineAdapter({
  id: "shopify",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("shopify")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    if ((await loadProviderApp("shopify")) === null) return [];
    if (!ctx.accessToken) return [];
    const shop = ctx.externalId;
    if (!shop || !SHOP_RE.test(shop)) return [];

    const since = new Date(Date.now() - ctx.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://${shop}/admin/api/2024-01/customers.json?updated_at_min=${encodeURIComponent(
      since,
    )}&limit=250`;
    const res = await safeJson<{ customers?: ShopifyCustomer[] }>(
      url,
      {
        headers: {
          "X-Shopify-Access-Token": ctx.accessToken,
          accept: "application/json",
        },
      },
      { provider: "shopify", op: "list_customers" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.customers ?? []) {
      const email = cleanEmail(c.email);
      const phone = cleanPhone(c.phone);
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
  },
});
