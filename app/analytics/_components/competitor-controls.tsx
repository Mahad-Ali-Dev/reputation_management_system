"use client";

import { Icon } from "@/components/shell/icon";
import { addCompetitor, removeCompetitor } from "@/lib/seo/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Client controls for the Competitors tab (Module 13): the "Add competitor"
 * dialog + the per-row remove button. Both post to the `addCompetitor` /
 * `removeCompetitor` server actions and refresh the route. The 3-cap is
 * enforced server-side; the add button disables at the cap here for UX.
 */
export function CompetitorControls({
  establishmentId,
  atCap,
}: {
  establishmentId: string | null;
  atCap: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (establishmentId) fd.set("establishmentId", establishmentId);
    startTransition(async () => {
      const res = await addCompetitor(fd);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(
          res.reason === "cap_reached"
            ? "You can track at most 3 competitors."
            : res.reason === "invalid_input"
              ? "Enter a valid name (and URL if provided)."
              : res.reason === "unmigrated"
                ? "Reporting tables aren't set up yet."
                : "Couldn't add — try again.",
        );
      }
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn--sm btn--pri"
        onClick={() => setOpen((o) => !o)}
        disabled={atCap}
        title={atCap ? "Competitor limit reached (3)" : "Add a competitor"}
      >
        <Icon name="plus" size={13} /> Add competitor
      </button>

      {open && !atCap && (
        <div
          className="ds-card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 20,
            width: 320,
            boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))",
          }}
        >
          <form
            onSubmit={onSubmit}
            className="ds-card__body"
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Add competitor</div>
            <label style={lbl}>
              Business name
              <input
                name="name"
                required
                maxLength={160}
                className="input"
                placeholder="e.g. Downtown Dental"
                style={inp}
              />
            </label>
            <label style={lbl}>
              Website (optional)
              <input
                name="websiteUrl"
                type="url"
                maxLength={500}
                className="input"
                placeholder="https://…"
                style={inp}
              />
            </label>
            {error && <div style={{ fontSize: 12, color: "var(--bad)" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn--sm btn--pri" disabled={pending}>
                {pending ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/** Per-row remove button (static member so the matrix can render it inline). */
function RemoveButton({ id, establishmentId }: { id: string; establishmentId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const fd = new FormData();
    fd.set("id", id);
    if (establishmentId) fd.set("establishmentId", establishmentId);
    startTransition(async () => {
      await removeCompetitor(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="Remove competitor"
      title="Remove"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--rl-muted-2)",
        display: "inline-flex",
        padding: 2,
      }}
    >
      <Icon name="x" size={13} />
    </button>
  );
}

CompetitorControls.RemoveButton = RemoveButton;

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "var(--rl-muted)",
};
const inp: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 6,
  border: "1px solid var(--line)",
  fontSize: 13,
  background: "var(--surface)",
  color: "var(--ink)",
};
