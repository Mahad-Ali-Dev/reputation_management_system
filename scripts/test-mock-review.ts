/**
 * End-to-end mock review test — runs the FULL pipeline:
 *   1. Picks the first establishment in your DB
 *   2. Inserts a 1-star mock review
 *   3. Calls generateReply (Sonnet)
 *   4. Calls classifyReplySafety (Haiku)
 *   5. Prints the AI's reply + verdict + cost
 *
 * Usage: npm run test:mock-review [rating]
 * Default rating is 1.
 */
import * as dotenv from "dotenv";
// Force-override existing session env vars so .env wins (PowerShell sessions can have stale empty values).
dotenv.config({ override: true });
import { PrismaClient } from "@prisma/client";
import { generateReply } from "../lib/ai/generate-reply";
import { classifyReplySafety } from "../lib/ai/safety-classify";

const prisma = new PrismaClient();

const RATING = Number.parseInt(process.argv[2] ?? "1", 10);

async function main() {
  console.log(`\n→ Mock review test (rating=${RATING})\n`);

  // Find the first establishment (with its org)
  // We connect as owner (no withTenant), since this is a test script.
  const estab = await prisma.establishment.findFirst({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      organizationId: true,
      brandVoice: true,
    },
  });
  if (!estab) {
    console.error("✗ No establishments found. Sign in to the app and create one first.");
    process.exit(1);
  }
  console.log(`  Establishment: ${estab.name} (${estab.id})`);
  console.log(`  Org: ${estab.organizationId}`);

  // Seed a mock review (raw SQL — bypass RLS context since we're owner here)
  const externalId = `cli-mock-${Date.now()}`;
  const body =
    RATING <= 2
      ? "Terrible experience. Waited 45 minutes, the staff were rude, and my order was wrong. Will never come back."
      : RATING === 3
        ? "Mixed experience. Some things were good, others not so much. Service could be more consistent."
        : RATING === 4
          ? "Really good overall. The team was friendly and the quality was solid. Minor wait but acceptable."
          : "Loved it! Great service, friendly staff, and excellent quality. Will definitely come back!";

  const review = await prisma.review.create({
    data: {
      organizationId: estab.organizationId,
      establishmentId: estab.id,
      source: "mock",
      externalId,
      reviewerName: "Test User",
      rating: RATING,
      body,
      postedAt: new Date(),
    },
  });
  console.log(`\n  Seeded review: ${review.id}`);
  console.log(`    "${body.slice(0, 80)}…"`);

  // Generate AI reply
  console.log(`\n→ Calling generateReply…`);
  const gen = await generateReply({
    orgId: estab.organizationId,
    review: {
      id: review.id,
      rating: review.rating,
      body: review.body,
      reviewerName: review.reviewerName,
    },
    establishment: {
      id: estab.id,
      name: estab.name,
      brandVoice: (estab.brandVoice as Parameters<typeof generateReply>[0]["establishment"]["brandVoice"]) ?? null,
    },
  });
  console.log(`\n  Model:       ${gen.model}`);
  console.log(`  Purpose:     ${gen.purpose}`);
  console.log(`  Tokens:      in=${gen.tokensIn}  out=${gen.tokensOut}`);
  console.log(`  Cost:        $${(gen.costMicros / 1_000_000).toFixed(4)}`);
  console.log(`\n  AI reply:\n  ─────────`);
  console.log(`  ${gen.body.split("\n").join("\n  ")}`);

  // Safety classify
  console.log(`\n→ Calling classifyReplySafety…`);
  const { verdict, blocked } = await classifyReplySafety({
    orgId: estab.organizationId,
    aiMessageId: gen.aiMessageId,
    candidate: gen.body,
    sourceReview: {
      rating: review.rating,
      body: review.body,
      reviewerName: review.reviewerName,
    },
  });
  console.log(`\n  Blocked:     ${blocked}`);
  const flags = (Object.entries(verdict) as [string, boolean | string][])
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  console.log(`  Flags:       ${flags.length ? flags.join(", ") : "(none — clean)"}`);
  console.log(`  Reasoning:   ${verdict.reasoning}`);

  // Write the review_replies row (what the UI action does after gen + classify)
  const status = blocked || RATING <= 3 ? "pending_review" : "draft";
  await prisma.reviewReply.create({
    data: {
      reviewId: review.id,
      organizationId: estab.organizationId,
      body: gen.body,
      status,
      generatedBy: gen.model,
    },
  });
  console.log(`\n  review_replies row created with status=${status}`);

  console.log(`\n✓ Done. The review is visible at /reviews/${review.id}.`);
  console.log(`  Cleanup with: npm run test:mock-review:clean\n`);
}

main()
  .catch((e) => {
    console.error("\n✗ Test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
