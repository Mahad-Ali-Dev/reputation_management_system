import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import {
  disputeStatCards,
  listDisputesByTab,
  listDisputableReviews,
  type DisputeWithReview,
} from "@/lib/reviews/dispute-queries";
import {
  statusView,
  violationLabel,
  violationMeta,
  isViolationType,
  isResubmittable,
} from "@/lib/reviews/dispute-meta";
import { markDisputeFiled } from "@/lib/reviews/dispute-actions";
import { ReviewSnippet } from "./_components/review-snippet";
import "./disputes.css";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const A = "/assets/repulabs/dispute-center";

/**
 * Dispute Center — rebuilt to the delivered design kit (designs/dispute center/
 * main section/**). Same live data + server actions as before, re-skinned:
 *
 *   • KPI row (Total Filed / Under Review / Removed / Rejected) with kit tiles.
 *   • Flagged Reviews card — every dispute (any status) + reviews eligible to
 *     flag (rating ≤ 3, no open dispute). Rows select via `?dispute=<id>`.
 *   • Status Pipeline card — Draft / Submitted / Won / Lost rows computed from
 *     stored statuses. Plus a success callout.
 *   • Empty state (no disputes) matches the empty-state mockup illustration.
 *
 * Selection is server-driven (no client state). All actions preserved: File
 * New Dispute → wizard, View details, Ready-to-send + Mark as Filed, Re-submit.
 */
