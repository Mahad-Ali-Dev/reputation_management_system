import { prisma } from "@/lib/db/client";

/**
 * Per-tenant daily AI cost cap.
 *
 * v1: Postgres-based — aggregates today's ai_messages.cost_micros for the org.
 * Day 9 hardening: move to Redis atomic INCRBY (AI_STRATEGY §8.2) for low-latency check.
 *
 * Default cap: $4/day (4_000_000 micros). Configurable via env AI_TENANT_DAILY_CAP_MICROS.
 */

const DEFAULT_CAP_MICROS = Number(process.env.AI_TENANT_DAILY_CAP_MICROS ?? 4_000_000);

export type BudgetCheck =
  | { ok: true; spentMicros: number; capMicros: number; remainingMicros: number }
  | { ok: false; spentMicros: number; capMicros: number; reason: "cap_exceeded" };

/**
 * Check the org's spend today against its cap. Returns ok=true and the headroom, or ok=false
 * if the cap is already exceeded.
 *
 * Does NOT reserve budget. Callers should compute their estimate, call this, then make the
 * Anthropic call. Real cost is written by the AI message logger which causes future calls
 * to see the higher spend.
 */
export async function checkBudget(orgId: string): Promise<BudgetCheck> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const result = await prisma.aiMessage.aggregate({
    where: {
      organizationId: orgId,
      createdAt: { gte: startOfDay },
    },
    _sum: { costMicros: true },
  });

  const spent = result._sum.costMicros ?? 0;
  const cap = DEFAULT_CAP_MICROS;

  if (spent >= cap) {
    return { ok: false, spentMicros: spent, capMicros: cap, reason: "cap_exceeded" };
  }

  return {
    ok: true,
    spentMicros: spent,
    capMicros: cap,
    remainingMicros: cap - spent,
  };
}
