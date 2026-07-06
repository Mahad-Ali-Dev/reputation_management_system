import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { getOrgContext } from "@/lib/auth/org-context";
import { getDisputeById } from "@/lib/reviews/dispute-queries";
import { markDisputeFiled } from "@/lib/reviews/dispute-actions";
import { violationLabel } from "@/lib/reviews/dispute-meta";
import { CopyPackage } from "../../_components/copy-package";
import "../../disputes.css";

export const dynamic = "force-dynamic";

const GOOGLE_SUPPORT_EMAIL = "reviews-support@google.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const A = "/assets/repulabs/dispute-center";

/**
 * Ready to Send — rebuilt to the "dispute ready" kit mockup (completion hero,
 * benefits strip, send-method cards, package contents, help card).
 *
 * COMPLIANCE (unchanged intent): the app NEVER auto-submits to Google. The user
 * must email Google from their OWN account, so the kit's "Let us send it for
 * you" card is honestly re-scoped to "Send from Your Email" (opens a pre-filled
 * Gmail draft) as the recommended method. The CopyPackage island + the
 * markDisputeFiled server action are preserved.
 */
export default async function ReadyToSendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { orgId, org } = await getOrgContext();
  const dispute = await getDisputeById(orgId, id);
  if (!dispute) notFound();

  const businessName = dispute.review?.establishment?.name ?? org.name;
  const violation = violationLabel(dispute.violationType);
  const reviewerName = dispute.review?.reviewerName ?? "Anonymous";
  const reviewDate = dispute.review?.postedAt
    ? new Date(dispute.review.postedAt).toLocaleDateString()
    : "—";
  const argument = dispute.details ?? "";

  const subject = `Review removal request — ${businessName}`;
  const allDetails = [
    `To: ${GOOGLE_SUPPORT_EMAIL}`,
    `Subject: ${subject}`,
    "",
    `Business: ${businessName}`,
    `Policy violation: ${violation}`,
    `Reviewer: ${reviewerName}`,
    `Review date: ${reviewDate}`,
    "",
    argument,
  ].join("\n");

  const gmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    GOOGLE_SUPPORT_EMAIL,
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(allDetails)}`;

  const alreadyFiled = dispute.status === "submitted_to_google";

  return (
    <AppShellServer topBar={<TopBar title="Ready to send" />}>
      <div className="dc">
        <PageHeader
          title="Your Dispute is Ready!"
          description="We've prepared everything you need to send to Google. Choose your preferred way to proceed."
          breadcrumb={[
            { label: "Dispute Center", href: "/reviews/dispute" },
            { label: "New Dispute", href: "/reviews/dispute/new" },
            { label: "Review & Send" },
          ]}
        />

        {/* Completion hero art */}
        <div className="dc-readyhero">
          <div />
          {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
          <img className="dc-readyhero__art" src={`${A}/ready-hero.svg`} alt="" aria-hidden="true" />
        </div>

        {/* Benefits strip */}
        <div className="dc-readyben">
          <ReadyBenefit tone="pri" art={`${A}/ready-crafted.svg`} title="AI-crafted argument" cap="Built on policy and evidence" />
          <ReadyBenefit tone="blue" art={`${A}/ready-savetime.svg`} title="Saves you time" cap="Ready in under 1 minute" />
          <ReadyBenefit tone="blue" art={`${A}/ready-secure.svg`} title="Your data is secure" cap="We never share your information" />
        </div>

        {/* Compliance note — kept prominent (spec). */}
        <div className="dc-compliance">
          <p className="dc-compliance__t">You send this from your own Google account</p>
          <p className="dc-compliance__s">
            Google only accepts review-removal requests submitted by the business owner directly. We
            don&apos;t submit on your behalf — use the options below to email Google yourself. This
            keeps your request legitimate and avoids it being flagged as spam. Outcomes vary; removal
            is never guaranteed.
          </p>
        </div>

        <h2 className="dc-readyheading">How would you like to send your dispute?</h2>

        {/* Send-method cards */}
        <div className="dc-methods">
          <div className="dc-method dc-method--rec">
            <span className="dc-method__badge"><StarIcon /> Recommended</span>
            <div className="dc-method__tile dc-method__tile--pri"><PlaneIcon /></div>
            <h3 className="dc-method__title">Send from Your Email</h3>
            <p className="dc-method__body">
              Open a pre-filled Gmail draft addressed to Google — review it, then hit send from your
              own account.
            </p>
            <div className="dc-method__feature dc-method__feature--pri"><ShieldCheckIcon /> Fastest &amp; most reliable</div>
            <a href={gmailHref} target="_blank" rel="noopener noreferrer" className="dc-method__cta dc-method__cta--pri">
              Open Gmail Draft <ArrowRight />
            </a>
          </div>

          <div className="dc-method">
            <div className="dc-method__tile dc-method__tile--blue"><MailIcon /></div>
            <h3 className="dc-method__title">Copy the Details</h3>
            <p className="dc-method__body">
              Copy the ready-to-use email — address, subject and argument — to paste into any email
              client you prefer.
            </p>
            <div className="dc-method__feature dc-method__feature--blue"><MailIcon /> Use your own email account</div>
            <CopyPackage email={GOOGLE_SUPPORT_EMAIL} allDetails={allDetails} gmailHref={gmailHref} />
          </div>

          <div className="dc-method">
            <div className="dc-method__tile dc-method__tile--teal"><DocIcon /></div>
            <h3 className="dc-method__title">Filed It Already?</h3>
            <p className="dc-method__body">
              Once you&apos;ve emailed Google from your account, mark it filed and we&apos;ll track the
              outcome on your timeline.
            </p>
            <div className="dc-method__feature dc-method__feature--teal"><ClockIcon /> Tracked on your timeline</div>
            {alreadyFiled ? (
              <span className="dc-chip dc-chip--review" style={{ height: 49, borderRadius: 8, width: "100%", justifyContent: "center" }}>
                Already marked as filed
              </span>
            ) : (
              <form action={markDisputeFiled} style={{ width: "100%" }}>
                <input type="hidden" name="disputeId" value={dispute.id} />
                <button type="submit" className="dc-method__cta dc-method__cta--teal">
                  Mark as Filed &amp; Track <ArrowRight />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Package + help */}
        <div className="dc-readylower">
          <section className="dc-card dc-pkgcard" aria-label="Package contents">
            <div className="dc-pkghead">
              <span className="dc-pkghead__icon"><FolderIcon /></span>
              <span className="dc-pkghead__title">Your Dispute Package Includes</span>
            </div>
            <div className="dc-pkgitems">
              <PkgItem art={`${A}/ready-pkg-ai.svg`} title="AI Argument" cap="Strong & policy-aligned" />
              <PkgItem art={`${A}/ready-pkg-policy.svg`} title="Policy References" cap="Relevant Google policies" />
              <PkgItem art={`${A}/ready-pkg-business.svg`} title="Business Context" cap="About your business" />
              <PkgItem art={`${A}/ready-pkg-evidence.svg`} title="Supporting Evidence" cap="Facts to support your case" />
            </div>

            <dl className="dc-evidence__meta" style={{ marginTop: 18 }}>
              <div>
                <dt className="dc-evidence__k">Send to</dt>
                <dd className="dc-evidence__v">{GOOGLE_SUPPORT_EMAIL}</dd>
              </div>
              <div>
                <dt className="dc-evidence__k">Subject</dt>
                <dd className="dc-evidence__v">{subject}</dd>
              </div>
              <div>
                <dt className="dc-evidence__k">Policy violation</dt>
                <dd className="dc-evidence__v">{violation}</dd>
              </div>
              <div>
                <dt className="dc-evidence__k">Reviewer</dt>
                <dd className="dc-evidence__v">{reviewerName}</dd>
              </div>
            </dl>

            <div style={{ marginTop: 16 }}>
              <div className="dc-evidence__k">Argument</div>
              <p className="dc-argument" style={{ marginTop: 6 }}>{argument || "(no argument text)"}</p>
            </div>

            <div className="dc-responsenote">
              <ClockIcon />
              <p>Google typically responds within 5–10 business days.</p>
            </div>
          </section>

          <section className="dc-card dc-helpcard" aria-label="Need help">
            <span className="dc-helpcard__icon"><HeadsetIcon /></span>
            <p className="dc-helpcard__title">Need help?</p>
            <p className="dc-helpcard__text">Our support team is here if you have any questions.</p>
            <Link href="/support" className="dc-btn" style={{ width: "100%" }}>
              <ChatIcon /> Chat with Support
            </Link>
            <div style={{ marginTop: 14 }}>
              <Link href={`/reviews/dispute/${dispute.id}`} className="dc-linkbtn">
                View dispute details <ArrowRight />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </AppShellServer>
  );
}

function ReadyBenefit({
  tone,
  art,
  title,
  cap,
}: {
  tone: "pri" | "blue";
  art: string;
  title: string;
  cap: string;
}) {
  return (
    <div className="dc-readyben__col">
      <div className={`dc-readyben__icon dc-readyben__icon--${tone}`}>
        {/* biome-ignore lint/performance/noImgElement: static kit SVG */}
        <img src={art} alt="" aria-hidden="true" />
      </div>
      <div>
        <div className="dc-readyben__title">{title}</div>
        <div className="dc-readyben__cap">{cap}</div>
      </div>
    </div>
  );
}

function PkgItem({ art, title, cap }: { art: string; title: string; cap: string }) {
  return (
    <div className="dc-pkgitem">
      <div className="dc-pkgitem__icon">
        {/* biome-ignore lint/performance/noImgElement: static kit SVG */}
        <img src={art} alt="" aria-hidden="true" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="dc-pkgitem__title">{title}</div>
        <div className="dc-pkgitem__cap">{cap}</div>
      </div>
    </div>
  );
}

/* --- Inline icons ---------------------------------------------------------- */

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 6.9L12 17.8 5.4 21l1.4-6.9L1.6 9.3l7-.8z" />
    </svg>
  );
}
function PlaneIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}
function ShieldCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" />
    </svg>
  );
}
function HeadsetIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
