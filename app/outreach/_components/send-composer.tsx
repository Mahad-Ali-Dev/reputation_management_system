"use client";

import { Icon } from "@/components/shell/icon";
import { createReviewRequest } from "@/lib/outreach/actions";
import { generateRequestBody } from "@/lib/outreach/ai-generate";
import { OUTREACH_MERGE_TAGS, resolveMergeTags, sampleContext } from "@/lib/outreach/merge-tags";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

/**
 * Send Request composer (Send tab body), rebuilt to the kit mockup
 * (designs/Review Request/send request). Two columns: a 4-step form card with a
 * vertical progress rail (Contact · Message · Delivery · Routing) on the left,
 * and live Email + SMS previews (phone mock) on the right.
 *
 * All original behaviour preserved:
 *   - template picker (fills body/subject from a saved OutreachTemplate),
 *   - merge-tag chips that insert {{tag}} at the cursor,
 *   - char limits (greeting ≤120, body ≤1000),
 *   - live email + SMS preview using the SAME `resolveMergeTags` the server uses,
 *   - Now/Schedule timing + TCPA attestation,
 *   - "Bulk CSV" deep link to /outreach/bulk.
 *
 * FK note: a chosen template's OutreachTemplate id is passed as
 * `outreachTemplateId` (subject/logo hydration) — NEVER as ReviewRequest.templateId.
 */

