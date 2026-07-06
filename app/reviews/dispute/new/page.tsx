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
import "../disputes.css";

export const dynamic = "force-dynamic";

type Step = "review" | "violation" | "argument";
const A = "/assets/repulabs/dispute-center";

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

  let step: Step = "review";
  if (sp.step === "argument" && reviewId && violationType) step = "argument";
  else if ((sp.step === "violation" || sp.step === "argument") && reviewId) step = "violation";

  const hero =
    step === "argument" ? `${A}/ai-hero.svg` : `${A}/wiz-hero.svg`;

  return (
    <AppShellServer topBar={<TopBar title="File a dispute" />}>
      <div className="dc">
        <div className="dc-wizhead">
          <div>
            <PageHeader
              title="File a dispute"
              description="Three simple steps to help us review and resolve the issue fairly."
              breadcrumb={BREADCRUMB}
            />
          </div>
          {/* biome-ignore lint/performance/noImgElement: static kit hero illustration */}
          <img className="dc-wizhead__art" src={hero} alt="" aria-hidden="true" />
        </div>

        <div className="space-y-6">
          <Stepper step={step} />

          {step === "review" && <StepSelectReview orgId={orgId} q={sp.q} />}
          {step === "violation" && reviewId && <StepSelectViolation orgId={orgId} reviewId={reviewId} />}
          {step === "argument" && reviewId && violationType && (
            <StepArgument orgId={orgId} reviewId={reviewId} violationType={violationType} />
          )}
        </div>
      </div>
    </AppShellServer>
  );
}

