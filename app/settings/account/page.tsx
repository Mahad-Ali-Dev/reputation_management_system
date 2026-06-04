import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import {
  inviteTeammate,
  removeMember,
  updateAccountSettings,
  updateSecurityPrefs,
} from "@/lib/account/actions";
import { getOrgContext } from "@/lib/auth/org-context";
import { prisma } from "@/lib/db/client";

/**
 * Account settings — repulabs v2 design.
 *
 * Section nav (left) + content panels (right). Profile + Workspace render
 * editable form bound to updateAccountSettings server action. Team /
 * Security / Notifications / API placeholder for empty data tables until
 * the supporting models and queries land.
 *
 * Real data: org.name, ownerName, ownerEmail, phone, country, websiteUrl,
 * logoUrl, businessDescription, plus session user info and membership list.
 */

export const dynamic = "force-dynamic";

const COUNTRIES = [
  ["US", "🇺🇸 United States"],
  ["CA", "🇨🇦 Canada"],
  ["GB", "🇬🇧 United Kingdom"],
  ["AU", "🇦🇺 Australia"],
  ["NZ", "🇳🇿 New Zealand"],
  ["DE", "🇩🇪 Germany"],
  ["FR", "🇫🇷 France"],
  ["ES", "🇪🇸 Spain"],
  ["IT", "🇮🇹 Italy"],
  ["NL", "🇳🇱 Netherlands"],
  ["IE", "🇮🇪 Ireland"],
  ["BR", "🇧🇷 Brazil"],
  ["MX", "🇲🇽 Mexico"],
  ["IN", "🇮🇳 India"],
  ["PK", "🇵🇰 Pakistan"],
  ["AE", "🇦🇪 UAE"],
  ["SG", "🇸🇬 Singapore"],
  ["JP", "🇯🇵 Japan"],
  ["KR", "🇰🇷 South Korea"],
  ["OTHER", "Other"],
] as const;

const SECTIONS: Array<{
  id: string;
  icon: "user" | "users" | "lock" | "bell" | "plug" | "building" | "trash";
  t: string;
  danger?: boolean;
}> = [
  { id: "profile", icon: "user", t: "Profile" },
  { id: "team", icon: "users", t: "Team & roles" },
  { id: "security", icon: "lock", t: "Security" },
  { id: "notifications", icon: "bell", t: "Notifications" },
  { id: "api", icon: "plug", t: "API & webhooks" },
  { id: "workspace", icon: "building", t: "Workspace" },
  { id: "danger", icon: "trash", t: "Delete account", danger: true },
];

