"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  RotateCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type {
  ConnectionSuggestion,
  OnboardingStatusResponse,
  OnboardingStepRecord,
  StepState,
} from "@/lib/onboarding/constants";
import { retryOnboarding } from "@/lib/onboarding/orchestrator-actions";

/**
 * `<OnboardingProgress>` — the live build view.
 *
 * Polls `GET /api/onboarding/status` every 1.5s and renders a vertical step
 * checklist (spinner → check → detail), an overall progress bar, and the
 * detected connection SUGGESTION cards (one-click Connect deep-links) once the
 * run reaches `needs_user`. Auto-redirects to `/dashboard` when `done`.
 *
 * Polling stops when status is `done` or `failed`. On `needs_user` the run is
 * usable but stalled waiting on the user (OAuth, or a stuck step) — we surface
 * the suggestion cards plus a "Resume setup" retry.
 */

const POLL_MS = 1500;

export function OnboardingProgress({
  initialStatus,
}: {
  initialStatus: OnboardingStatusResponse;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatusResponse>(initialStatus);
  const [redirecting, setRedirecting] = useState(false);
  const redirectedRef = useRef(false);

  const run = status.run;
  const isTerminal = run?.status === "done" || run?.status === "failed";

  // Poll the status endpoint until the run reaches a terminal state.
  useEffect(() => {
    if (isTerminal) return;
    let active = true;

    async function tick() {
      try {
        const res = await fetch("/api/onboarding/status", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const next = (await res.json()) as OnboardingStatusResponse;
        if (active) setStatus(next);
      } catch {
        // transient network blip — the next tick retries
      }
    }

    const id = setInterval(tick, POLL_MS);
    // fire one immediately so a stale server snapshot updates fast
    void tick();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isTerminal]);

  // Auto-redirect to the dashboard once the build is done.
  useEffect(() => {
    if (run?.status === "done" && !redirectedRef.current) {
      redirectedRef.current = true;
      setRedirecting(true);
      const t = setTimeout(() => router.push("/dashboard"), 900);
      return () => clearTimeout(t);
    }
  }, [run?.status, router]);

  if (!run) {
    return (
      <div className="rl-rise rounded-rl-card border border-rl-border bg-rl-surface p-6 shadow-rl-sm">
        <p className="rl-body text-rl-text-muted">
          Setup isn't available yet. Please refresh in a moment.
        </p>
      </div>
    );
  }

  const doneCount = run.steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  const pct = run.totalSteps > 0 ? Math.round((doneCount / run.totalSteps) * 100) : 0;
  const isDone = run.status === "done";
  const isFailed = run.status === "failed";
  const isNeedsUser = run.status === "needs_user";

  return (
    <div className="rl-rise flex flex-1 flex-col">
      {/* Header */}
      <header>
        <h1 className="rl-h1 text-rl-text">
          {isDone
            ? "Your dashboard is ready"
            : isFailed
              ? "We hit a snag"
              : isNeedsUser
                ? "Almost there"
                : "Building your dashboard"}
        </h1>
        <p className="rl-body mt-2 text-rl-text-muted">
          {isDone ? (
            <>Taking you to your dashboard…</>
          ) : isFailed ? (
            <>Something went wrong while setting up. You can resume from where it stopped.</>
          ) : isNeedsUser ? (
            <>
              {run.businessName ?? "Your workspace"} is set up. Connect your review platforms below
              to finish or head straight to your dashboard.
            </>
          ) : (
            <>
              Our agent is reading {hostnameOf(run.websiteUrl) ?? "your website"} and configuring
              everything. This usually takes under a minute.
            </>
          )}
        </p>
      </header>

      {/* Progress bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <span className="rl-caption text-rl-text-muted">
            {doneCount} of {run.totalSteps} steps
          </span>
          <span className="rl-caption rl-tabular text-rl-text-muted">{pct}%</span>
        </div>
        <div
          aria-label={`${doneCount} of ${run.totalSteps} steps complete`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={pct}
          className="mt-2 h-2 overflow-hidden rounded-rl-pill bg-rl-surface-3"
          role="progressbar"
        >
          <div
            className={`h-full rounded-rl-pill transition-[width] duration-500 ease-rl ${
              isFailed ? "bg-rl-danger" : isDone ? "bg-rl-success" : "bg-rl-pri"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Step checklist */}
      <ol className="mt-7 grid gap-1">
        {run.steps.map((step, i) => (
          <StepRow active={i === run.currentStep} key={step.key} step={step} />
        ))}
      </ol>

      {/* Connection suggestions (Step D) — surfaced when the run waits on the user. */}
      {isNeedsUser && run.suggestions.length > 0 ? (
        <section className="mt-8">
          <h2 className="rl-overline text-rl-text-muted">Connect your review platforms</h2>
          <p className="rl-caption mt-1 text-rl-text-subtle">
            We found these on your website. Connect to pull in reviews automatically.
          </p>
          <div className="mt-4 grid gap-3">
            {run.suggestions.map((s) => (
              <SuggestionCard key={`${s.provider}:${s.url}`} suggestion={s} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Footer actions */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {isDone || isNeedsUser ? (
          <a
            className="rl-focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-rl-control border border-rl-pri bg-rl-pri px-5 rl-label text-rl-text-on-pri shadow-rl-sm transition-[background,box-shadow] duration-150 ease-rl hover:bg-rl-pri-700 hover:shadow-rl-md"
            href="/dashboard"
          >
            {redirecting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : null}
            Go to dashboard
            <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </a>
        ) : null}

        {isNeedsUser || isFailed ? <RetryButton /> : null}
      </div>
    </div>
  );
}

function StepRow({ active, step }: { active: boolean; step: OnboardingStepRecord }) {
  return (
    <li
      className={`flex items-start gap-3 rounded-rl-control px-3 py-3 transition-colors duration-200 ${
        active && step.state === "running" ? "bg-rl-pri-50" : ""
      }`}
    >
      <StepIcon state={step.state} />
      <div className="min-w-0 flex-1">
        <div
          className={`rl-body-strong ${
            step.state === "done" || step.state === "skipped"
              ? "text-rl-text-muted"
              : "text-rl-text"
          }`}
        >
          {step.label}
          {step.state === "skipped" ? (
            <span className="rl-caption ml-2 font-normal text-rl-text-subtle">skipped</span>
          ) : null}
        </div>
        {step.detail ? (
          <p
            className={`rl-caption mt-0.5 ${
              step.state === "failed" ? "text-rl-danger" : "text-rl-text-subtle"
            }`}
          >
            {step.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const base = "grid h-6 w-6 shrink-0 place-items-center rounded-rl-pill";
  if (state === "done") {
    return (
      <span className={`${base} bg-rl-success-bg text-rl-success`}>
        <Check aria-label="Done" className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }
  if (state === "skipped") {
    return (
      <span className={`${base} bg-rl-surface-3 text-rl-text-subtle`}>
        <Check aria-label="Skipped" className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={`${base} bg-rl-danger-bg text-rl-danger`}>
        <AlertTriangle aria-label="Failed" className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className={`${base} bg-rl-pri-100 text-rl-pri-700`}>
        <Loader2 aria-label="In progress" className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      </span>
    );
  }
  // pending
  return (
    <span className={`${base} border border-rl-border-strong text-rl-text-subtle`} aria-hidden>
      <span className="h-1.5 w-1.5 rounded-rl-pill bg-rl-text-subtle" />
    </span>
  );
}

const PROVIDER_META: Record<string, { label: string; authorizeProvider: string | null }> = {
  google: { label: "Google Business Profile", authorizeProvider: "google" },
  facebook: { label: "Facebook", authorizeProvider: "meta" },
  yelp: { label: "Yelp", authorizeProvider: null },
};

function SuggestionCard({ suggestion }: { suggestion: ConnectionSuggestion }) {
  const meta = PROVIDER_META[suggestion.provider] ?? {
    label: suggestion.provider,
    authorizeProvider: null,
  };
  // Deep-link to the OAuth start when we have a route; otherwise send the user
  // to /connections to finish manually (e.g. Yelp has no OAuth route yet).
  const href = meta.authorizeProvider
    ? `/api/connections/${meta.authorizeProvider}/authorize`
    : "/connections";

  return (
    <div className="flex items-center gap-3 rounded-rl-card border border-rl-border bg-rl-surface p-4 shadow-rl-sm transition-shadow duration-150 ease-rl hover:shadow-rl-md">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-rl-pill bg-rl-pri-50 text-[13px] font-semibold uppercase text-rl-pri-700">
        {meta.label.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="rl-body-strong text-rl-text">{meta.label}</div>
        <p className="rl-caption truncate text-rl-text-subtle">
          {suggestion.source ? `Found via ${suggestion.source}` : prettyUrl(suggestion.url)}
        </p>
      </div>
      <a
        className="rl-focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-rl-control border border-rl-pri-100 bg-rl-pri-50 px-3 rl-label text-rl-pri-700 transition-colors duration-150 hover:bg-rl-pri-100"
        href={href}
      >
        Connect
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
      </a>
    </div>
  );
}

function RetryButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onRetry = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await retryOnboarding();
      if (result && !result.ok) setError(result.error);
    });
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <button
        className="rl-focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-rl-control border border-rl-border-strong bg-rl-surface px-5 rl-label text-rl-text shadow-rl-sm transition-[background,box-shadow] duration-150 ease-rl hover:bg-rl-surface-3 hover:shadow-rl-md disabled:pointer-events-none disabled:opacity-60"
        disabled={pending}
        onClick={onRetry}
        type="button"
      >
        <RotateCw
          aria-hidden="true"
          className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
          strokeWidth={1.75}
        />
        Resume setup
      </button>
      {error ? (
        <p className="rl-caption text-rl-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function prettyUrl(url: string): string {
  return hostnameOf(url) ?? url;
}
