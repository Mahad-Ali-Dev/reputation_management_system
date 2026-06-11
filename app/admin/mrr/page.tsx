import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { KpiCard, TableCard, THead, Th, Td } from "@/components/admin/admin-ui";
import { prisma } from "@/lib/db/client";
import { STRIPE_PRO_PRICE_ID } from "@/lib/stripe/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Admin MRR dashboard.
 *
 * Aggregated from our local `subscriptions` table — Stripe is the source of
 * truth but we mirror enough to compute these without an API call (which
 * would rate-limit at scale). Webhook sync keeps numbers accurate within
 * minutes.
 */

// `Subscription.plan` stores the Stripe *price id* the customer is billed on
// (see lib/billing/sync.ts) — NOT a friendly slug. Repulabs is single-tier
// (Pro), so any real Stripe price maps to the Pro MRR. Keeping this keyed by the
// configured price id (with a price_* fallback for legacy/rotated ids) is what
// makes the numbers non-zero — the old `pro_monthly`/`pro_annual` keys never
// matched anything written, so every figure rendered $0.
const PRO_MRR_USD = 89; // current Pro list price ($/mo) — keep in sync with app/subscription/page.tsx

function planMrrCents(plan: string): number {
  if (!plan || plan === "unknown" || plan === "free") return 0;
  if (STRIPE_PRO_PRICE_ID && plan === STRIPE_PRO_PRICE_ID) return Math.round(PRO_MRR_USD * 100);
  // Defensive fallback: any Stripe price id (e.g. after a price rotation) is Pro.
  if (plan.startsWith("price_")) return Math.round(PRO_MRR_USD * 100);
  return 0;
}

/** Friendly label for the distribution table (raw value is a Stripe price id). */
function planLabel(plan: string): string {
  if (planMrrCents(plan) > 0) return "Pro";
  if (!plan || plan === "unknown") return "Unknown";
  return plan.replace(/_/g, " ");
}

export default async function MrrPage() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activeSubs, newSubs30d, canceled30d, trialCount, proCount] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: { in: ["active", "trialing"] } },
      select: { id: true, plan: true, status: true, createdAt: true, organizationId: true },
    }),
    prisma.subscription.findMany({
      where: {
        status: { in: ["active", "trialing"] },
        createdAt: { gte: since30 },
      },
      select: { plan: true },
    }),
    prisma.subscription.findMany({
      where: {
        status: "canceled",
        updatedAt: { gte: since30 },
      },
      select: { plan: true },
    }),
    prisma.organization.count({ where: { plan: "trial", deletedAt: null } }),
    prisma.organization.count({ where: { plan: "pro", deletedAt: null } }),
  ]);

  const mrrCents = activeSubs.reduce((s, sub) => s + planMrrCents(sub.plan), 0);
  const newMrrCents = newSubs30d.reduce((s, sub) => s + planMrrCents(sub.plan), 0);
  const churnedMrrCents = canceled30d.reduce((s, sub) => s + planMrrCents(sub.plan), 0);
  const netNewMrrCents = newMrrCents - churnedMrrCents;
  const arrCents = mrrCents * 12;

  const churnPct =
    activeSubs.length > 0 ? (canceled30d.length / activeSubs.length) * 100 : 0;

  const planCounts: Record<string, number> = {};
  for (const sub of activeSubs) {
    planCounts[sub.plan] = (planCounts[sub.plan] ?? 0) + 1;
  }

  return (
    <>
      <AdminPageHeader
        title="Revenue"
        description="Computed from our local subscription mirror. Stripe is authoritative — reconcile via Stripe Sigma when numbers feel off."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard
          l="MRR"
          v={fmt(mrrCents)}
          d={`${activeSubs.length} active subs`}
          up={mrrCents > 0}
        />
        <KpiCard l="ARR" v={fmt(arrCents)} d="MRR × 12" />
        <KpiCard
          l="Net new MRR · 30d"
          v={(netNewMrrCents >= 0 ? "+" : "") + fmt(netNewMrrCents)}
          d={`${fmt(newMrrCents)} new · ${fmt(churnedMrrCents)} churn`}
          up={netNewMrrCents >= 0}
        />
        <KpiCard
          l="Churn rate · 30d"
          v={`${churnPct.toFixed(1)}%`}
          d={`${canceled30d.length} canceled`}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Plan distribution</h3>
          </div>
          <TableCard
            empty={Object.keys(planCounts).length === 0}
            emptyText="No active subscriptions yet."
          >
            <THead>
              <Th>Plan</Th>
              <Th align="right">Subscribers</Th>
              <Th align="right">Per-sub MRR</Th>
              <Th align="right">Plan MRR</Th>
            </THead>
            <tbody>
              {Object.entries(planCounts).map(([plan, count]) => {
                const perSub = planMrrCents(plan);
                return (
                  <tr key={plan} style={{ borderTop: "1px solid var(--line)" }}>
                    <Td>
                      <span style={{ textTransform: "capitalize" }}>{planLabel(plan)}</span>
                    </Td>
                    <Td align="right">{count}</Td>
                    <Td align="right">{fmt(perSub)}</Td>
                    <Td align="right">
                      <strong>{fmt(perSub * count)}</strong>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        </div>

        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">Funnel snapshot</h3>
          <ul style={{ marginTop: 14, padding: 0, listStyle: "none" }}>
            <FunnelRow label="Orgs in trial" value={trialCount} />
            <FunnelRow label="Orgs on Pro" value={proCount} />
            <FunnelRow
              label="Trial → Pro rate (lifetime)"
              value={
                trialCount + proCount > 0
                  ? `${((proCount / (trialCount + proCount)) * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </ul>
        </div>
      </div>

      <div className="ds-card" style={{ padding: 18 }}>
        <h3 className="ds-card__title">Stripe reconciliation</h3>
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
          Numbers above come from the local{" "}
          <code className="mono" style={chipCode}>
            subscriptions
          </code>{" "}
          table. If a customer paid through Stripe but doesn't appear here, the webhook delivery
          is in the{" "}
          <Link
            href="/admin/audit?action=stripe"
            style={{ color: "#4f46e5", textDecoration: "underline" }}
          >
            audit log
          </Link>
          .
        </p>
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--rl-muted)" }}>
          For a forensic view, run a Stripe Sigma query against the{" "}
          <code className="mono" style={chipCode}>
            subscriptions
          </code>{" "}
          table and compare counts.
        </p>
      </div>
    </>
  );
}

const chipCode: React.CSSProperties = {
  background: "var(--surface-2, #fafbf8)",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 11.5,
};

function FunnelRow({ label, value }: { label: string; value: number | string }) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px dashed var(--line)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--ink-2)" }}>{label}</span>
      <strong style={{ color: "var(--ink)" }}>{value}</strong>
    </li>
  );
}

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const usd = Math.abs(cents) / 100;
  return `${sign}$${usd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
