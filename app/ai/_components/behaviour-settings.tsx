"use client";

import { Icon } from "@/components/shell/icon";
import { autosaveAiTraining } from "@/lib/ai/training-actions";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";

/**
 * Behaviour tab — kit "AI Behaviour Settings" surface.
 *
 * Faithfully renders the kit's summary strip + three setting cards + channel
 * info bar + footer actions, but every editable control is bound to a REAL
 * column on `AiTrainingProfile` (the same fields the legacy /ai?tab=behaviour
 * panel edits) and saved through the EXISTING `saveAiTraining` /
 * `autosaveAiTraining` server actions — no invented storage.
 *
 * The kit's free-form voice sliders / answer-confidence dropdowns have no
 * backing column, so per the build rules they are omitted in favour of the
 * categorical voice/behaviour selects that ARE persisted. The "Conversation
 * rules" card shows the real, always-on safety rules enforced by
 * lib/ai/assist/safety.ts (not user-editable — matching the all-enabled mockup).
 */

const ASSET = "/assets/repulabs/ai-kb";

export type BehaviourFields = {
  aiPersonalityStyle: string;
  customerInquiryStyle: string;
  bookingStyle: string;
  complaintStyle: string;
  supportStyle: string;
  customPrompt: string;
};

const PERSONALITY_OPTS: Array<[string, string]> = [
  ["friendly", "Friendly & helpful"],
  ["professional", "Professional"],
  ["playful", "Playful"],
  ["concise", "Concise"],
];
const INQUIRY_OPTS: Array<[string, string]> = [
  ["warm_intro_quick_qualification", "Warm intro + quick qualification"],
  ["direct_answer_only", "Direct answer only"],
  ["upsell_relevant_services", "Upsell relevant services"],
];
const BOOKING_OPTS: Array<[string, string]> = [
  ["propose_time_slots", "Propose time slots"],
  ["link_to_booking_page", "Link to booking page"],
  ["ask_for_preferred_time", "Ask for preferred time"],
];
const COMPLAINT_OPTS: Array<[string, string]> = [
  ["apologize_propose_fix", "Apologize + propose a fix"],
  ["escalate_to_human", "Escalate to human"],
  ["acknowledge_and_log", "Acknowledge and log"],
];
const SUPPORT_OPTS: Array<[string, string]> = [
  ["check_in_after_purchase", "Check in after purchase"],
  ["reactive_only", "Reactive only"],
  ["proactive_recommendations", "Proactive recommendations"],
];

const RULES = [
  "Be polite, respectful and professional",
  "Never make up information",
  "Do not guarantee results",
  "Protect customer privacy",
  "Follow business policies",
  "Stay on topic and concise",
];

function labelFor(opts: Array<[string, string]>, value: string): string {
  return opts.find(([v]) => v === value)?.[1] ?? "Not set";
}

function toFormData(f: BehaviourFields): FormData {
  const fd = new FormData();
  fd.set("aiPersonalityStyle", f.aiPersonalityStyle);
  fd.set("customerInquiryStyle", f.customerInquiryStyle);
  fd.set("bookingStyle", f.bookingStyle);
  fd.set("complaintStyle", f.complaintStyle);
  fd.set("supportStyle", f.supportStyle);
  fd.set("customPrompt", f.customPrompt);
  return fd;
}

