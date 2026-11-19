import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { markDisputeFiled } from "@/lib/reviews/dispute-actions";
import {
  isResubmittable,
  isViolationType,
  statusView,
  violationLabel,
  violationMeta,
} from "@/lib/reviews/dispute-meta";
import {
  type DisputeWithReview,
  disputeStatCards,
  listDisputableReviews,
  listDisputesByTab,
} from "@/lib/reviews/dispute-queries";
import { ChevronRight, Flag, Plus, Send, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { ReviewSnippet } from "./_components/review-snippet";
import "./disputes.css";
import "./disputes-glass.css";
import "./disputes-apple.css";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Dispute kit illustrations, kept and shown on soft icon plates. */
const A = "/assets/repulabs/dispute-center";

/**
 * Dispute Manager (Apple look). Same live data + server actions as before:
 *   • one frosted summary card with the four real counts (no invented deltas),
 *   • disputes + reviews eligible to flag as inset lists (?dispute=<id> selects),
 *   • the selected dispute's evidence package with its actions,
 *   • a status pipeline, and an Apple empty state.
 * Actions preserved: File New Dispute → wizard, View details, Ready-to-send,
 * Mark as Filed, Re-submit.
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
    draft: all.filter((d) => d.status === "submitted").length,
    submitted: all.filter((d) => d.status === "submitted_to_google").length,
    won: all.filter((d) => d.status === "removed" || d.status === "accepted").length,
    lost: all.filter((d) => d.status === "rejected").length,
  };
  const hasDisputes = all.length > 0;

  return (
    <AppShellServer topBar={<TopBar title="Dispute Manager" />}>
      <div className="dm">
        <header className="dm-head">
          <div>
            <span className="dm-eyebrow">Reputation</span>
            <h1 className="dm-title">Dispute Manager</h1>
            <p className="dm-sub">
              Fake, off-topic or policy-breaking reviews? We help you build a clear case and ask
              Google to remove them.
            </p>
          </div>
          <Link href="/reviews/dispute/new" className="dm-pill dm-pill--pri dm-pill--lg">
            <Plus size={16} strokeWidth={2} />
            File a dispute
          </Link>
        </header>

        <section className="dm-stats" aria-label="Dispute summary">
          <StatCell art={`${A}/kpi-total.svg`} label="Filed" value={stats.total} note="All time" />
          <StatCell
            art={`${A}/kpi-under-review.svg`}
            label="Under review"
            value={stats.underReview}
            note="Waiting on Google"
            tone="amber"
          />
          <StatCell
            art={`${A}/kpi-removed.svg`}
            label="Removed"
            value={stats.removed}
            note="Taken down"
            tone="green"
          />
          <StatCell
            art={`${A}/kpi-rejected.svg`}
            label="Rejected"
            value={stats.rejected}
            note="Google kept the review"
            tone="red"
          />
        </section>

        {!hasDisputes && eligible.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="dm-grid">
            <div className="dm-stack">
              {hasDisputes && <DisputeList disputes={all} selectedId={selected?.id ?? null} />}
              {selected && <EvidencePanel dispute={selected} />}
              {eligible.length > 0 && <EligibleList eligible={eligible} />}
            </div>
            <PipelinePanel pipeline={pipeline} />
          </div>
        )}
      </div>
    </AppShellServer>
  );
}

/* --- summary cell ----------------------------------------------------------- */

function StatCell({
  art,
  label,
  value,
  note,
  tone = "accent",
}: {
  art: string;
  label: string;
  value: number;
  note: string;
  tone?: "accent" | "amber" | "green" | "red";
}) {
  return (
    <div className="dm-stat">
      <span className={`dm-stat__icon dm-stat__icon--art is-${tone}`} aria-hidden="true">
        <img src={art} alt="" />
      </span>
      <div className="dm-stat__value">{value}</div>
      <div className="dm-stat__label">{label}</div>
      <div className="dm-stat__note">{note}</div>
    </div>
  );
}

/* --- shared vocabulary ------------------------------------------------------ */

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

const AVA_HUES = [252, 32, 152, 340, 214, 186];
function avaHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVA_HUES[h % AVA_HUES.length] ?? 252;
}
function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function statusTone(status: string): "amber" | "green" | "red" | "accent" {
  if (status === "submitted_to_google") return "amber";
  if (status === "removed" || status === "accepted") return "green";
  if (status === "rejected") return "red";
  return "accent";
}

