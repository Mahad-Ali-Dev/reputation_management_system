import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { updateAccountSettings } from "@/lib/account/actions";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";
import { LogoUploader } from "./_components/logo-uploader";

/**
 * Brand settings (designs/settings/brand/mockup.png).
 *
 * The org logo + identity used by review widgets and outbound emails, plus a
 * read-only brand kit (palette + typography) and a customer-facing review
 * widget preview. Bound to the existing updateAccountSettings server action
 * (which owns logoUrl). businessName is required by that action's schema, so
 * it's submitted as a hidden field to keep this form a logo-only update.
 * Self-serve file upload (dropzone) ships with the asset library — the working
 * control today is the Logo URL field.
 */
export const dynamic = "force-dynamic";

const ASSET = "/assets/repulabs/settings";

const SWATCHES: Array<[string, string]> = [
  ["Primary", "#4F46E5"],
  ["Secondary", "#10B981"],
  ["Accent", "#EC4899"],
  ["Neutral", "#64748B"],
  ["Light", "#F1F5F9"],
];

export default async function BrandSettingsPage() {
  const { org } = await loadSettingsData();

  return (
    <SettingsFrame>
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <section className="set-card">
        <h2 className="set-card__title">Brand</h2>
        <p className="set-card__sub">Your logo and identity on review widgets and emails.</p>

        <form action={updateAccountSettings}>
          {/* updateAccountSettings requires businessName — preserve it untouched. */}
          <input type="hidden" name="businessName" value={org.name} />

          <div className="set-brand-grid">
            <div className="set-brand-id">
              {org.logoUrl ? (
                <span className="set-logo-tile">
                  {/* Arbitrary user URL — plain <img> avoids next/image remotePatterns. */}
                  {/* biome-ignore lint/a11y/useAltText: alt provided */}
                  <img src={org.logoUrl} alt={`${org.name} logo`} />
                </span>
              ) : (
                <Avatar name={org.name} size={56} tone={3} />
              )}
              <div style={{ minWidth: 0 }}>
                <div className="set-brand-id__name">{org.name}</div>
                <div className="set-brand-id__sub">
                  Shown on QR review cards, the review widget, and outbound request emails.
                </div>
              </div>
            </div>

            <div className="set-brand-upload">
              <div>
                <div className="set-dl__label" style={{ marginBottom: 8 }}>
                  Current logo
                </div>
                <span className="set-logo-tile">
                  {org.logoUrl ? (
                    // biome-ignore lint/a11y/useAltText: alt provided
                    <img src={org.logoUrl} alt={`${org.name} current logo`} />
                  ) : (
                    <Avatar name={org.name} size={64} tone={3} />
                  )}
                </span>
              </div>
              <LogoUploader />
            </div>
          </div>

          <div className="set-field" style={{ marginTop: 20 }}>
            <span className="set-field__label">Logo URL</span>
            <input
              className="set-input"
              type="url"
              name="logoUrl"
              defaultValue={org.logoUrl ?? ""}
              placeholder="https://yourbusiness.com/logo.png"
            />
            <span className="set-field__hint">
              Paste a public image URL (PNG, JPG or WebP; square works best) — or use the uploader
              above to upload directly.
            </span>
          </div>

          <div className="set-actions">
            <button type="submit" className="set-btn set-btn--primary">
              <Icon name="check" size={16} className="set-btn__ic" />
              Save brand
            </button>
          </div>
        </form>
      </section>

      {/* ── Brand kit + Review widget preview ───────────────────────── */}
      <div className="set-grid-2">
        <section className="set-card">
          <h2 className="set-card__title set-card__title--sm">Brand kit</h2>
          <p className="set-card__sub">
            Your brand palette and typography used across widgets, emails and public pages.
          </p>

          <div className="set-kitcols">
            <div>
              <div className="set-kitlabel">Colors</div>
              <div className="set-swatches">
                {SWATCHES.map(([name, hex]) => (
                  <div key={name} className="set-swatch">
                    <div className="set-swatch__name">{name}</div>
                    <div
                      className="set-swatch__chip"
                      style={{
                        background: hex,
                        border: hex === "#F1F5F9" ? "1px solid #e2e8f0" : undefined,
                      }}
                    />
                    <div className="set-swatch__hex">{hex}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="set-kitlabel">Typography</div>
              <div className="set-specimen">Aa</div>
              <div className="set-type-name">Inter</div>
              <div className="set-type-desc">Clean, modern, and highly readable across all devices.</div>
            </div>

            <div>
              <div className="set-kitlabel">Widget preview</div>
              <div className="set-widget">
                <div className="set-widget__bar">
                  <Avatar name={org.name} size={22} tone={3} />
                </div>
                <div className="set-widget__body">
                  <div className="set-widget__q">How was your experience?</div>
                  <div className="set-widget__stars">
                    {[0, 1, 2, 3, 4].map((i) => (
                      // biome-ignore lint/a11y/useAltText: decorative preview star
                      <img key={i} src={`${ASSET}/brand-star-outline.svg`} alt="" aria-hidden="true" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="set-actions" style={{ justifyContent: "flex-start", marginTop: 18 }}>
            <a href="/brand" className="set-btn set-btn--sm">
              <Icon name="ext" size={14} className="set-btn__ic" />
              View brand kit
            </a>
          </div>
        </section>

        <section className="set-card">
          <h2 className="set-card__title set-card__title--sm">Review widget preview</h2>
          <p className="set-card__sub">See how your branding appears to your customers.</p>

          <div className="set-preview">
            <div className="set-preview__row">
              <Avatar name={org.name} size={40} tone={3} />
              <div style={{ minWidth: 0 }}>
                <div className="set-preview__name">{org.name}</div>
                <div className="set-preview__cap">We&apos;d love your feedback!</div>
              </div>
            </div>
            <div className="set-preview__stars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                // biome-ignore lint/a11y/useAltText: decorative preview star
                <img key={i} src={`${ASSET}/brand-star-filled.svg`} alt="" />
              ))}
            </div>
            <div className="set-preview__skel" />
            <div className="set-preview__skel" />
            <button type="button" className="set-preview__btn">
              Write a review
            </button>
          </div>

          <div className="set-actions" style={{ justifyContent: "flex-start", marginTop: 16 }}>
            <a href="/brand" target="_blank" rel="noopener noreferrer" className="set-link">
              Open full preview
              <Icon name="ext" size={13} />
            </a>
          </div>
        </section>
      </div>
    </SettingsFrame>
  );
}
