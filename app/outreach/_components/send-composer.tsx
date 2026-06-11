"use client";

import { Icon } from "@/components/shell/icon";
import { createReviewRequest } from "@/lib/outreach/actions";
import { generateRequestBody } from "@/lib/outreach/ai-generate";
import { OUTREACH_MERGE_TAGS, resolveMergeTags, sampleContext } from "@/lib/outreach/merge-tags";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

/**
 * Send Request composer (Send tab body). Enhances the original one-off form:
 *   - template picker (fills greeting/body/subject from a saved OutreachTemplate),
 *   - merge-tag chips that insert {{tag}} at the cursor (canonical double-brace),
 *   - raised char limits (greeting ≤120, body ≤1000),
 *   - live email + SMS preview using the SAME `resolveMergeTags` the server sends with,
 *   - Now/Schedule timing + TCPA attestation (carried over),
 *   - a "Bulk CSV" deep link to /outreach/bulk.
 *
 * FK note: when a template is chosen, we pass its OutreachTemplate id as
 * `outreachTemplateId` to the action (for subject/logo hydration) — it is NEVER
 * written to ReviewRequest.templateId.
 */

type Establishment = { id: string; name: string };
type TemplateOpt = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
};

const GREETING_MAX = 120;
const BODY_MAX = 1000;