export default async function AccountSettingsPage() {
  // Per-request memoized — org row already loaded by getOrgContext().
  const ctx = await getOrgContext();
  const orgId = ctx.orgId;
  const sessionUser = { name: ctx.userName, email: ctx.userEmail };

  const [orgWithCreated, members] = await Promise.all([
    // We need plan + createdAt which aren't in the cached context yet.
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, createdAt: true, settings: true },
    }),
    // Membership joins to User (auth-domain) which the tenant role can't read.
    // orgId comes from the verified session, so direct prisma with an explicit
    // organizationId filter is safe here.
    prisma.membership.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);
  // Combine the cached org context with the freshly-loaded plan + createdAt.
  const org = {
    id: ctx.org.id,
    name: ctx.org.name,
    ownerName: ctx.org.ownerName,
    ownerEmail: ctx.org.ownerEmail,
    phone: ctx.org.phone,
    country: ctx.org.country,
    websiteUrl: ctx.org.websiteUrl,
    logoUrl: ctx.org.logoUrl,
    businessDescription: ctx.org.businessDescription,
    plan: orgWithCreated?.plan ?? "trial",
    createdAt: orgWithCreated?.createdAt ?? new Date(),
  };

  // Saved security preferences (settings.security) — default to a 30-min
  // timeout when the org has never saved any.
  const savedSecurity =
    (orgWithCreated?.settings as { security?: { sessionTimeoutMinutes?: number } } | null)
      ?.security ?? {};
  const sessionTimeoutMinutes = savedSecurity.sessionTimeoutMinutes ?? 30;

  const ownerDisplayName =
    org.ownerName ?? sessionUser.name ?? sessionUser.email?.split("@")[0] ?? "Owner";

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Account"]}>
      <PageHeader
        kicker={`Workspace · ${org.name}`}
        title="Account settings"
        description="Profile, team, security, notifications and API access."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px minmax(0, 1fr)",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        <nav className="ds-card" style={{ padding: 6 }} aria-label="Account sections">
          {SECTIONS.map((s) => {
            const active = s.id === "profile";
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="row"
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  cursor: "pointer",
                  textDecoration: "none",
                  background: active ? "var(--pri-50)" : "transparent",
                  color: s.danger ? "var(--bad)" : active ? "var(--pri)" : "var(--ink-2)",
                }}
              >
                <Icon name={s.icon} size={13} />
                <span style={{ flex: 1, fontWeight: active ? 500 : 400 }}>{s.t}</span>
              </a>
            );
          })}
        </nav>

        <div className="col" style={{ gap: 16 }}>
          {/* Profile */}
          <section id="profile" className="ds-card">
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

          {/* Team */}
          <section id="team" className="ds-card">
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
                      The invite link is valid for 14 days. We&apos;ll log it for now — email
                      delivery ships next release.
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
                            <Avatar
                              name={m.user.name ?? m.user.email ?? "User"}
                              size={28}
                              tone={tone}
                            />
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

          {/* Security */}
          <section id="security" className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">Security</h3>
              <span className="chip chip--ok">
                <Icon name="checkCircle" size={9} stroke={2.4} />
                Strong
              </span>
            </div>
            <div className="ds-card__body">
              <form action={updateSecurityPrefs}>
                <FormSelect
                  label="Session timeout"
                  name="sessionTimeoutMinutes"
                  defaultValue={String(sessionTimeoutMinutes)}
                  options={[
                    ["15", "After 15 minutes of inactivity"],
                    ["30", "After 30 minutes of inactivity"],
                    ["60", "After 1 hour of inactivity"],
                    ["120", "After 2 hours of inactivity"],
                    ["480", "After 8 hours of inactivity"],
                  ]}
                />
                <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
                  Saved to your workspace now. Active enforcement of the timeout ships with the
                  Phase 0 session-policy update.
                </div>
                <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn--pri">
                    <Icon name="check" size={12} />
                    Save security settings
                  </button>
                </div>
              </form>
              <div className="divider" />
              <ToggleRowDisplay
                title="Two-factor authentication"
                sub="Coming in Phase 0 — WebAuthn passkeys + TOTP fallback"
                icon="lock"
              />
              <ToggleRowDisplay
                title="Single sign-on (SSO)"
                sub="Google Workspace + Microsoft 365 — available on Scale"
                icon="users"
              />
              <div className="divider" />
              <div className="lbl-mono">Active sessions</div>
              <div className="dim" style={{ fontSize: 12.5, padding: "10px 0" }}>
                Session management UI lands with WebAuthn admin policies (Phase 0).
              </div>
            </div>
          </section>

          {/* Workspace */}
          <section id="workspace" className="ds-card">
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
        </div>
      </div>
    </AppShellServer>
  );
}

function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  mono,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          height: 38,
          padding: "0 14px",
          borderRadius: "var(--r)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: mono ? "var(--f-mono)" : "var(--f-ui)",
          fontSize: 13,
          outline: "none",
        }}
      />
    </label>
  );
}

function FormSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        style={{
          width: "100%",
          height: 38,
          padding: "0 32px 0 14px",
          borderRadius: "var(--r)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: "var(--f-ui)",
          fontSize: 13,
          outline: "none",
          appearance: "none",
        }}
      >
        {options.map(([value, label_]) => (
          <option key={value} value={value}>
            {label_}
          </option>
        ))}
      </select>
    </label>
  );
}

function DisplayRow({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="lbl-mono">{l}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          fontFamily: mono ? "var(--f-mono)" : undefined,
          marginTop: 4,
          wordBreak: "break-all",
        }}
      >
        {v}
      </div>
    </div>
  );
}

function ToggleRowDisplay({
  title,
  sub,
  icon,
  on,
}: {
  title: string;
  sub: string;
  icon: "lock" | "users" | "clock";
  on?: boolean;
}) {
  return (
    <div
      className="row"
      style={{
        padding: 12,
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        marginBottom: 6,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: on ? "var(--pri-50)" : "var(--surface-3)",
          color: on ? "var(--pri)" : "var(--rl-muted)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{title}</div>
        <div className="dim" style={{ fontSize: 11 }}>
          {sub}
        </div>
      </div>
      <span className={`tg${on ? " is-on" : ""}`} aria-hidden="true" />
    </div>
  );
}

function memberRoleLabel(
  members: Array<{ role: string; user: { email: string | null } }>,
  email: string,
): string {
  const me = members.find((m) => m.user.email === email);
  if (!me) return "Member";
  return me.role.charAt(0).toUpperCase() + me.role.slice(1);
}

function prettyPlan(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
