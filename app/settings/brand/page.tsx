import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { updateAccountSettings } from "@/lib/account/actions";
import Link from "next/link";
import { FormField } from "../_components/fields";
import { loadSettingsData } from "../_lib/data";

/**
 * Brand settings — the org logo + identity used by review widgets and outbound
 * emails. Bound to the existing updateAccountSettings server action (which owns
 * logoUrl). businessName is required by that action's schema, so it's submitted
 * as a hidden field to keep this form a logo-only update.
 */
export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  const { org } = await loadSettingsData();

  return (
    <>
      <section className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Brand</h3>
            <div className="ds-card__sub">Your logo and identity on review widgets and emails</div>
          </div>
        </div>
        <div className="ds-card__body">
          <form action={updateAccountSettings}>
            {/* updateAccountSettings requires businessName — preserve it untouched. */}
            <input type="hidden" name="businessName" value={org.name} />

            <div className="row" style={{ gap: 16, marginBottom: 18, alignItems: "center" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 14,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {org.logoUrl ? (
                  // Arbitrary user-supplied URL — plain <img> avoids next/image
                  // remotePatterns config (fail-soft if the host isn't allowed).
                  // biome-ignore lint/a11y/useAltText: alt provided below
                  <img
                    src={org.logoUrl}
                    alt={`${org.name} logo`}
                    width={72}
                    height={72}
                    style={{ objectFit: "contain", width: "100%", height: "100%" }}
                  />
                ) : (
                  <Avatar name={org.name} size={56} tone={3} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{org.name}</div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Shown on QR review cards, the review widget, and outbound request emails.
                </div>
              </div>
            </div>

            <FormField
              label="Logo URL"
              name="logoUrl"
              type="url"
              defaultValue={org.logoUrl ?? ""}
              placeholder="https://yourbusiness.com/logo.png"
            />
            <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
              Paste a public image URL (PNG or SVG, square works best). Hosted uploads ship with the
              asset library.
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button type="submit" className="btn btn--pri">
                <Icon name="check" size={12} />
                Save brand
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Brand kit</h3>
            <div className="ds-card__sub">Colors, typography and logo usage guidelines</div>
          </div>
          <Link href="/brand" className="btn btn--sm" style={{ textDecoration: "none" }}>
            <Icon name="ext" size={12} />
            View brand kit
          </Link>
        </div>
        <div className="ds-card__body">
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            The Repulabs brand palette and typography used across the product live in the public
            brand kit. Customer-facing colors for your own widgets follow your logo and plan theme.
          </p>
        </div>
      </section>
    </>
  );
}
