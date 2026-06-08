"use client";

import { Icon } from "@/components/shell/icon";
import { getContactSourceMeta } from "@/lib/contacts/source-meta";
import { updateContact } from "@/lib/contacts/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Editable contact details (client). name / first / last, email, phone (E.164),
 * company, consent status, VIP toggle; source is a read-only badge. Saves via
 * `updateContact` (keyed on `id`). Client validation mirrors the action's E.164
 * + email checks so bad input is caught before the round-trip.
 */

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Initial = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  consentStatus: string | null;
  vip: boolean;
  source: string;
};

export function ContactDetailsForm({ contactId, initial }: { contactId: string; initial: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [firstName, setFirstName] = useState(initial.firstName ?? "");
  const [lastName, setLastName] = useState(initial.lastName ?? "");
  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [consentStatus, setConsentStatus] = useState(initial.consentStatus ?? "unknown");
  const [vip, setVip] = useState(initial.vip);

  const meta = getContactSourceMeta(initial.source);

  function cancel() {
    setFirstName(initial.firstName ?? "");
    setLastName(initial.lastName ?? "");
    setCompanyName(initial.companyName ?? "");
    setEmail(initial.email ?? "");
    setPhone(initial.phone ?? "");
    setConsentStatus(initial.consentStatus ?? "unknown");
    setVip(initial.vip);
    setError(null);
    setEditing(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const em = email.trim();
    const ph = phone.trim();
    if (em && !EMAIL_RE.test(em)) {
      setError("Enter a valid email address.");
      return;
    }
    if (ph && !PHONE_RE.test(ph)) {
      setError("Phone must be E.164 format, e.g. +15551234567.");
      return;
    }

    const fd = new FormData();
    fd.set("id", contactId);
    fd.set("firstName", firstName.trim());
    fd.set("lastName", lastName.trim());
    fd.set("companyName", companyName.trim());
    fd.set("email", em);
    fd.set("phone", ph);
    fd.set("consentStatus", consentStatus);
    fd.set("vip", vip ? "true" : "false");

    startTransition(async () => {
      try {
        await updateContact(fd);
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Details</h3>
        {editing ? (
          <span className="dim mono" style={{ fontSize: 10.5 }}>EDITING</span>
        ) : (
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => setEditing(true)}>
            <Icon name="edit" size={12} />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save}>
          <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Labeled label="First name">
                <input className="ds-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Labeled>
              <Labeled label="Last name">
                <input className="ds-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Labeled>
            </div>
            <Labeled label="Company">
              <input className="ds-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Labeled>
            <Labeled label="Email">
              <input type="email" className="ds-input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Labeled>
            <Labeled label="Phone (E.164)">
              <input className="ds-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Labeled>
            <Labeled label="Consent">
              <select className="ds-select" value={consentStatus} onChange={(e) => setConsentStatus(e.target.value)}>
                <option value="unknown">Unknown</option>
                <option value="opted_in">Opted in</option>
                <option value="opted_out">Opted out</option>
              </select>
            </Labeled>
            <label className="row" style={{ gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} />
              VIP
            </label>

            {error && (
              <p className="chip chip--bad" style={{ display: "inline-flex" }} role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="ds-card__head" style={{ borderTop: "1px solid var(--line)", borderBottom: "none", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={cancel} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn--pri btn--sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ReadRow label="Name" value={[initial.firstName, initial.lastName].filter(Boolean).join(" ") || initial.name || "—"} />
          <ReadRow label="Company" value={initial.companyName || "—"} />
          <ReadRow label="Email" value={initial.email || "—"} />
          <ReadRow label="Phone" value={initial.phone || "—"} mono />
          <ReadRow label="Consent" value={prettyConsent(initial.consentStatus)} />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="lbl" style={{ margin: 0 }}>Source</span>
            <span className="chip" style={{ background: meta.bgTint, color: meta.fg }}>
              {meta.label}
            </span>
          </div>
          {saved && (
            <span className="chip chip--ok" style={{ alignSelf: "flex-start" }}>
              <Icon name="check" size={12} />
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
      <span className="lbl" style={{ margin: 0 }}>{label}</span>
      <span className={mono ? "mono" : undefined} style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}

function prettyConsent(s: string | null): string {
  switch (s) {
    case "opted_in":
      return "Opted in";
    case "opted_out":
      return "Opted out";
    default:
      return "Unknown";
  }
}
