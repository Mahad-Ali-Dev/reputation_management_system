"use client";

import { useState } from "react";
import { requestCancellation } from "@/lib/billing/cancellation";

/**
 * Cancel-subscription flow. Renders a "Cancel subscription" button that opens
 * a modal asking for a reason + optional notes + whether they want a refund.
 *
 * The form submits to a server action (lib/billing/cancellation.ts) which
 * logs the request to audit_log + sends an in-app notification. Our team
 * processes it manually within 1 business day.
 */
export function CancelSubscriptionButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn--ghost"
        style={{
          width: "100%",
          justifyContent: "center",
          marginTop: 26,
          color: "var(--bad, #b91c1c)",
        }}
      >
        Cancel subscription
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(11,13,14,.45)",
              zIndex: 80,
              border: "none",
              cursor: "default",
            }}
          />
          <div
            role="dialog"
            aria-label="Cancel subscription"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(520px, calc(100vw - 32px))",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: "var(--surface, #fff)",
              borderRadius: 16,
              boxShadow: "0 30px 60px -20px rgba(11,13,14,.4)",
              zIndex: 81,
              padding: 24,
            }}
          >
            <div style={{ marginBottom: 18 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  marginBottom: 6,
                }}
              >
                Cancel your subscription
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--rl-muted, #94a3b8)",
                  lineHeight: 1.55,
                }}
              >
                Submit this and our billing team will reach out within 1 business
                day to confirm the cancellation date and handle any refund.
                Pro features stay active until then.
              </p>
            </div>

            <form action={requestCancellation} className="col" style={{ gap: 14 }}>
              <label className="col" style={{ gap: 4 }}>
                <span className="lbl">Reason for cancelling</span>
                <select
                  name="reason"
                  required
                  defaultValue=""
                  style={{
                    height: 40,
                    padding: "0 14px",
                    borderRadius: "var(--r)",
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    fontSize: 13,
                  }}
                >
                  <option value="" disabled>
                    Pick one
                  </option>
                  <option value="too_expensive">Too expensive</option>
                  <option value="missing_feature">Missing a feature I need</option>
                  <option value="switching_provider">Switching to another provider</option>
                  <option value="not_using_enough">Not using it enough</option>
                  <option value="business_closing">Closing or pausing the business</option>
                  <option value="other">Something else</option>
                </select>
              </label>

              <label className="col" style={{ gap: 4 }}>
                <span className="lbl">Notes (optional)</span>
                <textarea
                  name="notes"
                  maxLength={2000}
                  rows={4}
                  placeholder="Anything we should know? Feedback helps us improve."
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--r)",
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    resize: "vertical",
                    fontFamily: "var(--f-ui)",
                  }}
                />
              </label>

              <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  name="refundRequested"
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  I&apos;d like a refund for the unused portion of this billing
                  period. Our team will review and confirm eligibility.
                </span>
              </label>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn"
                >
                  Keep subscription
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    background: "var(--bad, #b91c1c)",
                    color: "#fff",
                    border: "none",
                  }}
                >
                  Submit cancellation request
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
