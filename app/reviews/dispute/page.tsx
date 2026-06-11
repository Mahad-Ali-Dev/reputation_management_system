import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
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

/**
 * Dispute Center — 3-panel workflow (Module 08, v3 layout).
 *
 *   1. Flagged reviews — every dispute (any status) + reviews eligible to flag
 *      (rating ≤ 3, no open dispute). Rows select via `?dispute=<id>`.
 *   2. AI dispute draft — the selected dispute's evidence package: the verbatim
 *      review, the policy violation, and the stored AI-drafted argument
 *      (persisted to `details` by the wizard's prepareDispute).
 *   3. Status pipeline — Draft / Submitted / Won / Lost columns computed from
 *      stored statuses (submitted / submitted_to_google / removed+accepted /
 *      rejected; withdrawn is footnoted).
 *
 * Selection is server-driven (no client state). All actions are preserved:
 * File New Dispute → wizard, View details, Ready-to-send + Mark as Filed
 * (markDisputeFiled), Re-submit for rejected disputes.
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

  const requestedId = sp.dispute && UUID_RE.test(sp.dispute) ? sp.dispute : undefined;
  const selected = (requestedId && all.find((d) => d.id === requestedId)) || all[0] || null;

  const pipeline = {
    draft: all.filter((d) => d.status === "submitted"),
    submitted: all.filter((d) => d.status === "submitted_to_google"),
    won: all.filter((d) => d.status === "removed" || d.status === "accepted"),
    lost: all.filter((d) => d.status === "rejected"),
  };
  const withdrawnCount = all.filter((d) => d.status === "withdrawn").length;

  return (
    <AppShellServer topBar={<TopBar title="Dispute Center" />}>
      <PageHeader
        title="Dispute Center"
        description="Challenge fake, off-topic, or policy-violating reviews — with an AI-drafted, Knowledge Base-grounded argument."
        breadcrumb={[{ label: "Reviews", href: "/reviews" }, { label: "Disputes" }]}
        actions={
          <Link href="/reviews/dispute/new" className="btn btn--pri">
            File New Dispute
          </Link>
        }
      />

      <div className="space-y-6">
        {/* Stat cards — whole-pipeline counts (live). */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total Filed" value={stats.total} />
          <StatCard label="Under Review" value={stats.underReview} tone="warn" />
          <StatCard label="Removed" value={stats.removed} tone="ok" />
          <StatCard label="Rejected" value={stats.rejected} tone="bad" />
        </div>

        {/* 3-panel workflow. */}
        <div className="dsp-grid">
          <FlaggedPanel disputes={all} eligible={eligible} selectedId={selected?.id ?? null} />
          <DraftPanel dispute={selected} />
          <PipelinePanel pipeline={pipeline} withdrawnCount={withdrawnCount} selectedId={selected?.id ?? null} />
        </div>
      </div>
    </AppShellServer>
  );
}

