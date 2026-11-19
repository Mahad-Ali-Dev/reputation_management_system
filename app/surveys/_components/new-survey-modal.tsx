"use client";

import { Icon } from "@/components/shell/icon";
import { type ReactNode, useEffect, useState } from "react";
import { CreateWizard, type WizardContact, type WizardTemplate } from "./create-wizard";

/**
 * New Survey — opens the 3-step CreateWizard in a centered glass modal instead
 * of navigating to /surveys/new (mirrors the Add Business modal). The wizard
 * itself navigates to the new campaign on completion, so there's no extra
 * close-on-success wiring; Esc / the scrim / the × close it beforehand.
 */
export function NewSurveyModal({
  contacts,
  templates,
  defaultEstablishmentId,
  triggerClassName = "btn btn--pri",
  children,
}: {
  contacts: WizardContact[];
  templates: WizardTemplate[];
  defaultEstablishmentId?: string;
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Icon name="plus" size={12} />
            New survey
          </>
        )}
      </button>

      {open && (
        <div className="svm-overlay" role="dialog" aria-modal="true" aria-label="New survey">
          <button
            type="button"
            className="svm-scrim"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="svm-modal">
            <div className="svm-modal__head">
              <div style={{ minWidth: 0 }}>
                <span className="svm-modal__eyebrow">Send in 3 steps</span>
                <h2 className="svm-modal__title">New survey</h2>
              </div>
              <button
                type="button"
                className="svm-modal__close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="svm-modal__body">
              <CreateWizard
                contacts={contacts}
                templates={templates}
                defaultEstablishmentId={defaultEstablishmentId}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
