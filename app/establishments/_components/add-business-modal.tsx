"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { createEstablishment } from "@/lib/establishments/actions";
import { type ReactNode, useEffect, useState } from "react";

/**
 * Add New Business — opens the create form in a glass modal (instead of
 * navigating to /establishments/new). Posts the same `createEstablishment`
 * server action, which redirects to the new establishment on success.
 */

const CATEGORY_OPTIONS = [
  "Cafe",
  "Restaurant",
  "Retail",
  "Dental",
  "Salon",
  "Fitness",
  "Automotive",
  "IT Services",
  "Professional Services",
  "Other",
] as const;

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

const COUNTRY_OPTIONS = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Pakistan",
  "United Arab Emirates",
  "Singapore",
  "Germany",
  "France",
  "Other",
] as const;

export function AddBusinessModal({
  triggerClassName = "est-btn est-btn--pri",
  children,
}: {
  /** Class for the trigger element (defaults to the primary button). */
  triggerClassName?: string;
  /** Custom trigger content (defaults to a + icon and "Add New Business"). */
  children?: ReactNode;
} = {}) {
  const [open, setOpen] = useState(false);

  // Esc to close + lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Icon name="plus" size={16} />
            Add New Business
          </>
        )}
      </button>

      {open && (
        <div className="estm-overlay" role="dialog" aria-modal="true" aria-label="Add new business">
          <button
            type="button"
            className="estm-scrim"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="estm">
            <div className="estm__head">
              <div>
                <span className="estm__eyebrow">New Business</span>
                <h2 className="estm__title">Add New Business</h2>
              </div>
              <button
                type="button"
                className="estm__close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="estm__sub">
              A business you want to manage reviews for. You&apos;ll connect its Google Business
              Profile in the next step.
            </p>

            <form action={createEstablishment} className="estm__form">
              <div className="est-formgrid">
                <div className="est-formgrid__full">
                  <Field
                    label="Name"
                    name="name"
                    required
                    icon="building"
                    placeholder="Acme Coffee Downtown"
                  />
                </div>

                <SelectField
                  label="Category"
                  name="category"
                  icon="tag"
                  placeholder="cafe / dental / salon / ..."
                  options={CATEGORY_OPTIONS}
                />
                <SelectField
                  label="Timezone"
                  name="timezone"
                  icon="clock"
                  defaultValue="UTC"
                  options={TIMEZONE_OPTIONS}
                />

                <div className="est-field est-formgrid__full">
                  <span className="est-field__lbl">
                    Address{" "}
                    <span style={{ color: "var(--est-muted-2)", fontWeight: 400 }}>· Street</span>
                  </span>
                  <InputBase name="address_line1" icon="pin" placeholder="123 Main St" />
                </div>

                <Field label="City" name="address_city" icon="building" />
                <Field label="Region / State" name="address_region" icon="globe" />

                <Field label="Postal code" name="address_postal" icon="mail" />
                <SelectField
                  label="Country"
                  name="address_country"
                  icon="globe"
                  placeholder="US or United States"
                  options={COUNTRY_OPTIONS}
                />
              </div>

              <div className="estm__foot">
                <button
                  type="button"
                  className="est-btn est-btn--ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="est-btn est-btn--pri">
                  <Icon name="plus" size={16} />
                  Create business
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Fields (mirror /establishments/new) ──────────────────────────────

function InputBase({
  name,
  icon,
  placeholder,
  required,
  defaultValue,
}: {
  name: string;
  icon: IconName;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <span className="est-inputwrap">
      <span className="est-inputwrap__icon" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="est-input"
      />
    </span>
  );
}

function Field({
  label,
  name,
  icon,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  icon: IconName;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="est-field">
      <span className="est-field__lbl">
        {label}
        {required && <span className="est-field__req"> *</span>}
      </span>
      <InputBase
        name={name}
        icon={icon}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  icon,
  placeholder,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  icon: IconName;
  placeholder?: string;
  defaultValue?: string;
  options: readonly string[];
}) {
  return (
    <label className="est-field">
      <span className="est-field__lbl">{label}</span>
      <span className="est-inputwrap">
        <span className="est-inputwrap__icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <select name={name} className="est-input" defaultValue={defaultValue ?? ""}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
