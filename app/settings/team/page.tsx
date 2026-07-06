import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { inviteTeammate, removeMember } from "@/lib/account/actions";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";
import { prettyPlan } from "../_lib/sections";

/**
 * Team & roles (designs/settings/team n roles/team n roles.png) — membership
 * table + invite flow. Bound to the existing inviteTeammate / removeMember
 * server actions.
 */
export const dynamic = "force-dynamic";

const ROLE_ACCESS: Record<string, string> = {
  owner: "Full control",
  admin: "Manage data",
  manager: "Reply + edit",
  viewer: "Read-only",
};

export default async function TeamSettingsPage() {
  const { org, members, sessionUser } = await loadSettingsData();

  return (
    <SettingsFrame>
      <section className="set-card">
        <div className="set-sec-head" style={{ alignItems: "center" }}>
          <span className="set-tile set-tile--sm set-tile--indigo">
            <Icon name="users" size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <h2 className="set-card__title set-card__title--sm">
            Team · {members.length} {members.length === 1 ? "member" : "members"}
          </h2>
          <p className="set-card__sub">{prettyPlan(org.plan)} includes unlimited seats</p>
        </div>
        <details style={{ position: "relative" }}>
          <summary
            className="set-btn set-btn--primary set-btn--sm"
            style={{ listStyle: "none", cursor: "pointer" }}
          >
            <Icon name="plus" size={13} className="set-btn__ic" />
            Invite teammate
          </summary>
          <form
            action={inviteTeammate}
            className="set-card"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              zIndex: 10,
              width: 320,
              padding: 16,
              boxShadow: "0 12px 34px -10px rgba(15,23,42,.25)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="set-field">
                <span className="set-field__label">Email</span>
                <input
                  className="set-input"
                  type="email"
                  name="email"
                  required
                  maxLength={200}
                  placeholder="teammate@business.com"
                />
              </label>
              <label className="set-field">
                <span className="set-field__label">Role</span>
                <select className="set-select" name="role" defaultValue="admin">
                  <option value="admin">Admin · can manage data</option>
                  <option value="manager">Manager · can reply + edit</option>
                  <option value="viewer">Viewer · read-only</option>
                  <option value="owner">Owner · full control</option>
                </select>
              </label>
              <button type="submit" className="set-btn set-btn--primary">
                <Icon name="send" size={15} className="set-btn__ic" />
                Send invitation
              </button>
              <p className="set-field__hint">
                The invite link is valid for 14 days. We&apos;ll log it for now — email delivery
                ships next release.
              </p>
            </div>
          </form>
        </details>
      </div>

      {members.length === 0 ? (
        <p className="set-dim" style={{ fontSize: 13, marginTop: 16 }}>
          No team members yet.
        </p>
      ) : (
        <table className="set-mini" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
              const isYou = m.user.email === sessionUser.email;
              return (
                <tr key={m.id}>
                  <td>
                    <div className="set-nrow" style={{ gap: 10 }}>
                      <Avatar name={m.user.name ?? m.user.email ?? "User"} size={30} tone={tone} />
                      <div style={{ minWidth: 0 }}>
                        <div className="set-mini__name">
                          {m.user.name ?? m.user.email}
                          {isYou && (
                            <span
                              className="set-pill set-pill--muted"
                              style={{ marginLeft: 6, height: 18, fontSize: 9.5 }}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="set-mini__email">{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className="set-pill set-pill--neutral"
                      style={{ textTransform: "capitalize" }}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="set-mini__access">{ROLE_ACCESS[m.role] ?? "Member"}</td>
                  <td style={{ textAlign: "right" }}>
                    {isYou ? null : (
                      <form action={removeMember}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button
                          type="submit"
                          className="set-btable__dl"
                          aria-label="Remove member"
                          title="Remove member"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      </section>
    </SettingsFrame>
  );
}
