/**
 * Square POS customers adapter.
 *
 * `fetchRecentContacts` pulls customers created/updated in the last `sinceDays`
 * via the Square Customers search endpoint (SDK-free fetch). GATED on Square
 * credentials: a configured provider app OR `SQUARE_APP_ID`+`SQUARE_APP_SECRET`
 * in env. Returns `[]` with zero network calls otherwise.
 *
 * Square's OAuth host differs sandbox vs production; `SQUARE_ENV=sandbox`
 * switches to `connect.squareupsandbox.com`.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type SquareCustomer = {
  id: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
};

export function squareApiBase(): string {
  return process.env.SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function squareEnvConfigured(): boolean {
  return Boolean(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET);
}

export const squareAdapter: ConnectionAdapter = defineAdapter({
  id: "square",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("square")) !== null,
  isEnvEnabled: () => squareEnvConfigured(),
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Gate: needs either a configured app or env creds, AND a live token.
    const configured = (await loadProviderApp("square")) !== null || squareEnvConfigured();
    if (!configured || !ctx.accessToken) return [];

    const since = new Date(Date.now() - ctx.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const res = await safeJson<{ customers?: SquareCustomer[] }>(
      `${squareApiBase()}/v2/customers/search`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "content-type": "application/json",
          "Square-Version": "2024-01-18",
          accept: "application/json",
        },
        body: JSON.stringify({
          limit: 100,
          query: {
            filter: { created_at: { start_at: since } },
            sort: { field: "CREATED_AT", order: "DESC" },
          },
        }),
      },
      { provider: "square", op: "search_customers" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.customers ?? []) {
      const email = cleanEmail(c.email_address);
      const phone = cleanPhone(c.phone_number);
      if (!email && !phone) continue;
      out.push({
        externalId: c.id,
        name: buildName({ first: c.given_name, last: c.family_name }),
        email,
        phone,
        raw: c,
      });
    }
    return out;
  },
});
