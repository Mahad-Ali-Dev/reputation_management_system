import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { saveAiTraining } from "@/lib/ai/training-actions";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";

/**
 * AI Training & Voice — repulabs v2 design.
 *
 * Single form bound to saveAiTraining server action. Real data: full
 * AiTrainingProfile loaded by tenant. Hero "readiness" ribbon shows a
 * computed completeness score from the profile fields.
 */

export const dynamic = "force-dynamic";

const DAYS = [
  { key: "monday", label: "Mo" },
  { key: "tuesday", label: "Tu" },
  { key: "wednesday", label: "We" },
  { key: "thursday", label: "Th" },
  { key: "friday", label: "Fr" },
  { key: "saturday", label: "Sa" },
  { key: "sunday", label: "Su" },
] as const;

type OperatingHours = Record<string, { open?: string; close?: string }>;

function readiness(
  profile: {
    businessOverview: string | null;
    servicesProducts: string | null;
    pricingDetails: string | null;
    customPrompt: string | null;
    operatingHours: unknown;
  } | null,
): number {
  if (!profile) return 0;
  let score = 0;
  if (profile.businessOverview && profile.businessOverview.length > 40) score += 25;
  if (profile.servicesProducts && profile.servicesProducts.length > 30) score += 20;
  if (profile.pricingDetails && profile.pricingDetails.length > 30) score += 20;
  if (profile.customPrompt && profile.customPrompt.length > 100) score += 15;
  const hours = (profile.operatingHours as OperatingHours | null) ?? {};
  const open = Object.values(hours).filter((d) => d?.open && d?.close).length;
  score += Math.min(20, open * 3);
  return Math.min(100, score);
}

