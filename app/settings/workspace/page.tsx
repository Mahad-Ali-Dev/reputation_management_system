import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { updateAccountSettings } from "@/lib/account/actions";
import { DisplayRow, FormField, FormSelect } from "../_components/fields";
import { loadSettingsData, memberRoleLabel } from "../_lib/data";
import { COUNTRIES, prettyPlan } from "../_lib/sections";

/**
 * Workspace settings — owner profile + business details (bound to
 * updateAccountSettings) and a read-only workspace summary. Default landing
 * section of the settings shell.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const { org, members, sessionUser } = await loadSettingsData();

  const ownerDisplayName =
    org.ownerName ?? sessionUser.name ?? sessionUser.email?.split("@")[0] ?? "Owner";

  return (
    <>
      {/* Profile + business details */}
      <section className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Profile</h3>
          <span className="dim mono" style={{ fontSize: 10.5 }}>
            {sessionUser.email ? "EMAIL VERIFIED" : ""}
          </span>
        </div>
        <div className="ds-card__body">
          <form action={updateAccountSettings}>
            <div className="row" style={{ marginBottom: 18 }}>
              <Avatar name={ownerDisplayName} size={64} tone={5} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{ownerDisplayName}</div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {memberRoleLabel(members, sessionUser.email ?? "")}
                  {" · joined "}
                  {org.createdAt.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <FormField
                label="Owner name"
                name="ownerName"
                defaultValue={org.ownerName ?? ""}
                placeholder="Your full name"
              />
              <FormField
                label="Owner email"
                name="ownerEmail"
                type="email"
                defaultValue={org.ownerEmail ?? ""}
                placeholder="you@business.com"
              />
              <FormField
                label="Business name"
                name="businessName"
                required
                defaultValue={org.name}
              />
              <FormField
                label="Phone number"
                name="phone"
                defaultValue={org.phone ?? ""}
                placeholder="+1 555 123 4567"
                mono
              />
              <FormSelect
                label="Country"
                name="country"
                defaultValue={org.country ?? ""}
                options={[
                  ["", "— Select —"],
                  ...COUNTRIES.map(([code, label]) => [code, label] as [string, string]),
                ]}
              />
              <FormField
                label="Website"
                name="websiteUrl"
                type="url"
                defaultValue={org.websiteUrl ?? ""}
                placeholder="https://yourbusiness.com"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label htmlFor="businessDescription" className="lbl">
                Business description
              </label>
              <textarea
                id="businessDescription"
                name="businessDescription"
                defaultValue={org.businessDescription ?? ""}
                rows={4}
                maxLength={2000}
                placeholder="Tell customers what you do — services, hours, specialties. Used by the AI to personalize replies."
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
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}>
              <button type="reset" className="btn">
                <Icon name="archive" size={12} />
                Reset
              </button>
              <button type="submit" className="btn btn--pri">
                <Icon name="check" size={12} />
                Save changes
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Workspace summary */}
      <section className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Workspace</h3>
        </div>
        <div className="ds-card__body">
          <div className="grid-2" style={{ gap: 12 }}>
            <DisplayRow l="Workspace ID" v={org.id} mono />
            <DisplayRow l="Created" v={org.createdAt.toLocaleDateString()} />
            <DisplayRow l="Plan" v={prettyPlan(org.plan)} />
            <DisplayRow l="Team size" v={String(members.length)} />
          </div>
        </div>
      </section>
    </>
  );
}
