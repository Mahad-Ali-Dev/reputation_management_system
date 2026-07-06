"use client";

import { Icon } from "@/components/shell/icon";
import { redeemCouponAction } from "@/lib/surveys/coupon-actions";
import { useState, useTransition } from "react";

/**
 * Coupon redemption form — "Customer Surveys" kit styling.
 *
 * Two-column field layout (coupon code + optional staff note), a scan-line
 * affordance inside the code field, and a violet Redeem button with a trailing
 * arrow. Wraps the existing `redeemCouponAction` server action unchanged;
 * announces the result in a polite live region. Preserves entered values on a
 * recoverable failure (only clears on success).
 */
export function CouponRedeemForm() {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: boolean; message: string; valueCents?: number; description?: string | null; code?: string }
    | null
  >(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const form = new FormData();
    form.set("code", code.trim().toUpperCase());
    if (note.trim()) form.set("note", note.trim());
    startTransition(async () => {
      try {
        const r = await redeemCouponAction(form);
        setResult(r);
        if (r.ok) {
          setCode("");
          setNote("");
        }
      } catch (err) {
        setResult({
          ok: false,
          message: err instanceof Error ? err.message : "Failed to redeem",
        });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="surv-redeem__fields">
        <div>
          <label htmlFor="coupon-code" className="surv-field-lbl">
            Coupon code
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="coupon-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter coupon code"
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              required
              className="surv-input"
              style={{ textTransform: "uppercase", paddingRight: 40, fontFamily: "var(--f-mono, monospace)" }}
            />
            <span
              aria-hidden
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--surv-muted)",
              }}
            >
              <Icon name="qr" size={18} />
            </span>
          </div>
        </div>
        <div>
          <label htmlFor="coupon-note" className="surv-field-lbl">
            Staff note (optional)
          </label>
          <input
            id="coupon-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="Receipt #, customer name, notes…"
            className="surv-input"
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn btn--pri btn--sm"
        style={{ marginTop: 12 }}
        disabled={pending || code.trim().length < 4}
      >
        {pending ? "Checking…" : "Redeem"}
        <Icon name="arrowR" size={13} />
      </button>

      {result && (
        <div
          role="status"
          className="surv-status"
          style={{
            display: "block",
            marginTop: 12,
            padding: "10px 14px",
            fontSize: 12.5,
            fontWeight: 500,
            background: result.ok ? "var(--surv-ok-soft)" : "var(--surv-bad-soft)",
            color: result.ok ? "var(--surv-ok)" : "var(--surv-bad)",
          }}
        >
          {result.message}
          {result.ok && result.description && (
            <div style={{ fontSize: 11, marginTop: 3, opacity: 0.85 }}>{result.description}</div>
          )}
        </div>
      )}
    </form>
  );
}
