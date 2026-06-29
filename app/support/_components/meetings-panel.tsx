"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { ChannelGlyph } from "./channel-glyph";
import { updateMeetingRequestStatus } from "../meetings/actions";
import { MEETING_STATUSES, type MeetingStatus } from "../meetings/constants";

/**
 * Meeting requests panel (Unified Inbox — "Meeting requests" tab), rebuilt to the
 * delivered meeting-request kit. Client island fed serialized rows + counts by
 * the shell's <MeetingsTab/> server loader (RSC-safe — the page does the DB read;
 * this owns row selection + the detail panel).
 *
 * Active state: status filter pills + 4 stat tiles + a request table + a detail
 * panel (preferred time / channel / actions). Empty state: the kit illustration
 * card + a 3-step setup card. Status changes (accept / reschedule / decline) use
 * the `updateMeetingRequestStatus` "use server" action via inline forms (manager-
 * gated server-side).
 */

export type MeetingRowView = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  preferredTime: string | null;
  source: string;
  status: string;
  createdAt: string; // ISO
};

const FILTERS: { key: "all" | MeetingStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "declined", label: "Declined" },
];

const NEXT_ACTIONS: Record<MeetingStatus, MeetingStatus[]> = {
  new: ["scheduled", "contacted", "declined"],
  contacted: ["scheduled", "declined"],
  scheduled: ["contacted", "declined"],
  declined: ["new", "contacted"],
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  declined: "Declined",
};

