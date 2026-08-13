/**
 * X (Twitter) publish + read adapter (OAuth 2.0 PKCE, API v2).
 *
 * Mirrors the Meta publish adapter's contract: the DEFAULT path makes **zero**
 * outbound calls. A live tweet (`POST /2/tweets`) or a mentions read
 * (`GET /2/users/:id/mentions`) only happens when:
 *   - `TWITTER_PUBLISH_ENABLED === "true"` (explicit opt-in), AND
 *   - a decrypted user access token is supplied by the caller.
 *
 * LIVE REQUIREMENT (noted, not faked): X's write + mentions endpoints require a
 * **paid** API tier (Basic $100+/mo or above). Without it the calls 403. We do
 * not fake success — `postTweet` surfaces the real error string up to the
 * dispatcher, which records it as a per-platform failure (fail-soft).
 *
 * The text-shaping + response-parsing helpers are PURE (no IO) and unit-tested
 * in `tests/social/twitter-adapter.test.ts`.
 */

import { runtimeFlag } from "@/lib/env-runtime";
import { PLATFORM_LIMITS } from "@/lib/social/connections";

/** Tweet hard limit (v2). Mirrors PLATFORM_LIMITS.twitter.maxChars. */
export const TWEET_MAX_CHARS = PLATFORM_LIMITS.twitter.maxChars; // 280

export type TweetText = { text: string; truncated: boolean };

/**
 * Shape a caption + hashtags into a single tweet body, hard-capped at 280.
 * PURE. Appends hashtags only when they fit; truncates the caption with an
 * ellipsis as a last resort so the request never 400s on length.
 */
export function formatTweetText(caption: string | null, hashtags: string[] = []): TweetText {
  const base = (caption ?? "").trim();
  const tags = hashtags
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);

  // Try caption + all tags first.
  const withTags = [base, tags.join(" ")].filter(Boolean).join(base && tags.length ? "\n\n" : "");
  if (withTags.length <= TWEET_MAX_CHARS) {
    return { text: withTags, truncated: false };
  }

  // Drop tags, then truncate the caption with an ellipsis.
  if (base.length <= TWEET_MAX_CHARS) {
    return { text: base, truncated: tags.length > 0 };
  }
  const sliced = base.slice(0, TWEET_MAX_CHARS - 1).trimEnd();
  return { text: `${sliced}…`, truncated: true };
}

/** Build the JSON body for POST /2/tweets. PURE. */
export function buildTweetPayload(args: {
  caption: string | null;
  hashtags?: string[];
  /** Up to 4 already-uploaded media ids (X requires a separate media upload). */
  mediaIds?: string[];
}): { text: string; media?: { media_ids: string[] } } {
  const { text } = formatTweetText(args.caption, args.hashtags ?? []);
  const mediaIds = (args.mediaIds ?? []).filter(Boolean).slice(0, 4);
  return {
    text,
    ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}),
  };
}

/** Raw v2 create-tweet response subset. */
export interface TweetCreateResponse {
  data?: { id?: string; text?: string };
  errors?: Array<{ message?: string; title?: string }>;
}

/**
 * Extract the new tweet id from a v2 response, or throw a readable error. PURE.
 */
export function parseTweetResponse(json: TweetCreateResponse): string {
  const id = json.data?.id;
  if (id && typeof id === "string") return id;
  const err = json.errors?.[0];
  throw new Error(err?.message ?? err?.title ?? "twitter_no_id");
}

/** A normalized mention (parsed from GET /2/users/:id/mentions). */
export type TwitterMention = {
  externalId: string;
  text: string;
  authorId: string | null;
  createdAt: Date | null;
};

interface MentionsResponse {
  data?: Array<{ id?: string; text?: string; author_id?: string; created_at?: string }>;
}

/** Map a v2 mentions response into normalized mentions. PURE. */
export function parseMentions(json: MentionsResponse): TwitterMention[] {
  const out: TwitterMention[] = [];
  for (const m of json.data ?? []) {
    const externalId = typeof m.id === "string" ? m.id.trim() : "";
    const text = typeof m.text === "string" ? m.text : "";
    if (!externalId) continue;
    out.push({
      externalId,
      text,
      authorId: typeof m.author_id === "string" ? m.author_id : null,
      createdAt: m.created_at ? safeDate(m.created_at) : null,
    });
  }
  return out;
}

function safeDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Live publish enabled? Explicit opt-in flag only — mirrors isMetaPublishEnabled. */
export function isTwitterPublishEnabled(): boolean {
  return runtimeFlag("TWITTER_PUBLISH_ENABLED");
}

const API_BASE = "https://api.twitter.com/2";

/**
 * Post a tweet via POST /2/tweets. The ONLY function here that makes a live
 * (paid-tier) call. Reached only behind `isTwitterPublishEnabled()` + a token.
 * Returns the new tweet id, or throws a readable error (the dispatcher catches
 * it and records a per-platform failure — it never aborts other platforms).
 */
export async function postTweet(args: {
  token: string;
  caption: string | null;
  hashtags?: string[];
  mediaIds?: string[];
  timeoutMs?: number;
}): Promise<string> {
  const payload = buildTweetPayload({
    caption: args.caption,
    hashtags: args.hashtags,
    mediaIds: args.mediaIds,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  try {
    const res = await fetch(`${API_BASE}/tweets`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as TweetCreateResponse;
    if (!res.ok) {
      const detail = json.errors?.[0]?.message ?? json.errors?.[0]?.title ?? "";
      throw new Error(`twitter_http_${res.status}: ${detail}`.slice(0, 200));
    }
    return parseTweetResponse(json);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read recent mentions for a connected X user. Fail-soft: returns `[]` on any
 * error or when not enabled. `userId` is the connection's stored externalId
 * (the numeric X user id captured at connect).
 */
export async function fetchMentions(args: {
  token: string;
  userId: string;
  maxResults?: number;
  timeoutMs?: number;
}): Promise<TwitterMention[]> {
  if (!isTwitterPublishEnabled() || !args.token || !args.userId) return [];
  const max = Math.min(Math.max(args.maxResults ?? 25, 5), 100);
  const url =
    `${API_BASE}/users/${encodeURIComponent(args.userId)}/mentions` +
    `?max_results=${max}&tweet.fields=created_at,author_id`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${args.token}`, accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => ({}))) as MentionsResponse;
    return parseMentions(json);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
