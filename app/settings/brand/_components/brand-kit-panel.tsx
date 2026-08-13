"use client";

import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { useToast } from "@/components/toast";
import { updateBrandColors } from "@/lib/account/actions";
import {
  BRAND_COLOR_KEYS,
  BRAND_COLOR_LABELS,
  type BrandColorKey,
  DEFAULT_BRAND_COLORS,
} from "@/lib/account/brand-colors";
import { useState, useTransition } from "react";

/**
 * Brand kit — palette + the two preview widgets ("Widget preview" mini card
 * and the larger "Review widget preview"), all driven by ONE piece of state.
 *
 * This is a client island (the rest of the Brand page is a Server Component)
 * specifically so picking a color updates both previews IMMEDIATELY, before
 * "Save brand kit" is even clicked — the whole point of a swatch editor is
 * seeing the effect live, not guessing and reloading. "Save" persists to
 * `Organization.settings.brand.colors` via `updateBrandColors`; until then,
 * the picked colors are local-only (a refresh reverts to `initialColors`).
 *
 * Only `primary` currently drives real, customer-facing surfaces beyond this
 * page (the outbound review-request email's CTA button — see
 * lib/outreach/dispatch.ts). The other four swatches are saved and shown here
 * for a complete palette, but nothing outside Settings reads them yet.
 */
export function BrandKitPanel({
  initialColors,
  orgName,
}: {
  initialColors: Record<BrandColorKey, string>;
  orgName: string;
}) {
  const toast = useToast();
  const [colors, setColors] = useState(initialColors);
  const [pending, startTransition] = useTransition();
  const dirty = BRAND_COLOR_KEYS.some((k) => colors[k] !== initialColors[k]);

  function setColor(key: BrandColorKey, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }));
  }

  function resetToDefaults() {
    setColors(DEFAULT_BRAND_COLORS);
  }

  function save() {
    const form = new FormData();
    for (const key of BRAND_COLOR_KEYS) form.set(key, colors[key]);
    startTransition(async () => {
      const res = await updateBrandColors(form);
      if (res.ok) toast.success("Brand kit saved.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="set-grid-2">
      <section className="set-card">
        <h2 className="set-card__title set-card__title--sm">Brand kit</h2>
        <p className="set-card__sub">
          Your brand palette and typography used across widgets, emails and
          public pages.
        </p>

        <div className="set-kitcols">
          <div>
            <div className="set-kitlabel">Colors</div>
            <div className="set-swatches">
              {BRAND_COLOR_KEYS.map((key) => (
                <label
                  key={key}
                  className="set-swatch"
                  style={{ cursor: "pointer" }}
                >
                  <div className="set-swatch__name">
                    {BRAND_COLOR_LABELS[key]}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      width: 40,
                      height: 40,
                      margin: "0 auto",
                    }}
                  >
                    <div
                      className="set-swatch__chip"
                      style={{
                        width: "100%",
                        height: "100%",
                        background: colors[key],
                        border:
                          key === "light" ? "1px solid #e2e8f0" : undefined,
                      }}
                    />
                    <input
                      type="color"
                      value={colors[key]}
                      onChange={(e) => setColor(key, e.target.value)}
                      aria-label={`${BRAND_COLOR_LABELS[key]} color`}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        cursor: "pointer",
                      }}
                    />
                  </div>
                  <div className="set-swatch__hex">{colors[key]}</div>
                </label>
              ))}
            </div>

            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="set-btn set-btn--primary set-btn--sm"
                onClick={save}
                disabled={pending || !dirty}
              >
                <Icon name="check" size={13} className="set-btn__ic" />
                {pending ? "Saving…" : "Save brand kit"}
              </button>
              <button
                type="button"
                className="set-btn set-btn--sm"
                onClick={resetToDefaults}
                disabled={pending}
              >
                Reset to defaults
              </button>
            </div>
          </div>

          <div>
            <div className="set-kitlabel">Typography</div>
            <div className="set-specimen">Aa</div>
            <div className="set-type-name">Inter</div>
            <div className="set-type-desc">
              Clean, modern, and highly readable across all devices.
            </div>
          </div>

          <div>
            <div className="set-kitlabel">Widget preview</div>
            <div className="set-widget">
              <div
                className="set-widget__bar"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`,
                }}
              >
                <Avatar name={orgName} size={22} tone={3} />
              </div>
              <div className="set-widget__body">
                <div className="set-widget__q">How was your experience?</div>
                <div className="set-widget__stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Icon
                      key={i}
                      name="star"
                      size={16}
                      style={{ color: colors.primary }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="set-actions"
          style={{ justifyContent: "flex-start", marginTop: 18 }}
        >
          <a href="/brand" className="set-btn set-btn--sm">
            <Icon name="ext" size={14} className="set-btn__ic" />
            View brand kit
          </a>
        </div>
      </section>

      <section className="set-card">
        <h2 className="set-card__title set-card__title--sm">
          Review widget preview
        </h2>
        <p className="set-card__sub">
          See how your branding appears to your customers.
        </p>

        <div className="set-preview">
          <div className="set-preview__row">
            <Avatar name={orgName} size={40} tone={3} />
            <div style={{ minWidth: 0 }}>
              <div className="set-preview__name">{orgName}</div>
              <div className="set-preview__cap">
                We&apos;d love your feedback!
              </div>
            </div>
          </div>
          <div className="set-preview__stars" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Icon
                key={i}
                name="star"
                size={22}
                style={{ color: colors.primary, fill: colors.primary }}
              />
            ))}
          </div>
          <div className="set-preview__skel" />
          <div className="set-preview__skel" />
          <button
            type="button"
            className="set-preview__btn"
            style={{ background: colors.primary }}
          >
            Write a review
          </button>
        </div>

        <div
          className="set-actions"
          style={{ justifyContent: "flex-start", marginTop: 16 }}
        >
          <a
            href="/brand"
            target="_blank"
            rel="noopener noreferrer"
            className="set-link"
          >
            Open full preview
            <Icon name="ext" size={13} />
          </a>
        </div>
      </section>
    </div>
  );
}