/* --- Stat cards (unchanged behavior) -------------------------------------- */

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  const valueColor =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-[var(--ink)]";
  return (
    <div className="ds-card" style={{ padding: "14px 16px" }}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</div>
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

/** Reason line for a dispute row — precise violation type, else legacy reason. */
function disputeReasonLabel(d: DisputeWithReview): string {
  if (d.violationType && isViolationType(d.violationType)) return violationLabel(d.violationType);
  return LEGACY_REASON_LABEL[d.reason] ?? "Unspecified";
}

/* --- Panel 1: flagged reviews ---------------------------------------------- */

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
  return (
    <section className="ds-card" style={{ padding: 0 }} aria-label="Flagged reviews">
      <div className="ds-card__head">
        <div>
          <h2 className="ds-card__title">Flagged reviews</h2>
          <p className="ds-card__sub">Potential policy issues</p>
        </div>
      </div>
      <div className="ds-card__body">
        {disputes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews flagged yet.</p>
        ) : (
          <div className="dsp-list">
            {disputes.map((d) => {
              const view = statusView(d.status);
              const isSelected = d.id === selectedId;
              return (
                <Link
                  key={d.id}
                  href={`/reviews/dispute?dispute=${d.id}`}
                  className={isSelected ? "dsp-row is-selected" : "dsp-row"}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div className="dsp-row__top">
                    <span className="dsp-row__name">{d.review?.reviewerName ?? "Anonymous"}</span>
                    <span className={view.chipClass}>{view.label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{disputeReasonLabel(d)}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {d.review?.body ?? "(no review text)"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        {eligible.length > 0 && (
          <>
            <h3 className="dsp-section-label text-muted-foreground">Eligible to flag</h3>
            <div className="dsp-list">
              {eligible.map((r) => (
                <Link
                  key={r.id}
                  href={`/reviews/dispute/new?step=violation&reviewId=${r.id}`}
                  className="dsp-row"
                >
                  <div className="dsp-row__top">
                    <span className="dsp-row__name">{r.reviewerName ?? "Anonymous"}</span>
                    <span className="chip chip--out">Flag</span>
                  </div>
                  <p className="mt-0.5 text-xs text-amber-500" aria-label={`${r.rating} of 5 stars`}>
                    {"★".repeat(Math.max(0, Math.min(5, r.rating)))}
                    {"☆".repeat(5 - Math.max(0, Math.min(5, r.rating)))}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {r.body ?? "(no review text)"}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* --- Panel 2: AI dispute draft / evidence package -------------------------- */

function DraftPanel({ dispute }: { dispute: DisputeWithReview | null }) {
  if (!dispute) {
    return (
      <section className="ds-card" style={{ padding: "40px 24px", textAlign: "center" }} aria-label="AI dispute draft">
        <EmptyIllustration name="disputes-empty" style={{ marginBottom: 12 }} />
        <h2 className="text-base font-semibold text-[var(--ink)]">No disputes yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          When a review is fake, off-topic, or violates Google&apos;s policies, file a dispute to
          request its removal. We&apos;ll help you draft a strong, factual argument.
        </p>
        <div className="mt-4">
          <Link href="/reviews/dispute/new" className="btn btn--pri">
            File your first dispute
          </Link>
        </div>
      </section>
    );
  }

  const view = statusView(dispute.status);
  const violation =
    dispute.violationType && isViolationType(dispute.violationType)
      ? violationMeta(dispute.violationType)
      : null;
  const review = dispute.review;
  const isPending = dispute.status === "submitted";

  return (
    <section className="ds-card" style={{ padding: 0 }} aria-label="AI dispute draft">
      <div className="ds-card__head">
        <div>
          <h2 className="ds-card__title">AI dispute draft</h2>
          <p className="ds-card__sub">Evidence package</p>
        </div>
        <span className={view.chipClass}>{view.label}</span>
      </div>
      <div className="ds-card__body space-y-4">
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
          <p className="text-sm text-muted-foreground">The original review is no longer available.</p>
        )}

        <dl className="dsp-meta text-sm">
          <MetaField label="Policy violation" value={disputeReasonLabel(dispute)} />
          <MetaField label="Google policy" value={violation?.policy ?? "—"} />
          <MetaField label="Prepared" value={new Date(dispute.createdAt).toLocaleDateString()} />
          <MetaField
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
          <div className="text-xs font-medium text-muted-foreground">Dispute argument</div>
          <p className="dsp-argument mt-1">
            {dispute.details ?? "(no argument recorded — open the wizard to draft one)"}
          </p>
        </div>

        <div className="dsp-actions">
          <Link href={`/reviews/dispute/${dispute.id}`} className="btn btn--outlined">
            View details
          </Link>
          {isPending && (
            <>
              <Link href={`/reviews/dispute/${dispute.id}/ready`} className="btn btn--tonal">
                Open ready-to-send
              </Link>
              <form action={markDisputeFiled}>
                <input type="hidden" name="disputeId" value={dispute.id} />
                <button type="submit" className="btn btn--pri">
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
              className="btn btn--pri"
            >
              Re-submit
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[var(--ink)]">{value}</dd>
    </div>
  );
}

/* --- Panel 3: status pipeline ----------------------------------------------*/

function PipelinePanel({
  pipeline,
  withdrawnCount,
  selectedId,
}: {
  pipeline: {
    draft: DisputeWithReview[];
    submitted: DisputeWithReview[];
    won: DisputeWithReview[];
    lost: DisputeWithReview[];
  };
  withdrawnCount: number;
  selectedId: string | null;
}) {
  const columns: Array<{ key: string; title: string; rows: DisputeWithReview[]; empty: string }> = [
    { key: "draft", title: "Draft", rows: pipeline.draft, empty: "Ready for review" },
    { key: "submitted", title: "Submitted", rows: pipeline.submitted, empty: "Awaiting Google" },
    { key: "won", title: "Won", rows: pipeline.won, empty: "No removals yet" },
    { key: "lost", title: "Lost", rows: pipeline.lost, empty: "No rejections" },
  ];

  return (
    <section className="ds-card" style={{ padding: 0 }} aria-label="Status pipeline">
      <div className="ds-card__head">
        <div>
          <h2 className="ds-card__title">Status pipeline</h2>
          <p className="ds-card__sub">Draft to decision</p>
        </div>
      </div>
      <div className="ds-card__body">
        <div className="dsp-cols">
          {columns.map((col) => (
            <div key={col.key} className="dsp-col">
              <div className="dsp-col__head">
                <span className="dsp-col__title">{col.title}</span>
                <span className="dsp-col__count">{col.rows.length}</span>
              </div>
              {col.rows.length === 0 ? (
                <p className="dsp-col__empty text-muted-foreground">{col.empty}</p>
              ) : (
                col.rows.map((d) => {
                  const isSelected = d.id === selectedId;
                  return (
                    <Link
                      key={d.id}
                      href={`/reviews/dispute?dispute=${d.id}`}
                      className={isSelected ? "dsp-mini is-selected" : "dsp-mini"}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <span className="dsp-mini__name">{d.review?.reviewerName ?? "Anonymous"}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          ))}
        </div>
        {withdrawnCount > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {withdrawnCount} withdrawn dispute{withdrawnCount === 1 ? "" : "s"} not shown in the
            pipeline.
          </p>
        )}
      </div>
    </section>
  );
}
