"use client";

import { Icon } from "@/components/shell/icon";
import { GlassSelect } from "@/components/ui/glass-select";
import { useEffect, useRef, useState } from "react";

/**
 * Real search / status-filter / view-toggle for the Automation Rules list.
 *
 * The list itself stays server-rendered (AutomationTab is a server component
 * that fetches live rules). This thin client island filters the already-rendered
 * `.rr-rule` cards in-place by toggling their `hidden` attribute — the cards
 * carry `data-search` (lowercased title+trigger) and `data-status`
 * (active|paused). Before this the toolbar was static `<span>`s that looked like
 * a search box + filter but did nothing (reported bug: "Search button not
 * working").
 */
export function AutomationToolbar({ targetId }: { targetId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused">("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const emptyRef = useRef<HTMLOutputElement | null>(null);

  // Apply filters to the server-rendered cards.
  useEffect(() => {
    const list = document.getElementById(targetId);
    if (!list) return;
    const cards = list.querySelectorAll<HTMLElement>(".rr-rule");
    const needle = q.trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const hay = card.dataset.search ?? "";
      const st = card.dataset.status ?? "";
      const match = (!needle || hay.includes(needle)) && (status === "all" || st === status);
      card.hidden = !match;
      if (match) visible++;
    }
    list.classList.toggle("rr-rules--grid", view === "grid");
    if (emptyRef.current) emptyRef.current.hidden = visible !== 0 || cards.length === 0;
  }, [q, status, view, targetId]);

  return (
    <div className="rr-listbar__ctrls">
      <div className="rr-gsel">
        <GlassSelect
          value={status}
          onChange={(v) => setStatus(v as "all" | "active" | "paused")}
          ariaLabel="Filter rules by status"
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
          ]}
        />
      </div>
      <span className="rr-searchbox">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rules…"
          aria-label="Search automation rules"
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
      <div className="rr-viewtoggle" role="group" aria-label="View mode">
        <button
          type="button"
          className={view === "list" ? "is-active" : ""}
          aria-label="List view"
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          <Icon name="bars" size={15} />
        </button>
        <button
          type="button"
          className={view === "grid" ? "is-active" : ""}
          aria-label="Grid view"
          aria-pressed={view === "grid"}
          onClick={() => setView("grid")}
        >
          <Icon name="grid" size={15} />
        </button>
      </div>
      {/* "no matches" note, revealed by the effect when a filter hides everything */}
      <output ref={emptyRef} hidden className="rr-nomatch">
        No rules match your search.
      </output>
    </div>
  );
}
