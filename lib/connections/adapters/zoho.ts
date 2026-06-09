/**
 * Zoho CRM contacts adapter.
 *
 * `fetchRecentContacts` pulls contacts modified in the last `sinceDays` via the
 * CRM v3 Contacts API. Zoho is multi-data-center: the API base
 * (e.g. `https://www.zohoapis.com`, `.eu`, `.in`, `.com.au`) is returned by the
 * token endpoint as `api_domain` and captured on the connection at connect time.
 * We read it from the connection metadata (`accountLabel`, falling back to
 * `externalId`) and validate it before use. ENV/CREDENTIAL GATED: returns `[]`
 * with zero network calls when no provider app is configured, no token is
 * present, or the api_domain is missing/invalid.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";
import { buildName, cleanEmail, cleanPhone, safeJson } from "./fetch-util";

/** A single Contact record as returned by the Zoho CRM v3 Contacts API. */
export type ZohoContact = {
  id?: string | number;
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  Email?: string | null;
  Phone?: string | null;
  Mobile?: string | null;
};

/** The `data` envelope Zoho wraps Contacts records in. */
export type ZohoContactsResponse = {
  data?: ZohoContact[] | null;
};

/** Accept only an https Zoho data-center domain (no trailing path/query). */
const ZOHO_DOMAIN_RE = /^https:\/\/[a-z0-9.-]*zohoapis\.[a-z.]+$/i;

/**
 * Pure mapping: Zoho Contacts API response → normalized contacts.
 *
 * Network-free + side-effect-free so it is unit-testable in isolation. Records
 * with neither an email nor a phone (nothing to reach the customer on) are
 * dropped, matching the HubSpot/Shopify adapters. `Phone` is preferred over
 * `Mobile` for the phone field, falling back to `Mobile` when `Phone` is empty.
 */
export function mapZohoContacts(res: ZohoContactsResponse | null | undefined): NormalizedContact[] {
  const out: NormalizedContact[] = [];
  for (const c of res?.data ?? []) {
    if (c?.id === undefined || c.id === null || c.id === "") continue;
    const email = cleanEmail(c.Email);
    const phone = cleanPhone(c.Phone) ?? cleanPhone(c.Mobile);
    if (!email && !phone) continue;
    out.push({
      externalId: String(c.id),
      name: buildName({ full: c.Full_Name, first: c.First_Name, last: c.Last_Name }),
      email,
      phone,
      raw: c,
    });
  }
  return out;
}

/** Resolve + validate the Zoho data-center API base from connection metadata. */
function resolveApiDomain(ctx: AdapterSyncCtx): string | null {
  const candidate = (ctx.accountLabel ?? ctx.externalId ?? "").trim().replace(/\/+$/, "");
  return ZOHO_DOMAIN_RE.test(candidate) ? candidate : null;
}

export const zohoAdapter: ConnectionAdapter = defineAdapter({
  id: "zoho",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("zoho")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("zoho")) === null) return [];
    if (!ctx.accessToken) return [];
    const apiDomain = resolveApiDomain(ctx);
    if (!apiDomain) return [];

    const since = new Date(Date.now() - ctx.sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const out: NormalizedContact[] = [];
    const PER_PAGE = 200;
    const MAX_PAGES = 25; // hard cap so a runaway pagination can't loop forever
    let page = 1;

    for (let i = 0; i < MAX_PAGES; i++) {
      const url =
        `${apiDomain}/crm/v3/Contacts` +
        `?fields=${encodeURIComponent("id,Full_Name,First_Name,Last_Name,Email,Phone,Mobile")}` +
        `&per_page=${PER_PAGE}&page=${page}` +
        `&sort_by=Modified_Time&sort_order=desc`;
      const res = await safeJson<ZohoContactsResponse & { info?: { more_records?: boolean } }>(
        url,
        {
          headers: {
            // Zoho uses its own auth scheme, not a bare Bearer token.
            authorization: `Zoho-oauthtoken ${ctx.accessToken}`,
            accept: "application/json",
            // Pull only contacts modified within the sync window.
            "If-Modified-Since": since,
          },
        },
        { provider: "zoho", op: "list_contacts" },
      );
      // A 304 (no records modified since) surfaces as !ok with status 304 — and
      // any error/timeout — degrades to "no more contacts this run".
      if (!res.ok) break;

      const batch = mapZohoContacts(res.data);
      for (const c of batch) out.push(c);

      const rows = res.data.data ?? [];
      // Stop when Zoho reports no further pages, or a short page signals the end.
      if (!res.data.info?.more_records || rows.length < PER_PAGE) break;
      page += 1;
    }
    return out;
  },
});
