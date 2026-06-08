/**
 * Toast POS customers adapter (NEW provider).
 *
 * Toast is a restaurant POS behind a Partner Program. This adapter is fully
 * ENV-GATED: it no-ops (returns `{available:false}` / `[]`, ZERO network calls)
 * unless `TOAST_CLIENT_ID`+`TOAST_CLIENT_SECRET` are set AND a live connection
 * token exists. No live/paid call is ever made on a default code path.
 *
 * Toast's API is restaurant-GUID scoped (the connection's `externalId`). The
 * shape below targets the Toast `guestfeedback`/`orders` customer fields; until
 * a partner app is approved this code only runs under a mocked test.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type ToastCustomer = {
  guid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

export function toastEnvConfigured(): boolean {
  return Boolean(process.env.TOAST_CLIENT_ID && process.env.TOAST_CLIENT_SECRET);
}

export function toastApiBase(): string {
  return process.env.TOAST_API_BASE ?? "https://ws-api.toasttab.com";
}

export const toastAdapter: ConnectionAdapter = defineAdapter({
  id: "toast",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("toast")) !== null,
  isEnvEnabled: () => toastEnvConfigured(),
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    const configured = (await loadProviderApp("toast")) !== null || toastEnvConfigured();
    if (!configured || !ctx.accessToken) return [];
    const restaurantGuid = ctx.externalId;
    if (!restaurantGuid) return [];

    const res = await safeJson<{ customers?: ToastCustomer[] }>(
      `${toastApiBase()}/crm/v1/customers`,
      {
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "Toast-Restaurant-External-ID": restaurantGuid,
          accept: "application/json",
        },
      },
      { provider: "toast", op: "list_customers" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.customers ?? []) {
      const email = cleanEmail(c.email);
      const phone = cleanPhone(c.phone);
      if (!email && !phone) continue;
      out.push({
        externalId: c.guid,
        name: buildName({ first: c.firstName, last: c.lastName }),
        email,
        phone,
        raw: c,
      });
    }
    return out;
  },
});