type Establishment = { id: string; name: string };
type TemplateOpt = { id: string; name: string; channel: string; subject: string | null; body: string };

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
    setBody(t.body.slice(0, BODY_MAX));
    if (t.channel === "email") setSendEmail(true);
    else if (t.channel === "sms") setSendSms(true);
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

  const subjectLine = `How was your experience at ${businessName}?`;

  return (
    <div className="rr-send">
      {/* ── Left: stepped form card ── */}
      <form onSubmit={handleSend} className="rr-card rr-formcard">
        <div className="rr-rail" aria-hidden />

        {/* Step 1 — Contact */}
        <section className="rr-step">
          <span className="rr-step__node">
            <Icon name="user" size={15} />
          </span>
          <h3 className="rr-step__title">1. Contact</h3>
          <label className="rr-field">
            <span className="rr-field__lbl">Customer name</span>
            <input
              className="rr-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="rr-2col">
            <label className="rr-field">
              <span className="rr-field__lbl">Phone (E.164)</span>
              <div className="rr-inputwrap">
                <span className="rr-inputwrap__icon">
                  <Icon name="phone" size={14} />
                </span>
                <input
                  className="rr-input"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                />
              </div>
            </label>
            <label className="rr-field">
              <span className="rr-field__lbl">Email</span>
              <div className="rr-inputwrap">
                <span className="rr-inputwrap__icon">
                  <Icon name="mail" size={14} />
                </span>
                <input
                  className="rr-input"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@example.com"
                />
              </div>
            </label>
          </div>
        </section>

        {/* Step 2 — Message */}
        <section className="rr-step">
          <span className="rr-step__node">
            <Icon name="chat" size={15} />
          </span>
          <h3 className="rr-step__title">
            2. Message
            {templates.length > 0 && (
              <select
                className="rr-select"
                style={{ maxWidth: 180, height: 36 }}
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                aria-label="Start from template"
              >
                <option value="">Start from template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </select>
            )}
          </h3>

          <label className="rr-field">
            <span className="rr-field__lbl">Greeting</span>
            <input
              className="rr-input"
              value={greeting}
              maxLength={GREETING_MAX}
              onChange={(e) => setGreeting(e.target.value)}
            />
          </label>

          <div className="rr-mergechips">
            {OUTREACH_MERGE_TAGS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="rr-mergechip"
                title={`Insert {{${t.key}}}`}
                onClick={() => insertTag(t.key)}
              >
                + {t.label}
              </button>
            ))}
          </div>

          <label className="rr-field">
            <span className="rr-field__lbl">Body</span>
            <textarea
              ref={bodyRef}
              className="rr-textarea"
              value={body}
              maxLength={BODY_MAX}
              rows={5}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          <div className="rr-msgctrls">
            <div className="row" style={{ gap: 8 }}>
              <select
                className="rr-select"
                style={{ height: 38, maxWidth: 130 }}
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
                aria-label="Tone"
              >
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="brief">Brief</option>
                <option value="warm">Warm</option>
                <option value="playful">Playful</option>
              </select>
              <button type="button" className="rr-toolbtn" disabled={aiPending} onClick={handleGenerateAI}>
                <Icon name="sparkle" size={13} />
                {aiPending ? "Generating…" : "Generate with AI"}
              </button>
            </div>
            <span className="rr-counter">
              {body.length}/{BODY_MAX}
            </span>
          </div>
        </section>

        {/* Step 3 — Delivery */}
        <section className="rr-step">
          <span className="rr-step__node">
            <Icon name="send" size={15} />
          </span>
          <h3 className="rr-step__title">3. Delivery</h3>
          <div className="rr-checks">
            <label className="rr-check">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email
            </label>
            <label className="rr-check">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              SMS
            </label>
          </div>
        </section>

        {/* Step 4 — Routing */}
        <section className="rr-step">
          <span className="rr-step__node">
            <Icon name="move" size={15} />
          </span>
          <h3 className="rr-step__title">4. Routing</h3>
          <div className="rr-2col">
            <label className="rr-field">
              <span className="rr-field__lbl">Business location</span>
              <div className="rr-inputwrap">
                <span className="rr-inputwrap__icon">
                  <Icon name="building" size={14} />
                </span>
                <select
                  className="rr-input rr-select"
                  value={establishmentId}
                  onChange={(e) => setEstablishmentId(e.target.value)}
                  required
                  style={{ paddingLeft: 36 }}
                >
                  {establishments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="rr-field">
              <span className="rr-field__lbl">Send timing</span>
              <div className="rr-inputwrap">
                <span className="rr-inputwrap__icon">
                  <Icon name="clock" size={14} />
                </span>
                <select
                  className="rr-input rr-select"
                  value={scheduleHours}
                  onChange={(e) => setScheduleHours(Number(e.target.value))}
                  style={{ paddingLeft: 36 }}
                >
                  <option value={0}>Now</option>
                  <option value={1}>In 1 hour</option>
                  <option value={24}>In 1 day</option>
                  <option value={72}>In 3 days</option>
                  <option value={168}>In 1 week</option>
                </select>
              </div>
            </label>
          </div>
        </section>

        {sendSms && (
          <label className="rr-consent">
            <input
              type="checkbox"
              checked={consentAttested}
              onChange={(e) => setConsentAttested(e.target.checked)}
            />
            <span>
              I attest this recipient has previously given written consent to receive marketing SMS from
              my business (TCPA / A2P 10DLC compliance).
            </span>
          </label>
        )}

        {error && <p className="rr-msgbad">{error}</p>}
        {success && <p className="rr-msgok">{success}</p>}

        <div className="rr-formactions">
          <button type="submit" className="rr-actbtn rr-actbtn--pri" disabled={sendPending}>
            <Icon name="send" size={14} />
            {sendPending ? "Sending…" : "Send request"}
          </button>
          <Link href="/outreach/bulk" className="rr-actbtn">
            <Icon name="upload" size={14} />
            Bulk CSV
          </Link>
        </div>
      </form>

      {/* ── Right: live previews ── */}
      <div className="rr-previewcol">
        {/* Email preview */}
        <div className="rr-card rr-preview">
          <div className="rr-preview__head">
            <div className="rr-preview__tile">
              <Icon name="mail" size={16} />
            </div>
            <div className="rr-preview__title">Email preview</div>
            <div className="rr-preview__aside">
              <span className="rr-linkbtn" style={{ cursor: "default" }}>
                <Icon name="ext" size={12} />
                Open in new tab
              </span>
            </div>
          </div>
          <div className="rr-meta">
            <div>
              <span className="rr-meta__k">From:</span> {businessName}
            </div>
            <div>
              <span className="rr-meta__k">To:</span> {customerEmail || "customer@example.com"}
            </div>
            <div>
              <span className="rr-meta__k">Subject:</span> {subjectLine}
            </div>
          </div>
          <div className="rr-preview__divider" />
          {logoUrl && (
            // biome-ignore lint/performance/noImgElement: org logo preview
            <img src={logoUrl} alt="" style={{ maxHeight: 36, marginBottom: 10, display: "block" }} />
          )}
          <div className="rr-emailbody">
            <strong>{filled(greeting)}</strong>
            {"\n\n"}
            {filled(body)}
          </div>
          {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
          <img
            src="/assets/repulabs/review-request/send-email-preview.svg"
            alt=""
            aria-hidden="true"
            className="rr-preview__art"
          />
        </div>

        {/* SMS preview */}
        <div className="rr-card rr-preview">
          <div className="rr-preview__head">
            <div className="rr-preview__tile rr-preview__tile--ok">
              <Icon name="chat" size={16} />
            </div>
            <div className="rr-preview__title">SMS preview</div>
            <div className="rr-preview__aside">
              <span className="rr-linkbtn" style={{ cursor: "default" }}>
                <Icon name="ext" size={12} />
                View full size
              </span>
            </div>
          </div>
          <div className="rr-meta" style={{ marginBottom: 4 }}>
            <span className="rr-meta__k">To:</span> {customerPhone || "+1 555 123 4567"}
          </div>
          <div className="rr-phone">
            <div className="rr-phone__bar">
              <span>9:41</span>
              <span className="row" style={{ gap: 4 }}>
                <Icon name="sound" size={12} />
                <Icon name="bars" size={12} />
              </span>
            </div>
            <div className="rr-phone__body">
              <div className="rr-bubble">
                {filled(greeting)}
                {"\n"}
                {filled(body)}
                <span className="rr-bubble__time">9:41 AM ✓✓</span>
              </div>
            </div>
          </div>
          <div className="rr-callout">
            <Icon name="info" size={14} />
            <span>
              Reply STOP to opt out. SMS includes our standard unsubscribe footer automatically.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
