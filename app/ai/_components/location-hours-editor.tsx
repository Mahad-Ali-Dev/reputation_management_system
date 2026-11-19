"use client";

import { GlassSelect } from "@/components/ui/glass-select";
import { autosaveAiTraining } from "@/lib/ai/training-actions";
import { MapPin, PenLine } from "lucide-react";
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

  const timeOptions = TIMES.map((t) => ({ value: t, label: to12h(t) }));
  const dayCount = DAYS.filter(([k]) => hours[k]?.open).length;

  if (!editing) {
    return (
      <div className="kb-loc">
        <div className="kb-loc__addr">
          <MapPin size={17} strokeWidth={1.8} className="kb-loc__pin" aria-hidden="true" />
          <span className="kb-loc__text">{address ?? "No location added"}</span>
          {saved && (
            <span className="kb-dot-label" aria-live="polite">
              Saved
            </span>
          )}
          <button
            type="button"
            className="kb-loc__edit"
            aria-label="Edit location and hours"
            onClick={() => setEditing(true)}
          >
            <PenLine size={14} strokeWidth={1.8} />
          </button>
        </div>

        <button
          type="button"
          className="kb-loc__hours"
          onClick={() => setEditing(true)}
          aria-label="Edit opening hours"
        >
          <span className="kb-loc__row">
            <span className="kb-loc__label">Opening hours</span>
            <span className="kb-loc__times">
              {dayCount === 0 ? "Not set" : `${to12h(openTime)} – ${to12h(closeTime)}`}
            </span>
          </span>
          <span className="kb-days">
            {DAYS.map(([k, l]) => (
              <span key={k} className={`kb-day${hours[k]?.open ? " is-on" : ""}`}>
                {l}
              </span>
            ))}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="kb-loc kb-loc--edit">
      <label className="kb-field">
        <span className="kb-field__lbl">Address</span>
        <input
          className="kb-input"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="123 Main St, Springfield"
        />
      </label>

      <div className="kb-field">
        <span className="kb-field__lbl">Open on</span>
        <div className="kb-days">
          {DAYS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleDay(k)}
              aria-pressed={openDays.has(k)}
              className={`kb-day kb-day--btn${openDays.has(k) ? " is-on" : ""}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="kb-loc__timepick">
        <div className="kb-field">
          <span className="kb-field__lbl">Opens</span>
          <GlassSelect
            options={timeOptions}
            value={openTime}
            onChange={setOpenTime}
            searchable
            searchPlaceholder="Search times"
            ariaLabel="Opening time"
          />
        </div>
        <div className="kb-field">
          <span className="kb-field__lbl">Closes</span>
          <GlassSelect
            options={timeOptions}
            value={closeTime}
            onChange={setCloseTime}
            searchable
            searchPlaceholder="Search times"
            ariaLabel="Closing time"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="kb-alert">
          {error}
        </p>
      )}

      <div className="kb-loc__actions">
        <button type="button" className="kb-pill" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="button" className="kb-pill kb-pill--pri" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
