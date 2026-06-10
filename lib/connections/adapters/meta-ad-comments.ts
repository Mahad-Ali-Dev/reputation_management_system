/**
 * Meta AD / promoted-post comment moderation (Module 09 parity — ReviewBoost).
 *
 * The organic path (page feed comments) is handled by the Meta webhook
 * (`app/api/webhooks/meta/route.ts`). Comments left on BOOSTED / dark / ad posts
 * do NOT arrive on the page-feed `changes` webhook — they live under the ad
 * account's promotable_posts / ads edges, keyed by each ad's `object_story_id`
 * (the underlying post the ad renders). This module closes that blind spot:
 *
 *   1. `listAdStoryIds(adAccountId, token)` — enumerate the `object_story_id`s of
 *      the account's promotable/active-ad posts via the Graph Ads API.
 *   2. `fetchObjectComments(objectId, token)` — read comments on one of those
 *      post objects.
 *   3. `fetchAdComments(...)` — orchestrate 1+2 and normalise EVERY comment into
 *      the SAME `NormalizedComment` shape the organic comments use, tagged
 *      `kind:"ad"` (and `platform:"facebook_ad"`) so it flows straight into the
 *      existing `ingestComment` → `SocialComment` → Comments-inbox pipeline.
 *
 * FAIL-SOFT, by contract:
 *   - No ad-account id, no token, or a Graph error/missing scope ⇒ `[]`. NEVER
 *     throws. A business with no ad account, or an app that hasn't yet been
 *     granted `ads_read`/`ads_management`, degrades to zero ad comments — the
 *     organic inbox is unaffected.
 *
 * PURE NORMALISATION: `normalizeAdComment` (graph comment → NormalizedComment) is
 * a side-effect-free mapper, exported + unit-tested in
 * `tests/moderation/meta-ad-comments.test.ts`.
 *
 * NOTE (live requirements): the Ads edges need `ads_read` (read) /
 * `ads_management` (hide/reply) scopes AND Meta App Review approval for the app.
 * Until then the structurally-correct code returns empty live (no creds → no
 * call). It is build-clean + ready to flip on once the scopes/review land.
 */

import type { NormalizedComment } from "@/lib/inbox/ingest";
import { safeJson } from "./fetch-util";
import { GRAPH_VERSION } from "./meta";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** A raw Graph comment node (the relevant subset of the `/comments` edge). */
export interface GraphComment {
  id?: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string } | null;
}

/**
 * Pure mapper: one raw Graph comment on an ad/boosted post → the canonical
 * `NormalizedComment` the inbox ingest understands, tagged as an AD comment.
 *
 * `platform:"facebook_ad"` keeps the `(platform, externalId)` idempotency unique
 * stable and self-describing, and lets the Comments panel offer an "Ad comments"
 * filter without a schema migration. `kind:"ad"` is carried for callers that want
 * the semantic flag directly. Returns `null` for a node missing an id or body
 * (likes/reactions/edits with no text) so the caller can drop it.
 */
export function normalizeAdComment(
  raw: GraphComment | null | undefined,
  opts: { objectStoryId?: string | null; platform?: "facebook" | "instagram" } = {},
): NormalizedComment | null {
  if (!raw) return null;
  const externalId = typeof raw.id === "string" ? raw.id.trim() : "";
  const body = typeof raw.message === "string" ? raw.message : "";
  if (!externalId || body.length === 0) return null;

  const base = opts.platform ?? "facebook";
  return {
    platform: base === "instagram" ? "instagram_ad" : "facebook_ad",
    kind: "ad",
    externalId,
    externalPostId: opts.objectStoryId ?? null,
    body,
    authorName: raw.from?.name ?? null,
    authorExternalId: raw.from?.id ?? null,
    postedAt: parseGraphTime(raw.created_time),
  };
}

/** Graph timestamps are ISO 8601 strings; tolerate epoch-seconds too. */
function parseGraphTime(t: string | number | null | undefined): Date {
  if (typeof t === "number") return new Date(t * 1000);
  if (typeof t === "string" && t.length > 0) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * List the `object_story_id`s of the ad account's promotable/active-ad posts.
 * These are the post objects whose comments the page-feed webhook does NOT
 * surface. Fail-soft: no account/token or any Graph error ⇒ `[]`.
 *
 * Strategy: prefer the `/ads` edge (covers active boosted + dark posts) and read
 * each ad's `creative{object_story_id}`. We de-dupe because many ads can share
 * one underlying post.
 */
export async function listAdStoryIds(
  adAccountId: string | null | undefined,
  token: string | null | undefined,
): Promise<string[]> {
  if (!adAccountId || !token) return [];
  // Graph expects the account id prefixed with `act_`; accept either form.
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  const res = await safeJson<{
    data?: Array<{ creative?: { object_story_id?: string } }>;
  }>(
    `${GRAPH}/${encodeURIComponent(acct)}/ads` +
      `?fields=${encodeURIComponent("creative{object_story_id}")}` +
      `&effective_status=${encodeURIComponent('["ACTIVE","PAUSED"]')}` +
      `&limit=100&access_token=${encodeURIComponent(token)}`,
    {},
    { provider: "meta", op: "list_ad_posts" },
  );
  if (!res.ok) return [];

  const ids = new Set<string>();
  for (const ad of res.data.data ?? []) {
    const sid = ad.creative?.object_story_id;
    if (typeof sid === "string" && sid.length > 0) ids.add(sid);
  }
  return [...ids];
}

/**
 * Read the comments on a single post object (an ad's `object_story_id`).
 * Fail-soft: any error ⇒ `[]`.
 */
export async function fetchObjectComments(
  objectStoryId: string,
  token: string,
): Promise<GraphComment[]> {
  if (!objectStoryId || !token) return [];
  const res = await safeJson<{ data?: GraphComment[] }>(
    `${GRAPH}/${encodeURIComponent(objectStoryId)}/comments` +
      `?fields=${encodeURIComponent("id,message,created_time,from{id,name}")}` +
      `&limit=100&access_token=${encodeURIComponent(token)}`,
    {},
    { provider: "meta", op: "list_ad_comments" },
  );
  if (!res.ok) return [];
  return res.data.data ?? [];
}

/**
 * Orchestrate ad-comment collection for one connection: enumerate ad post
 * objects, fetch each one's comments, and normalise them all into
 * `NormalizedComment`s tagged `kind:"ad"`. Fully fail-soft — every missing
 * piece (no ad account, no scope, Graph error) yields `[]`, never a throw.
 *
 * The caller (a sync job / manual refresh) feeds each result to
 * `ingestComment(orgId, comment)` so ad comments land in the same Comments inbox
 * as organic ones, deduped on `(platform, externalId)`.
 */
export async function fetchAdComments(args: {
  adAccountId?: string | null;
  /** Page (or IG-business) access token with ads_read scope. */
  token?: string | null;
  platform?: "facebook" | "instagram";
  /** Safety cap on how many post objects to scan per run. */
  maxPosts?: number;
}): Promise<NormalizedComment[]> {
  const { adAccountId, token, platform = "facebook", maxPosts = 50 } = args;
  if (!adAccountId || !token) return [];

  const storyIds = (await listAdStoryIds(adAccountId, token)).slice(0, maxPosts);
  if (storyIds.length === 0) return [];

  const out: NormalizedComment[] = [];
  for (const objectStoryId of storyIds) {
    const raw = await fetchObjectComments(objectStoryId, token);
    for (const node of raw) {
      const normalized = normalizeAdComment(node, { objectStoryId, platform });
      if (normalized) out.push(normalized);
    }
  }
  return out;
}
