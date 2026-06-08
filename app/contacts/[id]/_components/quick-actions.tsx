"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BulkRequestDialog } from "../../_components/bulk-request-dialog";

/**
 * Profile quick actions (client). Send Survey deep-links to the survey wizard
 * pre-populated with this contact; Request Review opens the review-request
 * composer scoped to the single contact (Pro-gated server-side). Send Message
 * deep-links to the support inbox (built in Wave 3c) — kept as a soft link.
 */

export function ProfileQuickActions({
  contactId,
  hasEmail,
  establishments,
  entitled,
}: {
  contactId: string;
  hasEmail: boolean;
  establishments: { id: string; name: string }[];
  entitled: boolean;
}) {
  const router = useRouter();
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <Link href="/support" className="btn btn--sm">
          <Icon name="chat" size={13} />
          Send message
        </Link>
        <Link
          href={`/surveys/new?contacts=${encodeURIComponent(contactId)}`}
          className="btn btn--sm"
          aria-disabled={!hasEmail}
          style={hasEmail ? undefined : { opacity: 0.5, pointerEvents: "none" }}
          title={hasEmail ? "Send a survey" : "Needs an email address"}
        >
          <Icon name="survey" size={13} />
          Send survey
        </Link>
        <button
          type="button"
          className="btn btn--pri btn--sm"
          onClick={() => (entitled ? setRequestOpen(true) : router.push("/subscription?feature=bulk_review_request"))}
        >
          <Icon name="send" size={13} />
          Request review
          {!entitled && <Icon name="lock" size={11} />}
        </button>
      </div>

      {requestOpen && (
        <BulkRequestDialog
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          selectedIds={[contactId]}
          selectionCount={1}
          establishments={establishments}
          onDone={() => {
            setRequestOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
