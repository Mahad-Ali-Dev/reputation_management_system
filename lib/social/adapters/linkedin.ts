/**
 * LinkedIn publish adapter (OAuth 2.0, UGC Posts API).
 *
 * Same contract as the Meta/Twitter publish adapters: the DEFAULT path makes
 * **zero** outbound calls. A live post (`POST /v2/ugcPosts`) only happens when:
 *   - `LINKEDIN_PUBLISH_ENABLED === "true"` (explicit opt-in), AND
 *   - a decrypted member/org access token is supplied by the caller.
 *
 * AUTHOR URN: a LinkedIn post is authored by an `author` URN — either a member
 * (`urn:li:person:{id}`, scope `w_member_social`) or a company page
 * (`urn:li:organization:{id}`, scope `w_organization_social`). The connection's
 * stored `externalId` is the resolved URN captured at connect; we prefer an
 * organization URN when present so posts land on the company page.
 *
 * LIVE REQUIREMENT (noted, not faked): organization posting needs LinkedIn's
 * Marketing Developer Platform approval (2–4 weeks). Until then the structurally
 * correct code returns/throws real errors — it never fakes success.
 *
 * Payload-shaping + response-parsing helpers are PURE and unit-tested in
 * `tests/social/linkedin-adapter.test.ts`.
 */

import { runtimeFlag } from "@/lib/env-runtime";
import { PLATFORM_LIMITS } from "@/lib/social/connections";

export const LINKEDIN_MAX_CHARS = PLATFORM_LIMITS.linkedin.maxChars; // 3000

/** Build a `urn:li:person:{id}` or `urn:li:organization:{id}` author URN. PURE. */
export function buildAuthorUrn(args: {
  organizationId?: string | null;
  personId?: string | null;
  /** A raw URN already stored on the connection (`urn:li:...`) wins. */
  rawUrn?: string | null;
}): string | null {
  const raw = (args.rawUrn ?? "").trim();
  if (raw.startsWith("urn:li:")) return raw;
  const org = (args.organizationId ?? "").trim();
  if (org) return `urn:li:organization:${org.replace(/^urn:li:organization:/, "")}`;
  const person = (args.personId ?? "").trim();
  if (person) return `urn:li:person:${person.replace(/^urn:li:person:/, "")}`;
  return null;
}

/** Clamp the commentary text to LinkedIn's ceiling. PURE. */
export function formatLinkedInText(caption: string | null, hashtags: string[] = []): string {
  const base = (caption ?? "").trim();
  const tags = hashtags
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);
  const joined = [base, tags.join(" ")].filter(Boolean).join(base && tags.length ? "\n\n" : "");
  return joined.length <= LINKEDIN_MAX_CHARS ? joined : joined.slice(0, LINKEDIN_MAX_CHARS);
}

const API_BASE = "https://api.linkedin.com/v2";

/**
 * Build a UGC Posts body. PURE.
 *
 * An `assetUrn` (from registerAndUploadImage) produces a real IMAGE share.
 * Passing `mediaUrl` alone produces an ARTICLE share, which LinkedIn renders as
 * a LINK CARD showing the URL — not the picture. That used to be the only mode
 * here, chosen to avoid the asset-upload round-trip, and it meant every image
 * post went out as a bare link to our media endpoint.
 */
