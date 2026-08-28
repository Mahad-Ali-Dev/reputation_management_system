"use client";

import { Icon } from "@/components/shell/icon";
import { generateRequestBody } from "@/lib/outreach/ai-generate";
import { resolveMergeTags, sampleContext } from "@/lib/outreach/merge-tags";
import { upsertOutreachTemplate } from "@/lib/outreach/template-actions";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { MergeTagBody } from "./merge-tag-body";

/**
 * SMS is DISABLED for launch (2026-08) — email only; SMS returns later.
 * Flip to `true` to restore the channel picker. Existing SMS templates still
 * load and save correctly; they just can't be created from here meanwhile.
 */
const SMS_ENABLED = false;

/**
 * Two-column Template Editor (client island).
 *
 * Left: name; channel pills (Email / SMS) that toggle Subject-line visibility
 * (AC); subject (email only); logo preview + "Change logo" deep-link; the
 * merge-tag body field (chips insert at cursor; char counter); AI generate;
 * default toggle.
 *
 * Right: a recipient-style live preview — logo, subject, body with tags resolved
 * live from `sampleContext` (AC), a "Leave a Review" CTA, and a footer.
 *
 * Submits the controlled state via hidden inputs through a `<form>` bound to the
 * existing `upsertOutreachTemplate` action.
 */

const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

type Initial = {
  id: string | null;
  name: string;
  channel: "email" | "sms";
  subject: string;
  body: string;
  logoUrl: string;
  isDefault: boolean;
};

