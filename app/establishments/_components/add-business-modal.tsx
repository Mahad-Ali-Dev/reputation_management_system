"use client";

import { Icon } from "@/components/shell/icon";
import {
  type GlassOption,
  GlassSelect,
  localTimezone,
  timezoneOptions,
} from "@/components/ui/glass-select";
import { createEstablishment } from "@/lib/establishments/actions";
import { Building2, Clock, Globe, MapPin, Tag, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import "./add-business-modal.css";

/**
 * Add New Business — opens the create form in a frosted Apple-style sheet
 * (instead of navigating to /establishments/new). Posts the same
 * `createEstablishment` server action, which redirects to the new
 * establishment on success. Dropdowns are GlassSelect (searchable for the
 * long timezone + country lists); the timezone defaults to the browser's own.
 */

const CATEGORY_OPTIONS: GlassOption[] = [
  "Cafe",
  "Restaurant",
  "Retail",
  "Dental",
  "Medical",
  "Salon",
  "Spa & Beauty",
  "Fitness",
  "Hotel",
  "Automotive",
  "Home Services",
  "IT Services",
  "Professional Services",
  "Other",
].map((c) => ({ value: c, label: c }));

const COUNTRY_OPTIONS: GlassOption[] = [
  "Australia",
  "Canada",
  "France",
  "Germany",
  "India",
  "Ireland",
  "Italy",
  "Netherlands",
  "New Zealand",
  "Pakistan",
  "Saudi Arabia",
  "Singapore",
  "South Africa",
  "Spain",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Other",
].map((c) => ({ value: c, label: c }));

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
  const zones = useMemo(() => (open ? timezoneOptions() : []), [open]);
  const defaultZone = useMemo(() => (open ? localTimezone() : "UTC"), [open]);

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
        // biome-ignore lint/a11y/useSemanticElements: overlay dialog; a native dialog top layer would sit above the portalled dropdown menus
        <div className="abm-overlay" role="dialog" aria-modal="true" aria-labelledby="abm-title">
          <button
            type="button"
            className="abm-scrim"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="abm">
            <button
              type="button"
              className="abm__close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X size={16} strokeWidth={2.2} />
            </button>

            <div className="abm__hero">
              <span className="abm__badge" aria-hidden>
                <Building2 size={26} strokeWidth={1.7} />
              </span>
              <h2 id="abm-title" className="abm__title">
                Add a business
              </h2>
              <p className="abm__sub">
                A place you want to collect and manage reviews for. You&apos;ll connect its Google
                profile next.
              </p>
            </div>

            <form action={createEstablishment} className="abm__form">
              <div className="abm__body">
                <section className="abm-section" aria-labelledby="abm-sec-business">
                  <h3 id="abm-sec-business" className="abm-section__title">
                    Business
                  </h3>
                  <div className="abm-group abm-grid">
                    <label className="abm-field abm-field--full">
                      <span className="abm-field__lbl">
                        Name <span className="abm-field__req">*</span>
                      </span>
                      <input
                        name="name"
                        required
                        maxLength={120}
                        // biome-ignore lint/a11y/noAutofocus: first field of a just-opened dialog
                        autoFocus
                        placeholder="Acme Coffee Downtown"
                        className="abm-input"
                      />
                    </label>
                    <div className="abm-field">
                      <span className="abm-field__lbl">Category</span>
                      <GlassSelect
                        name="category"
                        options={CATEGORY_OPTIONS}
                        placeholder="Choose a category"
                        icon={<Tag size={16} strokeWidth={1.8} />}
                        ariaLabel="Category"
                      />
                    </div>
                    <div className="abm-field">
                      <span className="abm-field__lbl">Timezone</span>
                      <GlassSelect
                        name="timezone"
                        options={zones}
                        defaultValue={defaultZone}
                        searchable
                        searchPlaceholder="Search cities"
                        icon={<Clock size={16} strokeWidth={1.8} />}
                        ariaLabel="Timezone"
                      />
                    </div>
                  </div>
                </section>

                <section className="abm-section" aria-labelledby="abm-sec-address">
                  <h3 id="abm-sec-address" className="abm-section__title">
                    Address
                  </h3>
                  <div className="abm-group abm-grid">
                    <label className="abm-field abm-field--full">
                      <span className="abm-field__lbl">Street</span>
                      <span className="abm-inputwrap">
                        <MapPin size={16} strokeWidth={1.8} aria-hidden />
                        <input
                          name="address_line1"
                          placeholder="123 Main St"
                          className="abm-input"
                        />
                      </span>
                    </label>
                    <label className="abm-field">
                      <span className="abm-field__lbl">City</span>
                      <input name="address_city" className="abm-input" />
                    </label>
                    <label className="abm-field">
                      <span className="abm-field__lbl">State / Region</span>
                      <input name="address_region" className="abm-input" />
                    </label>
                    <label className="abm-field">
                      <span className="abm-field__lbl">Postal code</span>
                      <input name="address_postal" className="abm-input" />
                    </label>
                    <div className="abm-field">
                      <span className="abm-field__lbl">Country</span>
                      <GlassSelect
                        name="address_country"
                        options={COUNTRY_OPTIONS}
                        placeholder="Choose a country"
                        searchable
                        searchPlaceholder="Search countries"
                        icon={<Globe size={16} strokeWidth={1.8} />}
                        ariaLabel="Country"
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className="abm__foot">
                <button type="button" className="abm-btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="abm-btn abm-btn--pri" disabled={pending}>
      {pending ? "Creating…" : "Create business"}
    </button>
  );
}
