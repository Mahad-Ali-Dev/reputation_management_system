/**
 * Mailchimp audience-contacts adapter.
 *
 * `fetchRecentContacts` pulls list members via the Mailchimp Marketing API
 * (`GET /3.0/lists` to enumerate audiences, then `GET /3.0/lists/{id}/members`
 * with offset pagination). The per-account API base is data-center scoped
 * (`https://{dc}.api.mailchimp.com/3.0`); the `{dc}` prefix is captured at
 * connect time into the connection's `externalId` (the callback stores it as
 * `"{user_id}@{dc}"` or bare `"{dc}"`), mirroring how Salesforce reads its
 * `instance_url`. ENV/CREDENTIAL GATED: returns `[]` with zero network calls
 * when no provider app is configured, the access token is missing, or the data
 * center cannot be resolved from the connection.
 *
 * Auth is `Authorization: Bearer {access_token}` (the OAuth token). Records are
 * mapped from `merge_fields.FNAME`/`LNAME`, `email_address`, and `merge_fields`
 * phone into the shared NormalizedContact shape, keyed on the member `id`.
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

/** A single Mailchimp list member as returned by `/3.0/lists/{id}/members`. */
export type MailchimpMember = {
  id: string;
  email_address?: string | null;
  merge_fields?: {
    FNAME?: string | null;
    LNAME?: string | null;
    PHONE?: string | null;
    [k: string]: unknown;
  } | null;
};

/** The shape of a `GET /3.0/lists/{id}/members` response. */
export type MailchimpMembersResponse = {
  members?: MailchimpMember[];
  total_items?: number;
};

/** The shape of a `GET /3.0/lists` response. */
export type MailchimpListsResponse = {
  lists?: Array<{ id: string }>;
  total_items?: number;
};

/**
 * Resolve the Mailchimp data-center prefix from a connection externalId.
 * The callback writes `"{user_id}@{dc}"` (or bare `"{dc}"`), so the dc is the
 * segment after the last `@` (or the whole string). Returns null when empty.
 */
export function dataCenterFromExternalId(externalId: string | null | undefined): string | null {
  if (typeof externalId !== "string") return null;
  const trimmed = externalId.trim();
  if (!trimmed) return null;
  const dc = trimmed.includes("@") ? trimmed.slice(trimmed.lastIndexOf("@") + 1) : trimmed;
  const cleaned = dc.trim();
  // dc prefixes look like `us21`, `us6`, etc. Reject anything with chars that
  // could break out of the host (defensive — the value is admin/OAuth sourced).
  return /^[a-z0-9-]+$/i.test(cleaned) ? cleaned : null;
}

/**
 * PURE mapping: Mailchimp members → NormalizedContact[]. No network, no I/O —
 * safe to unit test directly. Members with neither a usable email nor phone are
 * dropped (same rule the other adapters use). Name is built from
 * `merge_fields.FNAME`/`LNAME`.
 */
export function mapMailchimpMembers(
  members: MailchimpMember[] | undefined | null,
): NormalizedContact[] {
  const out: NormalizedContact[] = [];
  for (const m of members ?? []) {
    if (!m || !m.id) continue;
    const email = cleanEmail(m.email_address);
    const phone = cleanPhone(m.merge_fields?.PHONE);
    if (!email && !phone) continue;
    out.push({
      externalId: m.id,
      name: buildName({ first: m.merge_fields?.FNAME, last: m.merge_fields?.LNAME }),
      email,
      phone,
      raw: m,
    });
  }
  return out;
}

/** Page size for the members endpoint. */
const PAGE_SIZE = 100;
/** Hard cap on pages we follow per list, so a runaway offset can't loop forever. */
const MAX_PAGES = 20;
/** Hard cap on the number of audiences we walk in a single run. */
const MAX_LISTS = 10;

export const mailchimpAdapter: ConnectionAdapter = defineAdapter({
  id: "mailchimp",
  kind: "oauth",
  syncs: "contacts",
  isConfigured: async () => (await loadProviderApp("mailchimp")) !== null,
  isEnvEnabled: () => false,
  fetchRecentContacts: async (ctx: AdapterSyncCtx): Promise<NormalizedContact[]> => {
    // Hard gate: no configured app ⇒ no call.
    if ((await loadProviderApp("mailchimp")) === null) return [];
    if (!ctx.accessToken) return [];
    const dc = dataCenterFromExternalId(ctx.externalId);
    if (!dc) return [];

    const base = `https://${dc}.api.mailchimp.com/3.0`;
    const headers = {
      authorization: `Bearer ${ctx.accessToken}`,
      accept: "application/json",
    };

    // 1) Enumerate the account's audiences (lists).
    const listsRes: SafeJsonResult<MailchimpListsResponse> = await safeJson(
      `${base}/lists?fields=lists.id&count=${MAX_LISTS}`,
      { headers },
      { provider: "mailchimp", op: "list_audiences" },
    );
    if (!listsRes.ok) return [];
    const listIds = (listsRes.data.lists ?? []).map((l) => l.id).filter(Boolean);

    const out: NormalizedContact[] = [];
    // 2) Walk members per list, offset-paginated.
    for (const listId of listIds.slice(0, MAX_LISTS)) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * PAGE_SIZE;
        const url =
          `${base}/lists/${encodeURIComponent(listId)}/members` +
          `?count=${PAGE_SIZE}&offset=${offset}` +
          `&fields=members.id,members.email_address,members.merge_fields`;
        const res: SafeJsonResult<MailchimpMembersResponse> = await safeJson(
          url,
          { headers },
          { provider: "mailchimp", op: "list_members" },
        );
        if (!res.ok) break;
        const members = res.data.members ?? [];
        out.push(...mapMailchimpMembers(members));
        // Short page ⇒ last page for this list.
        if (members.length < PAGE_SIZE) break;
      }
    }

    return out;
  },
});
