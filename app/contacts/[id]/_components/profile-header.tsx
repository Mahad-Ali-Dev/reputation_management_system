import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { getContactSourceMeta } from "@/lib/contacts/source-meta";
import type { ContactWithFields } from "@/lib/contacts/queries";

/**
 * Contact profile header (server). Avatar (initials), name, company, source
 * badge, VIP star, created / last-activity timestamps, and the contact's
 * identifiers (email / phone). Read-only presentation — edits happen in the
 * right-column `<ContactDetailsForm/>`.
 */

export function ProfileHeader({ contact }: { contact: ContactWithFields }) {
  const meta = getContactSourceMeta(contact.source);
  const displayName =
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    contact.phone ||
    "Unnamed contact";
  // Avatar tone is a stable hash of the contact id (1–7).
  const tone = ((hashTone(contact.id) % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  return (
    <div className="ds-card">
      <div className="ds-card__body" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <Avatar name={displayName} size={56} tone={tone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0 }}>
              {displayName}
            </h2>
            {contact.vip && (
              <span className="chip chip--warn" title="VIP">
                <Icon name="star" size={12} />
                VIP
              </span>
            )}
            <span className="chip" style={{ background: meta.bgTint, color: meta.fg }} title={meta.description}>
              {meta.label}
            </span>
          </div>

          {contact.companyName && (
            <div className="dim" style={{ fontSize: 13, marginTop: 2 }}>
              {contact.companyName}
            </div>
          )}

          <div className="row" style={{ gap: 16, flexWrap: "wrap", marginTop: 12 }}>
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="row" style={{ gap: 6, fontSize: 13, color: "var(--ink-2)", textDecoration: "none" }}>
                <Icon name="mail" size={14} style={{ color: "var(--rl-muted-2)" }} />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="row mono" style={{ gap: 6, fontSize: 13, color: "var(--ink-2)", textDecoration: "none" }}>
                <Icon name="phone" size={14} style={{ color: "var(--rl-muted-2)" }} />
                {contact.phone}
              </a>
            )}
            {!contact.email && !contact.phone && (
              <span className="dim" style={{ fontSize: 13 }}>
                No contact methods on file
              </span>
            )}
          </div>

          <div className="row" style={{ gap: 16, flexWrap: "wrap", marginTop: 10 }}>
            <Meta label="Added" value={fmtDate(contact.createdAt)} />
            <Meta label="Last activity" value={contact.lastActivityAt ? fmtDate(contact.lastActivityAt) : "—"} />
            {contact.consentStatus && <Meta label="Consent" value={prettyConsent(contact.consentStatus)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="lbl-mono" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{value}</div>
    </div>
  );
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function prettyConsent(s: string): string {
  switch (s) {
    case "opted_in":
      return "Opted in";
    case "opted_out":
      return "Opted out";
    default:
      return "Unknown";
  }
}

function hashTone(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
