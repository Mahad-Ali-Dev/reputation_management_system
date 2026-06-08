"use client";

import { Icon } from "@/components/shell/icon";
import { updateContactNotes } from "@/lib/contacts/actions";
import { useRef, useState, useTransition } from "react";

/**
 * Notes editor (client). A debounced-autosave textarea → `updateContactNotes`
 * (keyed on `id`; writes `Contact.notes` + a `note_added` activity marker).
 * Saves ~900ms after the last keystroke and on blur; shows a subtle save state.
 */

export function NotesEditor({ contactId, initialNotes }: { contactId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialNotes ?? "");

  function persist(value: string) {
    if (value === lastSavedRef.current) return;
    setStatus("saving");
    const fd = new FormData();
    fd.set("id", contactId);
    fd.set("notes", value);
    startTransition(async () => {
      try {
        await updateContactNotes(fd);
        lastSavedRef.current = value;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch {
        setStatus("error");
      }
    });
  }

  function onChange(value: string) {
    setNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(value), 900);
  }

  function flush() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    persist(notes);
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Notes</h3>
        <span className="dim mono" style={{ fontSize: 10.5 }}>
          {status === "saving" && "SAVING…"}
          {status === "saved" && "SAVED"}
          {status === "error" && "SAVE FAILED"}
        </span>
      </div>
      <div className="ds-card__body">
        <textarea
          className="ds-textarea"
          rows={5}
          placeholder="Private notes about this contact…"
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
        />
        {status === "error" && (
          <p className="row" style={{ gap: 6, fontSize: 12, color: "var(--bad)", marginTop: 8 }}>
            <Icon name="alert" size={12} />
            Couldn’t save — check your connection and try again.
          </p>
        )}
      </div>
    </div>
  );
}
