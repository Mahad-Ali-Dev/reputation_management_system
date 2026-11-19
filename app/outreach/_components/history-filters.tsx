"use client";

import { Icon } from "@/components/shell/icon";
import { GlassSelect } from "@/components/ui/glass-select";
import { useEffect, useState } from "react";

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
      <div className="rr-gsel">
        <GlassSelect
          value={channel}
          onChange={(v) => setChannel(v as "all" | "email" | "sms")}
          ariaLabel="Filter by channel"
          options={[
            { value: "all", label: "All channels" },
            { value: "email", label: "Email" },
            { value: "sms", label: "SMS" },
          ]}
        />
      </div>
      <div className="rr-gsel">
        <GlassSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "all", label: "All statuses" },
            { value: "queued", label: "Queued" },
            { value: "scheduled", label: "Scheduled" },
            { value: "sent", label: "Sent" },
            { value: "delivered", label: "Delivered" },
            { value: "opened", label: "Opened" },
            { value: "clicked", label: "Clicked" },
            { value: "reviewed", label: "Reviewed" },
            { value: "bounced", label: "Bounced" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </div>
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
