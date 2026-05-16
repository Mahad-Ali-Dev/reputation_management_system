/**
 * Local dev seed.
 * Run: pnpm db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding…");
  console.log(
    "Note: signup creates an org automatically — most dev work needs only `pnpm dev` then sign up.",
  );
  // Reserved for future seeds (hardware product catalog, prompt versions, etc).
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
