import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { inviteTeammate, removeMember } from "@/lib/account/actions";
import { loadSettingsData } from "../_lib/data";
import { prettyPlan } from "../_lib/sections";

/**
 * Team & roles — membership table + invite flow. Bound to the existing
 * inviteTeammate / removeMember server actions.
 */
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const { org, members, sessionUser } = await loadSettingsData();

  return (
    <section className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Team · {members.length} members</h3>
          <div className="ds-card__sub">{prettyPlan(org.plan)} includes unlimited seats</div>
        </div>
        <details className="relative">
          <summary
            className="btn btn--sm btn--pri"
            style={{ listStyle: "none", cursor: "pointer" }}
          >
            <Icon name="plus" size={11} />
            Invite teammate
          </summary>
          <form
            action={inviteTeammate}
            className="ds-card"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              zIndex: 10,
              width: 320,
              padding: 14,
              boxShadow: "0 10px 30px -10px rgba(0,0,0,.25)",
            }}
          >
            <div className="col" style={{ gap: 10 }}>
              <label className="col" style={{ gap: 4 }}>
                <span className="lbl">Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={200}
                  placeholder="teammate@business.com"
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: "var(--r)",
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </label>
              <label className="col" style={{ gap: 4 }}>
                <span className="lbl">Role</span>
                <select
                  name="role"
                  defaultValue="admin"
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: "var(--r)",
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    fontSize: 13,
                  }}
                >
                  <option value="admin">Admin · can manage data</option>
                  <option value="manager">Manager · can reply + edit</option>
                  <option value="viewer">Viewer · read-only</option>
                  <option value="owner">Owner · full control</option>
                </select>
              </label>
              <button type="submit" className="btn btn--pri">
                <Icon name="send" size={11} />
                Send invitation
              </button>
              <p className="dim" style={{ fontSize: 11, margin: 0 }}>
                The invite link is valid for 14 days. We&apos;ll log it for now — email delivery
                ships next release.
              </p>
            </div>
          </form>
        </details>
      </div>
      {members.length === 0 ? (
        <div className="ds-card__body dim" style={{ fontSize: 12.5 }}>
          No team members yet.
        </div>
      ) : (
        <table className="tbl tbl--compact">
          <thead>
            <tr>
              <th style={{ paddingLeft: 18 }}>Member</th>
              <th>Role</th>
              <th>Last active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
              const isYou = m.user.email === sessionUser.email;
              return (
                <tr key={m.id}>
                  <td style={{ paddingLeft: 18 }}>
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={m.user.name ?? m.user.email ?? "User"} size={28} tone={tone} />
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {m.user.name ?? m.user.email}
                          {isYou && (
                            <span
                              className="chip chip--out"
                              style={{ marginLeft: 4, fontSize: 9.5 }}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="dim" style={{ fontSize: 11 }}>
                          {m.user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="chip" style={{ textTransform: "capitalize" }}>
                      {m.role}
                    </span>
                  </td>
                  <td className="mono dim" style={{ fontSize: 11.5 }}>
                    —
                  </td>
                  <td>
                    {isYou ? null : (
                      <form action={removeMember}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button
                          type="submit"
                          className="btn btn--xs btn--ghost"
                          aria-label="Remove member"
                          title="Remove member"
                        >
                          <Icon name="trash" size={11} />
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
  );
}
