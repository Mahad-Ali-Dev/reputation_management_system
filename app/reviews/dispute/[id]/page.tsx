import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { getOrgContext } from "@/lib/auth/org-context";
import { getDisputeById } from "@/lib/reviews/dispute-queries";
import { statusView, violationLabel, violationMeta, isViolationType, isResubmittable } from "@/lib/reviews/dispute-meta";
import { ReviewSnippet } from "../_components/review-snippet";
import "../disputes.css";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const A = "/assets/repulabs/dispute-center";

/**
 * Dispute Details — rebuilt to the "dispute details" kit mockup. A horizontal
 * summary banner (illustration + ID/submitted/violation/status columns), then a
 * 2-column lower grid: Review Snapshot + Argument (left), Violation Category +
 * Progress Tracker (right). Re-submit affordance for rejected disputes. Live
 * data + status flow preserved; the review renders verbatim (no restyle).
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
  const violation =
    dispute.violationType && isViolationType(dispute.violationType)
      ? violationMeta(dispute.violationType)
      : null;

  const shortId = `DIS-${dispute.id.slice(0, 8).toUpperCase()}`;
  const filedAt = dispute.filedAt ?? dispute.submittedToProviderAt ?? null;
  const decisionAt = dispute.decisionAt ?? dispute.resolvedAt ?? null;

  return (
    <AppShellServer topBar={<TopBar title="Dispute" />}>
      <div className="dc">
        <PageHeader
          title="Dispute Details"
          description="Track the status of your dispute and everything we submitted on your behalf."
          breadcrumb={[
            { label: "Reviews", href: "/reviews" },
            { label: "Disputes", href: "/reviews/dispute" },
            { label: shortId },
          ]}
          actions={
            <>
              <Link href="/reviews/dispute" className="dc-btn">
                <ArrowLeft /> Back to Disputes
              </Link>
              <span className={chipClassFor(dispute.status)}>{view.label}</span>
            </>
          }
        />

        {/* Summary banner */}
        <div className="dc-detail-summary">
          {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
          <img className="dc-detail-summary__art" src={`${A}/det-banner.svg`} alt="" aria-hidden="true" />
          <div className="dc-detail-summary__cols">
            <div className="dc-detail-summary__col">
              <div className="dc-detail-summary__k">Dispute ID</div>
              <div className="dc-detail-summary__v dc-detail-summary__v--id">{shortId}</div>
            </div>
            <div className="dc-detail-summary__col">
              <div className="dc-detail-summary__k">Submitted</div>
              <div className="dc-detail-summary__v">{new Date(dispute.createdAt).toLocaleDateString()}</div>
              <div className="dc-detail-summary__sub">
                {new Date(dispute.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="dc-detail-summary__col">
              <div className="dc-detail-summary__k">Policy violation</div>
              <div className="dc-detail-summary__v">{violationLabel(dispute.violationType)}</div>
            </div>
            <div className="dc-detail-summary__col">
              <div className="dc-detail-summary__k">Current Status</div>
              <div className="dc-detail-summary__v">
                <span className={chipClassFor(dispute.status)}>{view.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lower grid */}
        <div className="dc-detail-grid">
          <div className="space-y-5">
            <section className="dc-card dc-detail-card" aria-label="Review snapshot">
              <div className="dc-detail-card__head">
                <span className="dc-detail-card__icon dc-detail-card__icon--pri"><UserIcon /></span>
                <span className="dc-detail-card__title">Review Snapshot</span>
              </div>
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
                <p className="text-sm" style={{ color: "var(--dc-muted)" }}>
                  The original review is no longer available.
                </p>
              )}
            </section>

            <section className="dc-card dc-detail-card" aria-label="Argument">
              <div className="dc-detail-card__head">
                <span className="dc-detail-card__icon dc-detail-card__icon--pri"><DocIcon /></span>
                <span className="dc-detail-card__title">Argument sent to Google</span>
              </div>
              <p className="dc-argument">{dispute.details ?? "(no argument recorded)"}</p>
            </section>

            {resubmittable && (
              <div className="dc-compliance">
                <p className="dc-compliance__t">This dispute was rejected</p>
                <p className="dc-compliance__s">
                  You can revise the argument and re-submit. A fresh, more specific argument often
                  helps.
                </p>
                <Link
                  href={`/reviews/dispute/new?step=argument&reviewId=${dispute.reviewId}${
                    dispute.violationType ? `&violationType=${dispute.violationType}` : ""
                  }&resubmit=1`}
                  className="btn btn--pri"
                  style={{ marginTop: 12, display: "inline-flex" }}
                >
                  Re-submit
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <section className="dc-card dc-detail-card" aria-label="Violation category">
              <div className="dc-detail-card__head">
                <span className="dc-detail-card__icon dc-detail-card__icon--teal"><ShieldIcon /></span>
                <span className="dc-detail-card__title">Violation Category</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--dc-ink)", margin: 0 }}>
                {violationLabel(dispute.violationType)}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--dc-body)", marginTop: 6 }}>
                {violation
                  ? `Cited under Google's ${violation.policy} policy.`
                  : "The specific policy for this dispute was not recorded."}
              </p>
            </section>

            <section className="dc-card dc-detail-card" aria-label="Progress tracker">
              <div className="dc-detail-card__head">
                <span className="dc-detail-card__icon dc-detail-card__icon--pri"><ClipboardIcon /></span>
                <span className="dc-detail-card__title">Progress Tracker</span>
              </div>
              <Timeline
                createdAt={dispute.createdAt}
                filedAt={filedAt}
                decisionAt={decisionAt}
                status={dispute.status}
              />
            </section>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function chipClassFor(status: string): string {
  switch (status) {
    case "submitted_to_google":
      return "dc-chip dc-chip--review";
    case "removed":
    case "accepted":
      return "dc-chip dc-chip--won";
    case "rejected":
      return "dc-chip dc-chip--lost";
    default:
      return "dc-chip dc-chip--pending";
  }
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
  const inReview = status === "submitted_to_google";
  const decisionLabel =
    status === "rejected" ? "Rejected by Google" : isResolved ? "Removed by Google" : "Resolution";

  const steps = [
    { label: "Prepared", at: createdAt, done: true, current: status === "submitted", desc: "We've prepared your dispute." },
    {
      label: isWithdrawn ? "Withdrawn" : "Filed with Google",
      at: isWithdrawn ? decisionAt : filedAt,
      done: Boolean(filedAt) || isResolved || isWithdrawn,
      current: inReview,
      desc: inReview ? "A specialist is reviewing your case." : "Submitted to Google for review.",
    },
    { label: decisionLabel, at: decisionAt, done: isResolved, current: false, desc: "Pending final decision and notification." },
  ];

  return (
    <ol className="dc-timeline">
      {steps.map((s, i) => (
        <li key={i} className="dc-tl">
          <span className={`dc-tl__node ${s.done ? "dc-tl__node--done" : "dc-tl__node--pending"}`}>
            {s.done ? <CheckMini /> : i + 1}
          </span>
          <div>
            <div className={`dc-tl__title ${s.done ? "" : "dc-tl__title--muted"}`}>
              {s.label}
              {s.current && <span className="dc-tl__inprogress">In progress</span>}
            </div>
            <div className="dc-tl__when">{s.at ? new Date(s.at).toLocaleString() : s.desc}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --- Inline icons ---------------------------------------------------------- */

function ArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function ClipboardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
function CheckMini() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
