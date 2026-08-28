import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/org-context";
import { generateReplyForReview, publishReply } from "@/lib/reviews/actions";
import { fileReviewDispute, withdrawReviewDispute } from "@/lib/reviews/dispute-actions";
import { getReviewDispute } from "@/lib/reviews/dispute-queries";
import { getReview } from "@/lib/reviews/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Validate UUID format before hitting Prisma — non-UUID slugs (e.g. /reviews/r1)
  // would otherwise throw "Inconsistent column data: Error creating UUID".
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) notFound();

  const { orgId } = await getOrgContext();
  const [review, dispute] = await Promise.all([getReview(orgId, id), getReviewDispute(orgId, id)]);
  if (!review) notFound();

  return (
    <AppShellServer topBar={<TopBar title="Review" />}>
      <PageHeader
        title="Review"
        breadcrumb={[{ label: "Reviews", href: "/reviews" }, { label: "Detail" }]}
      />

      <div className="space-y-6">
        <div>
          <div className="text-sm text-muted-foreground">
            {review.establishment.name} · {review.source} ·{" "}
            {new Date(review.postedAt).toLocaleString()}
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {"★".repeat(review.rating)}
            {"☆".repeat(5 - review.rating)}
            {review.reviewerName && (
              <span className="font-normal text-muted-foreground ml-3">
                by {review.reviewerName}
              </span>
            )}
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{review.body ?? "(no body)"}</p>
          </CardContent>
        </Card>

        {/* Reply state */}
        {review.reply ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  AI Draft
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {review.reply.generatedBy ?? "human"}
                  </span>
                </CardTitle>
                <ReplyStatusBadge status={review.reply.status} />
              </div>
              {review.reply.publishedAt && (
                <CardDescription>
                  Published {new Date(review.reply.publishedAt).toLocaleString()}
                </CardDescription>
              )}
              {review.reply.publishError && (
                <CardDescription className="text-destructive">
                  Publish error: {review.reply.publishError}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {review.reply.status === "published" ? (
                <p className="whitespace-pre-wrap">{review.reply.body}</p>
              ) : (
                <PublishForm
                  reviewId={review.id}
                  initialBody={review.reply.body}
                  status={review.reply.status}
                />
              )}
              <RegenerateForm reviewId={review.id} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No reply yet</CardTitle>
              <CardDescription>
                Generate an AI-drafted reply. For ≤3⭐ reviews, replies go to{" "}
                <strong>pending approval</strong> before publishing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegenerateForm reviewId={review.id} initialLabel="Generate AI reply" />
            </CardContent>
          </Card>
        )}

        {/* Dispute card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Review dispute</CardTitle>
              {dispute && <DisputeStatusBadge status={dispute.status} />}
            </div>
            <CardDescription>
              Flag this review if it's fake, offensive, or about the wrong business. We log every
              dispute and your action history is preserved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dispute && dispute.status !== "withdrawn" ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Filed on {new Date(dispute.createdAt).toLocaleString()} reason:{" "}
                  <strong>{dispute.reason.replace(/_/g, " ")}</strong>
                </p>
                {dispute.details && (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    "{dispute.details}"
                  </p>
                )}
                {dispute.status === "submitted_to_google" && (
                  <p className="text-xs text-muted-foreground">
                    Submitted to Google{" "}
                    {dispute.submittedToProviderAt
                      ? new Date(dispute.submittedToProviderAt).toLocaleString()
                      : "—"}{" "}
                    · awaiting response.
                  </p>
                )}
                {(dispute.status === "submitted" || dispute.status === "submitted_to_google") && (
                  <form action={withdrawReviewDispute}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Withdraw dispute
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <form action={fileReviewDispute} className="space-y-3">
                <input type="hidden" name="reviewId" value={review.id} />
                <label className="block text-sm">
                  <span className="font-medium">Reason</span>
                  <select
                    name="reason"
                    required
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    <option value="fake">Fake / never a customer</option>
                    <option value="offensive">Offensive / harassment</option>
                    <option value="conflict_of_interest">
                      Conflict of interest (competitor / employee)
                    </option>
                    <option value="wrong_business">Wrong business meant for someone else</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Details (optional)</span>
                  <textarea
                    name="details"
                    rows={3}
                    maxLength={2000}
                    placeholder="Anything that helps us understand the situation e.g. they never came in, they have a grudge from a public dispute, etc."
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
                <Button type="submit" variant="outline">
                  File dispute
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}

function DisputeStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: "bg-amber-50 text-amber-700",
    submitted_to_google: "bg-blue-50 text-blue-700",
    accepted: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
    withdrawn: "bg-slate-100 text-slate-700",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ReplyStatusBadge({ status }: { status: string }) {
  const map = {
    draft: "bg-blue-50 text-blue-700",
    pending_review: "bg-amber-50 text-amber-700",
    published: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  } as const;
  const cls = (map as Record<string, string>)[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function RegenerateForm({
  reviewId,
  initialLabel = "Regenerate",
}: {
  reviewId: string;
  initialLabel?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await generateReplyForReview(reviewId);
      }}
    >
      <Button type="submit" variant="outline" size="sm">
        {initialLabel}
      </Button>
    </form>
  );
}

function PublishForm({
  reviewId,
  initialBody,
  status,
}: {
  reviewId: string;
  initialBody: string;
  status: string;
}) {
  return (
    <form
      action={async (form: FormData) => {
        "use server";
        const body = form.get("body");
        await publishReply(reviewId, typeof body === "string" ? body : undefined);
      }}
      className="space-y-3"
    >
      <textarea
        name="body"
        defaultValue={initialBody}
        rows={6}
        className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        <Button type="submit">
          {status === "pending_review" ? "Approve & publish" : "Publish"}
        </Button>
        {status === "pending_review" && (
          <span className="text-xs text-muted-foreground">
            Safety classifier flagged this review before posting publicly.
          </span>
        )}
      </div>
    </form>
  );
}
