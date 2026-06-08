"use client";

import { Icon } from "@/components/shell/icon";
import { addContact } from "@/lib/contacts/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "./modal";

/**
 * Add Contact dialog (client). Source defaults to "Manual Entry" (stored
 * `manual`). Phone uses a country-code prefix + E.164 client validation (mirrors
 * the outreach send-form regex). Tags are comma-separated; custom fields are
 * dynamic key/value rows. Submits to the extended `addContact` action.
 */

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CustomField = { key: string; value: string };

export function AddContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tags, setTags] = useState("");
  const [vip, setVip] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  function reset() {
    setFirstName("");
    setLastName("");
    setCompanyName("");
    setEmail("");
    setPhone("");
    setTags("");
    setVip(false);
    setCustomFields([]);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

    // The server requires at least one reachable identifier (email or phone).
    if (!trimmedEmail && !trimmedPhone) {
      setError("Enter at least an email or phone number.");
      return;
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setError("Phone must be international E.164 format, e.g. +15551234567.");
      return;
    }

    const fd = new FormData();
    if (name) fd.set("name", name);
    if (firstName.trim()) fd.set("firstName", firstName.trim());
    if (lastName.trim()) fd.set("lastName", lastName.trim());
    if (companyName.trim()) fd.set("companyName", companyName.trim());
    if (trimmedEmail) fd.set("email", trimmedEmail);
    if (trimmedPhone) fd.set("phone", trimmedPhone);
    if (tags.trim()) fd.set("tags", tags.trim());
    fd.set("vip", vip ? "true" : "false");
    fd.set("source", "manual");
    // Custom fields go as repeated customKey[]/customValue[] entries (the action
    // reads them via form.getAll), not a single JSON blob.
    for (const f of customFields) {
      if (f.key.trim() && f.value.trim()) {
        fd.append("customKey", f.key.trim());
        fd.append("customValue", f.value.trim());
      }
    }

    startTransition(async () => {
      try {
        await addContact(fd);
        close();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add contact.");
      }
    });
  }

  if (!open) return null;

  return (
    <Modal title="Add contact" onClose={close} width={520}>
      <form onSubmit={submit}>
        <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="First name">
              <input className="ds-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Alice" />
            </Field>
            <Field label="Last name">
              <input className="ds-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
            </Field>
          </div>

          <Field label="Company">
            <input className="ds-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Co." />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Email">
              <input type="email" className="ds-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@example.com" />
            </Field>
            <Field label="Phone (E.164)" hint="+15551234567">
              <input className="ds-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" inputMode="tel" />
            </Field>
          </div>

          <Field label="Tags" hint="Comma-separated">
            <input className="ds-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, regular, first-time" />
          </Field>

          <label className="row" style={{ gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} />
            Mark as VIP
          </label>

          {/* Dynamic custom fields */}
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <span className="lbl" style={{ margin: 0 }}>Custom fields</span>
              <button
                type="button"
                className="btn btn--ghost btn--xs"
                onClick={() => setCustomFields((p) => [...p, { key: "", value: "" }])}
              >
                <Icon name="plus" size={12} />
                Add field
              </button>
            </div>
            {customFields.length === 0 ? (
              <p className="dim" style={{ fontSize: 12, margin: 0 }}>
                No custom fields. Add key/value pairs like “Birthday → June 3”.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {customFields.map((f, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional + editable.
                  <div key={i} className="row" style={{ gap: 8 }}>
                    <input
                      className="ds-input"
                      style={{ flex: 1 }}
                      placeholder="Field name"
                      value={f.key}
                      onChange={(e) =>
                        setCustomFields((p) => p.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                      }
                    />
                    <input
                      className="ds-input"
                      style={{ flex: 1 }}
                      placeholder="Value"
                      value={f.value}
                      onChange={(e) =>
                        setCustomFields((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label="Remove field"
                      onClick={() => setCustomFields((p) => p.filter((_, j) => j !== i))}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="chip chip--bad" style={{ display: "inline-flex" }} role="alert">
              {error}
            </p>
          )}
        </div>

        <div
          className="ds-card__head"
          style={{ borderTop: "1px solid var(--line)", borderBottom: "none", justifyContent: "flex-end", gap: 8 }}
        >
          <button type="button" className="btn btn--sm" onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn--pri btn--sm" disabled={pending}>
            {pending ? "Adding…" : "Add contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="lbl">
        {label}
        {hint && <span className="dim" style={{ fontWeight: 400, marginLeft: 6 }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}