/* --- Stepper --------------------------------------------------------------- */

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["review", "violation", "argument"];
  const activeIdx = order.indexOf(step);
  const steps: Array<{ key: Step; title: string; copy: string; icon: React.ReactNode }> = [
    { key: "review", title: "Select review", copy: "Choose the review you want to dispute.", icon: <DocSearchIcon /> },
    { key: "violation", title: "Violation type", copy: "Select the policy it violates.", icon: <ShieldIcon /> },
    { key: "argument", title: "AI argument", copy: "Review and edit the AI-drafted argument.", icon: <PencilIcon /> },
  ];

  return (
    <ol className="dc-stepper" aria-label="File a dispute steps">
      {steps.map((s, i) => {
        const state = i < activeIdx ? "is-done" : i === activeIdx ? "is-active" : "";
        const isActive = i === activeIdx;
        return (
          <li key={s.key} className={`dc-step ${state}`} aria-current={isActive ? "step" : undefined}>
            <span className="dc-step__circle">{s.icon}</span>
            <div className="dc-step__text">
              <div className="dc-step__title">{s.title}</div>
              <div className="dc-step__copy">{s.copy}</div>
              {isActive && <div className="dc-step__underline" />}
            </div>
            {i < steps.length - 1 && <span className="dc-step__conn" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/* --- Step 1: select review ------------------------------------------------- */

async function StepSelectReview({ orgId, q }: { orgId: string; q?: string }) {
  const reviews = await listDisputableReviews(orgId, q);
  return (
    <>
      <div className="dc-card dc-selcard">
        <div className="dc-selcard__head">
          <span className="dc-selcard__icon"><DocIcon /></span>
          <div>
            <h2 className="dc-selcard__title">Select a review to dispute</h2>
            <p className="dc-selcard__helper">
              Showing reviews rated <b>3 stars or below</b> that aren&apos;t already in an open dispute.
            </p>
          </div>
        </div>

        <div className="dc-selcard__grid">
          <div>
            <form method="get" className="dc-searchrow">
              <input type="hidden" name="step" value="review" />
              <div className="dc-searchrow__field">
                <SearchIcon />
                <input
                  type="text"
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="Search review text, customer name, or topic…"
                  className="dc-searchrow__input"
                  aria-label="Search reviews"
                />
              </div>
              <button type="submit" className="dc-searchrow__btn">Search</button>
            </form>

            {reviews.length === 0 ? (
              <div className="dc-alert">
                <span className="dc-alert__icon"><SparkleIcon /></span>
                <div>
                  <div className="dc-alert__t">No eligible reviews found.</div>
                  <div className="dc-alert__s">Only reviews rated 3 stars or below can be disputed.</div>
                </div>
              </div>
            ) : (
              <div className="dc-revlist">
                {reviews.map((r) => (
                  <Link
                    key={r.id}
                    href={`/reviews/dispute/new?step=violation&reviewId=${r.id}`}
                    className="dc-revrow"
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
                    <span className="dc-revrow__select">Select <ArrowRight /></span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
          <img className="dc-selcard__art" src={`${A}/select-search.svg`} alt="" aria-hidden="true" />
        </div>
      </div>

      {/* Benefit cards */}
      <div className="dc-benefits">
        <Benefit tone="pri" art={`${A}/benefit-fair.svg`} title="Fair & Transparent" body="We evaluate each dispute based on policy guidelines." />
        <Benefit tone="green" art={`${A}/benefit-secure.svg`} title="Secure & Private" body="Your data and arguments are always protected." />
        <Benefit tone="orange" art={`${A}/benefit-ai.svg`} title="AI-Powered Support" body="Get intelligent suggestions to build a stronger case." />
        <Benefit tone="blue" art={`${A}/benefit-faster.svg`} title="Faster Resolution" body="We work quickly to resolve valid disputes." />
      </div>
    </>
  );
}

function Benefit({
  tone,
  art,
  title,
  body,
}: {
  tone: "pri" | "green" | "orange" | "blue";
  art: string;
  title: string;
  body: string;
}) {
  return (
    <div className="dc-benefit">
      <div className={`dc-benefit__icon dc-benefit__icon--${tone}`}>
        {/* biome-ignore lint/performance/noImgElement: static kit SVG */}
        <img src={art} alt="" aria-hidden="true" />
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="dc-benefit__title">{title}</p>
        <p className="dc-benefit__body">{body}</p>
      </div>
    </div>
  );
}

/* --- Step 2: violation type ------------------------------------------------ */

/** Kit rail colour + icon per stored violation type (order matches the grid). */
const VIOL_STYLE: Record<
  string,
  { rail: string; railSoft: string; icon: React.ReactNode }
> = {
  spam_fake: { rail: "#8e6df5", railSoft: "var(--dc-purple-soft)", icon: <TargetIcon /> },
  off_topic: { rail: "#8e6df5", railSoft: "var(--dc-purple-soft)", icon: <TargetIcon /> },
  conflict_of_interest: { rail: "#f28a35", railSoft: "var(--dc-orange-soft)", icon: <MegaphoneIcon /> },
  profanity_harassment: { rail: "#3478f6", railSoft: "var(--dc-blue-soft)", icon: <ChatIcon /> },
  discrimination: { rail: "#f43f64", railSoft: "var(--dc-pink-soft)", icon: <WarnShieldIcon /> },
  illegal_content: { rail: "#0ebb69", railSoft: "var(--dc-green-soft)", icon: <LockIcon /> },
};
// Concrete (non-Record) default so the ?? fallback is never `undefined` under
// noUncheckedIndexedAccess.
const DEFAULT_VIOL_STYLE = {
  rail: "#8e6df5",
  railSoft: "var(--dc-purple-soft)",
  icon: <TargetIcon />,
};

async function StepSelectViolation({ orgId, reviewId }: { orgId: string; reviewId: string }) {
  const review = await getReview(orgId, reviewId);
  if (!review) notFound();

  return (
    <>
      <div className="dc-card" style={{ padding: "16px 18px" }}>
        <ReviewSnippet
          rating={review.rating}
          reviewerName={review.reviewerName}
          source={review.source}
          establishmentName={review.establishment.name}
          postedAt={review.postedAt}
          body={review.body}
        />
      </div>

      <div className="dc-card dc-violcard">
        <div className="dc-violcard__head">
          <span className="dc-violcard__icon"><DocIcon /></span>
          <div>
            <h2 className="dc-violcard__title">Select violation type</h2>
            <p className="dc-violcard__sub">Choose the policy that best matches the issue with this review.</p>
          </div>
        </div>

        <div className="dc-violgrid">
          <aside className="dc-violhelper">
            {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
            <img className="dc-violhelper__art" src={`${A}/viol-helper.svg`} alt="" aria-hidden="true" />
            <p className="dc-violhelper__title">Not sure which one?</p>
            <p className="dc-violhelper__body">Pick the option that comes closest. You can change it later if needed.</p>
          </aside>

          <div className="dc-violopts" role="list">
            {VIOLATION_TYPES.map((v) => {
              const s = VIOL_STYLE[v.value] ?? VIOL_STYLE.spam_fake ?? DEFAULT_VIOL_STYLE;
              return (
                <Link
                  key={v.value}
                  href={`/reviews/dispute/new?step=argument&reviewId=${reviewId}&violationType=${v.value}`}
                  className="dc-violopt"
                  role="listitem"
                  style={{ ["--rail" as string]: s.rail, ["--railsoft" as string]: s.railSoft }}
                >
                  <span className="dc-violopt__icon">{s.icon}</span>
                  <div className="dc-violopt__body">
                    <p className="dc-violopt__title">{v.label}</p>
                    <p className="dc-violopt__desc">{v.blurb}</p>
                    <p className="dc-violopt__policy">Google policy: {v.policy}</p>
                  </div>
                  <span className="dc-violopt__radio" aria-hidden />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="dc-guidance">
          <span className="dc-guidance__icon"><InfoIcon /></span>
          <div>
            <div className="dc-guidance__t">Still not sure?</div>
            <div className="dc-guidance__s">You can describe the issue in the next step and we&apos;ll help you from there.</div>
          </div>
          <span className="dc-guidance__spacer" />
          <Link href="/ai/knowledge" className="dc-btn">
            <BookIcon /> View policy guidelines <ArrowRight />
          </Link>
        </div>
      </div>

      <Link href="/reviews/dispute/new?step=review" className="dc-backlink">
        <ArrowLeft /> Back to review selection
      </Link>
    </>
  );
}

/* --- Step 3: AI argument --------------------------------------------------- */

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
  const analysisComplete = initialArgument.trim().length > 0;

  return (
    <>
      <div className="dc-card" style={{ padding: "16px 18px" }}>
        <ReviewSnippet
          rating={review.rating}
          reviewerName={review.reviewerName}
          source={review.source}
          establishmentName={review.establishment.name}
          postedAt={review.postedAt}
          body={review.body}
        />
        <div className="dc-chip dc-chip--info" style={{ marginTop: 10 }}>Disputing as: {meta.label}</div>
      </div>

      <div className="dc-card dc-aicard">
        <div className="dc-aicard__head">
          <span className="dc-aicard__icon"><SparkleIcon /></span>
          <div>
            <h2 className="dc-aicard__title">AI argument</h2>
            <p className="dc-aicard__sub">Our AI will analyze the review and build a strong argument for your dispute.</p>
          </div>
          {analysisComplete && (
            <span className="dc-aicard__badge" role="status">
              <CheckCircleIcon /> Analysis complete
            </span>
          )}
        </div>

        <div className="dc-aibanner">
          <InfoIcon />
          <p>
            Our AI has analyzed this review and created a dispute argument based on the violation type
            and your business context.
          </p>
        </div>

        <div className="dc-aigrid">
          <aside className="dc-aihelper">
            {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
            <img className="dc-aihelper__art" src={`${A}/ai-generated.svg`} alt="" aria-hidden="true" />
            <p className="dc-aihelper__title">AI-generated argument</p>
            <p className="dc-aihelper__body">Drafted using policy rules, review content, and your business context.</p>
          </aside>

          <div>
            <ArgumentEditor
              reviewId={reviewId}
              violationType={violationType}
              initialArgument={initialArgument}
              initialKbChunksUsed={kbChunksUsed}
            />
            <div className="dc-ainote">
              <LightbulbIcon />
              <p>You can edit this argument before submitting. The AI uses your Knowledge Base for context.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="dc-protect">
        <span className="dc-protect__icon"><ShieldCheckIcon /></span>
        <div>
          <div className="dc-protect__t">Your data is protected</div>
          <div className="dc-protect__s">We never share your business information with third parties.</div>
        </div>
      </div>

      <Link
        href={`/reviews/dispute/new?step=violation&reviewId=${reviewId}`}
        className="dc-backlink"
      >
        <ArrowLeft /> Back to violation type
      </Link>
    </>
  );
}

/* --- Inline icons ---------------------------------------------------------- */

function DocSearchIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" /><path d="M14 3v5h5" />
      <circle cx="16" cy="16" r="3" /><path d="m21 21-1.5-1.5" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5 14 11.4 12 17l-1.9-5.6L4.5 9.5 10 7.6z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
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
function ArrowLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" />
    </svg>
  );
}
function LightbulbIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 12 3.5 4.65 4.65 0 0 0 7.5 11.5c.76.76 1.23 1.52 1.41 2.5" />
    </svg>
  );
}
function ShieldCheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 15-6v14l-15-6z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function WarnShieldIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
