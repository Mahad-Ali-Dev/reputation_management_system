"use client";

import { Icon } from "@/components/shell/icon";
import { DAYS, type OperatingHours, inputStyle, TextareaField } from "./shared";

/**
 * Business Info panel — the scraped/edited business facts. Controlled by the
 * parent KbTabs (single source of truth so autosave always sends complete data,
 * never clobbering one field while editing another).
 *
 * Bug fixes here:
 *   - Business Locations has its OWN block + a correct placeholder (was sitting
 *     under the Pricing header with a wrong placeholder).
 */
export type BusinessFields = {
  businessOverview: string;
  servicesProducts: string;
  pricingDetails: string;
  locations: string;
  operatingHours: OperatingHours;
};

export function BusinessInfoTab({
  fields,
  onChange,
}: {
  fields: BusinessFields;
  onChange: (patch: Partial<BusinessFields>) => void;
}) {
  const hours = fields.operatingHours ?? {};
  const todayIdx = (new Date().getDay() + 6) % 7;

  function setHour(day: string, edge: "open" | "close", v: string) {
    const next: OperatingHours = { ...hours, [day]: { ...(hours[day] ?? {}), [edge]: v } };
    onChange({ operatingHours: next });
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* Business overview + services + pricing */}
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
            value={fields.businessOverview}
            onChange={(v) => onChange({ businessOverview: v })}
            rows={3}
            maxLength={2000}
            placeholder="We're a family-owned hair salon in Springfield serving busy professionals since 2019."
          />
          <div style={{ height: 12 }} />
          <TextareaField
            name="servicesProducts"
            label="Services / Products"
            value={fields.servicesProducts}
            onChange={(v) => onChange({ servicesProducts: v })}
            rows={3}
            maxLength={2000}
            placeholder="Haircuts ($35-65), color ($85-150), balayage ($180+)."
          />
          <div style={{ height: 12 }} />
          <TextareaField
            name="pricingDetails"
            label="Pricing & payment"
            value={fields.pricingDetails}
            onChange={(v) => onChange({ pricingDetails: v })}
            rows={2}
            maxLength={2000}
            placeholder="We accept Visa, MC, Amex, Apple Pay, cash. 20% gratuity standard."
          />
        </div>
      </div>

      {/* Locations — its OWN block (bug fix) */}
      <div className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Business locations</h3>
            <div className="ds-card__sub">Where customers can find you</div>
          </div>
        </div>
        <div className="ds-card__body">
          <TextareaField
            name="locations"
            label="Locations / addresses"
            value={fields.locations}
            onChange={(v) => onChange({ locations: v })}
            rows={3}
            maxLength={2000}
            placeholder="123 Main St, Springfield, IL 62704&#10;456 Oak Ave, Lincoln, IL 62656"
          />
        </div>
      </div>

      {/* Operating hours */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Operating hours</h3>
          <span className="chip chip--info">
            <Icon name="clock" size={12} />
            Blank = closed
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
                    background: today ? "var(--pri)" : on ? "var(--pri-50)" : "var(--surface-3)",
                    color: today ? "#fff" : on ? "var(--pri)" : "var(--rl-muted)",
                    border: `1px solid ${today ? "var(--pri)" : on ? "var(--pri-100)" : "var(--line)"}`,
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
                    value={h.open ?? ""}
                    onChange={(e) => setHour(d.key, "open", e.target.value)}
                    style={inputStyle}
                  />
                  <span className="dim">to</span>
                  <input
                    type="time"
                    name={`${d.key}.close`}
                    value={h.close ?? ""}
                    onChange={(e) => setHour(d.key, "close", e.target.value)}
                    style={inputStyle}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
