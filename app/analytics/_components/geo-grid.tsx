"use client";

import { Icon } from "@/components/shell/icon";
import { scheduleGeoPost } from "@/lib/seo/actions";
import { useState, useTransition } from "react";

/**
 * `<GeoGrid>` (Module 13) — the 5-mile ranking heatmap.
 *
 * Renders `GeoGridSnapshot.cells` as a colored NxN grid (green = ranking well,
 * red = poor). Clicking a cell opens a small "Draft geo-post for this area"
 * affordance that posts the cell's lat/lng to the `scheduleGeoPost` server
 * action, which saves a DRAFT into the Social composer (it does NOT auto-publish
 * — the user finishes and publishes it in Social). Presentational over props;
 * does NOT fetch data.
 */

export type GeoGridProps = {
  keyword: string;
  gridSize: number;
  cells: { lat: number; lng: number; position: number | null }[];
  establishmentId?: string | null;
  /** Disable drafting (e.g. not entitled) — cells still render, click is a no-op note. */
  canSchedule?: boolean;
};

/** Map a rank position to a heat color (1 = best/green … none = red). */
function cellColor(position: number | null): string {
  if (position == null) return "var(--bad)";
  if (position <= 3) return "var(--ok)";
  if (position <= 7) return "var(--warn)";
  if (position <= 15) return "#f59e0b";
  return "var(--bad)";
}

export function GeoGrid({
  keyword,
  gridSize,
  cells,
  establishmentId,
  canSchedule = true,
}: GeoGridProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (cells.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: 0 }}>
        No geo-grid data yet. Once rank tracking runs, your 5-mile ranking heatmap appears here.
      </p>
    );
  }

  const size = Math.max(1, gridSize);

  function onSchedule(index: number, cell: GeoGridProps["cells"][number]) {
    setError(null);
    const fd = new FormData();
    fd.set("lat", String(cell.lat));
    fd.set("lng", String(cell.lng));
    fd.set("keyword", keyword);
    if (establishmentId) fd.set("establishmentId", establishmentId);
    startTransition(async () => {
      const res = await scheduleGeoPost(fd);
      if (res.ok) {
        setDone((prev) => new Set(prev).add(index));
        setSelected(null);
      } else {
        setError(
          res.reason === "unmigrated"
            ? "Reporting isn't set up yet."
            : "Couldn't save the draft — try again.",
        );
      }
    });
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`Ranking heatmap for "${keyword}", ${size} by ${size} grid`}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: 4,
          maxWidth: 360,
        }}
      >
        {cells.map((cell, i) => {
          const isSel = selected === i;
          const isDone = done.has(i);
          return (
            <button
              key={`${cell.lat}-${cell.lng}-${i}`}
              type="button"
              onClick={() => setSelected(isSel ? null : i)}
              title={cell.position == null ? "Not ranking here" : `Position #${cell.position}`}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 6,
                border: isSel ? "2px solid var(--ink)" : "1px solid var(--line)",
                background: cellColor(cell.position),
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                cursor: "pointer",
                position: "relative",
                opacity: isDone ? 0.55 : 1,
              }}
            >
              {cell.position == null ? "—" : cell.position}
              {isDone && (
                <span style={{ position: "absolute", top: 2, right: 3 }}>
                  <Icon name="check" size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, color: "var(--rl-muted)" }}>
        <Legend color="var(--ok)" label="Top 3" />
        <Legend color="var(--warn)" label="4–7" />
        <Legend color="#f59e0b" label="8–15" />
        <Legend color="var(--bad)" label="16+ / none" />
      </div>

      {/* Honest confirmation: drafts are saved, not auto-published. */}
      {done.size > 0 && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--ok)" }}>
          {done.size === 1 ? "Draft saved" : `${done.size} drafts saved`} to{" "}
          <a href="/social/posts" style={{ color: "inherit", textDecoration: "underline" }}>
            Social
          </a>
          . Review, then publish or schedule there — geo-posts aren’t published automatically.
        </p>
      )}

      {/* Schedule affordance for the selected cell */}
      {selected != null && cells[selected] && (
        <div
          className="ds-card"
          style={{ marginTop: 12, background: "var(--surface-2)" }}
        >
          <div className="ds-card__body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--ink)" }}>
              <strong>
                {cells[selected]!.position == null
                  ? "Not ranking"
                  : `Position #${cells[selected]!.position}`}
              </strong>{" "}
              <span style={{ color: "var(--rl-muted)" }}>
                at {cells[selected]!.lat.toFixed(4)}, {cells[selected]!.lng.toFixed(4)}
              </span>
            </div>
            {canSchedule ? (
              <button
                type="button"
                className="btn btn--sm btn--pri"
                disabled={pending}
                onClick={() => onSchedule(selected, cells[selected]!)}
              >
                <Icon name="pin" size={13} />
                {pending ? "Saving draft…" : "Draft geo-post in Social"}
              </button>
            ) : (
              <span style={{ fontSize: 12, color: "var(--rl-muted-2)" }}>Upgrade to draft geo-posts</span>
            )}
          </div>
          {error && (
            <div className="ds-card__body" style={{ paddingTop: 0, color: "var(--bad)", fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
