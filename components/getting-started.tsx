"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shell/icon";
import { dismissOnboarding } from "@/lib/onboarding/actions";
import Link from "next/link";
import { type JSX, useEffect, useState } from "react";

/**
 * `<GettingStarted>` — a dismissible, progress-tracked onboarding checklist.
 *
 * The multi-step generalization of `onboarding-banner.tsx` (the single-next-step
 * dashboard banner, which stays in use). Any module page can drop this in.
 *
 * WHERE DISMISSAL STATE LIVES (reuse the existing mechanisms — no new column):
 * - Per-step completion is DERIVED from real data (each step's `done` is computed
 *   server-side from facts via `lib/onboarding/facts.ts`) — never a stored boolean.
 * - Global "I'm done onboarding" → `organizations.onboarding_step` sentinel 99 via
 *   the existing `dismissOnboarding` server action (rendered only when
 *   `allowGlobalDismiss`). A server parent that knows the org is already at >=99
 *   simply omits this component.
 * - Per-card LOCAL hide ("hide this checklist on this page") → `localStorage`
 *   key `gs:dismissed:<checklistId>`. Purely cosmetic, client-only,
 *   non-authoritative — avoids a migration for a per-device preference.
 *
 * Styling reuses the indigo gradient card look from `onboarding-banner.tsx`.
 */

export type ChecklistStep = {
  key: string;
  title: string;
  body: string;
  /** Caller computes from facts (server-side). */
  done: boolean;
  cta?: { label: string; href: string };
};

/** Local-storage key namespace for the per-card cosmetic hide. */
const dismissKey = (checklistId: string) => `gs:dismissed:${checklistId}`;

/**
 * Pure progress summary for a checklist. Exported so the math is unit-testable
 * without a DOM: `completed`, `total`, `pct` (rounded 0..100), `allDone`, and
 * the index of the first not-done step (`-1` when all done).
 */
export function checklistProgress(steps: ReadonlyArray<{ done: boolean }>): {
  completed: number;
  total: number;
  pct: number;
  allDone: boolean;
  firstIncompleteIndex: number;
} {
  const total = steps.length;
  const completed = steps.reduce((n, s) => (s.done ? n + 1 : n), 0);
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const firstIncompleteIndex = steps.findIndex((s) => !s.done);
  return {
    completed,
    total,
    pct,
    allDone: total > 0 && completed === total,
    firstIncompleteIndex,
  };
}

export function GettingStarted({
  checklistId,
  title = "Getting started",
  steps,
  allowGlobalDismiss = false,
  hideWhenComplete = true,
}: {
  /** Namespaces the local-dismiss key. */
  checklistId: string;
  title?: string;
  steps: ChecklistStep[];
  /** Render the global "Skip onboarding" form (posts dismissOnboarding). Default false. */
  allowGlobalDismiss?: boolean;
  /** Hide entirely once every step.done is true (default true). */
  hideWhenComplete?: boolean;
}): JSX.Element | null {
  // Start hidden until we've read localStorage, so we never flash a card the
  // user already dismissed on this device (avoids a hydration flicker).
  const [hydrated, setHydrated] = useState(false);
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  useEffect(() => {
    try {
      setLocallyDismissed(
        typeof window !== "undefined" &&
          window.localStorage.getItem(dismissKey(checklistId)) === "1",
      );
    } catch {
      // localStorage can throw in private mode / sandboxed iframes — treat as
      // "not dismissed" and just don't persist.
    }
    setHydrated(true);
  }, [checklistId]);

  const { completed, total, pct, allDone, firstIncompleteIndex } =
    checklistProgress(steps);

  if (!hydrated) return null;
  if (locallyDismissed) return null;
  if (hideWhenComplete && allDone) return null;

  const hideLocally = () => {
    setLocallyDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(checklistId), "1");
    } catch {
      // best-effort persistence
    }
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5">
      {/* Header: title + progress + local hide */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {title}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-900">
              {completed}/{total} complete
            </span>
            <div
              className="h-1.5 max-w-[200px] flex-1 overflow-hidden rounded-full bg-indigo-100"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${completed} of ${total} steps complete`}
            >
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={hideLocally}
          aria-label="Hide checklist"
          className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* Steps */}
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step, i) => {
          const emphasized = !step.done && i === firstIncompleteIndex;
          return (
            <li
              key={step.key}
              className={
                emphasized
                  ? "flex items-start gap-3 rounded-md border border-indigo-200 bg-white/70 p-3"
                  : "flex items-start gap-3 px-1 py-1.5"
              }
            >
              <Icon
                name={step.done ? "checkCircle" : "round"}
                size={18}
                style={{
                  color: step.done ? "var(--ok)" : "var(--rl-muted-3)",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium"
                  style={{
                    color: step.done ? "var(--rl-muted)" : "var(--ink)",
                    textDecoration: step.done ? "line-through" : "none",
                  }}
                >
                  {step.title}
                </div>
                {emphasized && (
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    {step.body}
                  </p>
                )}
                {emphasized && step.cta && (
                  <div className="mt-2">
                    <Button asChild size="sm">
                      <Link href={step.cta.href}>{step.cta.label} →</Link>
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {allowGlobalDismiss && (
        <div className="mt-3 border-t border-indigo-100 pt-3">
          <form action={dismissOnboarding}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-slate-500"
            >
              Skip onboarding
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
