import { EmptyIllustration } from "@/components/empty-state";
import { Icon } from "@/components/shell/icon";
import { getContactSourceMeta } from "@/lib/contacts/source-meta";
import { getContactWithFields } from "@/lib/contacts/queries";
import { getContactTimeline, type TimelineEvent } from "@/lib/contacts/timeline";
import Link from "next/link";

/**
 * Profile drawer (server) — the right column of the CRM workspace.
 *
 * Driven entirely by `?contact=<id>` (row click = <Link>, no client state).
 * Loads the selected contact via `getContactWithFields` (tenant-scoped,
 * fail-soft) and the first page of the aggregated activity timeline
 * (`getContactTimeline` — same read-time union the full profile page uses).
 * Shows: identity header (VIP / source / consent chips), reachability rows,
 * tags, a compact timeline, and a review-request ELIGIBILITY hint computed
 * from real data (consent + reachable channels + most recent request event).
 * "Open full profile" deep-links to the existing /contacts/[id] page.
 */

const DRAWER_TIMELINE_TAKE = 8;

export async function ProfileDrawer({
  orgId,
  contactId,
  closeHref,
}: {
  orgId: string;
  contactId: string;
  /** Current URL minus the `contact` param (server-built). */
  closeHref: string;
}) {
  const contact = await getContactWithFields({ orgId, id: contactId });

  if (!contact) {
    return (
      <aside className="ds-card crm-drawer" aria-label="Contact profile">
        <div className="crm-drawer__empty">
          <span style={{ color: "var(--rl-muted-3)", display: "inline-flex" }}>
            <Icon name="alert" size={26} />
          </span>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: "10px 0 4px" }}>
            Contact not found
          </h4>
          <p className="dim" style={{ fontSize: 12.5, margin: "0 0 14px" }}>
            It may have been deleted or merged.
          </p>
          <Link href={closeHref} className="btn btn--sm">
            Close
          </Link>
        </div>
      </aside>
    );
  }

  const timeline = await getContactTimeline({
    orgId,
    contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
    take: DRAWER_TIMELINE_TAKE,
  }).catch(() => ({ events: [] as TimelineEvent[], nextCursor: null as string | null }));

  const displayName =
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    contact.phone ||
    "Unnamed contact";
  const initials = initialsOf(displayName);
  const sourceMeta = getContactSourceMeta(contact.source);
  const eligibility = computeEligibility(contact, timeline.events);

  return (
    <aside className="ds-card crm-drawer" aria-label={`Profile: ${displayName}`}>
      {/* Header */}
      <div className="ds-card__head" style={{ gap: 8 }}>
        <h3 className="ds-card__title">Profile</h3>
        <Link
          href={closeHref}
          className="btn btn--ghost btn--sm"
          aria-label="Close profile drawer"
          style={{ padding: "2px 7px" }}
        >
          <Icon name="x" size={13} />
        </Link>
      </div>

      {/* Identity */}
      <div className="crm-drawer__section">
        <div className="row" style={{ gap: 11, alignItems: "center" }}>
          <span className="crm-drawer__avatar" aria-hidden>
            {initials}
          </span>
          <div style={{ minWidth: 0 }}>
            <p className="crm-drawer__name">{displayName}</p>
            {contact.companyName && (
              <p className="dim" style={{ fontSize: 12, margin: "1px 0 0" }}>
                {contact.companyName}
              </p>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {contact.vip && (
            <span className="chip" style={{ background: "#fef3c7", color: "#b45309" }}>
              <Icon name="star" size={11} />
              VIP
            </span>
          )}
          <span className="chip" style={{ background: sourceMeta.bgTint, color: sourceMeta.fg }} title={sourceMeta.description}>
            {sourceMeta.label}
          </span>
          {contact.consentStatus === "opted_in" && <span className="chip chip--ok">Opted in</span>}
          {contact.consentStatus === "opted_out" && <span className="chip chip--bad">Opted out</span>}
        </div>
      </div>

      {/* Reachability */}
      <div className="crm-drawer__section">
        <p className="crm-drawer__kicker">Contact info</p>
        {contact.email && (
          <div className="crm-drawer__row">
            <Icon name="mail" size={13} />
            <span>{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <div className="crm-drawer__row mono">
            <Icon name="phone" size={13} />
            <span>{contact.phone}</span>
          </div>
        )}
        {!contact.email && !contact.phone && (
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            No email or phone on file.
          </p>
        )}
        {contact.tags.length > 0 && (
          <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 8 }}>
            {contact.tags.map((t) => (
              <span key={t} className="chip chip--out" style={{ height: 20, fontSize: 11 }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Eligibility */}
      <div className="crm-drawer__section">
        <p className="crm-drawer__kicker">Request eligibility</p>
        <div className={`crm-elig crm-elig--${eligibility.tone}`}>
          <span style={{ display: "inline-flex", marginTop: 1, flexShrink: 0 }}>
            <Icon name={eligibility.icon} size={14} />
          </span>
          <span>{eligibility.message}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="crm-drawer__section">
        <p className="crm-drawer__kicker">Timeline</p>
        {timeline.events.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            No activity yet — reviews, requests, surveys, and messages will appear here.
          </p>
        ) : (
          <ol className="crm-tl">
            {timeline.events.map((e, i) => (
              <li key={e.id} className="crm-tl__item">
                <span className="crm-tl__rail">
                  <span className="crm-tl__dot" aria-hidden>
                    {e.icon || "•"}
                  </span>
                  {i < timeline.events.length - 1 && <span className="crm-tl__line" />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="crm-tl__title" style={{ display: "block" }}>
                    {e.title}
                  </span>
                  <span className="crm-tl__time">{relativeTime(e.occurredAt)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Footer */}
      <div className="crm-drawer__section">
        <Link
          href={`/contacts/${contact.id}`}
          className="btn btn--pri btn--sm"
          style={{ width: "100%", justifyContent: "center" }}
        >
          Open full profile
          <Icon name="arrowR" size={13} />
        </Link>
      </div>
    </aside>
  );
}

/** Placeholder shown when no contact is selected (keeps the 3-col rhythm). */
export function ProfileDrawerPlaceholder() {
  return (
    <aside className="ds-card crm-drawer" aria-label="Contact profile (empty)">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Profile</h3>
      </div>
      <div className="crm-drawer__empty">
        <EmptyIllustration name="contacts-empty" />
        <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: "12px 0 4px" }}>
          No contact selected
        </h4>
        <p className="dim" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>
          Click a contact in the table to preview their profile, timeline, and request eligibility here.
        </p>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

const RECENT_REQUEST_WINDOW_DAYS = 30;

type Eligibility = {
  tone: "ok" | "warn" | "bad";
  icon: "checkCircle" | "alert" | "xCircle" | "clock";
  message: string;
};

/**
 * Review-request eligibility hint, computed from real data only:
 * consent status + reachable channels + the most recent `review_request`
 * event in the (already-loaded) timeline page.
 */
function computeEligibility(
  contact: { email: string | null; phone: string | null; consentStatus: string | null },
  events: TimelineEvent[],
): Eligibility {
  if (contact.consentStatus === "opted_out") {
    return { tone: "bad", icon: "xCircle", message: "Opted out — do not send review requests." };
  }
  if (!contact.email && !contact.phone) {
    return {
      tone: "warn",
      icon: "alert",
      message: "Not reachable — add an email or phone number to send a request.",
    };
  }
  const lastRequest = events.find((e) => e.channel === "review_request");
  if (lastRequest) {
    const days = Math.floor((Date.now() - new Date(lastRequest.occurredAt).getTime()) / 86_400_000);
    if (days >= 0 && days < RECENT_REQUEST_WINDOW_DAYS) {
      return {
        tone: "warn",
        icon: "clock",
        message: `Requested ${days === 0 ? "today" : `${days}d ago`} — recently contacted, consider waiting.`,
      };
    }
  }
  const channels = [contact.email && "email", contact.phone && "SMS"].filter(Boolean).join(" or ");
  return {
    tone: "ok",
    icon: "checkCircle",
    message: `Eligible — reachable via ${channels}, no recent review request.`,
  };
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 0) return date.toLocaleDateString();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}
