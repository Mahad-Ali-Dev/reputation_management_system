/**
 * Clover POS customers adapter (NEW provider).
 *
 * Clover is a retail/restaurant POS behind Developer + Partner approval. Fully
 * ENV-GATED: no-ops (returns `{available:false}` / `[]`, ZERO network calls)
 * unless `CLOVER_APP_ID`+`CLOVER_APP_SECRET` are set AND a live connection token
 * exists. No live/paid call on a default code path.
 *
 * Clover's API is merchant-scoped (the connection's `externalId`). The
 * `CLOVER_ENV=sandbox` switch points at the sandbox host. Until a partner app
 * is approved this only runs under a mocked test.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

type CloverEmail = { address?: string };
type CloverPhone = { phoneNumber?: string };
type CloverCustomer = {
  id: string;
  firstName?: string;
  lastName?: string;
  emailAddresses?: { elements?: CloverEmail[] };
  phoneNumbers?: { elements?: CloverPhone[] };
};

export function cloverEnvConfigured(): boolean {
  return Boolean(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET);
}

export function cloverApiBase(): string {
  return process.env.CLOVER_ENV === "sandbox"
    ? "https://apisandbox.dev.clover.com"
    : "https://api.clover.com";
}

export const cloverAdapter: ConnectionAdapter = defineAdapter({
  id: "clover",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("clover")) !== null,
  isEnvEnabled: () => cloverEnvConfigured(),
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    const configured = (await loadProviderApp("clover")) !== null || cloverEnvConfigured();
    if (!configured || !ctx.accessToken) return [];
    const merchantId = ctx.externalId;
    if (!merchantId) return [];

    const url = `${cloverApiBase()}/v3/merchants/${encodeURIComponent(
      merchantId,
    )}/customers?expand=emailAddresses,phoneNumbers&limit=100`;
    const res = await safeJson<{ elements?: CloverCustomer[] }>(
      url,
      {
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          accept: "application/json",
        },
      },
      { provider: "clover", op: "list_customers" },
    );
    if (!res.ok) return [];

    const out: NormalizedContact[] = [];
    for (const c of res.data.elements ?? []) {
      const email = cleanEmail(c.emailAddresses?.elements?.[0]?.address);
      const phone = cleanPhone(c.phoneNumbers?.elements?.[0]?.phoneNumber);
      if (!email && !phone) continue;
      out.push({
        externalId: c.id,
        name: buildName({ first: c.firstName, last: c.lastName }),
        email,
        phone,
        raw: c,
      });
    }
    return out;
  },
});
