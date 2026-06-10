/**
 * Klaviyo profiles adapter.
 *
 * `fetchRecentContacts` pulls profiles via the Klaviyo API
 * (`GET https://a.klaviyo.com/api/profiles/`) and follows the JSON:API
 * `links.next` cursor for pagination. Klaviyo is a single global host (no
 * per-tenant base), so unlike Salesforce/Mailchimp there is no instance/dc to
 * resolve from the connection. ENV/CREDENTIAL GATED: returns `[]` with zero
 * network calls when no provider app is configured or the access token is
 * missing.
 *
 * Auth is `Authorization: Bearer {access_token}` (OAuth token) plus the required
 * `revision` header. Profiles are mapped from `attributes.email`,
 * `attributes.first_name`/`last_name`, and `attributes.phone_number`, keyed on
 * the profile `id`.
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import {
  type SafeJsonResult,
  buildName,
  cleanEmail,
  cleanPhone,
  safeJson,
} from "./fetch-util";
import {
  type AdapterSyncCtx,
  type ConnectionAdapter,
  type NormalizedContact,
  defineAdapter,
} from "./types";

/** Klaviyo API revision the profiles endpoint is pinned to. */
const KLAVIYO_REVISION = "2024-06-15";

/** First-page URL — `additional-fields` is unused; default attributes suffice. */
const PROFILES_URL = "https://a.klaviyo.com/api/profiles/?page[size]=100";

/** A single Klaviyo profile resource (JSON:API). */
export type KlaviyoProfile = {
  id: string;
  type?: string;
  attributes?: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone_number?: string | null;
    [k: string]: unknown;
  } | null;
};

/** The shape of a `GET /api/profiles/` response (JSON:API + cursor links). */
export type KlaviyoProfilesResponse = {
  data?: KlaviyoProfile[];
  links?: {
    /** Absolute URL for the next page, or null/absent on the last page. */
    next?: string | null;
    [k: string]: unknown;
  } | null;
};

/**
 * PURE mapping: Klaviyo profiles → NormalizedContact[]. No network, no I/O —
 * safe to unit test directly. Profiles with neither a usable email nor phone
 * are dropped (same rule the other adapters use). Name is built from
 * `attributes.first_name`/`last_name`.
 */
export function mapKlaviyoProfiles(
  profiles: KlaviyoProfile[] | undefined | null,
): NormalizedContact[] {
  const out: NormalizedContact[] = [];
  for (const p of profiles ?? []) {
    if (!p || !p.id) continue;
    const email = cleanEmail(p.attributes?.email);
    const phone = cleanPhone(p.attributes?.phone_number);
    if (!email && !phone) continue;
    out.push({
      externalId: p.id,
      name: buildName({ first: p.attributes?.first_name, last: p.attributes?.last_name }),
      email,
      phone,
      raw: p,
    });
  }
  return out;
}

/** Hard cap on pages we follow, so a runaway cursor can never loop forever. */
const MAX_PAGES = 20;

export const klaviyoAdapter: ConnectionAdapter = defineAdapter({
  id: "klaviyo",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("klaviyo")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("klaviyo")) === null) return [];
    if (!ctx.accessToken) return [];

    const headers = {
      authorization: `Bearer ${ctx.accessToken}`,
      accept: "application/vnd.api+json",
      revision: KLAVIYO_REVISION,
    };

    const out: NormalizedContact[] = [];
    let nextUrl: string | null = PROFILES_URL;

    for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
      const res: SafeJsonResult<KlaviyoProfilesResponse> = await safeJson(
        nextUrl,
        { headers },
        { provider: "klaviyo", op: "list_profiles" },
      );
      if (!res.ok) break;

      out.push(...mapKlaviyoProfiles(res.data.data));

      // Follow the JSON:API cursor; absent/empty ⇒ done.
      const nextLink: string | null | undefined = res.data.links?.next;
      nextUrl = typeof nextLink === "string" && nextLink.length > 0 ? nextLink : null;
    }

    return out;
  },
});
