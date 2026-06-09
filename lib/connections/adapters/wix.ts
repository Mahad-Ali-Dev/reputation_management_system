/**
 * Wix contacts adapter.
 *
 * `fetchRecentContacts` pulls contacts via the Wix Contacts API v4 query
 * endpoint (`POST https://www.wixapis.com/contacts/v4/contacts/query`) and
 * follows the cursor pagination (`paging.cursors.next` echoed back as
 * `cursorPaging.cursor`). The OAuth/app access token is sent as the
 * `Authorization` header, mirroring how HubSpot sends its bearer token.
 * ENV/CREDENTIAL GATED: returns `[]` with zero network calls when no provider
 * app is configured or the access token is missing.
 *
 * Field mapping follows the Wix contact shape: `info.name.first` / `info.name.last`
 * → display name, `primaryInfo.email` → email, `primaryInfo.phone` → phone,
 * `id` → externalId.
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

/** Wix Contacts API v4 query endpoint. */
const QUERY_URL = "https://www.wixapis.com/contacts/v4/contacts/query";

/** A single contact as returned by the Wix Contacts query endpoint. */
export type WixContact = {
  id: string;
  /** Detailed contact info — names live here. */
  info?: {
    name?: {
      first?: string | null;
      last?: string | null;
    } | null;
  } | null;
  /** Convenience summary fields Wix surfaces alongside the full record. */
  primaryInfo?: {
    email?: string | null;
    phone?: string | null;
  } | null;
};

/** The shape of a Wix Contacts `query` response. */
export type WixQueryResponse = {
  contacts?: WixContact[];
  /** Cursor pagination metadata; `cursors.next` is the next-page cursor. */
  pagingMetadata?: {
    cursors?: {
      next?: string | null;
    } | null;
  } | null;
};

/**
 * PURE mapping: Wix query contacts → NormalizedContact[]. No network, no I/O —
 * safe to unit test directly. Records with neither a usable email nor phone are
 * dropped (same rule the other adapters use). The display name is built from
 * `info.name.first` + `info.name.last`.
 */
export function mapWixContacts(
  contacts: WixContact[] | undefined | null,
): NormalizedContact[] {
  const out: NormalizedContact[] = [];
  for (const c of contacts ?? []) {
    if (!c || !c.id) continue;
    const email = cleanEmail(c.primaryInfo?.email);
    const phone = cleanPhone(c.primaryInfo?.phone);
    if (!email && !phone) continue;
    out.push({
      externalId: c.id,
      name: buildName({ first: c.info?.name?.first, last: c.info?.name?.last }),
      email,
      phone,
      raw: c,
    });
  }
  return out;
}

/** Hard cap on pages we follow, so a runaway cursor can never loop forever. */
const MAX_PAGES = 20;

/** Page size requested per query. */
const PAGE_LIMIT = 100;

export const wixAdapter: ConnectionAdapter = defineAdapter({
  id: "wix",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("wix")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("wix")) === null) return [];
    if (!ctx.accessToken) return [];

    const headers = {
      authorization: ctx.accessToken,
      "content-type": "application/json",
      accept: "application/json",
    };

    const out: NormalizedContact[] = [];
    // First page sends a limit; subsequent pages echo the returned cursor.
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const body: { query: { cursorPaging: { cursor: string } | { limit: number } } } =
        cursor
          ? { query: { cursorPaging: { cursor } } }
          : { query: { cursorPaging: { limit: PAGE_LIMIT } } };

      const res: SafeJsonResult<WixQueryResponse> = await safeJson(
        QUERY_URL,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
        { provider: "wix", op: "query_contacts" },
      );
      if (!res.ok) break;

      out.push(...mapWixContacts(res.data.contacts));

      // Follow the next cursor until Wix stops returning one.
      const next: string | null | undefined = res.data.pagingMetadata?.cursors?.next;
      cursor = typeof next === "string" && next.length > 0 ? next : null;
      if (!cursor) break;
    }

    return out;
  },
});
