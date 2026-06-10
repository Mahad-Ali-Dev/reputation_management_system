/**
 * Platform publish adapter (Module 10, Wave 3d) — env-gated, NO live paid
 * calls by default.
 *
 * `publishSocialPost(post, orgId)` attempts to publish a stored `SocialPost` to
 * each of its target platforms. The default, unattended path makes **zero**
 * outbound calls:
 *
 *   - For each platform we resolve the active `Connection` via the single
 *     provider-mapping point (`lib/social/connections.ts`).
 *   - If there is no connection OR the platform's publish env is not enabled
 *     (`META_GRAPH_ENABLED` for Meta), the platform returns
 *     `{ skipped: "not_configured" }` and **no network call happens**.
 *   - Only when explicitly enabled AND connected do we decrypt the stored token
 *     and POST to the Graph API. LinkedIn / X have no live adapter yet and
 *     always return `not_configured`.
 *
 * The caller (`lib/social/dispatch.ts`) aggregates the per-platform results into
 * `SocialPost.externalIds` + `status`. This module never writes to the DB or
 * mutates post state — it is a pure adapter so it is trivially mockable and so
 * the "no paid call" guarantee can be asserted by spying on `fetch`.
 */

import { decryptAccessToken } from "@/lib/connections/adapters/refresh";
import { GRAPH_VERSION } from "@/lib/connections/adapters/meta";
import { platformToProvider, type SocialPlatform } from "@/lib/social/connections";
import {
  isInstagramPublishEnabled,
  publishToInstagram,
  resolveIgBusinessId,
} from "@/lib/social/adapters/instagram";
import { isTwitterPublishEnabled, postTweet } from "@/lib/social/adapters/twitter";
import { isLinkedInPublishEnabled, postToLinkedIn } from "@/lib/social/adapters/linkedin";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/** Result for a single platform within a publish attempt. */
export type PlatformPublishResult =
  | { platform: SocialPlatform; ok: true; externalId: string }
  | { platform: SocialPlatform; ok: false; skipped: string }
  | { platform: SocialPlatform; ok: false; error: string };

/** The minimal shape of a `SocialPost` the publisher needs. */
export type PublishablePost = {
  id: string;
  platforms: string[];
  caption: string | null;
  mediaUrl: string | null;
  approvedCreativeUrls?: string[];
  establishmentId: string | null;
};

/**
 * Is live Meta (Facebook/Instagram) publishing enabled? Requires BOTH an
 * explicit opt-in flag AND a token to exist. Default unset → false → no paid
 * call. This mirrors the adapter-availability pattern in `lib/connections`.
 */
export function isMetaPublishEnabled(): boolean {
  return (
    process.env.META_GRAPH_ENABLED === "true" &&
    Boolean(process.env.META_GRAPH_TOKEN || process.env.META_APP_ID)
  );
}

/** Postgres 42P01 / 42703 → connections table/columns not migrated yet. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** Minimal connection row needed to decrypt a token + identify the target. */
type ConnTokenRow = {
  id: string;
  organizationId: string;
  provider: string;
  externalId: string | null;
  accessTokenCt: Uint8Array;
  refreshTokenCt: Uint8Array | null;
  iv: Uint8Array;
  keyVersion: number;
  dekCiphertext: Uint8Array;
  encryptionCtx: unknown;
};

/**
 * Load the active connection for a provider (newest first). Fail-soft: returns
 * null on any error (including not-migrated), so the publisher degrades to
 * `not_configured` rather than throwing.
 */
