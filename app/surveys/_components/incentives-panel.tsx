"use client";

import { Icon } from "@/components/shell/icon";
import type { IncentiveCoupon, IncentiveStats } from "@/lib/surveys/coupon-queries";
import { CouponRedeemForm } from "../coupons/form";

/**
 * Incentives tab (Module 11) — the coupons workspace folded into the Surveys
 * lifecycle, re-skinned to the "Customer Surveys" kit. Promoters (NPS ≥ 9) get a
 * one-time code; staff redeem it here.
 *
 * Reuses the existing `<CouponRedeemForm>` server action and reads its data
 * (stats + recent codes) from the workspace's server fetch. All metrics derive
 * from authoritative counts; the table shows a recent subset only.
 */

const KIT = "/assets/repulabs/customer-surveys/incentives";

export function IncentivesPanel({
  stats,
  coupons,
}: {
  stats: IncentiveStats;
  coupons: IncentiveCoupon[];
}) {
  const redemptionRate =
    stats.issued > 0 ? `${Math.round((stats.redeemed / stats.issued) * 100)}% redemption rate` : "Awaiting redemptions";
  const expiredRate =
    stats.issued > 0 ? `${Math.round((stats.expired / stats.issued) * 100)}% of issued` : "Lapsed before use";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="surv-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Kpi
          tone="violet"
          icon={`${KIT}/issued.svg`}
          label="Issued"
          value={stats.issued.toLocaleString()}
          pillClass="surv-kpi__pill--violet"
          pill="One-time codes · all time"
        />
        <Kpi
          tone="green"
          icon={`${KIT}/redeemed.svg`}
          label="Redeemed"
          value={stats.redeemed.toLocaleString()}
          pillClass="surv-kpi__pill--green"
          pill={redemptionRate}
        />
        <Kpi
          tone="orange"
          icon={`${KIT}/expired.svg`}
          label="Expired unredeemed"
          value={stats.expired.toLocaleString()}
          pillClass="surv-kpi__pill--orange"
          pill={expiredRate}
        />
      </div>

      <div className="ds-card surv-redeem">
        <div className="surv-redeem__art" aria-hidden>
          <img src={`${KIT}/coupon.svg`} alt="" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 className="surv-card-h">Redeem a coupon</h2>
          <p className="surv-card-sub" style={{ maxWidth: 620 }}>
            A customer hands you a code at the counter enter it here and the system marks it used.
            Codes are single-use.
          </p>
          <CouponRedeemForm />
        </div>
      </div>

      <div className="ds-card surv-card--tinted" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <div className="surv-card-deco" aria-hidden>
          <img src={`${KIT}/coupon.svg`} alt="" />
        </div>
        <div className="row" style={{ padding: "16px 20px" }}>
          <h2 className="surv-card-h">Recent coupons</h2>
          {coupons.length > 0 && (
            <span className="dim" style={{ marginLeft: "auto", fontSize: 12 }}>
              {coupons.length.toLocaleString()} shown
            </span>
          )}
        </div>

        {coupons.length === 0 ? (
          <div className="surv-empty" style={{ paddingTop: 8 }}>
            <img src={`${KIT}/coupon.svg`} alt="" style={{ width: "min(180px, 60%)" }} />
            <h3 style={{ fontSize: 18 }}>No coupons issued yet</h3>
            <p>Enable an incentive on a survey campaign to start rewarding promoters automatically.</p>
          </div>
        ) : (
          <div className="surv-table-wrap">
            <table className="surv-table">
              <caption className="sr-only">Recent incentive coupons</caption>
              <thead>
                <tr>
                  <th scope="col">Coupon code</th>
                  <th scope="col">Reward</th>
                  <th scope="col">Issued</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const status: "redeemed" | "expired" | "active" = c.redeemedAt
                    ? "redeemed"
                    : new Date(c.expiresAt).getTime() < Date.now()
                      ? "expired"
                      : "active";
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="surv-code-chip">{c.code}</span>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Icon name="tag" size={13} style={{ color: "var(--surv-pri)" }} />
                          <span style={{ color: "var(--surv-ink)", fontWeight: 500 }}>
                            ${(c.valueCents / 100).toFixed(2)} off
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="dim" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(c.createdAt)}
                        </span>
                      </td>
                      <td>
                        <span className="dim" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(c.expiresAt)}
                        </span>
                      </td>
                      <td>
                        <span className={`surv-status surv-status--${status}`}>{status}</span>
                      </td>
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

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function Kpi({
  tone,
  icon,
  label,
  value,
  pill,
  pillClass,
}: {
  tone: "violet" | "green" | "orange";
  icon: string;
  label: string;
  value: string;
  pill: string;
  pillClass: string;
}) {
  return (
    <div className={`ds-card surv-kpi surv-kpi--${tone}`}>
      <span className="surv-kpi__icon" aria-hidden>
        <img src={icon} alt="" style={{ mixBlendMode: "multiply" }} />
      </span>
      <div>
        <div className="surv-kpi__label">{label}</div>
        <div className="surv-kpi__value">{value}</div>
        <span className={`surv-kpi__pill ${pillClass}`}>{pill}</span>
      </div>
    </div>
  );
}
