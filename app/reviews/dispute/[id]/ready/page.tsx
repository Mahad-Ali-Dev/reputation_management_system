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

export const dynamic = "force-dynamic";

const GOOGLE_SUPPORT_EMAIL = "reviews-support@google.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ready to Send (Module 08) — the compliant manual hand-off.
 *
 * The app NEVER auto-submits to Google (spec compliance flag): the user must
 * email Google from their OWN account. This screen assembles the package and
 * gives copy buttons + an Open Gmail link, then "Mark as Filed & Track" records
 * that the user filed it (status → Under Review). Submitting from the owner's
 * account is what prevents Google flagging coordinated dispute spam.
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
      <PageHeader
        title="Ready to send"
        description="Your dispute is prepared. Send it to Google from your own account, then mark it filed to track the outcome."
        breadcrumb={[
          { label: "Reviews", href: "/reviews" },
          { label: "Disputes", href: "/reviews/dispute" },
          { label: "Ready to send" },
        ]}
      />

      <div className="space-y-6">
        {/* Compliance explainer — prominent, verbatim intent from the spec. */}
        <div className="ds-card ds-card--pri" style={{ padding: "16px 18px" }}>
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            You must send this from your own Google account
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Google only accepts review-removal requests submitted by the business owner directly. We
            don&apos;t submit on your behalf — use the buttons below to email Google yourself. This
            keeps your request legitimate and avoids it being flagged as spam. Outcomes vary; removal
            is never guaranteed.
          </p>
        </div>

        {/* The package. */}
        <div className="ds-card" style={{ padding: 0 }}>
          <div className="ds-card__head">
            <div>
              <h2 className="ds-card__title">Your dispute package</h2>
              <p className="ds-card__sub">Copy the details into an email to Google, or open a pre-filled Gmail draft.</p>
            </div>
          </div>
          <div className="ds-card__body space-y-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Send to" value={GOOGLE_SUPPORT_EMAIL} />
              <Field label="Subject" value={subject} />
              <Field label="Business" value={businessName} />
              <Field label="Policy violation" value={violation} />
              <Field label="Reviewer" value={reviewerName} />
              <Field label="Review date" value={reviewDate} />
            </dl>

            <div>
              <div className="text-xs font-medium text-muted-foreground">Argument</div>
              <p className="mt-1 whitespace-pre-wrap rounded-md border bg-white p-3 text-sm">
                {argument || "(no argument text)"}
              </p>
            </div>

            <CopyPackage email={GOOGLE_SUPPORT_EMAIL} allDetails={allDetails} gmailHref={gmailHref} />
          </div>
        </div>

        {/* Track. */}
        <div className="ds-card" style={{ padding: "16px 18px" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Filed it with Google?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Mark it as filed and we&apos;ll track the outcome on your dispute timeline.
              </p>
            </div>
            {alreadyFiled ? (
              <span className="chip chip--warn">Already marked as filed</span>
            ) : (
              <form action={markDisputeFiled}>
                <input type="hidden" name="disputeId" value={dispute.id} />
                <button type="submit" className="btn btn--pri">
                  Mark as Filed &amp; Track
                </button>
              </form>
            )}
          </div>
        </div>

        <div>
          <Link href={`/reviews/dispute/${dispute.id}`} className="text-sm text-muted-foreground hover:underline">
            View dispute details →
          </Link>
        </div>
      </div>
    </AppShellServer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[var(--ink)]">{value}</dd>
    </div>
  );
}
