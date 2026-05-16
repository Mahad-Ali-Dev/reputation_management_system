import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/dev/seed-review
 *
 * DEV-ONLY: inserts a mock review for testing the AI reply flow before Google Business
 * Profile API access is granted. Disabled in production.
 *
 * Body: { establishmentId, rating, reviewerName?, body? }
 */
const Body = z.object({
  establishmentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled_in_production" }, { status: 403 });
  }

  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { establishmentId, rating, reviewerName, body } = parsed.data;

  const review = await withTenant(orgId, async (tx) => {
    // Verify establishment belongs to this org (RLS enforces it; this is a courtesy check)
    const e = await tx.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { id: true },
    });
    if (!e) throw new Error("establishment_not_found");

    const externalId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return tx.review.create({
      data: {
        organizationId: orgId,
        establishmentId,
        source: "mock",
        externalId,
        reviewerName: reviewerName ?? "Test User",
        rating,
        body: body ?? defaultBodyFor(rating),
        postedAt: new Date(),
      },
    });
  });

  logger.info(
    { orgId, reviewId: review.id, rating, event: "dev.seed_review" },
    "mock review seeded",
  );

  return NextResponse.json({ ok: true, id: review.id });
}

function defaultBodyFor(rating: number): string {
  if (rating >= 5) return "Absolutely loved it. The staff were friendly and the service was top-notch. Will definitely return!";
  if (rating === 4) return "Really good overall. Service was prompt and the quality was great. Minor wait at checkout but nothing major.";
  if (rating === 3) return "Decent experience. Some things were good, others not so much. Could improve consistency.";
  if (rating === 2) return "Disappointing. Service was slow and the staff seemed disinterested. Won't be coming back unless things change.";
  return "Terrible experience. Waited 45 minutes and the order was wrong. Asked to speak to a manager and was ignored.";
}
