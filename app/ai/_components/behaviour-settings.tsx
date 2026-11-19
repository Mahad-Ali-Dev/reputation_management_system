"use client";

import { GlassSelect } from "@/components/ui/glass-select";
import { autosaveAiTraining } from "@/lib/ai/training-actions";
import {
  Check,
  CircleCheck,
  MessageCircleReply,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Smile,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@/components/ui/glass-sheet.css";

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

const RULES: Array<{ title: string; detail: string }> = [
  {
    title: "Be polite, respectful and professional",
    detail: "Every reply is screened for a toxic or hostile tone before it can be sent.",
  },
  {
    title: "Never make up information",
    detail: "Unverifiable factual claims are flagged and blocked rather than shipped.",
  },
  {
    title: "Do not guarantee results",
    detail: "Medical, legal and financial claims are blocked those need a human's sign-off.",
  },
  {
    title: "Protect customer privacy",
    detail:
      "Replies can't introduce emails, phone numbers or names that weren't already in the conversation.",
  },
  {
    title: "Follow business policies",
    detail: "Off-brand language is flagged so replies stay consistent with how you run things.",
  },
  {
    title: "Stay on topic and concise",
    detail: "Attempts to redirect the AI off-task (prompt injection) are detected and refused.",
  },
];

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
  const [rulesOpen, setRulesOpen] = useState(false);

  const dirty = status === "dirty" || status === "error";

  // Esc closes the rules dialog; lock body scroll while it's open.
  useEffect(() => {
    if (!rulesOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRulesOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [rulesOpen]);

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

  const opts = (o: Array<[string, string]>) => o.map(([value, label]) => ({ value, label }));

  return (
    <div className="kb-beh">
      <header className="kb-section-head">
        <div>
          <h2 className="kb-section-title">How your AI talks</h2>
          <p className="kb-card__sub">
            Its voice and how it handles questions, complaints and support. Applies to reviews, DMs
            and surveys.
          </p>
        </div>
      </header>

      <div className="kb-beh__grid">
        <div className="kb-stack">
          {/* Voice */}
          <section className="kb-card kb-card--flush" aria-labelledby="beh-voice">
            <h3 id="beh-voice" className="kb-group-title">
              <Smile size={16} strokeWidth={1.8} /> Voice
            </h3>
            <div className="kb-setting">
              <div className="kb-setting__text">
                <span className="kb-setting__t">Personality</span>
                <span className="kb-setting__d">How it sounds to customers</span>
              </div>
              <div className="kb-setting__ctl">
                <GlassSelect
                  options={opts(PERSONALITY_OPTS)}
                  value={fields.aiPersonalityStyle}
                  onChange={(v) => patch({ aiPersonalityStyle: v })}
                  ariaLabel="Personality"
                />
              </div>
            </div>
            <div className="kb-setting">
              <div className="kb-setting__text">
                <span className="kb-setting__t">Customer questions</span>
                <span className="kb-setting__d">How it opens an inquiry</span>
              </div>
              <div className="kb-setting__ctl">
                <GlassSelect
                  options={opts(INQUIRY_OPTS)}
                  value={fields.customerInquiryStyle}
                  onChange={(v) => patch({ customerInquiryStyle: v })}
                  ariaLabel="Customer inquiry style"
                />
              </div>
            </div>
          </section>

          {/* Responses */}
          <section className="kb-card kb-card--flush" aria-labelledby="beh-resp">
            <h3 id="beh-resp" className="kb-group-title">
              <MessageCircleReply size={16} strokeWidth={1.8} /> Responses
            </h3>
            {/* Booking row hidden with the AI Receptionist (see BOOKING_OPTS). */}
            <div className="kb-setting">
              <div className="kb-setting__text">
                <span className="kb-setting__t">Complaints</span>
                <span className="kb-setting__d">When a customer is unhappy</span>
              </div>
              <div className="kb-setting__ctl">
                <GlassSelect
                  options={opts(COMPLAINT_OPTS)}
                  value={fields.complaintStyle}
                  onChange={(v) => patch({ complaintStyle: v })}
                  ariaLabel="Complaint handling"
                />
              </div>
            </div>
            <div className="kb-setting">
              <div className="kb-setting__text">
                <span className="kb-setting__t">Support</span>
                <span className="kb-setting__d">How it looks after customers</span>
              </div>
              <div className="kb-setting__ctl">
                <GlassSelect
                  options={opts(SUPPORT_OPTS)}
                  value={fields.supportStyle}
                  onChange={(v) => patch({ supportStyle: v })}
                  ariaLabel="Customer support"
                />
              </div>
            </div>
          </section>

          {/* Custom instructions */}
          <section className="kb-card" aria-labelledby="beh-custom-title">
            <h3 id="beh-custom-title" className="kb-group-title kb-group-title--in">
              <PenLine size={16} strokeWidth={1.8} /> Custom instructions
            </h3>
            <textarea
              id="beh-custom"
              aria-labelledby="beh-custom-title"
              value={fields.customPrompt}
              onChange={(e) => patch({ customPrompt: e.target.value })}
              maxLength={3000}
              rows={5}
              placeholder="Holiday hours, things never to say, first-time discounts…"
              className="kb-textarea"
            />
            <p className="kb-hint">
              {fields.customPrompt.length.toLocaleString()} / 3,000 · Answers you teach in Test are
              added here automatically.
            </p>
          </section>
        </div>

        {/* Always-on rules */}
        <section className="kb-card kb-rules" aria-labelledby="beh-rules">
          <span className="kb-badge kb-badge--green" aria-hidden="true">
            <ShieldCheck size={22} strokeWidth={1.8} />
          </span>
          <h3 id="beh-rules" className="kb-card__title">
            Always-on rules
          </h3>
          <p className="kb-card__sub">
            A safety check enforces these on every reply. They can&apos;t be switched off.
          </p>
          <ul className="kb-checks">
            {RULES.map((r) => (
              <li key={r.title}>
                <span className="kb-checks__tick" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
                {r.title}
              </li>
            ))}
          </ul>
          <button type="button" className="kb-pill" onClick={() => setRulesOpen(true)}>
            What each rule does
          </button>
        </section>
      </div>

      {/* Save bar */}
      <div className="kb-savebar">
        <button type="button" className="kb-pill" onClick={reset} disabled={!dirty}>
          <RotateCcw size={15} strokeWidth={1.8} />
          Reset
        </button>
        <span className="kb-savebar__status" aria-live="polite">
          {status === "saved" && (
            <>
              <CircleCheck size={16} strokeWidth={2} className="kb-ok" /> All changes saved
            </>
          )}
          {status === "dirty" && <span className="kb-warn">Unsaved changes</span>}
          {status === "error" && (
            <span role="alert" className="kb-bad">
              Couldn&apos;t save. Try again.
            </span>
          )}
        </span>
        <button
          type="button"
          className="kb-pill kb-pill--pri"
          onClick={save}
          disabled={status === "saving" || status === "saved"}
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>

      {rulesOpen && (
        // biome-ignore lint/a11y/useSemanticElements: overlay dialog; matches the other glass sheets
        <div
          className="gs-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kb-rules-title"
        >
          <button
            type="button"
            aria-label="Close"
            className="gs-scrim"
            onClick={() => setRulesOpen(false)}
          />
          <div className="gs">
            <button
              type="button"
              aria-label="Close"
              className="gs__close"
              onClick={() => setRulesOpen(false)}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
            <div className="gs__hero">
              <span className="gs__badge" aria-hidden="true">
                <ShieldCheck size={28} strokeWidth={1.7} />
              </span>
              <h2 id="kb-rules-title" className="gs__title">
                Always-on rules
              </h2>
              <p className="gs__sub">
                Checked automatically on every AI reply, on every channel, so your customers are
                always covered.
              </p>
            </div>
            <div className="gs__body">
              <div className="gs-group">
                {RULES.map((r) => (
                  <div className="kb-rule-item" key={r.title}>
                    <span className="kb-checks__tick" aria-hidden="true">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <div>
                      <div className="kb-list__t">{r.title}</div>
                      <div className="kb-list__d">{r.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="gs__foot">
              <button
                type="button"
                className="gs-btn gs-btn--pri"
                onClick={() => setRulesOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
