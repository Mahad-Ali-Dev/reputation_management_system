import { prisma } from "@/lib/db/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health — used by uptime monitors and the homepage status badge.
 *
 * Checks (in parallel):
 *   - db        : single SELECT 1 round-trip via Prisma
 *   - anthropic : assertion that an API key is configured (HEAD ping would burn budget)
 *   - stripe    : assertion that secret key is configured
 *   - voyage    : assertion that key is configured (chatbot RAG dependency)
 *   - resend    : assertion that key is configured (outreach + magic-link dependency)
 *
 * Returns 200 only when DB is reachable. Other checks degrade to "degraded" status
 * but still 200 — we don't want a missing Resend key to page the on-call (deliberately
 * unset in some envs). DB is the only true SLO-critical check.
 *
 * The response includes a `time` field so external monitors can detect stale-cache.
 */

type CheckStatus = "ok" | "fail" | "skipped";

async function checkDb(): Promise<CheckStatus> {
  try {
    // 1500ms timeout so a stuck DB doesn't make the health endpoint itself flaky.
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]);
    return "ok";
  } catch {
    return "fail";
  }
}

function checkEnvKey(name: string): CheckStatus {
  const v = process.env[name];
  if (!v || v.length === 0) return "skipped";
  return "ok";
}

export async function GET() {
  const start = Date.now();
  const [dbStatus] = await Promise.all([checkDb()]);

  const checks: Record<string, CheckStatus> = {
    db: dbStatus,
    anthropic: checkEnvKey("ANTHROPIC_API_KEY"),
    stripe: checkEnvKey("STRIPE_SECRET_KEY"),
    voyage: checkEnvKey("VOYAGE_API_KEY"),
    resend: checkEnvKey("RESEND_API_KEY"),
  };

  // DB is the only blocking dependency. Everything else is "configured or not".
  const allCritical = checks.db === "ok";
  const allOptional = Object.entries(checks)
    .filter(([k]) => k !== "db")
    .every(([, s]) => s !== "fail");

  const status = !allCritical ? "down" : !allOptional ? "degraded" : "ok";
  const httpStatus = allCritical ? 200 : 503;

  return NextResponse.json(
    {
      status,
      checks,
      version: process.env.npm_package_version ?? "0.1.0",
      time: new Date().toISOString(),
      latencyMs: Date.now() - start,
    },
    {
      status: httpStatus,
      headers: { "cache-control": "no-store, must-revalidate" },
    },
  );
}
