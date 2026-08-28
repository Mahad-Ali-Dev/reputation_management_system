import Link from "next/link";
import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { getActiveRun } from "@/lib/onboarding/run-store";
import { buildStatusResponse } from "@/lib/onboarding/status";
import { OnboardingForm } from "./_components/onboarding-form";
import { OnboardingProgress } from "./_components/onboarding-progress";
import { getSetupSignals, type SetupSignals } from "./_lib/signals";
import "./onboarding.css";

/**
 * `/onboarding` — the in-shell setup hub (wizard chrome around the agentic
 * first-run flow).
 *
 * Three layers, all driven by REAL tenant signals (`_lib/signals.ts`,
 * fail-soft):
 *   - a gradient step banner ("Step N of 4" + contextual line),
 *   - a Wizard-path card with the 4-step strip (Business → Connect →
 *     First request → Invite team); steps 2-4 deep-link to their modules,
 *   - a right Checklist rail mirroring the steps plus the smaller tasks we
 *     can actually verify (logo, brand voice).
 *
 * The EXISTING intake form + "Building your dashboard" progress flow is
 * preserved byte-for-byte as the step-1 content: no active run + no
 * establishment → `<OnboardingForm>`; active run → `<OnboardingProgress>`
 * (same polling + redirect behavior); establishment already exists → a
 * server-rendered "done" state and the banner advances.
 */

export const dynamic = "force-dynamic";

type WizardStep = {
  key: string;
  label: string;
  /** Static descriptors of the step itself (not data), swapped on completion. */
  subTodo: string;
  subDone: string;
  href: string | null;
  done: boolean;
};

