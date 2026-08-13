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

/**
 * Build a UGC Posts body (text or article/image share). PURE.
 * `mediaUrl` (when present) is attached as an ARTICLE share — the simplest media
 * mode that needs no separate asset-register round-trip.
 */
export function buildLinkedInPayload(args: {
  authorUrn: string;
  caption: string | null;
  hashtags?: string[];
  mediaUrl?: string | null;
}): Record<string, unknown> {
  const text = formatLinkedInText(args.caption, args.hashtags ?? []);
  const hasMedia = Boolean(args.mediaUrl);

  return {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: hasMedia ? "ARTICLE" : "NONE",
        ...(hasMedia
          ? {
              media: [
                {
                  status: "READY",
                  originalUrl: args.mediaUrl,
                },
              ],
            }
          : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
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
  return runtimeFlag("LINKEDIN_PUBLISH_ENABLED");
}

const API_BASE = "https://api.linkedin.com/v2";

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
  const payload = buildLinkedInPayload({
    authorUrn: args.authorUrn,
    caption: args.caption,
    hashtags: args.hashtags,
    mediaUrl: args.mediaUrl,
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