export function BehaviourSettings({ initial }: { initial: BehaviourFields }) {
  const [fields, setFields] = useState<BehaviourFields>(initial);
  const savedRef = useRef<BehaviourFields>(initial);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");

  const dirty = status === "dirty" || status === "error";

  function patch(p: Partial<BehaviourFields>) {
    setFields((f) => ({ ...f, ...p }));
    setStatus("dirty");
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await autosaveAiTraining(toFormData(fields));
      if (res.ok) {
        savedRef.current = fields;
        setStatus("saved");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  function reset() {
    setFields(savedRef.current);
    setStatus("saved");
  }

  const summary = useMemo(
    () => [
      {
        icon: "beh-voice-tone.svg",
        t: "Voice & tone",
        v: labelFor(PERSONALITY_OPTS, fields.aiPersonalityStyle),
      },
      {
        icon: "beh-customer-inquiry.svg",
        t: "Customer inquiry style",
        v: labelFor(INQUIRY_OPTS, fields.customerInquiryStyle),
      },
      // Booking style is an AI RECEPTIONIST concern (taking bookings on a call).
      // That module is behind the Coming Soon lock, so the setting is hidden
      // until it ships. Commented out rather than deleted — `bookingStyle` is
      // still persisted, so restoring this is uncommenting.
      {
        icon: "beh-language.svg",
        t: "Complaint handling",
        v: labelFor(COMPLAINT_OPTS, fields.complaintStyle),
      },
      {
        icon: "beh-sentence-length.svg",
        t: "Customer support",
        v: labelFor(SUPPORT_OPTS, fields.supportStyle),
      },
      {
        icon: "beh-emoji.svg",
        t: "Custom instructions",
        v:
          fields.customPrompt.trim().length > 0
            ? `${fields.customPrompt.trim().length} chars`
            : "Not set",
      },
    ],
    [fields],
  );

  return (
    <div>
      {/* page header */}
      <div className="akb-beh-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="akb-beh-head__title">AI Behaviour Settings</h2>
          <p className="akb-beh-head__sub">
            Control how your AI speaks, responds and handles different situations.
          </p>
        </div>
        {/* Preview uses the live tester in the Test tab with the current settings. */}
        <a className="akb-btn-outline" href="/ai?tab=test">
          <Icon name="eye" size={15} />
          Preview response
        </a>
      </div>

      {/* summary strip (live values) */}
      <div className="akb-summary-strip">
        {summary.map((s) => (
          <div className="akb-summary-item" key={s.t}>
            <span className="akb-summary-item__icon" aria-hidden="true">
              <Image src={`${ASSET}/${s.icon}`} alt="" width={44} height={44} unoptimized />
            </span>
            <span style={{ minWidth: 0 }}>
              <div className="akb-summary-item__t">{s.t}</div>
              <div className="akb-summary-item__v">{s.v}</div>
            </span>
          </div>
        ))}
      </div>

      {/* three setting cards */}
      <div className="akb-beh-grid">
        {/* Voice & tone */}
        <div className="akb-beh-card">
          <h3 className="akb-beh-card__title">Voice &amp; tone</h3>
          <p className="akb-beh-card__sub">
            Define the personality your AI uses when talking to customers.
          </p>

          <div className="akb-resp-row">
            <label className="akb-resp-row__l" htmlFor="beh-personality">
              Personality
            </label>
            <select
              id="beh-personality"
              className="akb-select"
              value={fields.aiPersonalityStyle}
              onChange={(e) => patch({ aiPersonalityStyle: e.target.value })}
            >
              {PERSONALITY_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="akb-resp-row">
            <label className="akb-resp-row__l" htmlFor="beh-inquiry">
              Customer inquiry style
            </label>
            <select
              id="beh-inquiry"
              className="akb-select"
              value={fields.customerInquiryStyle}
              onChange={(e) => patch({ customerInquiryStyle: e.target.value })}
            >
              {INQUIRY_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="akb-tip">
            <Image
              src={`${ASSET}/beh-tips.svg`}
              alt=""
              width={18}
              height={18}
              unoptimized
              aria-hidden="true"
            />
            <span>
              Tip: These settings help your AI sound consistent across every conversation.
            </span>
          </div>
        </div>

        {/* Response behaviour */}
        <div className="akb-beh-card">
          <h3 className="akb-beh-card__title">Response behaviour</h3>
          <p className="akb-beh-card__sub">Set how your AI should respond in conversations.</p>

          {/* Booking row hidden with the AI Receptionist (see BOOKING_OPTS). */}
          <div className="akb-resp-row">
            <label className="akb-resp-row__l" htmlFor="beh-complaint">
              Complaint handling
            </label>
            <select
              id="beh-complaint"
              className="akb-select"
              value={fields.complaintStyle}
              onChange={(e) => patch({ complaintStyle: e.target.value })}
            >
              {COMPLAINT_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="akb-resp-row">
            <label className="akb-resp-row__l" htmlFor="beh-support">
              Customer support
            </label>
            <select
              id="beh-support"
              className="akb-select"
              value={fields.supportStyle}
              onChange={(e) => patch({ supportStyle: e.target.value })}
            >
              {SUPPORT_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 18 }}>
            <label
              className="akb-resp-row__l"
              htmlFor="beh-custom"
              style={{ display: "block", marginBottom: 6 }}
            >
              Custom instructions
            </label>
            <textarea
              id="beh-custom"
              value={fields.customPrompt}
              onChange={(e) => patch({ customPrompt: e.target.value })}
              maxLength={3000}
              rows={5}
              placeholder="Holiday hours, things never to say, first-time discounts…"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--akb-divider)",
                fontFamily: "var(--f-mono, monospace)",
                fontSize: 12,
                lineHeight: 1.6,
                resize: "vertical",
                color: "var(--akb-ink)",
                background: "#fff",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--akb-muted)", marginTop: 4 }}>
              {fields.customPrompt.length}/3,000 · answers you teach in Test are appended here
              automatically.
            </div>
          </div>

          <div className="akb-tip">
            <Image
              src={`${ASSET}/beh-tips.svg`}
              alt=""
              width={18}
              height={18}
              unoptimized
              aria-hidden="true"
            />
            <span>These help your AI choose the right way to respond in every situation.</span>
          </div>
        </div>

        {/* Conversation rules (always-on safety guarantees) */}
        <div className="akb-beh-card">
          <h3 className="akb-beh-card__title">Conversation rules</h3>
          <p className="akb-beh-card__sub">
            Guidelines your AI always follows. Enforced automatically on every reply.
          </p>

          <div className="akb-rules">
            {RULES.map((r) => (
              <div className="akb-rule" key={r}>
                <span className="akb-rule__check" aria-hidden="true">
                  <Icon name="check" size={13} />
                </span>
                {r}
              </div>
            ))}
          </div>

          <a className="akb-btn-outline" href="/ai?tab=behaviour" style={{ marginTop: 24 }}>
            <Image
              src={`${ASSET}/beh-manage-rules.svg`}
              alt=""
              width={16}
              height={16}
              unoptimized
              aria-hidden="true"
            />
            Manage rules
          </a>
        </div>
      </div>

      {/* channel info bar */}
      <div className="akb-beh-info">
        <Image
          src={`${ASSET}/beh-info.svg`}
          alt=""
          width={20}
          height={20}
          unoptimized
          aria-hidden="true"
        />
        <span>
          These behaviour settings apply across all AI channels: Reviews, DMs and Surveys.
        </span>
      </div>

      {/* footer actions */}
      <div className="akb-beh-foot">
        <button type="button" className="akb-btn-outline" onClick={reset} disabled={!dirty}>
          <Icon name="refresh" size={15} />
          Reset changes
        </button>
        <div className="akb-beh-foot__spacer" />
        <button
          type="button"
          className="akb-btn-primary"
          onClick={save}
          disabled={status === "saving" || status === "saved"}
        >
          <Icon name="check" size={15} />
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        <span
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {status === "saved" && (
            <>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "var(--akb-success-soft)",
                  color: "var(--akb-success)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="check" size={13} />
              </span>
              All changes saved
            </>
          )}
          {status === "dirty" && (
            <span style={{ color: "var(--akb-warning-text)" }}>Unsaved changes</span>
          )}
          {status === "error" && (
            <span role="alert" style={{ color: "#e14d62" }}>
              Save failed — retry
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