export function SendComposer({
  establishments,
  templates,
  businessName,
  logoUrl,
}: {
  establishments: Establishment[];
  templates: TemplateOpt[];
  businessName: string;
  logoUrl: string | null;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [greeting, setGreeting] = useState("Hi {{first_name}},");
  const [body, setBody] = useState(
    `We'd love to hear your feedback on your recent experience with {{business_name}}!\n\nLeave a review: {{review_link}}`,
  );
  const [tone, setTone] = useState<"friendly" | "formal" | "brief" | "warm" | "playful">("friendly");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [scheduleHours, setScheduleHours] = useState(0);
  const [consentAttested, setConsentAttested] = useState(false);

  const [aiPending, startAiTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const previewCtx = useMemo(
    () => ({ ...sampleContext(businessName), recipientName: customerName || "Jordan Smith" }),
    [businessName, customerName],
  );
  const filled = (s: string) => resolveMergeTags(s, previewCtx, { keepUnknown: true });

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // Choosing a template fills the body (+ subject for email). Channel hint:
    // toggle the matching channel on.
    setBody(t.body.slice(0, BODY_MAX));
    if (t.channel === "email") {
      setSendEmail(true);
    } else if (t.channel === "sms") {
      setSendSms(true);
    }
  }

  function insertTag(key: string) {
    const token = `{{${key}}}`;
    const ta = bodyRef.current;
    if (!ta) {
      setBody((b) => (b + token).slice(0, BODY_MAX));
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = (body.slice(0, start) + token + body.slice(end)).slice(0, BODY_MAX);
    setBody(next);
    requestAnimationFrame(() => {
      const pos = Math.min(start + token.length, next.length);
      ta.focus();
      try {
        ta.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  }

  function handleGenerateAI() {
    setError(null);
    const channel = sendEmail ? "email" : "sms";
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("tone", tone);
    startAiTransition(async () => {
      try {
        const result = await generateRequestBody(fd);
        setBody(result.body.slice(0, BODY_MAX));
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI generation failed");
      }
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sendEmail && !sendSms) return setError("Pick at least one delivery channel.");
    if (sendEmail && !customerEmail.trim()) return setError("Email channel requires an email address.");
    if (sendSms && !customerPhone.trim()) return setError("SMS channel requires a phone number.");
    if (sendSms && !consentAttested) return setError("SMS requires TCPA consent attestation.");

    startSendTransition(async () => {
      try {
        const tasks: Array<Promise<{ ok: true } | { ok: false; error: string }>> = [];
        const fullBody = `${greeting}\n\n${body}`;

        if (sendEmail) {
          const fd = new FormData();
          fd.set("establishmentId", establishmentId);
          fd.set("channel", "email");
          fd.set("recipient", customerEmail);
          if (customerName) fd.set("recipientName", customerName);
          fd.set("scheduleHours", scheduleHours.toString());
          fd.set("customBody", fullBody);
          if (templateId) fd.set("outreachTemplateId", templateId);
          tasks.push(createReviewRequest(fd));
        }
        if (sendSms) {
          const fd = new FormData();
          fd.set("establishmentId", establishmentId);
          fd.set("channel", "sms");
          fd.set("recipient", customerPhone);
          if (customerName) fd.set("recipientName", customerName);
          fd.set("scheduleHours", scheduleHours.toString());
          fd.set("customBody", fullBody);
          if (templateId) fd.set("outreachTemplateId", templateId);
          fd.set("consentAttested", "on");
          tasks.push(createReviewRequest(fd));
        }

        const results = await Promise.all(tasks);
        const failed = results.find((r) => !r.ok);
        if (failed && !failed.ok) {
          setError(failed.error);
          return;
        }
        setSuccess(
          `Sent! Customer will receive ${sendEmail && sendSms ? "both messages" : sendEmail ? "an email" : "an SMS"} ${scheduleHours > 0 ? `in ${scheduleHours}h` : "now"}.`,
        );
        setCustomerName("");
        setCustomerPhone("");
        setCustomerEmail("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send failed");
      }
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}>
      {/* Left: form */}
      <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section>
          <h3 className="ds-card__title" style={{ marginBottom: 8 }}>1 · Contact</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="lbl" style={{ gridColumn: "1 / -1" }}>
              Customer name
              <input
                className="ds-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="lbl">
              Phone (E.164)
              <input
                className="ds-input"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+15551234567"
              />
            </label>
            <label className="lbl">
              Email
              <input
                className="ds-input"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </label>
          </div>
        </section>

        <section>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h3 className="ds-card__title">2 · Message</h3>
            {templates.length > 0 && (
              <select
                className="ds-input"
                style={{ maxWidth: 220, height: 32 }}
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="">Start from template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="lbl">
            Greeting
            <input
              className="ds-input"
              value={greeting}
              maxLength={GREETING_MAX}
              onChange={(e) => setGreeting(e.target.value)}
            />
          </label>

          <div style={{ marginTop: 10 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {OUTREACH_MERGE_TAGS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="chip chip--info"
                  style={{ cursor: "pointer", border: "1px solid var(--line)" }}
                  title={`Insert {{${t.key}}}`}
                  onClick={() => insertTag(t.key)}
                >
                  + {t.label}
                </button>
              ))}
            </div>
            <label className="lbl">
              Body
              <textarea
                ref={bodyRef}
                className="ds-textarea"
                value={body}
                maxLength={BODY_MAX}
                rows={6}
                onChange={(e) => setBody(e.target.value)}
                style={{ fontFamily: "var(--f-mono, monospace)" }}
              />
            </label>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <select
                  className="ds-input"
                  style={{ height: 30, maxWidth: 130 }}
                  value={tone}
                  onChange={(e) => setTone(e.target.value as typeof tone)}
                >
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                  <option value="brief">Brief</option>
                  <option value="warm">Warm</option>
                  <option value="playful">Playful</option>
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={aiPending}
                  onClick={handleGenerateAI}
                >
                  <Icon name="sparkle" size={12} />
                  {aiPending ? "Generating…" : "Generate with AI"}
                </button>
              </div>
              <span className="dim" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {body.length}/{BODY_MAX}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="ds-card__title" style={{ marginBottom: 8 }}>3 · Delivery</h3>
          <div className="row" style={{ gap: 16 }}>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email
            </label>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              SMS
            </label>
          </div>
        </section>

        <section>
          <h3 className="ds-card__title" style={{ marginBottom: 8 }}>4 · Routing</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="lbl">
              Business location
              <select
                className="ds-input"
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
                required
              >
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="lbl">
              Send timing
              <select
                className="ds-input"
                value={scheduleHours}
                onChange={(e) => setScheduleHours(Number(e.target.value))}
              >
                <option value={0}>Now</option>
                <option value={1}>In 1 hour</option>
                <option value={24}>In 1 day</option>
                <option value={72}>In 3 days</option>
                <option value={168}>In 1 week</option>
              </select>
            </label>
          </div>
        </section>

        {sendSms && (
          <label
            className="row"
            style={{
              gap: 8,
              alignItems: "flex-start",
              fontSize: 12,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <input
              type="checkbox"
              checked={consentAttested}
              onChange={(e) => setConsentAttested(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              I attest this recipient has previously given written consent to receive marketing SMS
              from my business (TCPA / A2P 10DLC compliance).
            </span>
          </label>
        )}

        {error && <p style={{ color: "var(--bad)", fontSize: 13 }}>{error}</p>}
        {success && <p style={{ color: "var(--ok)", fontSize: 13 }}>{success}</p>}

        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="btn btn--pri" disabled={sendPending}>
            <Icon name="send" size={12} />
            {sendPending ? "Sending…" : "Send request"}
          </button>
          <Link href="/outreach/bulk" className="btn">
            <Icon name="upload" size={12} />
            Bulk CSV
          </Link>
        </div>
      </form>

      {/* Right: live preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            className="dim"
            style={{
              borderBottom: "1px solid var(--line)",
              padding: "8px 14px",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Email preview
          </div>
          <div style={{ padding: 16 }}>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.6 }}>
              <strong>From:</strong> {businessName}
              <br />
              <strong>To:</strong> {customerEmail || "customer@example.com"}
              <br />
              <strong>Subject:</strong> How was your experience at {businessName}?
            </div>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ maxHeight: 40, marginBottom: 10, display: "block" }} />
            )}
            <p style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{filled(greeting)}</p>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.6 }}>
              {filled(body)}
            </div>
          </div>
        </div>

        <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            className="dim"
            style={{
              borderBottom: "1px solid var(--line)",
              padding: "8px 14px",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            SMS preview
          </div>
          <div style={{ padding: 16 }}>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 8 }}>
              <strong>To:</strong> {customerPhone || "+15551234567"}
            </div>
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: 10,
                padding: 12,
                fontSize: 13,
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {filled(greeting)}
              {"\n"}
              {filled(body)}
            </div>
            <p className="dim" style={{ fontSize: 10.5, marginTop: 8 }}>
              Reply STOP to opt out. SMS includes our standard unsubscribe footer automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
