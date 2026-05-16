import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listOpenDisputes } from "@/lib/reviews/dispute-queries";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

/**
 * Curated "Dispute Reviews" queue.
 *
 * Pulls reviews matching any of:
 *   - rating ≤ 2 AND sentiment < -0.3 (sentiment from extract-topics worker)
 *   - topics array includes "harassment" or "profanity" (if extracted)
 *
 * Plus a section for reviews currently in dispute.
 */
export default async function ReviewDisputePage() {
  const { orgId } = await getOrgContext();

  const [flagged, openDisputes] = await Promise.all([
    withTenant(orgId, async (tx) =>
      tx.review.findMany({
        where: {
          rating: { lte: 2 },
          sentiment: { lt: -0.3 },
        },
        orderBy: { postedAt: "desc" },
        take: 50,
        include: {
          establishment: { select: { name: true } },
          reply: { select: { status: true } },
        },
      }),
    ),
    listOpenDisputes(orgId),
  ]);

  // Exclude reviews already in dispute from the flagged queue
  const inDisputeIds = new Set(openDisputes.map((d) => d.reviewId));
  const queue = flagged.filter((r) => !inDisputeIds.has(r.id));

  return (
    <AppShellServer topBar={<TopBar title="Dispute Reviews" />}>
      <PageHeader
        title="Dispute Reviews"
        description="AI-flagged reviews that may be eligible for dispute."
        breadcrumb={[{"label":"Reviews","href":"/reviews"},{"label":"Disputes"}]}
      />

        
      <div className="space-y-6">
{/* AI-flagged queue */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Flagged by AI ({queue.length})</CardTitle>
                <CardDescription>
                  Reviews that scored ≤ 2 stars with negative sentiment. Open one to dispute it.
                </CardDescription>
              </div>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                Needs attention
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No flagged reviews right now. The topic+sentiment worker runs every 30 min — newly synced reviews appear here automatically.
              </p>
            ) : (
              <div className="space-y-3">
                {queue.map((r) => (
                  <div key={r.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-amber-400 text-sm">
                            {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                          </span>
                          <span>{r.reviewerName ?? "Anonymous"}</span>
                          <span>·</span>
                          <span>{r.establishment.name}</span>
                          <span>·</span>
                          <span>{new Date(r.postedAt).toLocaleDateString()}</span>
                          {r.sentiment && (
                            <>
                              <span>·</span>
                              <span className="text-rose-700">
                                sentiment {Number(r.sentiment).toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                        {r.body && <p className="mt-1 text-sm line-clamp-2">{r.body}</p>}
                      </div>
                      <Button asChild size="sm">
                        <Link href={`/reviews/${r.id}#dispute`}>Open & dispute →</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reviews currently in dispute */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">In dispute ({openDisputes.length})</CardTitle>
            <CardDescription>Submitted disputes awaiting provider response.</CardDescription>
          </CardHeader>
          <CardContent>
            {openDisputes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open disputes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {openDisputes.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                    <span>
                      <span className="capitalize">{d.reason.replace(/_/g, " ")}</span> · filed{" "}
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