export function MeetingsPanel({
  rows,
  counts,
  activeFilter = "all",
}: {
  rows: MeetingRowView[];
  counts: Record<string, number>;
  activeFilter?: "all" | MeetingStatus;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* Filter pills */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTERS.map((f) => {
          const count = f.key === "all" ? totalAll : (counts[f.key] ?? 0);
          const isActive = activeFilter === f.key;
          const href = f.key === "all" ? "/support?tab=meetings" : `/support?tab=meetings&status=${f.key}`;
          return (
            <Link key={f.key} href={href} className={`uik-chip${isActive ? " uik-chip--pri is-active" : ""}`}>
              {f.label}
              <span className="uik-chip__count">{count}</span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <MeetingsEmpty />
      ) : (
        <>
          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
            <StatTile icon="cal" tint="#eef1ff" iconColor="var(--uik-pri)" num={totalAll} label="Total requests" />
            <StatTile icon="bell" tint="#fff4d8" iconColor="#b45309" num={counts.new ?? 0} label="New" />
            <StatTile icon="reply" tint="#eef2ff" iconColor="var(--uik-purple)" num={counts.contacted ?? 0} label="Contacted" />
            <StatTile icon="checkCircle" tint="#e8fbf1" iconColor="#099a5a" num={counts.scheduled ?? 0} label="Scheduled" />
          </div>

          {/* Table + detail */}
          <div className="uik-card uik-mr-grid">
            {/* Table */}
            <div style={{ overflowY: "auto", minWidth: 0 }}>
              <div
                className="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.6fr) 110px 130px 120px",
                  gap: 10,
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: "var(--uik-mut)",
                }}
              >
                <span>Customer &amp; request</span>
                <span>Preferred</span>
                <span>Source</span>
                <span>Status</span>
              </div>
              {rows.map((r) => (
                <MeetingRow key={r.id} row={r} active={r.id === selectedId} onSelect={() => setSelectedId(r.id)} />
              ))}
            </div>

            {/* Detail panel */}
            <div style={{ borderLeft: "1px solid var(--uik-line)", overflowY: "auto" }}>
              {selected ? (
                <MeetingDetail row={selected} />
              ) : (
                <p className="uik-mut" style={{ fontSize: 13, textAlign: "center", padding: 40 }}>
                  Select a request to view details.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon,
  tint,
  iconColor,
  num,
  label,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  tint: string;
  iconColor: string;
  num: number;
  label: string;
}) {
  return (
    <div className="uik-stat row" style={{ gap: 12, alignItems: "center" }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: tint, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="uik-stat__num">{num}</div>
        <div className="uik-stat__label">{label}</div>
      </div>
    </div>
  );
}

function MeetingRow({ row, active, onSelect }: { row: MeetingRowView; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`uik-mr-row${active ? " is-active" : ""}`}>
      <span className="row" style={{ gap: 10, minWidth: 0 }}>
        <Avatar name={row.name} size={36} tone={((row.id.charCodeAt(0) % 7) + 1) as 1} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--uik-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.name}
          </span>
          <span className="uik-mut" style={{ display: "block", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.message || row.email || "Meeting request"}
          </span>
        </span>
      </span>
      <span className="uik-mut" style={{ fontSize: 12 }}>{row.preferredTime || "—"}</span>
      <span className="row" style={{ gap: 6, fontSize: 12, color: "var(--uik-ink-2)" }}>
        <ChannelGlyph channel={sourceToChannel(row.source)} size={14} />
        {sourceLabel(row.source)}
      </span>
      <span>
        <span className={`uik-pill ${meetingPill(row.status)}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
      </span>
    </button>
  );
}

function MeetingDetail({ row }: { row: MeetingRowView }) {
  const status = (row.status as MeetingStatus) in NEXT_ACTIONS ? (row.status as MeetingStatus) : "new";
  return (
    <div>
      {/* Header */}
      <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--uik-divider)" }}>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <Avatar name={row.name} size={48} tone={((row.id.charCodeAt(0) % 7) + 1) as 1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 7, alignItems: "center" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--uik-ink)" }}>{row.name}</h3>
              <span className={`uik-pill ${meetingPill(row.status)}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
            </div>
            <div className="row" style={{ gap: 14, marginTop: 6, flexWrap: "wrap", fontSize: 12.5, color: "var(--uik-ink-2)" }}>
              {row.email && (
                <a href={`mailto:${row.email}`} className="row" style={{ gap: 5, color: "inherit", textDecoration: "none" }}>
                  <Icon name="mail" size={13} />
                  {row.email}
                </a>
              )}
              {row.phone && (
                <a href={`tel:${row.phone}`} className="row" style={{ gap: 5, color: "inherit", textDecoration: "none" }}>
                  <Icon name="phone" size={13} />
                  {row.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div style={{ padding: "16px 20px", display: "grid", gap: 16 }}>
        <DetailRow icon="cal" label="Preferred date & time" value={row.preferredTime || "No preference given"} />
        <DetailRow icon="chat" label="Preferred channel" value={sourceLabel(row.source)} />
        <DetailRow icon="clock" label="Request received" value={formatWhen(row.createdAt)} />
        {row.message && (
          <div>
            <span className="uik-field__label" style={{ marginBottom: 6 }}>
              <Icon name="survey" size={12} /> Message
            </span>
            <p style={{ margin: 0, fontSize: 13, color: "var(--uik-ink)", lineHeight: 1.55, whiteSpace: "pre-wrap", background: "var(--uik-soft)", border: "1px solid var(--uik-divider)", borderRadius: "var(--uik-r-md)", padding: 12 }}>
              {row.message}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "0 20px 20px" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {NEXT_ACTIONS[status].map((next) => (
            <form key={next} action={updateMeetingRequestStatus}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="status" value={next} />
              <button
                type="submit"
                className={
                  next === "scheduled"
                    ? "uik-btn uik-btn--sm uik-btn--purple"
                    : next === "declined"
                      ? "uik-btn uik-btn--sm"
                      : "uik-btn uik-btn--sm"
                }
              >
                {next === "scheduled" && <Icon name="checkCircle" size={13} />}
                {next === "contacted" && <Icon name="reply" size={13} />}
                {next === "declined" && <Icon name="x" size={13} />}
                {next === "new" && <Icon name="refresh" size={13} />}
                {next === "scheduled" ? "Confirm meeting" : next === "contacted" ? "Mark contacted" : next === "declined" ? "Decline" : "Reopen"}
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; value: string }) {
  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--uik-soft)", color: "var(--uik-pri)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={15} />
      </span>
      <div>
        <span className="uik-field__label">{label}</span>
        <span className="uik-field__value">{value}</span>
      </div>
    </div>
  );
}

function MeetingsEmpty() {
  return (
    <div className="uik-card" style={{ background: "transparent", border: 0, boxShadow: "none", overflow: "visible" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 342px", gap: 24, alignItems: "stretch" }}>
        {/* Illustration card */}
        <div className="uik-mempty">
          <div>
            <h3 className="uik-empty__title" style={{ fontSize: 30 }}>No meeting requests yet</h3>
            <p className="uik-empty__body" style={{ maxWidth: 360 }}>
              When a visitor asks to book a meeting through your website chat, their request will
              appear here.
            </p>
            <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 6 }}>
              <Link href="/support?tab=live-chat&sub=deploy" className="uik-btn uik-btn--purple">
                <Icon name="chat" size={13} />
                Set up website chat
              </Link>
              <Link href="/connections" className="uik-btn">
                <Icon name="plug" size={13} />
                Connect channels
              </Link>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img
              src="/assets/repulabs/unified-inbox/meeting-empty.svg"
              alt=""
              aria-hidden="true"
              style={{ width: "100%", maxWidth: 480, height: "auto", mixBlendMode: "multiply" }}
            />
          </div>
        </div>

        {/* Steps card */}
        <div className="uik-steps-card">
          <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 22px", color: "var(--uik-ink)", maxWidth: 260 }}>
            Get meeting requests in 3 simple steps
          </h3>
          <Step n={1} icon="chat" title="Enable website chat" body="Add our chat widget to your website so visitors can start a conversation." />
          <Step n={2} icon="share" title="Connect channels" body="Link the channels you use so all messages come into one place." />
          <Step n={3} icon="send" title="Start receiving requests" body="Visitors can book meetings and their requests will show up here." />
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, title, body }: { n: number; icon: Parameters<typeof Icon>[0]["name"]; title: string; body: string }) {
  return (
    <div className="uik-step">
      <span className="uik-step__num">{n}</span>
      <span className="uik-step__icon">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--uik-ink)" }}>{title}</p>
        <p className="uik-mut" style={{ fontSize: 11.5, margin: "3px 0 0", lineHeight: 1.5 }}>{body}</p>
      </div>
    </div>
  );
}

/* ---- helpers ---- */

function sourceToChannel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("web") || s.includes("chat") || s.includes("widget")) return "webchat";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("instagram")) return "instagram_dm";
  if (s.includes("facebook")) return "facebook_msg";
  if (s.includes("email")) return "email";
  if (s.includes("phone")) return "phone";
  return "webchat";
}

function sourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("web") || s.includes("chat") || s.includes("widget")) return "Website chat";
  if (s.includes("whatsapp")) return "WhatsApp";
  if (s.includes("instagram")) return "Instagram";
  if (s.includes("facebook")) return "Facebook";
  if (s.includes("email")) return "Email";
  if (s.includes("phone")) return "Phone";
  return source || "Website chat";
}

function meetingPill(status: string): string {
  switch (status) {
    case "scheduled":
      return "uik-pill--replied";
    case "contacted":
      return "uik-pill--info";
    case "declined":
      return "uik-pill--hidden";
    default:
      return "uik-pill--starred";
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString();
  }
}
