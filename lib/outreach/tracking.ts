/**
 * Review-request click tracking — the server-side half of the tracked
 * `/r/{slug}` link every review request now sends (see lib/outreach/dispatch.ts).
 *
 * ── WHAT "clicked"/"converted" ACTUALLY MEANS ──
 * Google gives no API or webhook that tells a third party when someone posts
 * a review. The only signal any review-request tool (this one included) can
 * ever observe is "the customer opened the link we sent them" — so that's
 * what `clickedAt`/`convertedAt` record, and it's why the requester
 * notification below says "opened the review link", never "posted a review".
 * Treating a click as the conversion event is the same convention every
 * review-request product uses, for the same reason.
 *
 * Destination precedence: `Establishment.reviewLinkOverride` (an owner-pasted
 * link) wins over the auto-derived Google-Place-Id link — see
 * `app/establishments/[id]/settings/page.tsx`.
 */

import { prisma } from "@/lib/db/client";
import { googleReviewUrl, isAllowedReviewHost } from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/actions";
import { notificationEnabled } from "@/lib/notifications/prefs";

export type ReviewRequestClickResolution =
  | { found: false }
  | { found: true; destination: string; allowedHost: boolean };

/**
 * Resolve a review-request tracking slug to its destination, and — on the
 * FIRST click only — mark `clickedAt`/`convertedAt` and notify the requester.
 * Repeat clicks still resolve and redirect correctly; they just don't
 * re-fire the timestamps or the notification.
 *
 * Deliberately mirrors app/r/[slug]/route.ts's existing Device lookup: a
 * plain `prisma` call (no `withTenant`) — this is a public, unauthenticated
 * endpoint reached by a random 10-char slug, the same trust model as the
 * survey response token lookup in app/s/[token]/page.tsx.
 */
export async function resolveReviewRequestClick(
  shortSlug: string,
): Promise<ReviewRequestClickResolution> {
  const rr = await prisma.reviewRequest.findUnique({
    where: { shortSlug },
    select: {
      id: true,
      organizationId: true,
      recipient: true,
      recipientName: true,
      clickedAt: true,
      establishment: {
        select: { name: true, googlePlaceId: true, reviewLinkOverride: true, deletedAt: true },
      },
    },
  });
  if (!rr || !rr.establishment || rr.establishment.deletedAt) return { found: false };

  const override = rr.establishment.reviewLinkOverride?.trim();
  const destination =
    override && override.length > 0
      ? override
      : googleReviewUrl(rr.establishment.googlePlaceId, rr.establishment.name);

  if (!rr.clickedAt) {
    const now = new Date();
    // Status-guarded update (same race-safety idiom as dispatch.ts's finalize):
    // `clickedAt: null` in the WHERE means a second concurrent click loses
    // the claim and simply skips the notification below.
    const claimed = await prisma.reviewRequest.updateMany({
      where: { id: rr.id, clickedAt: null },
      data: { clickedAt: now, convertedAt: now },
    });
    if (claimed.count > 0) {
      notifyRequesterOfClick({
        orgId: rr.organizationId,
        reviewRequestId: rr.id,
        recipientLabel: rr.recipientName?.trim() || rr.recipient,
        businessName: rr.establishment.name,
      }).catch((err) => {
        logger.warn(
          { event: "outreach.review_request.click_notify_failed", error: String(err) },
          "review-request click notification failed (ignored)",
        );
      });
    }
  }

  return { found: true, destination, allowedHost: isAllowedReviewHost(destination) };
}

/**
 * In-app bell notification for "a customer opened the review link" — the
 * best-effort "response" a requester gets, given Google exposes no way to
 * confirm the review was actually posted. Mirrors the
 * notifyInternalAlert pattern in lib/surveys/actions.ts (org-wide in-app
 * notification, gated by the org's saved preference, never blocking the
 * redirect it's called from).
 */
async function notifyRequesterOfClick(args: {
  orgId: string;
  reviewRequestId: string;
  recipientLabel: string;
  businessName: string;
}): Promise<void> {
  if (!(await notificationEnabled(args.orgId, "review_request_clicked", "inApp"))) return;
  await createNotification(args.orgId, {
    type: "outreach.review_request_clicked",
    title: "Review link opened",
    body: `${args.recipientLabel} opened the review link you sent for ${args.businessName}.`,
    resourceType: "review_request",
    resourceId: args.reviewRequestId,
    href: "/outreach?tab=history",
  });
}
