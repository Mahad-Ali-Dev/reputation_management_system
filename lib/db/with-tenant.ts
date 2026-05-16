import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run a transaction in tenant context.
 *
 * Two things happen at the start of every tenant transaction:
 *   1. SET LOCAL ROLE app_tenant_user  — switches to a NOBYPASSRLS role so RLS policies actually apply.
 *      Neon's `neondb_owner` has BYPASSRLS; without this switch, every policy would be silently ignored.
 *   2. SET LOCAL app.current_org_id = '<orgId>'  — populates the RLS predicate value.
 *
 * Both are transaction-local — automatically reset at commit/rollback.
 *
 * Pattern:
 *   const result = await withTenant(session.orgId, async (tx) => {
 *     return tx.review.findMany({ where: { establishmentId } });
 *   });
 *
 * See DATA_MODEL.md §2 + §6.1 for the canonical RLS pattern.
 */
export async function withTenant<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { timeout?: number; maxWait?: number },
): Promise<T> {
  if (!UUID_REGEX.test(organizationId)) {
    throw new Error("withTenant: invalid organization_id");
  }

  return prisma.$transaction(
    async (tx) => {
      // Switch to NOBYPASSRLS role for the duration of this transaction.
      await tx.$executeRawUnsafe("SET LOCAL ROLE app_tenant_user");
      // Set the tenant context the RLS policies read from.
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_org_id = '${organizationId}'`,
      );
      return fn(tx);
    },
    {
      timeout: opts?.timeout ?? 15_000,
      maxWait: opts?.maxWait ?? 5_000,
    },
  );
}

/**
 * Run a transaction with NO tenant context, but still as the NOBYPASSRLS role.
 * Every tenant-scoped query inside will return 0 rows because RLS requires the GUC to match.
 *
 * Use for: testing the "deny by default" property, or for cron-style work that should explicitly
 * not see any tenant's data.
 */
export async function withoutTenant<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE app_tenant_user");
      await tx.$executeRawUnsafe("RESET app.current_org_id");
      return fn(tx);
    },
    {
      timeout: opts?.timeout ?? 15_000,
      maxWait: opts?.maxWait ?? 5_000,
    },
  );
}
