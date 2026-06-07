import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { getOrgContext } from "@/lib/auth/org-context";
import { getDisputeById } from "@/lib/reviews/dispute-queries";
import { statusView, violationLabel, isResubmittable } from "@/lib/reviews/dispute-meta";
import { ReviewSnippet } from "../_components/review-snippet";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Dispute Details (Module 08): the original review + violation + argument on the
 * left; a vertical Filed → Under Review → Decision timeline on the right; a
 * Re-submit affordance for rejected disputes. The review is rendered verbatim
 * (no restyle of the native surface).
 */
export default async function DisputeDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { orgId } = await getOrgContext();
  const dispute = await getDisputeById(orgId, id);
  if (!dispute) notFound();

  const view = statusView(dispute.status);
  const review = dispute.review;
  const resubmittable = isResubmittable(dispute.status);

  return (
    <AppShellServer topBar={<TopBar title="Dispute" />}>
      <PageHeader
        title="Dispute details"
        breadcrumb={[
          { label: "Reviews", href: "/reviews" },
          { label: "Disputes", href: "/reviews/dispute" },
          { label: "Details" },
        ]}
        actions={
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${view.badgeClass}`}>
            {view.label}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left — review + violation + argument */}
        <div className="space-y-6">
          <div className="ds-card" style={{ padding: 0 }}>
            <div className="ds-card__head">
              <h2 className="ds-card__title">Disputed review</h2>
            </div>
            <div className="ds-card__body">
              {review ? (
                <ReviewSnippet
                  rating={review.rating}
                  reviewerName={review.reviewerName}
                  source={review.source}
                  establishmentName={review.establishment?.name}
                  postedAt={review.postedAt}
                  body={review.body}
                />
              ) : (
                <p className="text-sm text-muted-foreground">The original review is no longer available.</p>
              )}
            </div>
          </div>

          <div className="ds-card" style={{ padding: 0 }}>
            <div className="ds-card__head">
              <h2 className="ds-card__title">Policy violation</h2>
            </div>
            <div className="ds-card__body">
              <span className="chip chip--info">{violationLabel(dispute.violationType)}</span>
            </div>
          </div>

          <div className="ds-card" style={{ padding: 0 }}>
            <div className="ds-card__head">
              <h2 className="ds-card__title">Argument sent to Google</h2>
            </div>
            <div className="ds-card__body">
              <p className="whitespace-pre-wrap text-sm">{dispute.details ?? "(no argument recorded)"}</p>
            </div>
          </div>

          {resubmittable && (
            <div className="ds-card ds-card--tint" style={{ padding: "16px 18px" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--ink)]">This dispute was rejected</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You can revise the argument and re-submit. A fresh, more specific argument often helps.
                  </p>
                </div>
                <Link
                  href={`/reviews/dispute/new?step=argument&reviewId=${dispute.reviewId}${
                    dispute.violationType ? `&violationType=${dispute.violationType}` : ""
                  }&resubmit=1`}
                  className="btn btn--pri"
                >
                  Re-submit
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right — timeline */}
        <div className="ds-card" style={{ padding: 0 }}>
          <div className="ds-card__head">
            <h2 className="ds-card__title">Timeline</h2>
          </div>
          <div className="ds-card__body">
            <Timeline
              createdAt={dispute.createdAt}
              filedAt={dispute.filedAt ?? dispute.submittedToProviderAt ?? null}
              decisionAt={dispute.decisionAt ?? dispute.resolvedAt ?? null}
              status={dispute.status}
            />
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function Timeline({
  createdAt,
  filedAt,
  decisionAt,
  status,
}: {
  createdAt: Date;
  filedAt: Date | null;
  decisionAt: Date | null;
  status: string;
}) {
  const isWithdrawn = status === "withdrawn";
  const isResolved = status === "removed" || status === "accepted" || status === "rejected";
  const decisionLabel =
    status === "rejected" ? "Rejected by Google" : isResolved ? "Removed by Google" : "Decision";

  const steps = [
    { label: "Prepared", at: createdAt, done: true },
    {
      label: isWithdrawn ? "Withdrawn" : "Filed with Google (Under Review)",
      at: isWithdrawn ? decisionAt : filedAt,
      done: Boolean(filedAt) || isResolved || isWithdrawn,
    },
    {
      label: decisionLabel,
      at: decisionAt,
      done: isResolved,
    },
  ];

  return (
    <ol className="relative space-y-5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-0.5 h-3 w-3 rounded-full border-2 ${
                s.done ? "border-[var(--pri)] bg-[var(--pri)]" : "border-slate-300 bg-white"
              }`}
              aria-hidden
            />
            {i < steps.length - 1 && (
              <span className={`mt-1 w-px flex-1 ${s.done ? "bg-[var(--pri)]" : "bg-slate-200"}`} style={{ minHeight: 24 }} />
            )}
          </div>
          <div className="pb-1">
            <div className={`text-sm font-medium ${s.done ? "text-[var(--ink)]" : "text-muted-foreground"}`}>
              {s.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {s.at ? new Date(s.at).toLocaleString() : "Pending"}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