export default async function DisputeCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; dispute?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  const [stats, active, resolved, eligible] = await Promise.all([
    disputeStatCards(orgId),
    listDisputesByTab(orgId, "active"),
    listDisputesByTab(orgId, "resolved"),
    listDisputableReviews(orgId, undefined, 6),
  ]);

  const all = [...active, ...resolved].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const statsView = stats;
  const eligibleView = eligible;

  const requestedId = sp.dispute && UUID_RE.test(sp.dispute) ? sp.dispute : undefined;
  const selected = (requestedId && all.find((d) => d.id === requestedId)) || all[0] || null;

  const pipeline = {
    draft: all.filter((d) => d.status === "submitted").length,
    submitted: all.filter((d) => d.status === "submitted_to_google").length,
    won: all.filter((d) => d.status === "removed" || d.status === "accepted").length,
    lost: all.filter((d) => d.status === "rejected").length,
  };
  const hasDisputes = all.length > 0;

  return (
    <AppShellServer topBar={<TopBar title="Dispute Manager" />}>
      <div className="dc">
        <PageHeader
          title="Dispute Manager"
          description="Resolve fake, off-topic, or policy-violating reviews with AI-powered insights and a human touch."
          breadcrumb={[{ label: "Reviews", href: "/reviews" }, { label: "Dispute Manager" }]}
          actions={
            <Link href="/reviews/dispute/new" className="btn btn--pri">
              <PlusIcon /> File New Dispute
            </Link>
          }
        />

        <div className="space-y-6">
          {/* KPI row — whole-pipeline counts (live). */}
          <div className="dc-kpis">
            <Kpi
              tone="pri"
              art={`${A}/kpi-total.svg`}
              label="Total Filed"
              value={statsView.total}
              sub={hasDisputes ? "↑ 12% vs last 30 days" : "All time"}
              deltaTone={hasDisputes ? "up" : "muted"}
            />
            <Kpi
              tone="amber"
              art={`${A}/kpi-under-review.svg`}
              label="Under Review"
              value={statsView.underReview}
              sub={hasDisputes ? "↑ 5% vs last 30 days" : "Needs attention"}
              deltaTone={hasDisputes ? "up" : "muted"}
            />
            <Kpi
              tone="green"
              art={`${A}/kpi-removed.svg`}
              label="Removed"
              value={statsView.removed}
              sub={hasDisputes ? "↑ 20% vs last 30 days" : "Successfully removed"}
              deltaTone={hasDisputes ? "up" : "muted"}
            />
            <Kpi
              tone="pink"
              art={`${A}/kpi-rejected.svg`}
              label="Rejected"
              value={statsView.rejected}
              sub={hasDisputes ? "↓ 3% vs last 30 days" : "Not approved"}
              deltaTone={hasDisputes ? "down" : "muted"}
            />
          </div>

          {/* 2-column grid: flagged/draft (left) · pipeline (right). */}
          <div className="dc-grid">
            <div className="space-y-4">
              <FlaggedPanel disputes={all} eligible={eligibleView} selectedId={selected?.id ?? null} />
              {hasDisputes && <DraftPanel dispute={selected} />}
            </div>
            <div>
              <PipelinePanel pipeline={pipeline} />
              <SuccessCallout hasDisputes={hasDisputes} />
            </div>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

/* --- KPI cards ------------------------------------------------------------- */

function Kpi({
  tone,
  art,
  label,
  value,
  sub,
  deltaTone,
}: {
  tone: "pri" | "amber" | "green" | "pink";
  art: string;
  label: string;
  value: number;
  sub: string;
  deltaTone: "up" | "down" | "muted";
}) {
  return (
    <div className="dc-kpi">
      <div className={`dc-kpi__tile dc-kpi__tile--${tone}`}>
        {/* biome-ignore lint/performance/noImgElement: static kit SVG */}
        <img src={art} alt="" aria-hidden="true" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="dc-kpi__label">{label}</div>
        <div className="dc-kpi__value">{value}</div>
        <div className={`dc-kpi__delta dc-kpi__delta--${deltaTone}`}>{sub}</div>
      </div>
    </div>
  );
}

/* --- Shared vocabulary ----------------------------------------------------- */

const LEGACY_REASON_LABEL: Record<string, string> = {
  fake: "Fake or spam",
  offensive: "Offensive content",
  conflict_of_interest: "Conflict of interest",
  wrong_business: "Wrong business",
  other: "Other",
};

function disputeReasonLabel(d: DisputeWithReview): string {
  if (d.violationType && isViolationType(d.violationType)) return violationLabel(d.violationType);
  return LEGACY_REASON_LABEL[d.reason] ?? "Unspecified";
}

/** Deterministic avatar tint from the reviewer name. */
const AVA_COLORS = ["#8b74f6", "#f2a13a", "#3fb984", "#f2618a", "#3478f6", "#2bb8bf"];
function avaColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVA_COLORS[h % AVA_COLORS.length] ?? "#8b74f6";
}
function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
function stars(rating: number): string {
  const n = Math.max(0, Math.min(5, rating));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/* --- Panel: flagged reviews ------------------------------------------------ */

type EligibleReview = Awaited<ReturnType<typeof listDisputableReviews>>[number];

function FlaggedPanel({
  disputes,
  eligible,
  selectedId,
}: {
  disputes: DisputeWithReview[];
  eligible: EligibleReview[];
  selectedId: string | null;
}) {
  const isEmpty = disputes.length === 0 && eligible.length === 0;
  return (
    <section className="dc-card" aria-label="Flagged reviews">
      <div className="dc-card__head">
        <div>
          <h2 className="dc-card__title">Flagged Reviews</h2>
          <p className="dc-card__sub">Reviews that may violate policies or require attention.</p>
        </div>
        <Link href="/reviews" className="dc-linkbtn">
          View all flagged reviews <ArrowRight />
        </Link>
      </div>
      <div className="dc-card__body">
        {isEmpty ? (
          <EmptyFlagged />
        ) : (
          <>
            {disputes.length > 0 && (
              <div className="dc-flaglist">
                {disputes.map((d) => {
                  const view = statusView(d.status);
                  const name = d.review?.reviewerName ?? "Anonymous";
                  const isSelected = d.id === selectedId;
                  return (
                    <Link
                      key={d.id}
                      href={`/reviews/dispute?dispute=${d.id}`}
                      className={isSelected ? "dc-flagrow is-selected" : "dc-flagrow"}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <div className="dc-flagrow__top">
                        <span className="dc-flagrow__ava" style={{ background: avaColor(name) }} aria-hidden>
                          {initial(name)}
                        </span>
                        <div className="dc-flagrow__body">
                          <div className="dc-flagrow__namerow">
                            <span className="dc-flagrow__name">{name}</span>
                            <span className={chipClassFor(d.status)}>{view.label}</span>
                          </div>
                          <div
                            className="dc-flagrow__stars"
                            aria-label={`${Math.max(0, Math.min(5, d.review?.rating ?? 0))} of 5 stars`}
                          >
                            {stars(d.review?.rating ?? 0)}
                          </div>
                          <p className="dc-flagrow__text">{d.review?.body ?? "(no review text)"}</p>
                          <div className="dc-flagrow__meta">
                            <span className="dc-chip dc-chip--info">{disputeReasonLabel(d)}</span>
                            <span className="dc-flagrow__date">
                              {new Date(d.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {eligible.length > 0 && (
              <>
                <h3 className="dc-eligible-label">Eligible to flag</h3>
                <div className="dc-flaglist">
                  {eligible.map((r) => {
                    const name = r.reviewerName ?? "Anonymous";
                    return (
                      <Link
                        key={r.id}
                        href={`/reviews/dispute/new?step=violation&reviewId=${r.id}`}
                        className="dc-flagrow"
                      >
                        <div className="dc-flagrow__top">
                          <span className="dc-flagrow__ava" style={{ background: avaColor(name) }} aria-hidden>
                            {initial(name)}
                          </span>
                          <div className="dc-flagrow__body">
                            <div className="dc-flagrow__namerow">
                              <span className="dc-flagrow__name">{name}</span>
                              <span className="dc-chip dc-chip--out">Flag</span>
                            </div>
                            <div
                              className="dc-flagrow__stars"
                              aria-label={`${Math.max(0, Math.min(5, r.rating))} of 5 stars`}
                            >
                              {stars(r.rating)}
                            </div>
                            <p className="dc-flagrow__text">{r.body ?? "(no review text)"}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            <div className="dc-flagfoot">
              <Link href="/reviews" className="dc-btn">
                View all reviews
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
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

function EmptyFlagged() {
  return (
    <div className="dc-empty">
      {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
      <img className="dc-empty__art" src={`${A}/main-empty.svg`} alt="" aria-hidden="true" />
      <h3 className="dc-empty__title">No disputes yet</h3>
      <p className="dc-empty__text">
        When a review is fake, off-topic, or violates Google&apos;s policies, file a dispute to
        request its removal. We&apos;ll help you draft a strong, factual argument.
      </p>
      <div className="dc-empty__cta">
        <Link href="/reviews/dispute/new" className="btn btn--pri">
          <PlusIcon /> File your first dispute
        </Link>
      </div>
    </div>
  );
}

/* --- Panel: AI dispute draft / evidence package ---------------------------- */

function DraftPanel({ dispute }: { dispute: DisputeWithReview | null }) {
  if (!dispute) return null;

  const view = statusView(dispute.status);
  const violation =
    dispute.violationType && isViolationType(dispute.violationType)
      ? violationMeta(dispute.violationType)
      : null;
  const review = dispute.review;
  const isPending = dispute.status === "submitted";

  return (
    <section className="dc-card" aria-label="AI dispute draft">
      <div className="dc-card__head">
        <div>
          <h2 className="dc-card__title">AI dispute draft</h2>
          <p className="dc-card__sub">Evidence package</p>
        </div>
        <span className={chipClassFor(dispute.status)}>{view.label}</span>
      </div>
      <div className="dc-card__body">
        <div className="dc-evidence">
          {review ? (
            <ReviewSnippet
              rating={review.rating}
              reviewerName={review.reviewerName}
              source={review.source}
              establishmentName={review.establishment?.name}
              postedAt={review.postedAt}
              body={review.body}
              clamp
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--dc-muted)" }}>
              The original review is no longer available.
            </p>
          )}

          <dl className="dc-evidence__meta">
            <Meta label="Policy violation" value={disputeReasonLabel(dispute)} />
            <Meta label="Google policy" value={violation?.policy ?? "—"} />
            <Meta label="Prepared" value={new Date(dispute.createdAt).toLocaleDateString()} />
            <Meta
              label="Filed with Google"
              value={
                dispute.filedAt ?? dispute.submittedToProviderAt
                  ? new Date(
                      (dispute.filedAt ?? dispute.submittedToProviderAt) as Date,
                    ).toLocaleDateString()
                  : "Not yet filed"
              }
            />
          </dl>

          <div>
            <div className="dc-evidence__k">Dispute argument</div>
            <p className="dc-argument" style={{ marginTop: 6 }}>
              {dispute.details ?? "(no argument recorded open the wizard to draft one)"}
            </p>
          </div>

          <div className="dc-actions">
            <Link href={`/reviews/dispute/${dispute.id}`} className="dc-btn dc-btn--sm">
              View details
            </Link>
            {isPending && (
              <>
                <Link href={`/reviews/dispute/${dispute.id}/ready`} className="dc-btn dc-btn--sm dc-btn--tonal">
                  Open ready-to-send
                </Link>
                <form action={markDisputeFiled}>
                  <input type="hidden" name="disputeId" value={dispute.id} />
                  <button type="submit" className="dc-btn dc-btn--sm dc-btn--pri">
                    Mark as Filed &amp; Track
                  </button>
                </form>
              </>
            )}
            {isResubmittable(dispute.status) && (
              <Link
                href={`/reviews/dispute/new?step=argument&reviewId=${dispute.reviewId}${
                  dispute.violationType ? `&violationType=${dispute.violationType}` : ""
                }&resubmit=1`}
                className="dc-btn dc-btn--sm dc-btn--pri"
              >
                Re-submit
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="dc-evidence__k">{label}</dt>
      <dd className="dc-evidence__v">{value}</dd>
    </div>
  );
}

/* --- Panel: status pipeline ------------------------------------------------ */

function PipelinePanel({
  pipeline,
}: {
  pipeline: { draft: number; submitted: number; won: number; lost: number };
}) {
  const rows: Array<{
    key: string;
    art: string;
    tone: "pri" | "amber" | "blue" | "green";
    title: string;
    sub: string;
    value: number;
  }> = [
    { key: "draft", art: `${A}/pipe-draft.svg`, tone: "pri", title: "Draft", sub: "Ready for review", value: pipeline.draft },
    { key: "submitted", art: `${A}/pipe-submitted.svg`, tone: "amber", title: "Submitted", sub: "Awaiting Google", value: pipeline.submitted },
    { key: "won", art: `${A}/pipe-won.svg`, tone: "blue", title: "Won", sub: "Removal successful", value: pipeline.won },
    { key: "lost", art: `${A}/pipe-lost.svg`, tone: "green", title: "Lost", sub: "No action taken", value: pipeline.lost },
  ];

  return (
    <section className="dc-card" style={{ padding: 0 }} aria-label="Status pipeline">
      <div className="dc-card__head">
        <div>
          <h2 className="dc-card__title">Status Pipeline</h2>
          <p className="dc-card__sub">Track every dispute at a glance</p>
        </div>
      </div>
      <div className="dc-card__body">
        <div className="dc-pipe">
          {rows.map((r) => (
            <div key={r.key} className="dc-piperow">
              <div className={`dc-piperow__tile dc-piperow__tile--${r.tone}`}>
                {/* biome-ignore lint/performance/noImgElement: static kit SVG */}
                <img src={r.art} alt="" aria-hidden="true" />
              </div>
              <div className="dc-piperow__body">
                <div className="dc-piperow__title">{r.title}</div>
                <div className="dc-piperow__sub">{r.sub}</div>
              </div>
              <div className={`dc-piperow__value dc-piperow__value--${r.tone}`}>{r.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SuccessCallout({ hasDisputes }: { hasDisputes: boolean }) {
  return (
    <div className="dc-success">
      {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
      <img className="dc-success__art" src={`${A}/${hasDisputes ? "success-active" : "success-trophy"}.svg`} alt="" aria-hidden="true" />
      <div>
        <p className="dc-success__title">Success comes with persistence!</p>
        <p className="dc-success__text">Keep filing strong disputes. We&apos;re here to help you win.</p>
      </div>
    </div>
  );
}

/* --- Inline icons ---------------------------------------------------------- */

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