async function loadActiveConnection(
  orgId: string,
  provider: string,
  establishmentId: string | null,
): Promise<ConnTokenRow | null> {
  try {
    return (await withTenant(orgId, async (tx) =>
      tx.connection.findFirst({
        where: {
          provider,
          status: "active",
          ...(establishmentId
            ? { OR: [{ establishmentId }, { establishmentId: null }] }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          organizationId: true,
          provider: true,
          externalId: true,
          accessTokenCt: true,
          refreshTokenCt: true,
          iv: true,
          keyVersion: true,
          dekCiphertext: true,
          encryptionCtx: true,
        },
      }),
    )) as ConnTokenRow | null;
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        provider,
        event: "social.publish.connection_load_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

/**
 * Publish to one platform. Returns a skip (default path) or a real external id.
 * NEVER throws — any failure becomes `{ ok:false, error }` so one bad platform
 * doesn't abort the others.
 */
async function publishToPlatform(
  platform: SocialPlatform,
  post: PublishablePost,
  orgId: string,
): Promise<PlatformPublishResult> {
  // Env gate FIRST — proves no paid call in the default path even when a
  // connection exists. Each platform has its OWN explicit opt-in flag; absent it
  // we never reach the connection lookup or any network call.
  if (!isPlatformPublishEnabled(platform)) {
    return { platform, ok: false, skipped: "not_configured" };
  }

  const provider = platformToProvider(platform); // meta | x | linkedin
  const conn = await loadActiveConnection(orgId, provider, post.establishmentId);
  if (!conn) {
    return { platform, ok: false, skipped: "not_configured" };
  }

  const token = decryptAccessToken({
    id: conn.id,
    organizationId: conn.organizationId,
    provider: conn.provider,
    externalId: conn.externalId,
    accountLabel: null,
    establishmentId: null,
    accessTokenCt: conn.accessTokenCt,
    refreshTokenCt: conn.refreshTokenCt,
    iv: conn.iv,
    keyVersion: conn.keyVersion,
    dekCiphertext: conn.dekCiphertext,
    encryptionCtx: conn.encryptionCtx,
    tokenExpiresAt: null,
    scopes: [],
  });
  if (!token) {
    return { platform, ok: false, error: "token_decrypt_failed" };
  }

  const targetId = conn.externalId; // Page id (meta) / user id (x) / author URN (linkedin)
  if (!targetId) {
    return { platform, ok: false, error: "no_target_id" };
  }

  const media = pickMedia(post);
  try {
    const externalId = await publishOne({ platform, targetId, token, post, media });
    return { platform, ok: true, externalId };
  } catch (err) {
    return {
      platform,
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
    };
  }
}

/**
 * Per-platform live-publish gate. Each platform is OFF by default behind its own
 * env flag (Meta: META_GRAPH_ENABLED; X: TWITTER_PUBLISH_ENABLED; LinkedIn:
 * LINKEDIN_PUBLISH_ENABLED). IG shares the Meta gate.
 */
function isPlatformPublishEnabled(platform: SocialPlatform): boolean {
  switch (platform) {
    case "facebook":
      return isMetaPublishEnabled();
    case "instagram":
      return isInstagramPublishEnabled();
    case "twitter":
      return isTwitterPublishEnabled();
    case "linkedin":
      return isLinkedInPublishEnabled();
  }
}

/** Route one platform's publish to its adapter. Throws on failure (caught above). */
async function publishOne(args: {
  platform: SocialPlatform;
  targetId: string;
  token: string;
  post: PublishablePost;
  media: string | null;
}): Promise<string> {
  const { platform, targetId, token, post, media } = args;
  switch (platform) {
    case "facebook":
      return postToFacebook({ targetId, token, caption: post.caption, media });
    case "instagram": {
      // The meta connection stores the Page id; resolve the IG business id from
      // it at publish time. IG requires media.
      const igUserId = await resolveIgBusinessId({ pageId: targetId, token });
      if (!igUserId) throw new Error("no_ig_business_account");
      return publishToInstagram({ igUserId, token, caption: post.caption, media });
    }
    case "twitter":
      return postTweet({ token, caption: post.caption });
    case "linkedin":
      return postToLinkedIn({ token, authorUrn: targetId, caption: post.caption, mediaUrl: media });
  }
}

/** First media URL for the post (carousel ordering: creatives win, else legacy single). */
function pickMedia(post: PublishablePost): string | null {
  const ordered = post.approvedCreativeUrls ?? [];
  if (ordered.length > 0 && ordered[0]) return ordered[0];
  return post.mediaUrl || null;
}

/**
 * Publish to a Facebook Page via the Graph API. Reached only behind
 * `isMetaPublishEnabled()` + a live connection. Image posts use `/photos`, plain
 * text uses `/feed`. (Instagram has its own container-based adapter.)
 */
async function postToFacebook(args: {
  targetId: string;
  token: string;
  caption: string | null;
  media: string | null;
}): Promise<string> {
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;
  const message = args.caption ?? "";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    let url: string;
    const body = new URLSearchParams();
    body.set("access_token", args.token);

    if (args.media) {
      url = `${base}/${args.targetId}/photos`;
      body.set("url", args.media);
      if (message) body.set("caption", message);
    } else {
      url = `${base}/${args.targetId}/feed`;
      body.set("message", message);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`graph_http_${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id?: string; post_id?: string };
    const id = json.post_id ?? json.id;
    if (!id) throw new Error("graph_no_id");
    return id;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish a post to all of its platforms. Returns one result per platform.
 * Never throws. The default path (no creds) returns all-`skipped`.
 */
export async function publishSocialPost(
  post: PublishablePost,
  orgId: string,
): Promise<PlatformPublishResult[]> {
  const platforms = post.platforms
    .map((p) => p.toLowerCase())
    .filter((p): p is SocialPlatform =>
      ["facebook", "instagram", "twitter", "linkedin"].includes(p),
    );

  const results: PlatformPublishResult[] = [];
  for (const platform of platforms) {
    results.push(await publishToPlatform(platform, post, orgId));
  }
  return results;
}
