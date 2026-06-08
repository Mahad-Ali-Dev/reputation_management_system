"use client";

import { Icon } from "@/components/shell/icon";
import { SelectField } from "./shared";

/**
 * Personality (Voice & Behaviour) panel + the Custom Instructions textarea
 * (the spec's "direct prompt injection"). Controlled by the parent KbTabs so
 * autosave sends the complete profile.
 */
export type PersonalityFields = {
  aiPersonalityStyle: string;
  customerInquiryStyle: string;
  bookingStyle: string;
  complaintStyle: string;
  supportStyle: string;
  customPrompt: string;
};

export function PersonalityTab({
  fields,
  onChange,
}: {
  fields: PersonalityFields;
  onChange: (patch: Partial<PersonalityFields>) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 380px",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Voice & behavior</h3>
            <div className="ds-card__sub">How the AI should sound</div>
          </div>
          <div className="ds-card__body">
            <SelectField
              label="Personality"
              name="aiPersonalityStyle"
              value={fields.aiPersonalityStyle}
              onChange={(v) => onChange({ aiPersonalityStyle: v })}
              options={[
                ["friendly", "Friendly"],
                ["professional", "Professional"],
                ["playful", "Playful"],
                ["concise", "Concise"],
              ]}
            />
            <div style={{ height: 12 }} />
            <SelectField
              label="Customer inquiry style"
              name="customerInquiryStyle"
              value={fields.customerInquiryStyle}
              onChange={(v) => onChange({ customerInquiryStyle: v })}
              options={[
                ["warm_intro_quick_qualification", "Warm intro + quick qualification"],
                ["direct_answer_only", "Direct answer only"],
                ["upsell_relevant_services", "Upsell relevant services"],
              ]}
            />
            <div style={{ height: 12 }} />
            <SelectField
              label="Booking style"
              name="bookingStyle"
              value={fields.bookingStyle}
              onChange={(v) => onChange({ bookingStyle: v })}
              options={[
                ["propose_time_slots", "Propose time slots"],
                ["link_to_booking_page", "Link to booking page"],
                ["ask_for_preferred_time", "Ask for preferred time"],
              ]}
            />
            <div style={{ height: 12 }} />
            <SelectField
              label="Complaint handling"
              name="complaintStyle"
              value={fields.complaintStyle}
              onChange={(v) => onChange({ complaintStyle: v })}
              options={[
                ["apologize_propose_fix", "Apologize + propose fix"],
                ["escalate_to_human", "Escalate to human"],
                ["acknowledge_and_log", "Acknowledge and log"],
              ]}
            />
            <div style={{ height: 12 }} />
            <SelectField
              label="Customer support"
              name="supportStyle"
              value={fields.supportStyle}
              onChange={(v) => onChange({ supportStyle: v })}
              options={[
                ["check_in_after_purchase", "Check-in after purchase"],
                ["reactive_only", "Reactive only"],
                ["proactive_recommendations", "Proactive recommendations"],
              ]}
            />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Custom instructions</h3>
            <div className="ds-card__sub">Direct rules · up to 3,000 chars</div>
          </div>
          <div className="ds-card__body">
            <textarea
              name="customPrompt"
              value={fields.customPrompt}
              onChange={(e) => onChange({ customPrompt: e.target.value })}
              rows={8}
              maxLength={3000}
              placeholder={`Holiday hours: closed Dec 24-26 and Jan 1.\n\nNever mention competitor names. If asked about "Salon X", just say "I can only speak about our services".\n\nFirst-time clients get 10% off bookings over $100.`}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--r)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                lineHeight: 1.6,
                outline: "none",
                resize: "vertical",
              }}
            />
            <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
              {fields.customPrompt.length}/3,000 · answers you teach in the Learning Monitor are
              appended here automatically.
            </div>
          </div>
        </div>
      </div>

      <div className="ds-card ds-card--pri" style={{ padding: 18, fontSize: 12.5, lineHeight: 1.55 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <Icon name="info" size={14} style={{ color: "var(--pri)" }} />
          <strong>Brand voice signal</strong>
        </div>
        The AI learns from every approved review reply you publish. The more replies you approve, the
        closer it gets to your authentic voice.
      </div>
    </div>
  );
}
