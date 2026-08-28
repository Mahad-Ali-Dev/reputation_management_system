"use client";

import { Icon } from "@/components/shell/icon";
import { createSurveyCampaignReturningId, sendSurveyBatch } from "@/lib/surveys/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

/**
 * 3-step Create Survey wizard (Module 11): Select Recipients → Choose Template →
 * Schedule & Send. Recipients come from the CRM (checkbox list) plus a manual /
 * CSV-paste add. A template is an existing campaign (or "blank NPS"). Step 3
 * sends now or schedules N hours ahead, then routes to the campaign.
 */

export type WizardContact = { id: string; name: string | null; email: string };
export type WizardTemplate = { id: string; name: string; questionCount: number };

type Recipient = { email: string; name?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateWizard({
  contacts,
  templates,
  defaultEstablishmentId,
  preselectedContactIds,
}: {
  contacts: WizardContact[];
  templates: WizardTemplate[];
  defaultEstablishmentId?: string;
  /** Contact ids to pre-check on mount (e.g. deep-linked from /contacts). */
  preselectedContactIds?: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — recipients. Seed from any deep-linked pre-selection (intersected
  // with the loaded contacts so a stale id can't select a phantom recipient).
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(() => {
    if (!preselectedContactIds || preselectedContactIds.length === 0) return new Set();
    const valid = new Set(contacts.map((c) => c.id));
    return new Set(preselectedContactIds.filter((id) => valid.has(id)));
  });
  const [manualInput, setManualInput] = useState("");
  const [manualRecipients, setManualRecipients] = useState<Recipient[]>([]);
  const [search, setSearch] = useState("");

  // Step 2 — template
  const [templateChoice, setTemplateChoice] = useState<string>(templates[0]?.id ?? "blank");
  const [campaignName, setCampaignName] = useState("");

  // Step 3 — schedule
  const [scheduleHours, setScheduleHours] = useState(0);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.name ?? "").toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [contacts, search]);

  const recipients = useMemo<Recipient[]>(() => {
    const fromContacts = contacts
      .filter((c) => selectedContactIds.has(c.id))
      .map((c) => ({ email: c.email, name: c.name ?? undefined }));
    // De-dupe by email (manual wins for name).
    const map = new Map<string, Recipient>();
    for (const r of fromContacts) map.set(r.email.toLowerCase(), r);
    for (const r of manualRecipients) map.set(r.email.toLowerCase(), r);
    return [...map.values()];
  }, [contacts, selectedContactIds, manualRecipients]);

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addManual() {
    // Accept comma / newline / space separated emails.
    const tokens = manualInput.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
    const valid = tokens.filter((t) => EMAIL_RE.test(t));
    if (valid.length === 0) {
      setError("Enter at least one valid email.");
      return;
    }
    setError(null);
    setManualRecipients((prev) => {
      const map = new Map(prev.map((r) => [r.email.toLowerCase(), r]));
      for (const e of valid) map.set(e.toLowerCase(), { email: e });
      return [...map.values()];
    });
    setManualInput("");
  }

  function removeManual(email: string) {
    setManualRecipients((prev) => prev.filter((r) => r.email !== email));
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      try {
        // Resolve the campaign: existing template or create a fresh one.
        let campaignId = templateChoice;
        if (templateChoice === "blank") {
          const name = campaignName.trim() || `Survey ${new Date().toLocaleDateString()}`;
          const created = await createSurveyCampaignReturningId({
            name,
            establishmentId: defaultEstablishmentId,
          });
          if (!created.ok) {
            setError(created.error);
            return;
          }
          campaignId = created.id;
        }

        const result = await sendSurveyBatch({ campaignId, recipients, scheduleHours });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/surveys/${campaignId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Stepper step={step} />

      {/* Step 1 */}
      {step === 1 && (
        <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Select recipients</h3>
            <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
              Pick contacts from your CRM, or paste emails directly.
            </p>
          </div>

          {contacts.length > 0 && (
            <>
              <div className="row" style={{ gap: 8 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Icon name="search" size={13} style={{ position: "absolute", left: 10, top: 10, color: "var(--rl-muted-2)" }} />
                  <input
                    className="ds-textarea"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search contacts…"
                    style={{ fontFamily: "inherit", padding: "8px 10px 8px 30px", width: "100%" }}
                  />
                </div>
                <span className="chip chip--info" style={{ fontSize: 11 }}>
                  {selectedContactIds.size} selected
                </span>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                {filteredContacts.map((c) => (
                  <label
                    key={c.id}
                    className="row"
                    style={{ gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer", fontSize: 13 }}
                  >
                    <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => toggleContact(c.id)} />
                    <span style={{ fontWeight: 500 }}>{c.name ?? c.email}</span>
                    {c.name && <span className="dim" style={{ marginLeft: "auto", fontSize: 12 }}>{c.email}</span>}
                  </label>
                ))}
                {filteredContacts.length === 0 && (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--rl-muted-2)", fontSize: 12.5 }}>
                    No matching contacts.
                  </div>
                )}
              </div>
            </>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="lbl">Or add emails manually</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="ds-textarea"
                aria-label="Add emails manually"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManual();
                  }
                }}
                placeholder="alex@example.com, sam@example.com"
                style={{ fontFamily: "inherit", padding: "8px 10px", flex: 1 }}
              />
              <button type="button" className="btn btn--sm" onClick={addManual}>
                <Icon name="plus" size={12} /> Add
              </button>
            </div>
            {manualRecipients.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {manualRecipients.map((r) => (
                  <span key={r.email} className="chip chip--out" style={{ fontSize: 11, gap: 5 }}>
                    {r.email}
                    <button type="button" onClick={() => removeManual(r.email)} aria-label={`Remove ${r.email}`} style={{ display: "inline-flex" }}>
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>}

          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--pri"
              disabled={recipients.length === 0}
              onClick={() => {
                setError(null);
                setStep(2);
              }}
            >
              Next: choose template <Icon name="arrowR" size={12} />
            </button>
            <Link href="/surveys" className="btn btn--ghost btn--sm">
              Cancel
            </Link>
            <span className="dim" style={{ marginLeft: "auto", fontSize: 12.5 }}>
              {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Choose a template</h3>
            <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
              Reuse a saved survey or start from a quick NPS.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TemplateOption
              active={templateChoice === "blank"}
              onClick={() => setTemplateChoice("blank")}
              title="Quick NPS (blank)"
              subtitle="1 NPS question + an optional comment"
              icon="trend"
            />
            {templates.map((t) => (
              <TemplateOption
                key={t.id}
                active={templateChoice === t.id}
                onClick={() => setTemplateChoice(t.id)}
                title={t.name}
                subtitle={`${t.questionCount} question${t.questionCount === 1 ? "" : "s"}`}
                icon="copy"
              />
            ))}
          </div>

          {templateChoice === "blank" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
              <span className="lbl">Survey name</span>
              <input
                className="ds-textarea"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={`Survey ${new Date().toLocaleDateString()}`}
                maxLength={120}
                style={{ fontFamily: "inherit", padding: "8px 10px" }}
              />
            </label>
          )}

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep(1)}>
              <Icon name="arrowR" size={12} style={{ transform: "rotate(180deg)" }} /> Back
            </button>
            <button type="button" className="btn btn--pri" onClick={() => setStep(3)}>
              Next: schedule &amp; send <Icon name="arrowR" size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="ds-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Schedule &amp; send</h3>
            <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
              Send now or in a few hours. Each recipient gets a single-use link that expires in 14 days.
            </p>
          </div>

          <div
            className="row"
            style={{ gap: 14, padding: "12px 14px", borderRadius: 10, background: "var(--surface-2)", flexWrap: "wrap" }}
          >
            <Summary label="Recipients" value={String(recipients.length)} />
            <Summary
              label="Template"
              value={templateChoice === "blank" ? "Quick NPS" : templates.find((t) => t.id === templateChoice)?.name ?? "—"}
            />
            <Summary label="Expires" value="14 days" />
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <span className="lbl">When to send</span>
            <select
              className="ds-textarea"
              value={scheduleHours}
              onChange={(e) => setScheduleHours(Number(e.target.value))}
              style={{ fontFamily: "inherit", padding: "8px 10px", maxWidth: 240 }}
            >
              <option value={0}>Send now</option>
              <option value={1}>In 1 hour</option>
              <option value={4}>In 4 hours</option>
              <option value={24}>Tomorrow</option>
            </select>
          </label>

          {error && <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>}

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep(2)} disabled={pending}>
              <Icon name="arrowR" size={12} style={{ transform: "rotate(180deg)" }} /> Back
            </button>
            <button type="button" className="btn btn--pri" onClick={finish} disabled={pending || recipients.length === 0}>
              <Icon name="send" size={12} />
              {pending ? "Sending…" : scheduleHours === 0 ? `Send to ${recipients.length}` : `Schedule for ${recipients.length}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Recipients", "Template", "Schedule & Send"];
  return (
    <div className="row" style={{ gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="row" style={{ gap: 8, alignItems: "center" }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 600,
                background: active || done ? "var(--pri)" : "var(--surface-3)",
                color: active || done ? "#fff" : "var(--rl-muted)",
              }}
            >
              {done ? <Icon name="check" size={12} /> : n}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? "var(--ink)" : "var(--rl-muted)" }}>
              {label}
            </span>
            {i < steps.length - 1 && <span style={{ width: 24, height: 1, background: "var(--line)" }} />}
          </div>
        );
      })}
    </div>
  );
}

function TemplateOption({
  active,
  onClick,
  title,
  subtitle,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: Parameters<typeof Icon>[0]["name"];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="row"
      style={{
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${active ? "var(--pri)" : "var(--line)"}`,
        background: active ? "var(--pri-50, rgba(37,99,235,0.06))" : "var(--surface)",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          display: "grid",
          placeItems: "center",
          background: active ? "var(--pri)" : "var(--surface-3)",
          color: active ? "#fff" : "var(--rl-muted)",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <span className="dim" style={{ fontSize: 12 }}>
          {subtitle}
        </span>
      </span>
      {active && <Icon name="checkCircle" size={16} style={{ marginLeft: "auto", color: "var(--pri)" }} />}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="lbl-mono">{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
