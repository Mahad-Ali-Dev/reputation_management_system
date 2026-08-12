"use client";

import { Icon } from "@/components/shell/icon";
import { autosaveAiTraining } from "@/lib/ai/training-actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Inline editor for the Knowledge tab's "Business location" card.
 *
 * WHY: the card rendered the address, per-day chips, open/close times and a
 * toggle as STATIC spans dressed with dropdown chevrons — they looked like
 * controls and did nothing. The first fix pointed the whole row at
 * /ai/training, but bouncing to another page to change an opening time is still
 * the wrong answer when the control is right there.
 *
 * Saves through the SAME `autosaveAiTraining` action the training workspace
 * uses, so the two surfaces can't disagree. Only the fields shown here are
 * submitted — Prisma ignores `undefined`, so a partial save never clobbers the
 * business overview / services / pricing fields owned by the other screen.
 *
 * Model note: this card shows ONE open/close pair applied to the selected days,
 * matching what the design displays. Per-day different hours remain available in
 * the training workspace, which writes the same columns.
 */

const DAYS: Array<[string, string]> = [
  ["monday", "Mo"],
  ["tuesday", "Tu"],
  ["wednesday", "We"],
  ["thursday", "Th"],
  ["friday", "Fr"],
  ["saturday", "Sa"],
  ["sunday", "Su"],
];

/** 24h "HH:MM" options on the half hour. */
const TIMES: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function to12h(t: string): string {
  const [hStr, m] = t.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}

export function LocationHoursEditor({
  address,
  hours,
}: {
  address: string | null;
  hours: Record<string, { open?: string; close?: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addr, setAddr] = useState(address ?? "");
  const [openDays, setOpenDays] = useState<Set<string>>(
    () => new Set(DAYS.map(([k]) => k).filter((k) => hours[k]?.open)),
  );
  const [openTime, setOpenTime] = useState(
    () => DAYS.map(([k]) => hours[k]?.open).find(Boolean) ?? "09:00",
  );
  const [closeTime, setCloseTime] = useState(
    () => DAYS.map(([k]) => hours[k]?.close).find(Boolean) ?? "17:00",
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(key: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const fd = new FormData();
      fd.set("locations", addr);
      // A CLOSED day submits empty strings — persistTraining treats a blank
      // open/close as "not open", which is how the card renders it back.
      for (const [key] of DAYS) {
        const on = openDays.has(key);
        fd.set(`${key}.open`, on ? openTime : "");
        fd.set(`${key}.close`, on ? closeTime : "");
      }
      const res = await autosaveAiTraining(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save. Try again.");
        return;
      }
      setSaved(true);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <>
        <div className="akb-loc__addr">
          <span className="akb-loc__pin" aria-hidden="true">
            <Icon name="pin" size={15} />
          </span>
          <span className="akb-loc__addr-text">{address ?? "No location added"}</span>
          {saved && (
            <span className="akb-saved">
              <Icon name="checkCircle" size={11} /> Saved
            </span>
          )}
          <button
            type="button"
            className="akb-icon-btn"
            aria-label="Edit location and hours"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={12} />
          </button>
        </div>

        <div className="akb-loc__hours-head">
          <div className="akb-bo__t" style={{ justifyContent: "flex-start" }}>
            Operating hours
          </div>
          <div className="akb-card__sub" style={{ marginTop: 2 }}>
            Set your business operating hours.
          </div>
        </div>
        <div className="akb-loc__days">
          {DAYS.map(([k, l]) => (
            <span key={k} className={`akb-day ${hours[k]?.open ? "is-on" : ""}`}>
              {l}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="akb-loc__times"
          onClick={() => setEditing(true)}
          style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left" }}
        >
          <span className="akb-time">{to12h(openTime)}</span>
          <span className="akb-time__to">to</span>
          <span className="akb-time">{to12h(closeTime)}</span>
        </button>
      </>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label className="aikb-label">
        Address
        <input
          className="aikb-input"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="123 Main St, Springfield"
        />
      </label>

      <div>
        <div className="akb-card__sub" style={{ marginBottom: 6 }}>
          Open on
        </div>
        <div className="akb-loc__days">
          {DAYS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleDay(k)}
              aria-pressed={openDays.has(k)}
              className={`akb-day ${openDays.has(k) ? "is-on" : ""}`}
              style={{ cursor: "pointer", border: 0 }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="aikb-select"
          value={openTime}
          onChange={(e) => setOpenTime(e.target.value)}
          aria-label="Opening time"
        >
          {TIMES.map((t) => (
            <option key={t} value={t}>
              {to12h(t)}
            </option>
          ))}
        </select>
        <span className="akb-time__to">to</span>
        <select
          className="aikb-select"
          value={closeTime}
          onChange={(e) => setCloseTime(e.target.value)}
          aria-label="Closing time"
        >
          {TIMES.map((t) => (
            <option key={t} value={t}>
              {to12h(t)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 12.5, color: "#e14d62", margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="akb-btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="akb-btn-outline" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