export function TemplateEditor({
  initial,
  businessName,
  sampleAddress,
  changeLogoHref,
}: {
  initial: Initial;
  businessName: string;
  sampleAddress: string;
  changeLogoHref: string;
}) {
  const [name, setName] = useState(initial.name);
  const [channel, setChannel] = useState<"email" | "sms">(initial.channel);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [isDefault, setIsDefault] = useState(initial.isDefault);

  const [tone, setTone] = useState<"friendly" | "formal" | "brief" | "warm" | "playful">(
    "friendly",
  );
  const [aiPending, startAi] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);

  const ctx = useMemo(
    () => sampleContext(businessName, sampleAddress),
    [businessName, sampleAddress],
  );
  const previewSubject = resolveMergeTags(subject, ctx, { keepUnknown: true });
  const previewBody = resolveMergeTags(body, ctx, { keepUnknown: true });

  function handleAi() {
    setAiError(null);
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("tone", tone);
    startAi(async () => {
      try {
        const result = await generateRequestBody(fd);
        setBody(result.body.slice(0, BODY_MAX));
      } catch (e) {
        setAiError(e instanceof Error ? e.message : "AI generation failed");
      }
    });
  }

  return (
    <div className="tpl-editor" style={{ display: "grid", gap: 18, alignItems: "start" }}>
      <style>{`
        .tpl-editor {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .tpl-editor__preview {
          position: sticky;
          top: 12px;
        }
        @media (max-width: 860px) {
          .tpl-editor {
            grid-template-columns: 1fr;
          }
          .tpl-editor__preview {
            position: static;
          }
        }
      `}</style>
      {/* Left: form */}
      {/* `ds-card` carries no padding of its own — every other usage in the app
          passes it explicitly. Without it the form's fields sat flush against
          the card edges. */}
      <form
        action={upsertOutreachTemplate}
        className="ds-card"
        style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20 }}
      >
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="subject" value={channel === "email" ? subject : ""} />
        <input type="hidden" name="logoUrl" value={initial.logoUrl} />
        {isDefault && <input type="hidden" name="isDefault" value="on" />}

        <label className="lbl">
          Template name
          <input
            className="ds-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            name="name"
            required
            placeholder="Post-Purchase Follow-Up"
          />
        </label>

        {/* Channel pills — hidden while SMS is disabled, since Email would be
            the only option and a one-choice picker is just noise. */}
        {SMS_ENABLED && (
          <div>
            <span className="lbl">Channel</span>
            <div className="row" style={{ gap: 8 }}>
              {(["email", "sms"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={channel === c ? "btn btn--pri" : "btn"}
                  onClick={() => setChannel(c)}
                >
                  <Icon name={c === "email" ? "mail" : "smartphone"} size={12} />
                  {c === "email" ? "Email" : "SMS"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subject — email only (channel toggle controls visibility, AC). */}
        {channel === "email" && (
          <label className="lbl">
            Subject line
            <input
              className="ds-input"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="How was your experience at {{business_name}}?"
            />
          </label>
        )}

        {/* Logo preview + Change logo (email only) */}
        {channel === "email" && (
          <div>
            <span className="lbl">Email logo</span>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              {initial.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={initial.logoUrl}
                  alt=""
                  style={{
                    maxHeight: 40,
                    maxWidth: 140,
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: 4,
                  }}
                />
              ) : (
                <span className="dim" style={{ fontSize: 12 }}>
                  No logo set falls back to your business name.
                </span>
              )}
              <Link href={changeLogoHref} className="btn" style={{ height: 30 }}>
                <Icon name="image" size={12} />
                Change logo
              </Link>
            </div>
          </div>
        )}

        {/* Body via the Wave-0 merge-tag editor */}
        <MergeTagBody
          value={body}
          onChange={(v) => setBody(v.slice(0, BODY_MAX))}
          channel={channel}
          businessName={businessName}
          sampleAddress={sampleAddress}
          maxLength={BODY_MAX}
        />

        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="ds-input"
              style={{ height: 32, maxWidth: 130 }}
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof tone)}
            >
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="brief">Brief</option>
              <option value="warm">Warm</option>
              <option value="playful">Playful</option>
            </select>
            <button type="button" className="btn" disabled={aiPending} onClick={handleAi}>
              <Icon name="sparkle" size={12} />
              {aiPending ? "Generating…" : "Generate with AI"}
            </button>
          </div>
          <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Default {channel} template
          </label>
        </div>

        {aiError && <p style={{ color: "var(--bad)", fontSize: 13 }}>{aiError}</p>}

        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="btn btn--pri">
            <Icon name="check" size={12} />
            Save template
          </button>
          <Link href="/outreach?tab=templates" className="btn">
            Cancel
          </Link>
        </div>
      </form>

      {/* Right: recipient preview. Matches the form's top padding so the two
          column headings sit on the same baseline. */}
      <div className="tpl-editor__preview" style={{ paddingTop: 20 }}>
        <span className="lbl">Preview what the recipient sees</span>
        {channel === "email" ? (
          <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              className="dim"
              style={{ borderBottom: "1px solid var(--line)", padding: "10px 16px", fontSize: 12 }}
            >
              <strong>Subject:</strong>{" "}
              {previewSubject || `How was your experience at ${businessName}?`}
            </div>
            <div style={{ padding: 24, background: "var(--surface-2)" }}>
              <div
                style={{
                  maxWidth: 520,
                  margin: "0 auto",
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  padding: 28,
                }}
              >
                {initial.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={initial.logoUrl}
                    alt=""
                    style={{ maxHeight: 44, marginBottom: 16, display: "block" }}
                  />
                ) : (
                  <div
                    style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 16 }}
                  >
                    {businessName}
                  </div>
                )}
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    color: "var(--ink-2)",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {previewBody}
                </div>
                <div style={{ margin: "22px 0" }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "var(--pri)",
                      color: "#fff",
                      padding: "11px 22px",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Leave a Review →
                  </span>
                </div>
                <hr
                  style={{ border: "none", borderTop: "1px solid var(--line)", margin: "20px 0" }}
                />
                <p className="dim" style={{ fontSize: 11 }}>
                  Don't want these emails? Unsubscribe anytime.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="ds-card">
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 8 }}>
              <strong>SMS to:</strong> +15551234567
            </div>
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                color: "var(--ink-2)",
              }}
            >
              {previewBody || "Your message preview appears here."}
            </div>
            <p className="dim" style={{ fontSize: 10.5, marginTop: 8 }}>
              Reply STOP to opt out. An unsubscribe footer is added automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
