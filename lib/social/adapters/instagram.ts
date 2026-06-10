/**
 * Instagram Business PUBLISH adapter — reuses the existing **Meta** connection.
 *
 * Instagram has NO separate OAuth here: a connected `meta` connection already
 * carries a Facebook Page whose linked `instagram_business_account` id is the
 * publish target. Publishing is a two-step Graph dance:
 *   1. POST /{ig-user-id}/media           → returns a creation_id (container)
 *   2. POST /{ig-user-id}/media_publish   → publishes the container → media id
 *
 * IG **requires media** (no text-only posts) — the dispatch pre-check
 * (`validatePost`) already enforces that, and `publishToInstagram` re-asserts it.
 *
 * The Meta connection stores the Page id as `externalId` (not the IG business
 * id), so we resolve the IG business id at publish time from the Page id + token
 * (`resolveIgBusinessId`). Fail-soft: a Page with no linked IG account ⇒ a
 * readable `no_ig_business_account` error (recorded as a per-platform failure).
 *
 * Gated by the SAME `isMetaPublishEnabled()` flag as Facebook (it's the same
 * Graph token + the same opt-in) — no new env var. The container/publish parsers
 * are PURE and unit-tested in `tests/social/instagram-adapter.test.ts`.
 */

import { GRAPH_VERSION } from "@/lib/connections/adapters/meta";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Live IG publish enabled? IG rides the SAME Meta Graph token + opt-in as
 * Facebook, so it shares the `META_GRAPH_ENABLED` gate (no new env var). Kept as
 * its own named export so the publish dispatcher's IG branch is self-describing.
 */
export function isInstagramPublishEnabled(): boolean {
  return (
    process.env.META_GRAPH_ENABLED === "true" &&
    Boolean(process.env.META_GRAPH_TOKEN || process.env.META_APP_ID)
  );
}

/** Parse a creation_id (container) from a /media response. PURE. */
export function parseContainerResponse(json: { id?: string }): string {
  const id = json?.id;
  if (id && typeof id === "string") return id;
  throw new Error("ig_no_container_id");
}

/** Parse the published media id from a /media_publish response. PURE. */
export function parsePublishResponse(json: { id?: string }): string {
  const id = json?.id;
  if (id && typeof id === "string") return id;
  throw new Error("ig_no_media_id");
}

/**
 * Resolve a Page's linked Instagram Business account id. Fail-soft: returns null
 * on any error or when the Page has no linked IG account.
 */
export async function resolveIgBusinessId(args: {
  pageId: string;
  token: string;
  timeoutMs?: number;
}): Promise<string | null> {
  if (!args.pageId || !args.token) return null;
  const url =
    `${GRAPH}/${encodeURIComponent(args.pageId)}` +
    `?fields=instagram_business_account&access_token=${encodeURIComponent(args.token)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      instagram_business_account?: { id?: string };
    } | null;
    return json?.instagram_business_account?.id ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish a single image to Instagram (container → publish). The ONLY function
 * that makes live Graph calls. Reached only behind `isMetaPublishEnabled()` + a
 * live Meta connection (the publish dispatcher enforces both). Returns the
 * published media id, or throws a readable error.
 *
 * `igUserId` is the Instagram Business account id (resolved via
 * `resolveIgBusinessId`); `media` is a publicly reachable image URL (IG fetches
 * it server-side — required, no text-only).
 */
export async function publishToInstagram(args: {
  igUserId: string;
  token: string;
  caption: string | null;
  media: string | null;
  timeoutMs?: number;
}): Promise<string> {
  if (!args.media) throw new Error("ig_requires_media");
  const caption = args.caption ?? "";
  const timeoutMs = args.timeoutMs ?? 15_000;

  // Step 1: create the media container.
  const containerBody = new URLSearchParams();
  containerBody.set("image_url", args.media);
  if (caption) containerBody.set("caption", caption);
  containerBody.set("access_token", args.token);

  const creationId = await graphPost(
    `${GRAPH}/${encodeURIComponent(args.igUserId)}/media`,
    containerBody,
    timeoutMs,
    parseContainerResponse,
  );

  // Step 2: publish the container.
  const publishBody = new URLSearchParams();
  publishBody.set("creation_id", creationId);
  publishBody.set("access_token", args.token);

  return graphPost(
    `${GRAPH}/${encodeURIComponent(args.igUserId)}/media_publish`,
    publishBody,
    timeoutMs,
    parsePublishResponse,
  );
}

async function graphPost(
  url: string,
  body: URLSearchParams,
  timeoutMs: number,
  parse: (json: { id?: string }) => string,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok) {
      throw new Error(`ig_graph_http_${res.status}: ${json?.error?.message ?? ""}`.slice(0, 200));
    }
    return parse(json);
  } finally {
    clearTimeout(timer);
  }
}
