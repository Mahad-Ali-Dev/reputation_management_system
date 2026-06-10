import Image from "next/image";
import { getOrgContext } from "@/lib/auth/org-context";
import { getActiveRun } from "@/lib/onboarding/run-store";
import { buildStatusResponse } from "@/lib/onboarding/status";
import { OnboardingForm } from "./_components/onboarding-form";
import { OnboardingProgress } from "./_components/onboarding-progress";

/**
 * `/onboarding` — the agentic first-run experience.
 *
 * A full-screen, shell-free surface on the warm paper canvas. Two states:
 *   - NO active run  → the 2-field start form (business name + website URL).
 *   - ACTIVE run     → the live progress checklist (polls the status API).
 *
 * Server component: `getOrgContext()` enforces auth (redirects to /login). We
 * read the active run directly from the tenant-scoped store (fail-soft: returns
 * null pre-migration, so the form renders). When a run already exists we hand a
 * server-rendered status snapshot to the progress client so there's no
 * empty-flash before the first poll lands.
 */

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { orgId, org } = await getOrgContext();

  const run = await getActiveRun(orgId);
  const initialStatus = run ? await buildStatusResponse(orgId) : null;

  return (
    <main className="rl-theme min-h-screen bg-rl-surface-2">
      <div className="mx-auto flex min-h-screen w-full max-w-[680px] flex-col px-5 py-10 sm:py-16">
        {/* Brand mark */}
        <div className="mb-10 flex items-center gap-2.5">
          <Image
            src="/favicon.png?v=2"
            alt=""
            width={32}
            height={32}
            priority
            className="rounded-[9px] object-contain"
          />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-rl-text">
            repu<span className="text-rl-pri">labs</span>
          </span>
        </div>

        {run && initialStatus ? (
          <OnboardingProgress initialStatus={initialStatus} />
        ) : (
          <OnboardingForm
            defaultBusinessName={org.name ?? ""}
            defaultWebsiteUrl={org.websiteUrl ?? ""}
          />
        )}
      </div>
    </main>
  );
}