export default async function AiTrainingPage() {
  const { orgId } = await getOrgContext();

  const profile = await withTenant(orgId, async (tx) =>
    tx.aiTrainingProfile.findUnique({ where: { organizationId: orgId } }),
  );

  const hours = (profile?.operatingHours as OperatingHours | null) ?? {};
  const score = readiness(profile);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Intelligence", "AI Training"]}>
      <PageHeader
        kicker="The brain behind every reply"
        title="AI training & voice"
        description="Teach your AI assistant about your business, brand voice and pricing. It uses this to answer reviews, DMs, surveys and phone calls — without sounding like a bot."
        actions={
          <button type="button" className="btn btn--pri" form="ai-training-form">
            <Icon name="sparkle" size={12} />
            Save & retrain
          </button>
        }
      />

      {/* Readiness ribbon */}
      <div
        className="ds-card spot"
        style={{ marginBottom: 18, overflow: "hidden", position: "relative" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -80,
            top: -80,
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "rgba(255,255,255,.12)",
          }}
        />
        <div
          style={{
            padding: 22,
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 22,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.15)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Icon name="brain" size={50} stroke={1.2} style={{ opacity: 0.9 }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span
                style={{
                  background: "rgba(255,255,255,.15)",
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {profile ? `Trained ${relativeTime(profile.updatedAt)}` : "Not trained yet"}
              </span>
            </div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 600,
                margin: 0,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              Brain readiness · {score}%
            </h2>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, maxWidth: 480 }}>
              {score >= 90
                ? "Strong knowledge base. Your AI is ready to answer with confidence."
                : score >= 70
                  ? "Solid foundation. Add pricing or refund details to push past 95%."
                  : "Fill in the business overview, services and hours below to unlock full AI quality."}
            </div>
          </div>
        </div>
      </div>

      <form id="ai-training-form" action={saveAiTraining}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 400px",
            gap: 22,
            alignItems: "flex-start",
          }}
        >
          <div className="col" style={{ gap: 14 }}>
            {/* Business overview */}
            <div className="ds-card">
              <div className="ds-card__head">
                <div>
                  <h3 className="ds-card__title">Business overview</h3>
                  <div className="ds-card__sub">Core context · used in every reply</div>
                </div>
              </div>
              <div className="ds-card__body">
                <TextareaField
                  name="businessOverview"
                  label="What does your business do?"
                  defaultValue={profile?.businessOverview ?? ""}
                  rows={3}
                  maxLength={2000}
                  placeholder="We're a family-owned hair salon in Springfield serving busy professionals since 2019."
                />
                <div style={{ height: 12 }} />
                <TextareaField
                  name="servicesProducts"
                  label="Services / Products"
                  defaultValue={profile?.servicesProducts ?? ""}
                  rows={3}
                  maxLength={2000}
                  placeholder="Haircuts ($35-65), color ($85-150), balayage ($180+)."
                />
                <div style={{ height: 12 }} />
                <TextareaField
                  name="pricingDetails"
                  label="Pricing & payment"
                  defaultValue={profile?.pricingDetails ?? ""}
                  rows={2}
                  maxLength={2000}
                  placeholder="We accept Visa, MC, Amex, Apple Pay, cash. 20% gratuity standard."
                />
              </div>
            </div>

            {/* Operating hours */}
            <div className="ds-card">
              <div className="ds-card__head">
                <h3 className="ds-card__title">Hours & locations</h3>
                <span className="chip chip--ok">
                  <span className="live" />
                  Open now
                </span>
              </div>
              <div className="ds-card__body">
                <div className="row" style={{ gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                  {DAYS.map((d, i) => {
                    const h = hours[d.key];
                    const on = !!(h?.open && h?.close);
                    const today = i === todayIdx;
                    return (
                      <span
                        key={d.key}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: today
                            ? "var(--pri)"
                            : on
                              ? "var(--pri-50)"
                              : "var(--surface-3)",
                          color: today ? "#fff" : on ? "var(--pri)" : "var(--rl-muted)",
                          border: `1px solid ${
                            today ? "var(--pri)" : on ? "var(--pri-100)" : "var(--line)"
                          }`,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {d.label}
                      </span>
                    );
                  })}
                </div>
                <div className="col" style={{ gap: 8 }}>
                  {DAYS.map((d) => {
                    const h = hours[d.key] ?? {};
                    return (
                      <div key={d.key} className="row" style={{ gap: 12, fontSize: 13 }}>
                        <span style={{ width: 44, fontWeight: 500 }}>{d.label}</span>
                        <input
                          type="time"
                          name={`${d.key}.open`}
                          defaultValue={h.open ?? ""}
                          style={inputStyle}
                        />
                        <span className="dim">to</span>
                        <input
                          type="time"
                          name={`${d.key}.close`}
                          defaultValue={h.close ?? ""}
                          style={inputStyle}
                        />
                        <span className="dim" style={{ fontSize: 11 }}>
                          blank = closed
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Custom prompt */}
            <div className="ds-card">
              <div className="ds-card__head">
                <h3 className="ds-card__title">Custom training prompt</h3>
                <div className="ds-card__sub">250–3,000 chars</div>
              </div>
              <div className="ds-card__body">
                <textarea
                  name="customPrompt"
                  defaultValue={profile?.customPrompt ?? ""}
                  rows={8}
                  minLength={250}
                  maxLength={3000}
                  placeholder={`Holiday hours: closed Dec 24-26 and Jan 1.\n\nNever mention competitor names. If asked about "Salon X", just say "I can only speak about our services".\n\nWe always offer first-time clients a 10% discount on bookings over $100.`}
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
              </div>
            </div>
          </div>

          {/* Right column — voice & behavior */}
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
                  defaultValue={profile?.aiPersonalityStyle ?? "friendly"}
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
                  defaultValue={profile?.customerInquiryStyle ?? "warm_intro_quick_qualification"}
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
                  defaultValue={profile?.bookingStyle ?? "propose_time_slots"}
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
                  defaultValue={profile?.complaintStyle ?? "apologize_propose_fix"}
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
                  defaultValue={profile?.supportStyle ?? "check_in_after_purchase"}
                  options={[
                    ["check_in_after_purchase", "Check-in after purchase"],
                    ["reactive_only", "Reactive only"],
                    ["proactive_recommendations", "Proactive recommendations"],
                  ]}
                />
              </div>
            </div>

            <div
              className="ds-card ds-card--pri"
              style={{ padding: 18, fontSize: 12.5, lineHeight: 1.55 }}
            >
              <div className="row" style={{ marginBottom: 8 }}>
                <Icon name="info" size={14} style={{ color: "var(--pri)" }} />
                <strong>Brand voice signal</strong>
              </div>
              The AI learns from every approved review reply you publish. The more replies you
              approve, the closer the AI gets to your authentic voice.
            </div>
          </div>
        </div>
      </form>
    </AppShellServer>
  );
}

const inputStyle = {
  height: 32,
  padding: "0 10px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--f-mono)",
  fontSize: 12,
  outline: "none",
} as const;

function TextareaField({
  label,
  name,
  defaultValue,
  rows,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <span className="lbl">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: "var(--r)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: "var(--f-ui)",
          fontSize: 13,
          lineHeight: 1.6,
          outline: "none",
          resize: "vertical",
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        style={{
          width: "100%",
          height: 38,
          padding: "0 32px 0 14px",
          borderRadius: "var(--r)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: "var(--f-ui)",
          fontSize: 13,
          outline: "none",
          appearance: "none",
        }}
      >
        {options.map(([value, label_]) => (
          <option key={value} value={value}>
            {label_}
          </option>
        ))}
      </select>
    </label>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
