/**
 * Meta adapter — combined Facebook Pages + Instagram Business.
 *
 * `syncs: "social"` — this adapter does NOT pull contacts; it exposes the
 * connected Page + IG Business account metadata that the inbox (Step 9) and
 * post creator (Step 10) modules consume, and it validates that a connection
 * carries the full combined scope set. `fetchRecentContacts` is the no-op.
 *
 * Fully ENV-GATED: `available` only when a `meta` provider app is configured OR
 * `META_APP_ID`+`META_APP_SECRET` are present. `fetchPages` makes a Graph call
 * ONLY with a live token; with no creds it returns `[]` (zero network calls).
 */

import { loadProviderApp } from "@/lib/connections/oauth-helpers";
import { safeJson } from "./fetch-util";
import { META_PROVIDER } from "./meta-overlay";
import { type ConnectionAdapter, defineAdapter } from "./types";

/** The combined scope set a healthy Meta connection must carry. */
export const META_REQUIRED_SCOPES = META_PROVIDER.scopes ?? [];

export function metaEnvConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

// Graph API version for ALL Meta calls (Pages, IG publish, token exchange).
// Meta sunsets a version ~2 years after release; v19 shipped early 2024 and is
// at/past end-of-life, and a removed version fails in vague ways that look like
// config errors. v23 is a recent stable rather than the bleeding edge.
export const GRAPH_VERSION = "v23.0";

/** A connected Facebook Page (+ optional linked IG Business account). */
export type MetaPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string | null;
  instagramBusinessId: string | null;
};

/**
 * True iff `granted` covers every required combined scope. Used by the callback
 * (to reject partial consent) and the Manage view (to flag a re-auth need).
 */
export function hasCombinedScopes(granted: string[]): boolean {
  const set = new Set(granted);
  return META_REQUIRED_SCOPES.every((s) => set.has(s));
}

/**
 * List the Pages (and their linked IG business accounts) for a user token.
 * Used by the callback identity probe + the inbox/post modules. Fail-soft: any
 * error ⇒ `[]`.
 */
export async function fetchMetaPages(userAccessToken: string): Promise<MetaPage[]> {
  if (!userAccessToken) return [];
  const res = await safeJson<{
    data?: Array<{
      id: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string };
    }>;
  }>(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(
      userAccessToken,
    )}`,
    {},
    { provider: "meta", op: "list_pages" },
  );
  if (!res.ok) return [];
  return (res.data.data ?? []).map((p) => ({
    pageId: p.id,
    pageName: p.name ?? "Facebook Page",
    pageAccessToken: p.access_token ?? null,
    instagramBusinessId: p.instagram_business_account?.id ?? null,
  }));
}

export const metaAdapter: ConnectionAdapter = defineAdapter({
  id: "meta",
  kind: "oauth",
  syncs: "social",
  isConfigured: async () => (await loadProviderApp("meta")) !== null,
  isEnvEnabled: () => metaEnvConfigured(),
  // Social connection — no contact sync. The cron's contacts drain skips it
  // because `syncs !== "contacts"`.
  fetchRecentContacts: async () => [],
});
