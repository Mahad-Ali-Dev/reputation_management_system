/**
 * Xero contacts adapter.
 *
 * `fetchRecentContacts` pulls contacts via the Accounting API, filtered by the
 * `If-Modified-Since` header to the last `sinceDays`. Xero requires the tenant
 * id (organisation) in the `Xero-Tenant-Id` header — read from the connection's
 * `externalId` (captured from `/connections` during the callback). ENV/CREDENTIAL
 * GATED: returns `[]` with zero network calls when unconfigured or the tenant id
 * is missing.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type XeroPhone = { PhoneType?: string; PhoneNumber?: string };
type XeroContact = {
  ContactID: string;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Phones?: XeroPhone[];
};

function pickPhone(phones: XeroPhone[] | undefined): string | null {
  if (!phones || phones.length === 0) return null;
  const mobile = phones.find((p) => p.PhoneType === "MOBILE" && p.PhoneNumber);
  const def = phones.find((p) => p.PhoneNumber);
  return cleanPhone((mobile ?? def)?.PhoneNumber);
}

export const xeroAdapter: ConnectionAdapter = defineAdapter({
  id: "xero",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("xero")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    if ((await loadProviderApp("xero")) === null) return [];
    if (!ctx.accessToken) return [];
    const tenantId = ctx.externalId;
    if (!tenantId) return [];

    const since = new Date(Date.now() - ctx.sinceDays * 24 * 60 * 60 * 1000).toUTCString();
    const res = await safeJson<{ Contacts?: XeroContact[] }>(
      "https://api.xero.com/api.xro/2.0/Contacts?page=1",
      {
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "Xero-Tenant-Id": tenantId,
          "If-Modified-Since": since,
          accept: "application/json",
        },
      },
      { provider: "xero", op: "list_contacts" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.Contacts ?? []) {
      const email = cleanEmail(c.EmailAddress);
      const phone = pickPhone(c.Phones);
      if (!email && !phone) continue;
      out.push({
        externalId: c.ContactID,
        name: c.Name ?? buildName({ first: c.FirstName, last: c.LastName }),
        email,
        phone,
        raw: c,
      });
    }
    return out;
  },
});
