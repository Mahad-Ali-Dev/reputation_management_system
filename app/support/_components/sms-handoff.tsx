"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { provisionHandoffNumberAction } from "@/lib/inbox/widget-actions";

/**
 * Live Chat — Widget settings → SMS handoff sub-tab (client island).
 *
 * The Podium-killer surface: explains the flow, lets the operator provision a
 * dedicated handoff number (env-gated — the button is disabled with "Twilio not
 * configured" when creds are absent), shows the org's provisioned numbers + their
 * monthly cost, and notes the per-conversation "Move to SMS" lives in the live
 * session view + the Conversations customer panel.
 *
 * Provisioning is entitlement-gated (Pro) + env-gated inside the server action;
 * the UI never triggers a paid call when Twilio is unconfigured.
 */

export type SmsHandoffData = {
  twilioConfigured: boolean;
  smsHandoffEnabled: boolean;
  numbers: { id: string; phoneE164: string; monthlyCostCents: number }[];
};

export function SmsHandoff({ data }: { data: SmsHandoffData }) {
  const [pending, startTransition] = useTransition();
  const [areaCode, setAreaCode] = useState("");

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* How it works */}
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "linear-gradient(180deg, #f7f9ff 0%, #ffffff 100%)",
          padding: 16,
        }}
      >
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          <Icon name="smartphone" size={14} style={{ color: "var(--pri)" }} /> Never lose a
          conversation when a visitor leaves
        </h4>
        <p className="dim" style={{ fontSize: 13, margin: 0, lineHeight: 1.55 }}>
          When a website chat needs a human and the visitor closes the tab, capture their phone and
          continue over SMS from a dedicated number. Their replies land right back in your unified
          inbox as an SMS conversation with a <strong>“Started via Widget”</strong> badge.
        </p>
      </div>

      {/* Provision */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          Handoff number
        </h4>
        {data.twilioConfigured ? (
          <p className="dim" style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>
            Provision a virtual number to text visitors from. One number serves your whole org
            (each visitor is tracked by their own phone). ~$1.15/mo per number.
          </p>
        ) : (
          <div
            className="row"
            style={{
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              marginBottom: 12,
              fontSize: 12.5,
              color: "#9a3412",
            }}
          >
            <Icon name="info" size={14} />
            Twilio is not configured. Add your Twilio credentials in environment settings to enable
            SMS handoff. The conversation is still saved to the inbox without it.
          </div>
        )}

        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "block" }}>
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-2)",
                marginBottom: 5,
              }}
            >
              Preferred area code (optional)
            </span>
            <input
              type="text"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="415"
              inputMode="numeric"
              disabled={!data.twilioConfigured}
              className="mono"
              style={{
                width: 120,
                padding: "8px 10px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: data.twilioConfigured ? "#fff" : "#f1f5f9",
              }}
            />
          </label>
          <button
            type="button"
            disabled={!data.twilioConfigured || pending}
            className="btn btn--pri"
            title={data.twilioConfigured ? undefined : "Twilio not configured"}
            onClick={() => {
              startTransition(async () => {
                const fd = new FormData();
                if (areaCode) fd.set("areaCode", areaCode);
                await provisionHandoffNumberAction(fd);
              });
            }}
          >
            <Icon name="plus" size={13} />
            {pending ? "Provisioning…" : "Provision a number"}
          </button>
        </div>
      </div>

      {/* Active numbers */}
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px", color: "var(--ink)" }}>
          Active numbers ({data.numbers.length})
        </h4>
        {data.numbers.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            No handoff numbers provisioned yet.
          </p>
        ) : (
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            {data.numbers.map((n, i) => (
              <div
                key={n.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderTop: i ? "1px solid var(--line)" : "none",
                }}
              >
                <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                  {formatE164(n.phoneE164)}
                </span>
                <span className="dim" style={{ fontSize: 12 }}>
                  ${(n.monthlyCostCents / 100).toFixed(2)}/mo
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="dim" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        To hand off a specific conversation, use <strong>Move to SMS</strong> from a live session or
        the customer panel in Conversations. Visitors must consent before the first text; STOP
        replies are honored automatically.
      </p>
    </div>
  );
}

function formatE164(p: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return p;
}
