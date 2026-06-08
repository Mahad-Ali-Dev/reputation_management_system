/**
 * Shared, fail-soft fetch helper for provider adapters.
 *
 * Every adapter network call goes through here so the sync engine never throws
 * on a flaky provider, a 4xx, or a timeout — it degrades to "no contacts this
 * run" and the engine records a `skipped`/`error` ConnectionSyncLog instead of
 * 500-ing the cron. Adapters that have no creds never reach this (they return
 * `[]` before any fetch).
 */

import { logger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 15_000;

export type SafeJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string };

/**
 * GET/POST JSON with a hard timeout. Returns a discriminated result rather than
 * throwing. `status` is the HTTP status (or null on a network/timeout error).
 */
export async function safeJson<T = unknown>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
  context?: { provider: string; op: string },
): Promise<SafeJsonResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({
        event: "connection.adapter.http_error",
        provider: context?.provider,
        op: context?.op,
        status: res.status,
        body: body.slice(0, 200),
      });
      return { ok: false, status: res.status, error: `http_${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({
      event: "connection.adapter.fetch_failed",
      provider: context?.provider,
      op: context?.op,
      error,
    });
    return { ok: false, status: null, error };
  } finally {
    clearTimeout(timer);
  }
}

/** Trim + lower an email, returning null when empty/obviously invalid. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length > 3 && e.includes("@") ? e : null;
}

/** Trim a phone, returning null when empty. (E.164 normalization happens on import.) */
export function cleanPhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const p = v.trim();
  return p.length >= 5 ? p : null;
}

/** Build a display name from optional first/last/full parts. */
export function buildName(parts: {
  full?: unknown;
  first?: unknown;
  last?: unknown;
}): string | null {
  const full = typeof parts.full === "string" ? parts.full.trim() : "";
  if (full) return full;
  const first = typeof parts.first === "string" ? parts.first.trim() : "";
  const last = typeof parts.last === "string" ? parts.last.trim() : "";
  const joined = `${first} ${last}`.trim();
  return joined.length > 0 ? joined : null;
}
