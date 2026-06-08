/**
 * HubSpot contacts adapter.
 *
 * `fetchRecentContacts` pulls contacts modified in the last `sinceDays` via the
 * CRM v3 search API. ENV/CREDENTIAL GATED: returns `[]` (and makes ZERO network
 * calls) when no provider app is configured. A real call happens only when a
 * live connection token is passed by the sync engine.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type HubSpotContact = {
  id: string;
  properties?: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
  };
};

export const hubspotAdapter: ConnectionAdapter = defineAdapter({
  id: "hubspot",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("hubspot")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("hubspot")) === null) return [];
    if (!ctx.accessToken) return [];

    const sinceMs = Date.now() - ctx.sinceDays * 24 * 60 * 60 * 1000;
    const res = await safeJson<{ results?: HubSpotContact[] }>(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "lastmodifieddate", operator: "GTE", value: String(sinceMs) },
              ],
            },
          ],
          properties: ["firstname", "lastname", "email", "phone"],
          limit: 100,
        }),
      },
      { provider: "hubspot", op: "search_contacts" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.results ?? []) {
      const email = cleanEmail(c.properties?.email);
      const phone = cleanPhone(c.properties?.phone);
      if (!email && !phone) continue;
      out.push({
        externalId: c.id,
        name: buildName({ first: c.properties?.firstname, last: c.properties?.lastname }),
        email,
        phone,
        raw: c,
      });
    }
    return out;
  },
});
