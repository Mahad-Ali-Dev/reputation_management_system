"use client";

import { Icon } from "@/components/shell/icon";
import { type CSSProperties, useEffect, useState } from "react";

/**
 * Real search + channel + status filters for the Sent-History table.
 *
 * HistoryTab stays a server component (fetches live requests + stats); this
 * client island filters the already-rendered `<tr>`s in-place by toggling their
 * `hidden` attribute. Each row carries `data-search` (name+recipient, lowercased),
 * `data-channel` (email|sms) and `data-status`. Before this the toolbar was
 * static `<span>`s that looked like a search box + dropdowns but did nothing.
 */
export function HistoryFilters({ targetId }: { targetId: string }) {
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<"all" | "email" | "sms">("all");
  const [status, setStatus] = useState<string>("all");

  useEffect(() => {
    const table = document.getElementById(targetId);
    if (!table) return;
    const rows = table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-search]");
    const needle = q.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const hay = row.dataset.search ?? "";
      const ch = row.dataset.channel ?? "";
      const st = row.dataset.status ?? "";
      const match =
        (!needle || hay.includes(needle)) &&
        (channel === "all" || ch === channel) &&
        (status === "all" || st === status);
      row.hidden = !match;
      if (match) visible++;
    }
    // Reflect the filtered count in the pagination info line, if present.
    const info = document.getElementById(`${targetId}-count`);
    if (info)
      info.textContent = `Showing ${visible} of ${rows.length} result${rows.length === 1 ? "" : "s"}`;
  }, [q, channel, status, targetId]);

  return (
    <>
      <label className="rr-filterctrl" style={{ cursor: "pointer" }}>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as "all" | "email" | "sms")}
          aria-label="Filter by channel"
          style={selectStyle}
        >
          <option value="all">All channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <Icon name="chevD" size={13} />
      </label>
      <label className="rr-filterctrl" style={{ cursor: "pointer" }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          style={selectStyle}
        >
          <option value="all">All status</option>
          <option value="queued">Queued</option>
          <option value="scheduled">Scheduled</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="reviewed">Reviewed</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
        </select>
        <Icon name="chevD" size={13} />
      </label>
      <span className="rr-searchbox" style={{ minWidth: 200 }}>
        <Icon name="search" size={14} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by recipient…"
          aria-label="Search sent history by recipient"
          style={{
            border: 0,
            background: "none",
            font: "inherit",
            color: "inherit",
            outline: "none",
            width: "100%",
          }}
        />
      </span>
    </>
  );
}

const selectStyle: CSSProperties = {
  border: 0,
  background: "none",
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  appearance: "none",
  outline: "none",
};
