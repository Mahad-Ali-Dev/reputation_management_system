import { SaveToast } from "@/components/save-toast";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { updateAccountSettings } from "@/lib/account/actions";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData, memberRoleLabel } from "../_lib/data";
import { COUNTRIES, prettyPlan } from "../_lib/sections";

/**
 * Workspace settings (designs/settings/workspace/workspace.png) — owner profile
 * + business details (bound to updateAccountSettings) and a read-only workspace
 * summary. Default landing section of the settings shell.
 *
 * Save confirmation is a toast (<SaveToast>), not a static banner: `saveAction`
 * redirects with `?saved=1|error` (same signal `/establishments/[id]/settings`
 * uses for its banner) and the toast fires from that, then cleans the URL.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const { org, members, sessionUser } = await loadSettingsData();

  const ownerDisplayName =
    org.ownerName ?? sessionUser.name ?? sessionUser.email?.split("@")[0] ?? "Owner";

  async function saveAction(form: FormData) {
    "use server";
    try {
      await updateAccountSettings(form);
    } catch (err) {
      // redirect()/notFound() control-flow must propagate (e.g. an expired
      // session redirecting to /login from inside the action).
      const digest = (err as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      redirect("/settings/workspace?saved=error");
    }
    redirect("/settings/workspace?saved=1");
  }

  return (
    <SettingsFrame>
      <Suspense fallback={null}>
        <SaveToast successMessage="Workspace settings saved." />
      </Suspense>

      {/* Profile + business details */}
      <section className="set-card">
        <h2 className="set-card__title set-card__title--sm">Profile</h2>
        <p className="set-card__sub">Owner identity and business details.</p>

        <form action={saveAction}>
          <div className="set-preview__row" style={{ margin: "18px 0" }}>
            <Avatar name={ownerDisplayName} size={56} tone={5} />
            <div>
              <div className="set-preview__name">{ownerDisplayName}</div>
              <div className="set-preview__cap">
                {memberRoleLabel(members, sessionUser.email ?? "")}
                {" · joined "}
                {org.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          <div className="set-grid-2">
            <label className="set-field">
              <span className="set-field__label">Owner name</span>
              <input
                className="set-input"
                name="ownerName"
                defaultValue={org.ownerName ?? ""}
                placeholder="Your full name"
              />
            </label>
            <label className="set-field">
              <span className="set-field__label">Owner email</span>
              <input
                className="set-input"
                type="email"
                name="ownerEmail"
                defaultValue={org.ownerEmail ?? ""}
                placeholder="you@business.com"
              />
            </label>
            <label className="set-field">
              <span className="set-field__label">Business name</span>
              <input className="set-input" name="businessName" required defaultValue={org.name} />
            </label>
            <label className="set-field">
              <span className="set-field__label">Phone number</span>
              <input
                className="set-input set-input--mono"
                name="phone"
                defaultValue={org.phone ?? ""}
                placeholder="+1 555 123 4567"
              />
            </label>
            <label className="set-field">
              <span className="set-field__label">Country</span>
              <select className="set-select" name="country" defaultValue={org.country ?? ""}>
                <option value="">— Select —</option>
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              <span className="set-field__label">Website</span>
              <input
                className="set-input"
                type="url"
                name="websiteUrl"
                defaultValue={org.websiteUrl ?? ""}
                placeholder="https://yourbusiness.com"
              />
            </label>
          </div>

          <label className="set-field" style={{ marginTop: 14 }}>
            <span className="set-field__label">Business description</span>
            <textarea
              className="set-textarea"
              name="businessDescription"
              defaultValue={org.businessDescription ?? ""}
              rows={4}
              maxLength={2000}
              placeholder="Tell customers what you do — services, hours, specialties. Used by the AI to personalize replies."
            />
          </label>

          <div className="set-actions">
            <button type="reset" className="set-btn">
              <Icon name="archive" size={16} className="set-btn__ic" />
              Reset
            </button>
            <button type="submit" className="set-btn set-btn--primary">
              <Icon name="check" size={16} className="set-btn__ic" />
              Save changes
            </button>
          </div>
        </form>
      </section>

      {/* Workspace summary */}
      <section className="set-card">
        <h2 className="set-card__title set-card__title--sm">Workspace</h2>
        <div className="set-dl" style={{ marginTop: 16 }}>
          <div>
            <div className="set-dl__label">Workspace ID</div>
            <div className="set-dl__value set-dl__value--mono">{org.id}</div>
          </div>
          <div>
            <div className="set-dl__label">Created</div>
            <div className="set-dl__value">{org.createdAt.toLocaleDateString()}</div>
          </div>
          <div>
            <div className="set-dl__label">Plan</div>
            <div className="set-dl__value">{prettyPlan(org.plan)}</div>
          </div>
          <div>
            <div className="set-dl__label">Team size</div>
            <div className="set-dl__value">{String(members.length)}</div>
          </div>
        </div>
      </section>
    </SettingsFrame>
  );
}
