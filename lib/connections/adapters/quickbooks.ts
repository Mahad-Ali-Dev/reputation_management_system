/**
 * QuickBooks Online customers adapter.
 *
 * `fetchRecentContacts` runs a SQL-ish `query` against the Customer entity for
 * records updated in the last `sinceDays`. The QBO realm (company) id is read
 * from the connection's `externalId`. ENV/CREDENTIAL GATED: returns `[]` with
 * zero network calls when no provider app is configured or the realm id is
 * missing. `QUICKBOOKS_ENV=sandbox` switches to the sandbox API host.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type QboCustomer = {
  Id: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
};

export function qboApiBase(): string {
  return process.env.QUICKBOOKS_ENV === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export const quickbooksAdapter: ConnectionAdapter = defineAdapter({
  id: "quickbooks",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("quickbooks")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    if ((await loadProviderApp("quickbooks")) === null) return [];
    if (!ctx.accessToken) return [];
    const realmId = ctx.externalId;
    if (!realmId) return [];

    const since = new Date(Date.now() - ctx.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const query = `select * from Customer where Metadata.LastUpdatedTime >= '${since}' maxresults 100`;
    const url = `${qboApiBase()}/v3/company/${encodeURIComponent(
      realmId,
    )}/query?query=${encodeURIComponent(query)}`;
    const res = await safeJson<{ QueryResponse?: { Customer?: QboCustomer[] } }>(
      url,
      {
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          accept: "application/json",
        },
      },
      { provider: "quickbooks", op: "query_customers" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.QueryResponse?.Customer ?? []) {
      const email = cleanEmail(c.PrimaryEmailAddr?.Address);
      const phone = cleanPhone(c.PrimaryPhone?.FreeFormNumber);
      if (!email && !phone) continue;
      out.push({
        externalId: c.Id,
        name: c.DisplayName ?? buildName({ first: c.GivenName, last: c.FamilyName }),
        email,
        phone,
        raw: c,
      });
    }
    return out;
  },
});
