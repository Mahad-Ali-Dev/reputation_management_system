import { SaveToast } from "@/components/save-toast";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { updateAccountSettings } from "@/lib/account/actions";
import { resolveBrandColors } from "@/lib/account/brand-colors";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";
import { BrandKitPanel } from "./_components/brand-kit-panel";
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
 *
 * `logoUrlFieldValue` is deliberately NOT `org.logoUrl` verbatim: in dev
 * without cloud storage configured, the uploader's fallback stores a `data:`
 * URL (see lib/uploads/blob.ts), and echoing a multi-KB data URL back into
 * this "paste a public URL" text field made the field unusable AND crashed
 * "Save brand" the moment it was resubmitted unchanged (updateAccountSettings
 * caps logoUrl at 500 chars for exactly this reason). The preview tiles below
 * still render it fine — <img src> doesn't care that it's a data: URL.
 *
 * That blanked field created a second bug: clicking "Save brand" right after
 * a dropzone upload submitted an EMPTY logoUrl, which updateAccountSettings
 * reads as "clear the logo" and wiped out the upload that had just succeeded.
 * `saveAction` below fixes this — it compares the typed value against a
 * hidden mirror of the real current value and, when the field is blank
 * specifically BECAUSE we hid a data: URL (not because the user cleared a
 * real one), drops `logoUrl` from the submission entirely so
 * updateAccountSettings leaves the column untouched instead of nulling it.
 */
export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  const { org, settingsObj } = await loadSettingsData();
  const logoUrlFieldValue = org.logoUrl?.startsWith("data:") ? "" : (org.logoUrl ?? "");
  const brandColors = resolveBrandColors(settingsObj.brand?.colors);

  async function saveAction(form: FormData) {
    "use server";
    const typedLogoUrl = ((form.get("logoUrl") as string) ?? "").trim();
    const currentLogoUrl = (form.get("currentLogoUrl") as string) ?? "";
    if (!typedLogoUrl && currentLogoUrl.startsWith("data:")) {
      // Blank could mean "the user cleared the logo" or "we hid a data: URL
      // from this field" — only the latter should be preserved. Deleting the
      // key (rather than resubmitting the data: URL) makes
      // updateAccountSettings see it as absent, not as a too-long value.
      form.delete("logoUrl");
    }
    try {
      await updateAccountSettings(form);
    } catch (err) {
      const digest = (err as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      redirect("/settings/brand?saved=error");
    }
    redirect("/settings/brand?saved=1");
  }

  return (
    <SettingsFrame>
      <Suspense fallback={null}>
        <SaveToast successMessage="Brand settings saved." />
      </Suspense>

      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <section className="set-card">
        <h2 className="set-card__title">Brand</h2>
        <p className="set-card__sub">Your logo and identity on review widgets and emails.</p>

        <form action={saveAction}>
          {/* updateAccountSettings requires businessName — preserve it untouched. */}
          <input type="hidden" name="businessName" value={org.name} />
          {/* Mirrors the real (possibly data:) logoUrl so saveAction can tell
              "field left blank because we hid a data: URL" apart from "user
              intentionally cleared a real URL" — see the note above. */}
          <input type="hidden" name="currentLogoUrl" value={org.logoUrl ?? ""} />

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
              defaultValue={logoUrlFieldValue}
              placeholder="https://yourbusiness.com/logo.png"
            />
            <span className="set-field__hint">
              {org.logoUrl?.startsWith("data:")
                ? "Your current logo came from the uploader without cloud storage configured, so there's no public URL to show here paste one to replace it, or keep using the uploader."
                : "Paste a public image URL (PNG, JPG or WebP; square works best) or use the uploader above to upload directly."}
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
      <BrandKitPanel initialColors={brandColors} orgName={org.name} />
    </SettingsFrame>
  );
}
