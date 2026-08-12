/**
 * Scheduled-job handler registry.
 *
 * One handler per `ScheduledKind`. The foundation ships THIN stubs that route to
 * the owning module's service with a clear TODO marker; each later wave replaces
 * its stub with the real body (the dispatcher imports `HANDLERS` by reference, so
 * a module only edits its own `handlers/<kind>.ts` file — never this registry or
 * the dispatcher).
 *
 * Contract (from 00_foundation.md A7):
 *   - A handler receives an already-tenant-resolved job ({id, orgId, kind, payload}).
 *   - It performs its side effect INSIDE `withTenant(orgId, …)` itself (the
 *     dispatcher only wraps the claim + status writes in withTenant; the handler
 *     owns its own tenant-scoped reads/writes so module code stays self-contained).
 *   - It returns `{ ok, detail? }`. `ok:false` is a soft failure — the dispatcher
 *     will retry up to `maxAttempts`. A THROW is also treated as a retryable
 *     failure (the dispatcher catches it). Handlers should therefore throw only
 *     for genuinely transient problems and return `{ok:false}` for permanent ones
 *     they want surfaced in `lastError` without exhausting retries differently.
 */

export type ScheduledKind =
  | "scheduled_post"
  | "scheduled_request"
  | "scheduled_reply"
  | "onboarding_step"
  | "kb_crawl";

export type ScheduledHandlerJob = {
  id: string;
  orgId: string;
  kind: ScheduledKind;
  payload: Record<string, unknown>;
};

export type ScheduledHandler = (
  job: ScheduledHandlerJob,
) => Promise<{ ok: boolean; detail?: string }>;

import { handleKbCrawl } from "./kb_crawl";
import { handleOnboardingStep } from "./onboarding_step";
import { handleScheduledPost } from "./scheduled_post";
import { handleScheduledReply } from "./scheduled_reply";
import { handleScheduledRequest } from "./scheduled_request";

/**
 * Map every `ScheduledKind` to its handler. Exhaustive by construction — adding
 * a new kind to the union forces a new entry here (TypeScript errors otherwise),
 * which is what we want so the cron can never receive an unhandled kind.
 */
export const HANDLERS: Record<ScheduledKind, ScheduledHandler> = {
  scheduled_post: handleScheduledPost,
  scheduled_request: handleScheduledRequest,
  scheduled_reply: handleScheduledReply,
  onboarding_step: handleOnboardingStep,
  kb_crawl: handleKbCrawl,
};
