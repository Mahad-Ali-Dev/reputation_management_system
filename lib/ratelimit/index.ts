import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiter helpers.
 *
 * Pattern: define a named limiter per concern (e.g. "ai_reply", "url_crawl"),
 * call `.limit(key)` at the top of the endpoint, return 429 on failure.
 *
 * Keys should always include tenant scope to prevent one org from exhausting
 * the budget for everyone:
 *   const key = `ai_reply:${orgId}`;
 *
 * Backend selection (auto):
 *   1. If UPSTASH_REDIS_REST_URL + TOKEN are set → Upstash sliding window.
 *   2. Otherwise → in-memory sliding window (single-process, single-VPS only).
 *      Survives until process restart. Sufficient for a single Hostinger VPS;
 *      switch to Upstash before adding a second app instance.
 *   3. NODE_ENV=test → always no-op (limits return success).
 */

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

type LimiterConfig = {
  /** Max requests per window */
  max: number;
  /** Window in seconds */
  windowSec: number;
  /** Prefix for the Redis key */
  prefix: string;
};

const LIMITER_CONFIGS = {
  ai_reply: { max: 30, windowSec: 60, prefix: "rl:ai_reply" }, // 30/min per org
  ai_caption: { max: 20, windowSec: 60, prefix: "rl:ai_caption" }, // 20/min per org
  ai_classify: { max: 60, windowSec: 60, prefix: "rl:ai_classify" }, // 60/min per org
  ai_assistant: { max: 20, windowSec: 300, prefix: "rl:ai_asst" }, // 20/5min per user
  url_crawl: { max: 10, windowSec: 300, prefix: "rl:url_crawl" }, // 10/5min per org
  outreach_send: { max: 100, windowSec: 60, prefix: "rl:outreach" }, // 100/min per org
  bulk_csv: { max: 5, windowSec: 3600, prefix: "rl:bulk_csv" }, // 5/hour per org
  chatbot_turn: { max: 60, windowSec: 60, prefix: "rl:chatbot" }, // 60/min per visitor
  widget_bootstrap: { max: 30, windowSec: 60, prefix: "rl:widget_bs" }, // 30/min per IP
  widget_meeting: { max: 5, windowSec: 300, prefix: "rl:widget_meeting" }, // 5/5min per visitor — public meeting-request capture
  login_attempt: { max: 10, windowSec: 300, prefix: "rl:login" }, // 10/5min per email
  signup_attempt: { max: 3, windowSec: 3600, prefix: "rl:signup" }, // 3/hour per IP
  scan_redirect: { max: 60, windowSec: 60, prefix: "rl:scan" }, // 60/min per IP per slug
  survey_token: { max: 30, windowSec: 60, prefix: "rl:survey_token" }, // 30/min per IP — public survey page lookup
  hardware_batch: { max: 3, windowSec: 3600, prefix: "rl:hw_batch" }, // 3/hour per admin — bounds DoS via 500-device QR generation
} as const satisfies Record<string, LimiterConfig>;

export type LimiterName = keyof typeof LIMITER_CONFIGS;

const _cache = new Map<LimiterName, Ratelimit>();

function getLimiter(name: LimiterName): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (_cache.has(name)) return _cache.get(name) ?? null;
  const cfg = LIMITER_CONFIGS[name];
  if (!cfg) return null;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.max, `${cfg.windowSec} s`),
    prefix: cfg.prefix,
    analytics: false,
  });
  _cache.set(name, limiter);
  return limiter;
}

// ---- In-memory sliding-window fallback ----
// Single-process limiter for when Upstash isn't configured (single-VPS
// deployments). NOT safe across multiple instances — but we don't have those.
// Memory grows with unique keys; we expire entries on access + via a periodic
// sweep to keep it bounded.
type MemEntry = { timestamps: number[] };
const _memStore = new Map<string, MemEntry>();

function memSweep() {
  const now = Date.now();
  for (const [k, entry] of _memStore) {
    // Drop entries with no recent activity (older than 1 hour).
    const newest = entry.timestamps[entry.timestamps.length - 1] ?? 0;
    if (now - newest > 60 * 60 * 1000) {
      _memStore.delete(k);
    }
  }
}
// Sweep every 5 minutes. unref so it doesn't block process exit.
if (typeof setInterval !== "undefined") {
  const handle = setInterval(memSweep, 5 * 60 * 1000);
  if (typeof handle === "object" && "unref" in handle) handle.unref();
}

function memCheck(name: LimiterName, key: string): RateLimitResult {
  const cfg = LIMITER_CONFIGS[name];
  const fullKey = `${cfg.prefix}:${key}`;
  const now = Date.now();
  const windowMs = cfg.windowSec * 1000;
  const cutoff = now - windowMs;

  const entry = _memStore.get(fullKey) ?? { timestamps: [] };
  // Drop timestamps outside the window.
  while (entry.timestamps.length > 0 && (entry.timestamps[0] ?? 0) < cutoff) {
    entry.timestamps.shift();
  }
  const count = entry.timestamps.length;
  const success = count < cfg.max;
  if (success) {
    entry.timestamps.push(now);
    _memStore.set(fullKey, entry);
    return {
      success: true,
      remaining: Math.max(0, cfg.max - count - 1),
      reset: now + windowMs,
      retryAfterSeconds: 0,
    };
  }
  // Earliest timestamp + windowMs = when one slot frees up.
  const earliest = entry.timestamps[0] ?? now;
  const reset = earliest + windowMs;
  return {
    success: false,
    remaining: 0,
    reset,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
  };
}

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
};

/**
 * Check rate limit. Returns `{ success: false }` if exhausted.
 *
 * Backend (chosen per call):
 *   - Upstash if configured (works across multiple app instances)
 *   - In-memory sliding window otherwise (single-process only)
 *   - Always succeeds when NODE_ENV === "test"
 */
export async function checkRateLimit(name: LimiterName, key: string): Promise<RateLimitResult> {
  if (process.env.NODE_ENV === "test") {
    return { success: true, remaining: Number.MAX_SAFE_INTEGER, reset: 0, retryAfterSeconds: 0 };
  }
  const limiter = getLimiter(name);
  if (!limiter) {
    // No Upstash — use in-memory fallback. Single-VPS-safe.
    return memCheck(name, key);
  }
  const result = await limiter.limit(key);
  const retryAfter = result.success
    ? 0
    : Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
    retryAfterSeconds: retryAfter,
  };
}

/**
 * Throw if rate limit is exceeded. Convenience for server actions.
 */
export async function assertRateLimit(name: LimiterName, key: string): Promise<void> {
  const result = await checkRateLimit(name, key);
  if (!result.success) {
    throw new Error(`rate_limited:${name}:retry_after_${result.retryAfterSeconds}s`);
  }
}

/**
 * For HTTP handlers: returns a 429 NextResponse if limit exceeded.
 */
export function rateLimitResponse(result: RateLimitResult): Response | null {
  if (result.success) return null;
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.retryAfterSeconds),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(result.reset),
      },
    },
  );
}
