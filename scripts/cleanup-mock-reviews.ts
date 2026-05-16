/**
 * Delete all mock-source reviews (and their replies/AI messages cascade via FK).
 * Use after running test:mock-review to reset state.
 */
import * as dotenv from "dotenv";
dotenv.config({ override: true });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.review.deleteMany({ where: { source: "mock" } });
  console.log(`Deleted ${result.count} mock review(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
