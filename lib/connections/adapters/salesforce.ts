/**
 * Salesforce contacts adapter.
 *
 * `fetchRecentContacts` pulls Contacts via the REST API SOQL `query` endpoint
 * (`GET /services/data/vXX.X/query?q=...`) and follows the `nextRecordsUrl`
 * pagination cursor. The per-tenant API base (`instance_url`, returned by the
 * Salesforce token exchange) is read from the connection's `externalId`,
 * mirroring how Shopify reads its shop domain and Xero its tenant id. ENV/
 * CREDENTIAL GATED: returns `[]` with zero network calls when no provider app is
 * configured, the access token is missing, or the instance URL is missing.
 *
 * This matches the ReviewBoost Salesforce `fetchContacts` behaviour (the
 * companion new-contact webhook is handled elsewhere): one SOQL query over
 * Contact with Id/FirstName/LastName/Email/Phone/Account.Name, paginated until
 * `done`, normalized into the shared contact shape.
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

/** Salesforce REST API version we target for the query endpoint. */
const API_VERSION = "v59.0";

/** The SOQL we run — Contacts with the fields we map into a NormalizedContact. */
const CONTACT_SOQL =
  "SELECT Id, FirstName, LastName, Email, Phone, Account.Name FROM Contact";

/** A single Contact record as returned by the SOQL `query` endpoint. */
export type SalesforceContact = {
  Id: string;
  FirstName?: string | null;
  LastName?: string | null;
  Email?: string | null;
  Phone?: string | null;
  /** Relationship field — present only when the Contact has an Account. */
  Account?: { Name?: string | null } | null;
};

/** The shape of a Salesforce `query` / `query/{locator}` response. */
export type SalesforceQueryResponse = {
  totalSize?: number;
  done?: boolean;
  /** Relative path to the next page; absent/empty when `done` is true. */
  nextRecordsUrl?: string | null;
  records?: SalesforceContact[];
};

/**
 * PURE mapping: Salesforce query records → NormalizedContact[]. No network, no
 * I/O — safe to unit test directly. Records with neither a usable email nor
 * phone are dropped (same rule the other adapters use). The Account name is used
 * as a fallback display name when the Contact has no first/last name.
 */
export function mapSalesforceContacts(
  records: SalesforceContact[] | undefined | null,
): NormalizedContact[] {
  const out: NormalizedContact[] = [];
  for (const c of records ?? []) {
    if (!c || !c.Id) continue;
    const email = cleanEmail(c.Email);
    const phone = cleanPhone(c.Phone);
    if (!email && !phone) continue;
    const name =
      buildName({ first: c.FirstName, last: c.LastName }) ??
      (typeof c.Account?.Name === "string" && c.Account.Name.trim().length > 0
        ? c.Account.Name.trim()
        : null);
    out.push({
      externalId: c.Id,
      name,
      email,
      phone,
      raw: c,
    });
  }
  return out;
}

/** Hard cap on pages we follow, so a runaway cursor can never loop forever. */
const MAX_PAGES = 20;

export const salesforceAdapter: ConnectionAdapter = defineAdapter({
  id: "salesforce",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("salesforce")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("salesforce")) === null) return [];
    if (!ctx.accessToken) return [];
    // The Salesforce token exchange returns an `instance_url` (per-tenant API
    // base) captured at connect time into the connection's externalId.
    const instanceUrl = ctx.externalId?.replace(/\/+$/, "");
    if (!instanceUrl || !/^https:\/\//i.test(instanceUrl)) return [];

    const headers = {
      authorization: `Bearer ${ctx.accessToken}`,
      accept: "application/json",
    };

    const out: NormalizedContact[] = [];
    // First page: the SOQL query. Subsequent pages: the nextRecordsUrl cursor.
    let nextPath: string | null =
      `/services/data/${API_VERSION}/query?q=${encodeURIComponent(CONTACT_SOQL)}`;

    for (let page = 0; page < MAX_PAGES && nextPath; page++) {
      const url: string = `${instanceUrl}${nextPath}`;
      const res: SafeJsonResult<SalesforceQueryResponse> = await safeJson(
        url,
        { headers },
        { provider: "salesforce", op: "query_contacts" },
      );
      if (!res.ok) break;

      out.push(...mapSalesforceContacts(res.data.records));

      // `done` true ⇒ no more pages. Otherwise follow nextRecordsUrl (a
      // relative path on the same instance).
      const cursor: string | null =
        res.data.done === false && res.data.nextRecordsUrl
          ? res.data.nextRecordsUrl
          : null;
      nextPath = cursor;
    }

    return out;
  },
});