function Stars({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, rating));
  return (
    <span className="dm-stars" role="img" aria-label={`${n} of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-star display
          key={i}
          size={12}
          strokeWidth={0}
          fill={i < n ? "#ff9f0a" : "rgba(120,120,128,0.25)"}
        />
      ))}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="dm-ava"
      style={{ "--dm-hue": avaHue(name) } as React.CSSProperties}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}

/* --- disputes list ------------------------------------------------------------ */

function DisputeList({
  disputes,
  selectedId,
}: {
  disputes: DisputeWithReview[];
  selectedId: string | null;
}) {
  return (
    <section className="dm-card" aria-labelledby="dm-disputes-title">
      <header className="dm-card__head">
        <div>
          <h2 id="dm-disputes-title" className="dm-card__title">
            Your disputes <span className="dm-count">{disputes.length}</span>
          </h2>
          <p className="dm-card__sub">Select one to see its evidence and next step.</p>
        </div>
      </header>
      <ul className="dm-list">
        {disputes.map((d) => {
          const name = d.review?.reviewerName ?? "Anonymous";
          const isSelected = d.id === selectedId;
          return (
            <li key={d.id}>
              <Link
                href={`/reviews/dispute?dispute=${d.id}`}
                className={`dm-row${isSelected ? " is-selected" : ""}`}
                aria-current={isSelected ? "true" : undefined}
              >
                <Avatar name={name} />
                <span className="dm-row__main">
                  <span className="dm-row__top">
                    <span className="dm-row__name">{name}</span>
                    <span className={`dm-status is-${statusTone(d.status)}`}>
                      {statusView(d.status).label}
                    </span>
                  </span>
                  <Stars rating={d.review?.rating ?? 0} />
                  <span className="dm-row__text">{d.review?.body ?? "(no review text)"}</span>
                  <span className="dm-row__meta">
                    {disputeReasonLabel(d)} · {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="dm-chev" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* --- reviews eligible to flag ------------------------------------------------- */

type EligibleReview = Awaited<ReturnType<typeof listDisputableReviews>>[number];

function EligibleList({ eligible }: { eligible: EligibleReview[] }) {
  return (
    <section className="dm-card" aria-labelledby="dm-eligible-title">
      <header className="dm-card__head">
        <div>
          <h2 id="dm-eligible-title" className="dm-card__title">
            Could be disputed
          </h2>
          <p className="dm-card__sub">Low-rated reviews with no dispute yet.</p>
        </div>
        <Link href="/reviews" className="dm-link">
          All reviews <ChevronRight size={15} strokeWidth={2} />
        </Link>
      </header>
      <ul className="dm-list">
        {eligible.map((r) => {
          const name = r.reviewerName ?? "Anonymous";
          return (
            <li key={r.id}>
              <Link
                href={`/reviews/dispute/new?step=violation&reviewId=${r.id}`}
                className="dm-row"
              >
                <Avatar name={name} />
                <span className="dm-row__main">
                  <span className="dm-row__top">
                    <span className="dm-row__name">{name}</span>
                  </span>
                  <Stars rating={r.rating} />
                  <span className="dm-row__text">{r.body ?? "(no review text)"}</span>
                </span>
                <span className="dm-pill dm-pill--sm dm-pill--tint">
                  <Flag size={13} strokeWidth={2} />
                  Dispute
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* --- evidence package for the selected dispute -------------------------------- */

function EvidencePanel({ dispute }: { dispute: DisputeWithReview }) {
  const violation =
    dispute.violationType && isViolationType(dispute.violationType)
      ? violationMeta(dispute.violationType)
      : null;
  const review = dispute.review;
  const isPending = dispute.status === "submitted";
  const filed = dispute.filedAt ?? dispute.submittedToProviderAt;

  return (
    <section className="dm-card" aria-labelledby="dm-evidence-title">
      <header className="dm-card__head">
        <div>
          <h2 id="dm-evidence-title" className="dm-card__title">
            Evidence package
          </h2>
          <p className="dm-card__sub">What we send to Google for this review.</p>
        </div>
        <span className={`dm-status is-${statusTone(dispute.status)}`}>
          {statusView(dispute.status).label}
        </span>
      </header>

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
        <p className="dm-card__sub">The original review is no longer available.</p>
      )}

      <dl className="dm-facts">
        <div>
          <dt>Reason</dt>
          <dd>{disputeReasonLabel(dispute)}</dd>
        </div>
        <div>
          <dt>Google policy</dt>
          <dd>{violation?.policy ?? "—"}</dd>
        </div>
        <div>
          <dt>Prepared</dt>
          <dd>{new Date(dispute.createdAt).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Filed with Google</dt>
          <dd>{filed ? new Date(filed as Date).toLocaleDateString() : "Not yet"}</dd>
        </div>
      </dl>

      <div className="dm-argument">
        <div className="dm-argument__label">Your argument</div>
        <p>{dispute.details ?? "No argument yet. Open the wizard to draft one."}</p>
      </div>

      <div className="dm-actions">
        <Link href={`/reviews/dispute/${dispute.id}`} className="dm-pill">
          View details
        </Link>
        {isPending && (
          <>
            <Link href={`/reviews/dispute/${dispute.id}/ready`} className="dm-pill">
              Ready to send
            </Link>
            <form action={markDisputeFiled}>
              <input type="hidden" name="disputeId" value={dispute.id} />
              <button type="submit" className="dm-pill dm-pill--pri">
                <Send size={15} strokeWidth={1.8} />
                Mark as filed
              </button>
            </form>
          </>
        )}
        {isResubmittable(dispute.status) && (
          <Link
            href={`/reviews/dispute/new?step=argument&reviewId=${dispute.reviewId}${
              dispute.violationType ? `&violationType=${dispute.violationType}` : ""
            }&resubmit=1`}
            className="dm-pill dm-pill--pri"
          >
            Re-submit
          </Link>
        )}
      </div>
    </section>
  );
}

/* --- status pipeline ------------------------------------------------------------ */

function PipelinePanel({
  pipeline,
}: {
  pipeline: { draft: number; submitted: number; won: number; lost: number };
}) {
  const rows: Array<{
    key: string;
    art: string;
    tone: string;
    title: string;
    sub: string;
    value: number;
  }> = [
    {
      key: "draft",
      art: `${A}/pipe-draft.svg`,
      tone: "accent",
      title: "Ready to file",
      sub: "Prepared, not sent yet",
      value: pipeline.draft,
    },
    {
      key: "submitted",
      art: `${A}/pipe-submitted.svg`,
      tone: "amber",
      title: "With Google",
      sub: "Waiting for a decision",
      value: pipeline.submitted,
    },
    {
      key: "won",
      art: `${A}/pipe-won.svg`,
      tone: "green",
      title: "Removed",
      sub: "Review taken down",
      value: pipeline.won,
    },
    {
      key: "lost",
      art: `${A}/pipe-lost.svg`,
      tone: "red",
      title: "Rejected",
      sub: "Review stays up",
      value: pipeline.lost,
    },
  ];
  return (
    <aside className="dm-card dm-pipe" aria-labelledby="dm-pipe-title">
      <h2 id="dm-pipe-title" className="dm-card__title">
        Pipeline
      </h2>
      <p className="dm-card__sub">Where every dispute stands.</p>
      <ol className="dm-pipe__list">
        {rows.map((r) => {
          return (
            <li key={r.key} className="dm-pipe__row">
              <span className={`dm-stat__icon dm-stat__icon--art is-${r.tone}`} aria-hidden="true">
                <img src={r.art} alt="" />
              </span>
              <span className="dm-pipe__text">
                <span className="dm-pipe__t">{r.title}</span>
                <span className="dm-pipe__d">{r.sub}</span>
              </span>
              <span className="dm-pipe__value">{r.value}</span>
            </li>
          );
        })}
      </ol>
      <div className="dm-pipe__tip">
        <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
        Disputes with a specific Google policy and clear facts are removed most often.
      </div>
    </aside>
  );
}

/* --- empty state ---------------------------------------------------------------- */

function EmptyState() {
  return (
    <section className="dm-card dm-empty">
      <img className="dm-empty__art" src={`${A}/main-empty.svg`} alt="" aria-hidden="true" />
      <h2 className="dm-empty__title">No disputes. No problem reviews.</h2>
      <p className="dm-empty__text">
        When a review is fake, off-topic or breaks Google&apos;s rules, file a dispute and
        we&apos;ll help you write a clear, factual case for removal.
      </p>
      <Link href="/reviews/dispute/new" className="dm-pill dm-pill--pri dm-pill--lg">
        <Plus size={16} strokeWidth={2} />
        File your first dispute
      </Link>
    </section>
  );
}