export function buildLinkedInPayload(args: {
  authorUrn: string;
  caption: string | null;
  hashtags?: string[];
  mediaUrl?: string | null;
  assetUrn?: string | null;
}): Record<string, unknown> {
  const text = formatLinkedInText(args.caption, args.hashtags ?? []);
  const category = args.assetUrn ? "IMAGE" : args.mediaUrl ? "ARTICLE" : "NONE";

  const media = args.assetUrn
    ? [{ status: "READY", media: args.assetUrn }]
    : args.mediaUrl
      ? [{ status: "READY", originalUrl: args.mediaUrl }]
      : null;

  return {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: category,
        ...(media ? { media } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
}

/**
 * Upload an image to LinkedIn and return its asset URN.
 *
 * LinkedIn will not accept a remote URL for a picture: it has to be registered,
 * then PUT as bytes, then referenced by URN. Three round-trips, which is why the
 * original code took the ARTICLE shortcut.
 *
 * Throws on failure rather than silently degrading to a link card — a marketing
 * post quietly losing its image is worse than one that fails and can be retried.
 */
export async function registerAndUploadImage(args: {
  token: string;
  authorUrn: string;
  imageUrl: string;
  timeoutMs?: number;
}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 30_000);
  const headers = {
    authorization: `Bearer ${args.token}`,
    "content-type": "application/json",
    "x-restli-protocol-version": "2.0.0",
  };

  try {
    // 1. Register the upload and get a one-time URL + the asset URN.
    const regRes = await fetch(`${API_BASE}/assets?action=registerUpload`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: args.authorUrn,
          serviceRelationships: [
            { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
          ],
        },
      }),
      signal: ctrl.signal,
    });
    const regJson = (await regRes.json().catch(() => null)) as {
      value?: {
        asset?: string;
        uploadMechanism?: Record<string, { uploadUrl?: string }>;
      };
      message?: string;
    } | null;
    if (!regRes.ok) {
      throw new Error(
        `linkedin_asset_register_${regRes.status}: ${regJson?.message ?? ""}`.slice(0, 200),
      );
    }
    const asset = regJson?.value?.asset;
    const uploadUrl =
      regJson?.value?.uploadMechanism?.[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ]?.uploadUrl;
    if (!asset || !uploadUrl) throw new Error("linkedin_asset_register_incomplete");

    // 2. Fetch our own copy of the image.
    const imgRes = await fetch(args.imageUrl, { signal: ctrl.signal });
    if (!imgRes.ok) {
      throw new Error(`linkedin_image_fetch_${imgRes.status}`);
    }
    const bytes = Buffer.from(await imgRes.arrayBuffer());

    // 3. PUT the bytes. LinkedIn returns 201 with an empty body.
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${args.token}` },
      body: new Uint8Array(bytes),
      signal: ctrl.signal,
    });
    if (!putRes.ok) {
      throw new Error(`linkedin_image_upload_${putRes.status}`);
    }

    return asset;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the new post id. LinkedIn returns it in the `x-restli-id` header or
 * the JSON `id`. PURE. Throws a readable error when neither is present.
 */
export function parseLinkedInResponse(args: {
  headerId?: string | null;
  json?: { id?: string } | null;
}): string {
  const headerId = (args.headerId ?? "").trim();
  if (headerId) return headerId;
  const jsonId = args.json?.id;
  if (jsonId && typeof jsonId === "string") return jsonId;
  throw new Error("linkedin_no_id");
}

/** Live publish enabled? Explicit opt-in flag only. */
export function isLinkedInPublishEnabled(): boolean {
  return runtimeFlag("LINKEDIN_PUBLISH_ENABLED", process.env.LINKEDIN_PUBLISH_ENABLED);
}

/**
 * Post to LinkedIn via POST /v2/ugcPosts. The ONLY function that makes a live
 * call. Reached only behind `isLinkedInPublishEnabled()` + a token + URN.
 * Returns the new post id (URN), or throws a readable error.
 */
export async function postToLinkedIn(args: {
  token: string;
  authorUrn: string;
  caption: string | null;
  hashtags?: string[];
  mediaUrl?: string | null;
  timeoutMs?: number;
}): Promise<string> {
  // Register + upload the image FIRST so the post is a real IMAGE share rather
  // than a link card pointing at our media endpoint.
  let assetUrn: string | null = null;
  if (args.mediaUrl) {
    assetUrn = await registerAndUploadImage({
      token: args.token,
      authorUrn: args.authorUrn,
      imageUrl: args.mediaUrl,
      timeoutMs: args.timeoutMs,
    });
  }

  const payload = buildLinkedInPayload({
    authorUrn: args.authorUrn,
    caption: args.caption,
    hashtags: args.hashtags,
    mediaUrl: args.mediaUrl,
    assetUrn,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  try {
    const res = await fetch(`${API_BASE}/ugcPosts`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.token}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-restli-protocol-version": "2.0.0",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const headerId = res.headers.get("x-restli-id");
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) {
      throw new Error(`linkedin_http_${res.status}: ${json?.message ?? ""}`.slice(0, 200));
    }
    return parseLinkedInResponse({ headerId, json });
  } finally {
    clearTimeout(timer);
  }
}
