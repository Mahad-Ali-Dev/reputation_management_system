/**
 * One-shot: for any mock review with an ai_messages row but no review_replies row,
 * attach the ai_messages content as the review_reply. Used to repair test data created
 * by the older test-mock-review script.
 */
import * as dotenv from "dotenv";
dotenv.config({ override: true });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.review.findMany({
    where: { source: "mock", reply: null },
    include: { establishment: true },
  });
  console.log(`Found ${orphans.length} mock review(s) without a reply.`);

  for (const r of orphans) {
    // Find the latest ai_messages row for this org with a review-reply purpose
    const aiMsg = await prisma.aiMessage.findFirst({
      where: {
        organizationId: r.organizationId,
        purpose: { in: ["review_reply_sensitive", "review_reply_thank"] },
        role: "assistant",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!aiMsg) {
      console.log(`  ${r.id}: no ai_messages row found, skipping`);
      continue;
    }

    const status = r.rating <= 3 ? "pending_review" : "draft";
    await prisma.reviewReply.create({
      data: {
        reviewId: r.id,
        organizationId: r.organizationId,
        body: aiMsg.content,
        status,
        generatedBy: aiMsg.model ?? "unknown",
      },
    });
    console.log(`  ${r.id}: reply attached (status=${status})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
