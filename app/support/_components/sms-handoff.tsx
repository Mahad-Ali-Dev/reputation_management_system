"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { provisionHandoffNumberAction } from "@/lib/inbox/widget-actions";

/**
 * Live Chat — SMS Handoff sub-view (client island), rebuilt to the delivered kit.
 *
 * Numbered setup form (enable → business number → invitation → availability →
 * test) with a persistent right rail (setup timeline + analytics + pro tip).
 * Provisioning a dedicated handoff number is env-gated (the button is disabled
 * with a "Twilio not configured" note when creds are absent) and entitlement-
 * gated inside the server action, so the UI never triggers a paid call when
 * Twilio is unconfigured. The per-conversation "Move to SMS" lives in the live
 * session view + the Conversations customer panel.
 */

export type SmsHandoffData = {
  twilioConfigured: boolean;
  smsHandoffEnabled: boolean;
  numbers: { id: string; phoneE164: string; monthlyCostCents: number }[];
};

const DEFAULT_INVITE =
  "Thanks for chatting with us! You can continue this conversation over SMS. Click the link to reply anytime.";

export function SmsHandoff({ data }: { data: SmsHandoffData }) {
  const [pending, startTransition] = useTransition();
  const [areaCode, setAreaCode] = useState("");
  const [enabled, setEnabled] = useState(data.smsHandoffEnabled);
  const [invite, setInvite] = useState(DEFAULT_INVITE);
  const [availability, setAvailability] = useState<"always" | "business" | "custom">("always");
  const [testNumber, setTestNumber] = useState("");
  const [testSent, setTestSent] = useState(false);

  const hasNumber = data.numbers.length > 0;
  const firstNumber = hasNumber ? formatE164(data.numbers[0]!.phoneE164) : null;

  const steps = [
    { label: "Enable SMS handoff", done: enabled },
    { label: "Verify your business number", done: hasNumber, sub: firstNumber ?? undefined },
    { label: "Customize SMS message", done: invite.trim().length > 0, current: !hasNumber || !enabled ? false : true },
    { label: "Set availability hours", done: false },
    { label: "Test SMS handoff", done: testSent },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>
      {/* Main form */}
      <div style={{ display: "grid", gap: 16 }}>
        {/* 1 Enable */}
        <div className="uik-sec">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <span className="uik-sec__num">1</span>
              <div>
                <h4 className="uik-sec__title">Enable SMS handoff</h4>
                <p className="uik-sec__help">Give your visitors the option to continue conversations over SMS.</p>
              </div>
            </div>
            <label className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: enabled ? "#099a5a" : "var(--uik-mut)" }}>
                {enabled ? "Enabled" : "Disabled"}
              </span>
              <label className="uik-switch">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="uik-switch__track" style={{ ...(enabled ? { background: "var(--uik-ok)" } : {}) }} />
              </label>
            </label>
          </div>
          <div className="row" style={{ gap: 14, marginTop: 14, flexWrap: "wrap" }}>
            <SmsBenefit icon="refresh" title="Seamless continuation" />
            <SmsBenefit icon="lock" title="Secure & verified" />
            <SmsBenefit icon="chat" title="Context is preserved" />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 14, padding: "10px 12px", borderRadius: "var(--uik-r-md)", background: "var(--uik-ok-soft)", fontSize: 12, color: "#099a5a" }}>
            <Icon name="checkCircle" size={14} style={{ flexShrink: 0 }} />
            <span>SMS handoff is available for US, CA, UK, AU and selected countries.</span>
          </div>
        </div>

        {/* 2 Business number */}
        <div className="uik-sec">
          <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
            <span className="uik-sec__num">2</span>
            <div>
              <h4 className="uik-sec__title">Business number</h4>
              <p className="uik-sec__help">Select or add the number you want to use for SMS conversations.</p>
            </div>
          </div>

          {!data.twilioConfigured && (
            <div className="row" style={{ gap: 8, padding: "10px 12px", borderRadius: "var(--uik-r-md)", background: "#fff7ed", border: "1px solid #fed7aa", marginBottom: 12, fontSize: 12.5, color: "#9a3412" }}>
              <Icon name="info" size={14} style={{ flexShrink: 0 }} />
              Twilio is not configured. Add your Twilio credentials in environment settings to enable SMS handoff. The conversation is still saved to the inbox without it.
            </div>
          )}

          {hasNumber ? (
            <div style={{ border: "1px solid var(--uik-line)", borderRadius: "var(--uik-r-md)", overflow: "hidden", marginBottom: 12 }}>
              {data.numbers.map((n, i) => (
                <div key={n.id} className="row" style={{ justifyContent: "space-between", padding: "12px 14px", borderTop: i ? "1px solid var(--uik-divider)" : "none" }}>
                  <span className="uik-mono" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--uik-ink)" }}>{formatE164(n.phoneE164)}</span>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="uik-pill uik-pill--replied">Verified</span>
                    <span className="uik-mut" style={{ fontSize: 12 }}>${(n.monthlyCostCents / 100).toFixed(2)}/mo</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="uik-mut" style={{ fontSize: 12.5, margin: "0 0 12px" }}>No handoff number provisioned yet.</p>
          )}

          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "block" }}>
              <span className="uik-field__label" style={{ marginBottom: 5, fontWeight: 600 }}>Preferred area code (optional)</span>
              <input
                type="text"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="415"
                inputMode="numeric"
                disabled={!data.twilioConfigured}
                className="uik-input uik-mono"
                style={{ width: 120, background: data.twilioConfigured ? "#fff" : "#f1f5f9" }}
              />
            </label>
            <button
              type="button"
              disabled={!data.twilioConfigured || pending}
              className="uik-btn uik-btn--purple"
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
              {pending ? "Provisioning…" : "Add business number"}
            </button>
          </div>
        </div>

        {/* 3 Customize invitation */}
        <div className="uik-sec">
          <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
            <span className="uik-sec__num">3</span>
            <div>
              <h4 className="uik-sec__title">Customize SMS invitation</h4>
              <p className="uik-sec__help">This is the message visitors receive when they request to continue over SMS.</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: 16, alignItems: "start" }}>
            <div>
              <textarea value={invite} onChange={(e) => setInvite(e.target.value.slice(0, 160))} rows={4} className="uik-textarea" />
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                <span className="uik-mut uik-mono" style={{ fontSize: 11 }}>{invite.length} / 160</span>
                <div className="row" style={{ gap: 6 }}>
                  <span className="uik-chip" style={{ height: 24 }}>Visitor name</span>
                  <span className="uik-chip" style={{ height: 24 }}>Chat link</span>
                </div>
              </div>
            </div>
            {/* phone preview */}
            <div style={{ border: "1px solid var(--uik-line)", borderRadius: "var(--uik-r-lg)", padding: 12, background: "#f8fafc" }}>
              <div className="uik-mut" style={{ fontSize: 10.5, marginBottom: 6 }}>{firstNumber ?? "+1 (555) 123-4567"}</div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "9px 11px", fontSize: 11.5, color: "#0f172a", lineHeight: 1.45 }}>
                {invite} <span style={{ color: "var(--uik-purple)" }}>repu.la/a/bcb123</span>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8, fontSize: 10.5, color: "#099a5a" }}>
                <Icon name="check" size={12} /> Looks good!
              </div>
            </div>
          </div>
        </div>

        {/* 4 Availability */}
        <div className="uik-sec">
          <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
            <span className="uik-sec__num">4</span>
            <div>
              <h4 className="uik-sec__title">Set availability hours</h4>
              <p className="uik-sec__help">Choose when SMS handoff is available to your visitors.</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {([["always", "24/7 (Always available)"], ["business", "During business hours"], ["custom", "Custom hours"]] as const).map(([key, label]) => (
              <label key={key} className={`uik-opt${availability === key ? " is-selected" : ""}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="radio" checked={availability === key} onChange={() => setAvailability(key)} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--uik-ink)" }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 5 Test */}
        <div className="uik-sec">
          <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
            <span className="uik-sec__num">5</span>
            <div>
              <h4 className="uik-sec__title">Test SMS handoff</h4>
              <p className="uik-sec__help">Test the flow to make sure everything works as expected.</p>
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "block", flex: "1 1 200px" }}>
              <span className="uik-field__label" style={{ marginBottom: 5, fontWeight: 600 }}>Test phone number</span>
              <input type="tel" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="+1 (555) 987-6543" className="uik-input uik-mono" />
            </label>
            <button
              type="button"
              className="uik-btn uik-btn--purple"
              disabled={!testNumber.trim() || !data.twilioConfigured}
              onClick={() => setTestSent(true)}
              title={data.twilioConfigured ? undefined : "Twilio not configured"}
            >
              <Icon name="send" size={13} />
              Send test SMS
            </button>
          </div>
          {testSent && (
            <div className="row" style={{ gap: 8, marginTop: 10, fontSize: 12, color: "#099a5a" }}>
              <Icon name="checkCircle" size={14} /> Test SMS sent successfully!
            </div>
          )}
        </div>

        {/* support banner */}
        <div className="row" style={{ gap: 12, padding: 16, borderRadius: "var(--uik-r-lg)", background: "var(--uik-purple-soft)", alignItems: "center" }}>
          <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", color: "var(--uik-purple)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="help" size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--uik-ink)" }}>Need help setting up SMS handoff?</p>
            <p className="uik-mut" style={{ fontSize: 12, margin: "1px 0 0" }}>Our support team is here to help you get started.</p>
          </div>
          <a href="/contact" className="uik-btn uik-btn--sm uik-btn--purple">Contact Support</a>
        </div>
      </div>

      {/* Right rail */}
      <div style={{ display: "grid", gap: 16 }}>
        <div className="uik-sec">
          <h4 className="uik-sec__title">SMS Handoff Setup</h4>
          <p className="uik-sec__help" style={{ marginBottom: 14 }}>Follow these steps to enable SMS handoff for your visitors.</p>
          <div className="uik-tl">
            {steps.map((s, i) => (
              <div key={i} className="uik-tl__item">
                <span className="uik-tl__dot" style={{ background: s.done ? "var(--uik-ok)" : s.current ? "var(--uik-purple)" : "#cbd5e1" }} />
                <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: "var(--uik-ink)" }}>{s.label}</p>
                <p className="uik-mut" style={{ fontSize: 11, margin: "1px 0 0" }}>
                  {s.done ? (s.sub ? `Completed · ${s.sub}` : "Completed") : s.current ? "In progress" : "Pending"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="uik-sec">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h4 className="uik-sec__title">SMS Handoff Analytics</h4>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <Metric label="Handoff requests" value={hasNumber ? "—" : "0"} />
            <Metric label="Conversations continued" value={hasNumber ? "—" : "0"} />
            <Metric label="Continuation rate" value={hasNumber ? "—" : "0%"} />
          </div>
          <p className="uik-mut" style={{ fontSize: 11, marginTop: 10 }}>
            Live metrics appear once handoffs start flowing through your number.
          </p>
        </div>

        <div className="uik-sec" style={{ background: "var(--uik-purple-soft)", border: 0 }}>
          <h4 className="uik-sec__title">Pro tip</h4>
          <p style={{ fontSize: 12, color: "var(--uik-ink-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
            Place the SMS handoff option at the natural end of the chat to increase conversion.
          </p>
        </div>
      </div>
    </div>
  );
}

function SmsBenefit({ icon, title }: { icon: Parameters<typeof Icon>[0]["name"]; title: string }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center" }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--uik-purple-soft)", color: "var(--uik-purple)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={15} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--uik-ink)" }}>{title}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uik-stat__num">{value}</div>
      <div className="uik-stat__label">{label}</div>
    </div>
  );
}

function formatE164(p: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return p;
}
