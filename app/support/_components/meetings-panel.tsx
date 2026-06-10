import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import { EmptyState } from "@/components/empty-state";
import { withTenant } from "@/lib/db/with-tenant";
import { isMissingRelation } from "@/lib/inbox/fail-soft";
import { updateMeetingRequestStatus } from "../meetings/actions";
import { MEETING_STATUSES, type MeetingStatus } from "../meetings/constants";

/**
 * Meeting-requests panel (Module 09 — Unified Inbox, "Meeting requests" view).
 *
 * Folded INTO the unified workspace as a secondary management view. This is the
 * SAME queue that previously lived at `/support/meetings` — the page body moved
 * here verbatim (query, status chips, manager-gated status control) so the data,
 * the `updateMeetingRequestStatus` server action, and the public widget capture
 * endpoint (POST /api/widget/meeting-request) all keep working unchanged. The
 * legacy `/support/meetings` route is now a redirect into `/support?tab=meetings`.
 *
 * SERVER component: DB reads only (RSC-safe). Filterable by status via `?status=`.
 *
 * FAIL-SOFT: the meeting_requests table ships via a manually-applied migration; on
 * a not-yet-migrated DB the read degrades to an empty list (isMissingRelation) so
 * the workspace never 500s. Writes are RBAC-gated + fail-soft in ../meetings/actions.
 */

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  preferredTime: string | null;
  source: string;
  status: string;
  createdAt: Date;
};

const FILTERS: { key: "all" | MeetingStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "declined", label: "Declined" },
];

// Status → next-action buttons offered for a row.
const NEXT_ACTIONS: Record<MeetingStatus, MeetingStatus[]> = {
  new: ["contacted", "scheduled", "declined"],
  contacted: ["scheduled", "declined"],
  scheduled: ["contacted", "declined"],
  declined: ["new", "contacted"],
};

const STATUS_LABEL: Record<MeetingStatus, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  declined: "Declined",
};

function statusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "scheduled":
      return { background: "rgba(16,185,129,.12)", color: "#047857", border: "1px solid rgba(16,185,129,.25)" };
    case "contacted":
      return { background: "rgba(59,130,246,.12)", color: "#1d4ed8", border: "1px solid rgba(59,130,246,.25)" };
    case "declined":
      return { background: "rgba(100,116,139,.12)", color: "#475569", border: "1px solid rgba(100,116,139,.22)" };
    default: // new
      return { background: "rgba(245,158,11,.14)", color: "#b45309", border: "1px solid rgba(245,158,11,.28)" };
  }
}

function formatWhen(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export async function MeetingsPanel({
  orgId,
  status,
}: {
  orgId: string;
  status?: string;
}) {
  const active: "all" | MeetingStatus =
    status && (MEETING_STATUSES as readonly string[]).includes(status)
      ? (status as MeetingStatus)
      : "all";

  // FAIL-SOFT: degrade to an empty list on a not-yet-migrated DB.
  const rows: Row[] = await withTenant(orgId, async (tx) =>
    tx.meetingRequest.findMany({
      where: active === "all" ? {} : { status: active },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        message: true,
        preferredTime: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return [] as Row[];
    throw err;
  });

  // Status counts for the filter chips (over the full set, unfiltered).
  const counts: Record<string, number> = await withTenant(orgId, async (tx) => {
    const grouped = await tx.meetingRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) out[g.status] = g._count._all;
    return out;
  }).catch((err: unknown) => {
    if (isMissingRelation(err)) return {} as Record<string, number>;
    throw err;
  });
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* Status filter chips (deep-link within the unified workspace). */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTERS.map((f) => {
          const count = f.key === "all" ? totalAll : (counts[f.key] ?? 0);
          const isActive = active === f.key;
          const href =
            f.key === "all"
              ? "/support?tab=meetings"
              : `/support?tab=meetings&status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={`btn btn--sm${isActive ? "" : " btn--ghost"}`}
              aria-current={isActive ? "page" : undefined}
              style={{ textDecoration: "none" }}
            >
              {f.label}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  opacity: 0.7,
                }}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          illustration="messages-empty"
          icon="📅"
          title={active === "all" ? "No meeting requests yet" : `No ${active} requests`}
          description={
            active === "all"
              ? "When a visitor asks to book a meeting through your website chat, it will appear here for you to action."
              : "Nothing in this status right now. Try a different filter."
          }
          primaryAction={{ label: "Set up website chat", href: "/support?tab=live-chat" }}
          secondaryAction={{ label: "Connect channels", href: "/connections" }}
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((r) => (
            <div key={r.id} className="ds-card" style={{ padding: 18 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220, flex: 1 }}>
                  <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 6 }}>
                    <strong style={{ fontSize: 15 }}>{r.name}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 9px",
                        borderRadius: 999,
                        textTransform: "capitalize",
                        ...statusBadgeStyle(r.status),
                      }}
                    >
                      {r.status}
                    </span>
                  </div>

                  <div className="row" style={{ gap: 14, flexWrap: "wrap", fontSize: 13, color: "var(--rl-muted)" }}>
                    {r.email && (
                      <span className="row" style={{ gap: 5 }}>
                        <Icon name="mail" size={13} />
                        <a href={`mailto:${r.email}`} style={{ color: "inherit" }}>{r.email}</a>
                      </span>
                    )}
                    {r.phone && (
                      <span className="row" style={{ gap: 5 }}>
                        <Icon name="phone" size={13} />
                        <a href={`tel:${r.phone}`} style={{ color: "inherit" }}>{r.phone}</a>
                      </span>
                    )}
                    {r.preferredTime && (
                      <span className="row" style={{ gap: 5 }}>
                        <Icon name="cal" size={13} />
                        {r.preferredTime}
                      </span>
                    )}
                    <span className="row" style={{ gap: 5 }}>
                      <Icon name="clock" size={13} />
                      {formatWhen(r.createdAt)}
                    </span>
                  </div>

                  {r.message && (
                    <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--rl-text)", whiteSpace: "pre-wrap" }}>
                      {r.message}
                    </p>
                  )}
                </div>

                {/* Status control (manager-gated server action) */}
                <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {NEXT_ACTIONS[(r.status as MeetingStatus) in NEXT_ACTIONS ? (r.status as MeetingStatus) : "new"].map(
                    (next) => (
                      <form key={next} action={updateMeetingRequestStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value={next} />
                        <button
                          type="submit"
                          className={`btn btn--sm${next === "declined" ? " btn--ghost" : ""}`}
                        >
                          {next === "scheduled" && <Icon name="checkCircle" size={13} />}
                          {next === "contacted" && <Icon name="reply" size={13} />}
                          {next === "declined" && <Icon name="x" size={13} />}
                          {next === "new" && <Icon name="refresh" size={13} />}
                          {STATUS_LABEL[next]}
                        </button>
                      </form>
                    ),
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
