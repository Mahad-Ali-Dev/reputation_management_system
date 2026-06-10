"use client";

import { ArrowRight, Globe, Sparkles, Store } from "lucide-react";
import { useState, useTransition } from "react";
import { startOnboarding } from "@/lib/onboarding/orchestrator-actions";

/**
 * `<OnboardingForm>` — the premium first-run start screen.
 *
 * Two fields (business name + website URL) and one primary action. On submit it
 * calls the `startOnboarding` server action, which REDIRECTS to `/onboarding`
 * on success (the page then renders the live progress view) and only ever
 * returns `{ ok:false, error }` for a recoverable validation / entitlement /
 * rate-limit problem — which we surface inline.
 *
 * Layout: a centered card on the warm canvas with a brand-blue agent badge, a
 * confident headline, and a one-line promise. Client-side required + URL
 * validation gives instant feedback before the round-trip.
 */

const URL_RE = /^https?:\/\/.+\..+/i;

export function OnboardingForm({
  defaultBusinessName = "",
  defaultWebsiteUrl = "",
}: {
  defaultBusinessName?: string;
  defaultWebsiteUrl?: string;
}) {
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [websiteUrl, setWebsiteUrl] = useState(defaultWebsiteUrl);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const nameInvalid = touched && businessName.trim().length === 0;
  const urlInvalid = touched && !URL_RE.test(websiteUrl.trim());

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    setError(null);

    if (businessName.trim().length === 0) {
      setError("Enter your business name.");
      return;
    }
    if (!URL_RE.test(websiteUrl.trim())) {
      setError("Enter a valid website URL, including https://");
      return;
    }

    const data = new FormData();
    data.set("businessName", businessName.trim());
    data.set("websiteUrl", websiteUrl.trim());

    startTransition(async () => {
      // On success this redirects and never returns; we only get a value back
      // for a recoverable error.
      const result = await startOnboarding(data);
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="rl-rise mx-auto w-full max-w-[480px]">
        {/* Agent badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-rl-pill border border-rl-pri-100 bg-rl-pri-50 px-3 py-1.5 text-[12px] font-medium text-rl-pri-700">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
          AI setup agent
        </div>

        <h1 className="rl-h1 text-rl-text">Let's build your dashboard.</h1>
        <p className="rl-body mt-3 text-rl-text-muted">
          Tell us your business and website. Our agent will read your site, build your AI, and set
          everything up for you — usually in under a minute.
        </p>

        <form className="mt-8 grid gap-5" noValidate onSubmit={onSubmit}>
          <Field
            autoFocus
            error={nameInvalid ? "Enter your business name." : undefined}
            icon={Store}
            id="ob-business-name"
            label="Business name"
            onChange={setBusinessName}
            placeholder="Summit Dental Studio"
            value={businessName}
          />
          <Field
            error={urlInvalid ? "Enter a valid URL, including https://" : undefined}
            icon={Globe}
            id="ob-website-url"
            inputMode="url"
            label="Website URL"
            onChange={setWebsiteUrl}
            placeholder="https://yourbusiness.com"
            type="url"
            value={websiteUrl}
          />

          {error ? (
            <p
              aria-live="polite"
              className="rl-caption rounded-rl-control border border-rl-danger-border bg-rl-danger-bg px-3 py-2.5 text-rl-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            className="rl-focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-rl-control border border-rl-pri bg-rl-pri rl-label text-rl-text-on-pri shadow-rl-sm transition-[background,box-shadow,transform] duration-150 ease-rl hover:bg-rl-pri-700 hover:shadow-rl-md active:translate-y-px disabled:pointer-events-none disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Starting…
              </>
            ) : (
              <>
                Build my dashboard
                <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              </>
            )}
          </button>
        </form>

        <p className="rl-caption mt-5 text-center text-rl-text-subtle">
          We never post or change anything without your approval.
        </p>
      </div>
    </div>
  );
}

function Field({
  autoFocus,
  error,
  icon: Icon,
  id,
  inputMode,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  autoFocus?: boolean;
  error?: string;
  icon: typeof Store;
  id: string;
  inputMode?: "url";
  label: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <label className="rl-label text-rl-text" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rl-text-subtle"
          strokeWidth={1.75}
        />
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          autoFocus={autoFocus}
          className={`rl-focus-ring h-12 w-full rounded-rl-control border bg-rl-surface pl-10 pr-3 rl-body text-rl-text placeholder:text-rl-text-subtle transition-[border-color,box-shadow] duration-150 hover:border-rl-text-subtle focus:border-rl-pri ${
            error ? "border-rl-danger" : "border-rl-border-strong"
          }`}
          id={id}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </div>
      {error ? (
        <p className="rl-caption text-rl-danger" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