export default async function OnboardingPage() {
  const { orgId, org } = await getOrgContext();

  // Existing agentic-run reads (unchanged) + the new wizard signals, all
  // fail-soft: getActiveRun returns null pre-migration, getSetupSignals
  // degrades to all-false.
  const [run, signals] = await Promise.all([getActiveRun(orgId), getSetupSignals(orgId)]);
  const initialStatus = run ? await buildStatusResponse(orgId) : null;

  const runActive = Boolean(run && initialStatus);
  const hasLogo = Boolean(org.logoUrl);

  const steps: WizardStep[] = [
    {
      key: "business",
      label: "Business",
      subTodo: "Name + website the agent builds the rest",
      subDone: "Profile created",
      href: null, // step 1 lives on this page
      done: signals.hasEstablishment,
    },
    {
      key: "connect",
      label: "Connect",
      subTodo: "Google, Meta & more",
      subDone: "Platform connected",
      href: "/connections",
      done: signals.hasConnection,
    },
    {
      key: "request",
      label: "First request",
      subTodo: "Email, SMS or QR",
      subDone: "Request sent",
      href: "/outreach",
      done: signals.hasSentRequest,
    },
    {
      key: "team",
      label: "Invite team",
      subTodo: "Roles & approvals",
      subDone: "Team invited",
      href: "/settings/team",
      done: signals.hasTeam,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const currentIndex = allDone ? steps.length - 1 : steps.findIndex((s) => !s.done);
  const banner = bannerCopy({ steps, currentIndex, allDone, runActive });
  const cta = allDone
    ? { label: "Go to dashboard", href: "/dashboard" }
    : currentIndex === 0
      ? { label: "Continue setup", href: "#onb-step-1" }
      : { label: "Continue setup", href: steps[currentIndex]?.href ?? "/dashboard" };

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Setup"]}>
      <div className="onb">
        {/* ---------- page head ---------- */}
        <header className="ph" style={{ marginBottom: 0 }}>
          <div>
            <span className="ph__kicker">Setup</span>
            <h1 className="ph__title">Launch reputation operations in four steps</h1>
            <p className="ph__sub">
              Business setup, connections, and first request flow your progress is saved
              automatically.
            </p>
          </div>
          <Link className="btn btn--accent" href={cta.href}>
            {cta.label}
          </Link>
        </header>

        {/* ---------- gradient step banner ---------- */}
        <section aria-label="Setup progress" className="onb-banner">
          <div className="onb-banner__body">
            <span className="onb-banner__step">
              {allDone ? "Setup complete" : `Step ${currentIndex + 1} of ${steps.length}`}
            </span>
            <h2 className="onb-banner__title">{banner.title}</h2>
            <p className="onb-banner__sub">{banner.sub}</p>
          </div>
          <div aria-hidden="true" className="onb-banner__art">
            <EmptyIllustration name="onboarding-steps" size={160} />
          </div>
        </section>

        {/* ---------- wizard path + checklist rail ---------- */}
        <div className="onb-grid">
          {/* Wizard-path card: 4-step strip + the step-1 flow as content */}
          <section aria-label="Wizard path" className="ds-card">
            <div className="ds-card__head">
              <div className="ds-card__title">Wizard path</div>
              <span className="chip chip--out">
                {doneCount} of {steps.length} complete
              </span>
            </div>

            <ol className="onb-steps">
              {steps.map((step, i) => (
                <WizardStepCell
                  index={i}
                  key={step.key}
                  state={step.done ? "done" : i === currentIndex ? "current" : "future"}
                  step={step}
                />
              ))}
            </ol>

            {/* Step-1 content — the EXISTING intake / agentic-progress flow.
                rl-theme wrapper keeps the components' token-driven styling. */}
            <div className="onb-stepbody rl-theme" id="onb-step-1">
              {run && initialStatus ? (
                <OnboardingProgress initialStatus={initialStatus} />
              ) : signals.hasEstablishment ? (
                <Step1Done nextStep={allDone ? null : (steps[currentIndex] ?? null)} orgName={org.name} />
              ) : (
                <OnboardingForm
                  defaultBusinessName={org.name ?? ""}
                  defaultWebsiteUrl={org.websiteUrl ?? ""}
                />
              )}
            </div>
          </section>

          {/* Checklist rail — mirrors the steps + the smaller verifiable tasks */}
          <aside aria-label="Setup checklist" className="ds-card">
            <div className="ds-card__head">
              <div className="ds-card__title">Checklist</div>
              <span className="chip chip--pri">Setup progress</span>
            </div>
            <ChecklistRail hasLogo={hasLogo} signals={signals} />
            <p className="onb-check__note">
              The AI setup agent can complete this checklist with your approval every step stays
              reversible.
            </p>
          </aside>
        </div>
      </div>
    </AppShellServer>
  );
}

/* ============================================================
   Server-only presentational pieces (no client state)
   ============================================================ */

function bannerCopy({
  steps,
  currentIndex,
  allDone,
  runActive,
}: {
  steps: WizardStep[];
  currentIndex: number;
  allDone: boolean;
  runActive: boolean;
}): { title: string; sub: string } {
  if (allDone) {
    return {
      title: "You're all set",
      sub: "Every setup step is complete your workspace is live. Head to the dashboard to see it working.",
    };
  }
  if (runActive && currentIndex === 0) {
    return {
      title: "The agent is building your workspace",
      sub: "We're reading your website and configuring everything. Watch the progress below usually under a minute.",
    };
  }
  const key = steps[currentIndex]?.key;
  switch (key) {
    case "connect":
      return {
        title: "Connect Google and send your first request",
        sub: "Pull your reviews in automatically and prepare a stellar campaign. We never post or change anything without your approval.",
      };
    case "request":
      return {
        title: "Send your first review request",
        sub: "Email, SMS or QR your first request takes about a minute and starts the review flywheel.",
      };
    case "team":
      return {
        title: "Invite your team",
        sub: "Share the inbox, approvals, and reporting with teammates roles keep everyone in their lane.",
      };
    default:
      return {
        title: "Tell us about your business",
        sub: "Add your name and website below our AI agent reads your site and builds the rest of your workspace for you.",
      };
  }
}

function WizardStepCell({
  step,
  state,
  index,
}: {
  step: WizardStep;
  state: "done" | "current" | "future";
  index: number;
}) {
  const className = `onb-step onb-step--${state}`;
  const body = (
    <>
      <span className="onb-step__top">
        <span aria-hidden="true" className="onb-step__bubble">
          {state === "done" ? <CheckGlyph /> : index + 1}
        </span>
        <span className="onb-step__label">{step.label}</span>
      </span>
      <span className="onb-step__sub">{step.done ? step.subDone : step.subTodo}</span>
    </>
  );
  const aria = `Step ${index + 1}: ${step.label} ${
    state === "done" ? "complete" : state === "current" ? "current step" : "not started"
  }`;

  // Step 1 is this page; steps 2-4 deep-link to their modules.
  if (step.href) {
    return (
      <li>
        <Link aria-label={aria} className={className} href={step.href}>
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <a aria-label={aria} className={className} href="#onb-step-1">
        {body}
      </a>
    </li>
  );
}

/** Step-1 done state — shown when an establishment already exists and no run is active. */
function Step1Done({
  orgName,
  nextStep,
}: {
  orgName: string | null;
  nextStep: WizardStep | null;
}) {
  return (
    <div className="onb-done">
      <span aria-hidden="true" className="onb-done__icon">
        <CheckGlyph size={16} />
      </span>
      <div>
        <h3 className="onb-done__title">Business profile created</h3>
        <p className="onb-done__sub">
          {orgName ?? "Your business"} is set up and your workspace is live.
          {nextStep ? ` Next up: ${nextStep.label.toLowerCase()}.` : " Every step is complete."}
        </p>
        <div className="onb-done__actions">
          {nextStep?.href ? (
            <Link className="btn btn--accent" href={nextStep.href}>
              Continue: {nextStep.label}
            </Link>
          ) : (
            <Link className="btn btn--accent" href="/dashboard">
              Go to dashboard
            </Link>
          )}
          <Link className="btn" href="/establishments">
            Edit business details
          </Link>
        </div>
      </div>
    </div>
  );
}

type ChecklistItem = {
  key: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
};

function ChecklistRail({ signals, hasLogo }: { signals: SetupSignals; hasLogo: boolean }) {
  // Main steps first (same signals as the strip), then the smaller tasks we
  // have a real signal for (org logo, AI brand-voice profile).
  const items: ChecklistItem[] = [
    {
      key: "business",
      title: "Business profile",
      hint: signals.hasEstablishment ? "Listing created" : "Add name + website",
      href: signals.hasEstablishment ? "/establishments" : "#onb-step-1",
      done: signals.hasEstablishment,
    },
    {
      key: "google",
      title: "Connect Google",
      hint: signals.hasGoogleConnection ? "Reviews syncing" : "Pull reviews automatically",
      href: "/connections",
      done: signals.hasGoogleConnection,
    },
    {
      key: "request",
      title: "Send first request",
      hint: signals.hasSentRequest ? "First request sent" : "Email, SMS or QR",
      href: "/outreach",
      done: signals.hasSentRequest,
    },
    {
      key: "team",
      title: "Invite your team",
      hint: signals.hasTeam ? "Team on board" : "Roles & approvals",
      href: "/settings/team",
      done: signals.hasTeam,
    },
    {
      key: "logo",
      title: "Add your logo",
      hint: hasLogo ? "Logo uploaded" : "Brand your requests + QR",
      href: "/settings/brand",
      done: hasLogo,
    },
    {
      key: "voice",
      title: "Set brand voice",
      hint: signals.hasBrandVoice ? "AI voice trained" : "Teach the AI your tone",
      href: "/ai/training",
      done: signals.hasBrandVoice,
    },
  ];

  const firstOpen = items.findIndex((i) => !i.done);

  return (
    <ul className="onb-check__list">
      {items.map((item, i) => (
        <li key={item.key}>
          <Link className="onb-check__item" href={item.href}>
            <span
              aria-hidden="true"
              className={`onb-check__num${item.done ? " onb-check__num--done" : ""}`}
            >
              {item.done ? <CheckGlyph size={12} /> : i + 1}
            </span>
            <span className="onb-check__label">
              <span className="onb-check__title">{item.title}</span>
              <span className="onb-check__hint" style={{ display: "block" }}>
                {item.hint}
              </span>
            </span>
            {item.done ? (
              <span className="chip chip--ok">Done</span>
            ) : i === firstOpen ? (
              <span className="chip chip--pri">Open</span>
            ) : (
              <span className="chip chip--out">Ready</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Tiny inline check (server-safe; avoids pulling an icon lib into the RSC). */
function CheckGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
