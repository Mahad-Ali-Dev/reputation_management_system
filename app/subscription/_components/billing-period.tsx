"use client";

import { useState } from "react";

/**
 * Monthly/Annual segmented control for Plans & Billing (bug 013 in the June
 * 2026 assessment: the old control was static server markup with `is-active`
 * hardcoded on Annual, so clicking Monthly did nothing).
 *
 * Client island that owns the period state and exposes it to the
 * server-rendered plan cards via a `data-period` attribute + a tiny scoped
 * stylesheet: cards render BOTH price variants tagged `data-when="monthly|
 * annual"` and CSS shows the matching one. Keeps the cards (and their server
 * actions) server-rendered.
 */
export type BillingPeriod = "monthly" | "annual";

export function BillingPeriodSection({
  initial = "annual",
  children,
}: {
  initial?: BillingPeriod;
  children: React.ReactNode;
}) {
  const [period, setPeriod] = useState<BillingPeriod>(initial);

  return (
    <div data-period={period}>
      <style>{`
        [data-period="annual"] [data-when="monthly"] { display: none; }
        [data-period="monthly"] [data-when="annual"] { display: none; }
      `}</style>
      <div className="row" style={{ justifyContent: "center", marginBottom: 26 }}>
        <div className="seg" role="group" aria-label="Billing period">
          <button
            type="button"
            className={period === "monthly" ? "seg__t is-active" : "seg__t"}
            aria-pressed={period === "monthly"}
            onClick={() => setPeriod("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={period === "annual" ? "seg__t is-active" : "seg__t"}
            aria-pressed={period === "annual"}
            onClick={() => setPeriod("annual")}
          >
            Annual{" "}
            <span className="mono" style={{ color: "var(--ok)", marginLeft: 6 }}>
              −20%
            </span>
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
