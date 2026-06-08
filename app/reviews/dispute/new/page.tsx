import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { getOrgContext } from "@/lib/auth/org-context";
import { listDisputableReviews } from "@/lib/reviews/dispute-queries";
import { getReview } from "@/lib/reviews/queries";
import { draftDisputeArgumentAction } from "@/lib/reviews/dispute-actions";
import { VIOLATION_TYPES, isViolationType, violationMeta } from "@/lib/reviews/dispute-meta";
import { ArgumentEditor } from "../_components/argument-editor";
import { ReviewSnippet } from "../_components/review-snippet";

export const dynamic = "force-dynamic";

type Step = "review" | "violation" | "argument";

const BREADCRUMB = [
  { label: "Reviews", href: "/reviews" },
  { label: "Disputes", href: "/reviews/dispute" },
  { label: "File a dispute" },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function NewDisputePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; reviewId?: string; violationType?: string; q?: string; resubmit?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  const reviewId = sp.reviewId && UUID_RE.test(sp.reviewId) ? sp.reviewId : undefined;
  const violationType = sp.violationType && isViolationType(sp.violationType) ? sp.violationType : undefined;

  // Derive the active step from what we have, clamped to a valid forward state.
  let step: Step = "review";
  if (sp.step === "argument" && reviewId && violationType) step = "argument";
  else if ((sp.step === "violation" || sp.step === "argument") && reviewId) step = "violation";

  return (
    <AppShellServer topBar={<TopBar title="File a dispute" />}>
      <PageHeader
        title="File a dispute"
        description="Three steps: pick the review, choose the policy it violates, and review the AI-drafted argument."
        breadcrumb={BREADCRUMB}
      />

      <div className="space-y-6">
        <Stepper step={step} />

        {step === "review" && <StepSelectReview orgId={orgId} q={sp.q} />}
        {step === "violation" && reviewId && <StepSelectViolation orgId={orgId} reviewId={reviewId} />}
        {step === "argument" && reviewId && violationType && (
          <StepArgument orgId={orgId} reviewId={reviewId} violationType={violationType} />
        )}
      </div>
    </AppShellServer>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "review", label: "1. Select review" },
    { key: "violation", label: "2. Violation type" },
    { key: "argument", label: "3. AI argument" },
  ];
  const order: Step[] = ["review", "violation", "argument"];
  const activeIdx = order.indexOf(step);
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {steps.map((s, i) => {
        const state = i < activeIdx ? "done" : i === activeIdx ? "current" : "todo";
        const cls =
          state === "current" ? "chip chip--pri" : state === "done" ? "chip chip--ok" : "chip";
        return (
          <span key={s.key} className={cls}>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

/* --- Step 1 --------------------------------------------------------------- */
async function StepSelectReview({ orgId, q }: { orgId: string; q?: string }) {
  const reviews = await listDisputableReviews(orgId, q);
  return (
    <div className="ds-card" style={{ padding: 0 }}>
      <div className="ds-card__head">
        <div>
          <h2 className="ds-card__title">Select a review to dispute</h2>
          <p className="ds-card__sub">Showing reviews rated 3 stars or below that aren&apos;t already in an open dispute.</p>
        </div>
      </div>
      <div className="ds-card__body">
        <form method="get" className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input type="hidden" name="step" value="review" />
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search review text…"
            className="rounded-md border border-input px-3 py-2 text-sm"
            style={{ minWidth: 240, flex: 1 }}
          />
          <button type="submit" className="btn btn--ghost">
            Search
          </button>
        </form>

        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No eligible reviews found. Only reviews rated 3 stars or below can be disputed.
          </p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reviews/dispute/new?step=violation&reviewId=${r.id}`}
                  className="flex items-start justify-between gap-3 rounded-md border bg-white p-3 hover:border-[var(--pri)]"
                >
                  <ReviewSnippet
                    rating={r.rating}
                    reviewerName={r.reviewerName}
                    source={r.source}
                    establishmentName={r.establishment.name}
                    postedAt={r.postedAt}
                    body={r.body}
                    clamp
                  />
                  <span className="text-[var(--pri)] text-sm whitespace-nowrap">Select →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --- Step 2 --------------------------------------------------------------- */
async function StepSelectViolation({ orgId, reviewId }: { orgId: string; reviewId: string }) {
  const review = await getReview(orgId, reviewId);
  if (!review) notFound();

  return (
    <div className="space-y-4">
      <div className="ds-card" style={{ padding: "14px 16px" }}>
        <ReviewSnippet
          rating={review.rating}
          reviewerName={review.reviewerName}
          source={review.source}
          establishmentName={review.establishment.name}
          postedAt={review.postedAt}
          body={review.body}
        />
      </div>

      <div>
        <h2 className="text-base font-semibold text-[var(--ink)]">Why does this review violate Google&apos;s policies?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the category that best fits. This determines which policy the argument cites.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {VIOLATION_TYPES.map((v) => (
          <Link
            key={v.value}
            href={`/reviews/dispute/new?step=argument&reviewId=${reviewId}&violationType=${v.value}`}
            className="ds-card ds-card--hover block"
            style={{ padding: "16px 18px" }}
          >
            <div className="text-sm font-semibold text-[var(--ink)]">{v.label}</div>
            <p className="mt-1 text-sm text-muted-foreground">{v.blurb}</p>
            <div className="mt-2 chip">Google policy: {v.policy}</div>
          </Link>
        ))}
      </div>

      <div>
        <Link href={`/reviews/dispute/new?step=review`} className="text-sm text-muted-foreground hover:underline">
          ← Back to review selection
        </Link>
      </div>
    </div>
  );
}

/* --- Step 3 --------------------------------------------------------------- */
async function StepArgument({
  orgId,
  reviewId,
  violationType,
}: {
  orgId: string;
  reviewId: string;
  violationType: string;
}) {
  const review = await getReview(orgId, reviewId);
  if (!review) notFound();
  const meta = violationMeta(violationType as Parameters<typeof violationMeta>[0]);

  // First draft, server-side. If the org isn't entitled / over budget / lacks
  // the role, we DON'T 500 — start with an empty editor so the user can write
  // (or Regenerate later). The editor surfaces the gate message on Regenerate.
  let initialArgument = "";
  let kbChunksUsed = 0;
  try {
    const res = await draftDisputeArgumentAction({ reviewId, violationType });
    initialArgument = res.argument;
    kbChunksUsed = res.kbChunksUsed;
  } catch {
    initialArgument = "";
    kbChunksUsed = 0;
  }

  return (
    <div className="space-y-4">
      <div className="ds-card" style={{ padding: "14px 16px" }}>
        <ReviewSnippet
          rating={review.rating}
          reviewerName={review.reviewerName}
          source={review.source}
          establishmentName={review.establishment.name}
          postedAt={review.postedAt}
          body={review.body}
        />
        <div className="mt-2 chip chip--info">Disputing as: {meta.label}</div>
      </div>

      <div className="ds-card" style={{ padding: "18px 20px" }}>
        <ArgumentEditor
          reviewId={reviewId}
          violationType={violationType}
          initialArgument={initialArgument}
          initialKbChunksUsed={kbChunksUsed}
        />
      </div>

      <div>
        <Link
          href={`/reviews/dispute/new?step=violation&reviewId=${reviewId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to violation type
        </Link>
      </div>
    </div>
  );
}
