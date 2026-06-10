"use client";

import { Icon } from "@/components/shell/icon";
import type { IncentiveCoupon, IncentiveStats } from "@/lib/surveys/coupon-queries";
import { CouponRedeemForm } from "../coupons/form";

/**
 * Incentives tab (Module 11) — the coupons workspace folded into the Surveys
 * lifecycle. Promoters (NPS ≥ 9) get a one-time code; staff redeem it here.
 *
 * Reuses the existing `<CouponRedeemForm>` server action and reads its data
 * (stats + recent codes) from the workspace's server fetch. Pure presentation,
 * design-system styled to match the other Surveys tabs.
 */
export function IncentivesPanel({
  stats,
  coupons,
}: {
  stats: IncentiveStats;
  coupons: IncentiveCoupon[];
}) {
  const redemptionRate =
    stats.issued > 0 ? `${((stats.redeemed / stats.issued) * 100).toFixed(0)}%` : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="grid-3" style={{ gap: 12 }}>
        <Stat label="Issued" value={stats.issued.toLocaleString()} sub="One-time codes · all time" />
        <Stat
          label="Redeemed"
          value={stats.redeemed.toLocaleString()}
          sub={stats.issued > 0 ? `${redemptionRate} redemption rate` : "Awaiting redemptions"}
          accent
        />
        <Stat
          label="Expired unredeemed"
          value={stats.expired.toLocaleString()}
          sub="Lapsed before use"
        />
      </div>

      <div className="ds-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em" }}>Redeem a coupon</div>
        <p className="dim" style={{ fontSize: 12.5, marginTop: 4, marginBottom: 14, lineHeight: 1.55, maxWidth: 560 }}>
          Customer hands you a code at the counter — enter it here and the system marks it used. Codes
          are single-use.
        </p>
        <CouponRedeemForm />
      </div>

      <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Recent coupons</div>
          {coupons.length > 0 && (
            <span className="dim" style={{ marginLeft: "auto", fontSize: 12 }}>
              {coupons.length.toLocaleString()} shown
            </span>
          )}
        </div>

        {coupons.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div
              aria-hidden
              style={{
                width: 46,
                height: 46,
                borderRadius: 13,
                margin: "0 auto 12px",
                background: "var(--surface-3)",
                color: "var(--rl-muted)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="star" size={20} />
            </div>
            <p className="dim" style={{ fontSize: 13, margin: 0, lineHeight: 1.6, maxWidth: 420, marginInline: "auto" }}>
              No coupons issued yet. Enable an incentive on a survey campaign to start rewarding
              promoters automatically.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--rl-muted)" }}>
                  <Th>Code</Th>
                  <Th>Value</Th>
                  <Th>Issued</Th>
                  <Th>Expires</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const status = c.redeemedAt
                    ? "redeemed"
                    : new Date(c.expiresAt).getTime() < Date.now()
                      ? "expired"
                      : "active";
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <Td>
                        <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 12 }}>{c.code}</span>
                      </Td>
                      <Td>${(c.valueCents / 100).toFixed(2)}</Td>
                      <Td>
                        <span className="dim" style={{ whiteSpace: "nowrap" }}>
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </Td>
                      <Td>
                        <span className="dim" style={{ whiteSpace: "nowrap" }}>
                          {new Date(c.expiresAt).toLocaleDateString()}
                        </span>
                      </Td>
                      <Td>
                        <CouponStatusBadge status={status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CouponStatusBadge({ status }: { status: "redeemed" | "expired" | "active" }) {
  if (status === "active") {
    return <span className="chip chip--ok">active</span>;
  }
  if (status === "expired") {
    return (
      <span
        className="chip"
        style={{ background: "var(--bad-soft, rgba(220,38,38,0.1))", color: "var(--bad)" }}
      >
        expired
      </span>
    );
  }
  return <span className="chip chip--out">redeemed</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 14px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>{children}</td>;
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{label}</div>
        <div className="stat__value" style={{ fontSize: 28, color: accent ? "var(--pri)" : undefined }}>
          {value}
        </div>
        <div className="stat__delta">{sub}</div>
      </div>
    </div>
  );
}
