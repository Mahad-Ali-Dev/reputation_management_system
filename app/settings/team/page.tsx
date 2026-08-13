import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { accessTabLabel } from "@/lib/access/tabs";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";
import { prettyPlan } from "../_lib/sections";
import { EditRoleModal } from "./_components/edit-role-modal";
import { InviteTeammateModal } from "./_components/invite-teammate-modal";
import { RemoveMemberModal } from "./_components/remove-member-modal";

/**
 * Team & roles (designs/settings/team n roles/team n roles.png) — membership
 * table + invite flow. Bound to the existing inviteTeammate server action,
 * plus updateMemberRole / removeMember (both in lib/account/actions.ts).
 *
 * <InviteTeammateModal> owns the trigger button + centered dialog; its email
 * + role fields post straight to `inviteTeammate`, and the tab-access grid
 * lives alongside them in <InviteTeammateForm> (client component — it needs
 * state for the Full/Custom toggle and "select all"). <EditRoleModal> and
 * <RemoveMemberModal> follow the same dialog shape, one per member row.
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
        <InviteTeammateModal />
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
                  <td className="set-mini__access">
                    {ROLE_ACCESS[m.role] ?? "Member"}
                    {m.allowedTabs.length > 0 && (
                      <span
                        title={m.allowedTabs.map(accessTabLabel).join(", ")}
                        style={{
                          display: "block",
                          fontSize: 10.5,
                          color: "var(--set-mut-2)",
                          marginTop: 2,
                        }}
                      >
                        <Icon name="lock" size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                        {m.allowedTabs.length} tab{m.allowedTabs.length === 1 ? "" : "s"} only
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      {/* You can edit a teammate's role, but not your own — an
                          owner demoting themselves (accidentally or not) is
                          exactly the kind of self-lockout this hides. Removing
                          yourself is blocked the same way below. */}
                      {isYou ? null : (
                        <>
                          <EditRoleModal
                            membershipId={m.id}
                            memberName={m.user.name ?? m.user.email ?? "This member"}
                            currentRole={m.role}
                          />
                          <RemoveMemberModal
                            membershipId={m.id}
                            memberName={m.user.name ?? m.user.email ?? "This member"}
                          />
                        </>
                      )}
                    </div>
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
