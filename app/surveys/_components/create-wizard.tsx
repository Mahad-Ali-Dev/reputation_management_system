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

/** Kit illustrations shown beside each step heading. */
const KIT = "/assets/repulabs/customer-surveys";

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
    return contacts.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
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
    const tokens = manualInput
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
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
    <div className="svw">
      <Stepper step={step} />

      {/* Step 1 */}
      {step === 1 && (
        <div className="ds-card svw-card">
          <div className="svw-card__head">
            <span className="svw-card__art" aria-hidden>
              <img src={`${KIT}/campaigns/total-sent.svg`} alt="" />
            </span>
            <div>
              <h3 className="svw-card__title">Select recipients</h3>
              <p className="svw-card__sub">
                Pick contacts from your CRM, or paste emails directly.
              </p>
            </div>
          </div>

          {contacts.length > 0 && (
            <>
              <div className="svw-searchrow">
                <div className="svw-search">
                  <Icon name="search" size={14} className="svw-search__icon" />
                  <input
                    className="svw-input svw-input--search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search contacts…"
                    aria-label="Search contacts"
                  />
                </div>
                <span className="svw-count">{selectedContactIds.size} selected</span>
              </div>
              <div className="svw-list">
                {filteredContacts.map((c) => (
                  <label key={c.id} className="svw-list__row">
                    <input
                      type="checkbox"
                      checked={selectedContactIds.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                    />
                    <span className="svw-list__name">{c.name ?? c.email}</span>
                    {c.name && <span className="svw-list__email">{c.email}</span>}
                  </label>
                ))}
                {filteredContacts.length === 0 && (
                  <div className="svw-list__empty">No matching contacts.</div>
                )}
              </div>
            </>
          )}

          <div className="svw-field">
            <span className="svw-lbl">Or add emails manually</span>
            <div className="svw-addrow">
              <input
                className="svw-input"
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
              />
              <button type="button" className="svw-btn" onClick={addManual}>
                <Icon name="plus" size={12} /> Add
              </button>
            </div>
            {manualRecipients.length > 0 && (
              <div className="svw-tokens">
                {manualRecipients.map((r) => (
                  <span key={r.email} className="svw-token">
                    {r.email}
                    <button
                      type="button"
                      onClick={() => removeManual(r.email)}
                      aria-label={`Remove ${r.email}`}
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <div className="svw-error">{error}</div>}

          <div className="svw-foot">
            <button
              type="button"
              className="svw-btn svw-btn--pri"
              disabled={recipients.length === 0}
              onClick={() => {
                setError(null);
                setStep(2);
              }}
            >
              Next: choose template <Icon name="arrowR" size={12} />
            </button>
            <Link href="/surveys" className="svw-btn svw-btn--plain">
              Cancel
            </Link>
            <span className="svw-foot__meta">
              {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="ds-card svw-card">
          <div className="svw-card__head">
            <span className="svw-card__art" aria-hidden>
              <img src={`${KIT}/templates/loyalty-pulse.svg`} alt="" />
            </span>
            <div>
              <h3 className="svw-card__title">Choose a template</h3>
              <p className="svw-card__sub">Reuse a saved survey or start from a quick NPS.</p>
            </div>
          </div>

          <div className="svw-options">
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
            <label className="svw-field">
              <span className="svw-lbl">Survey name</span>
              <input
                className="svw-input"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={`Survey ${new Date().toLocaleDateString()}`}
                maxLength={120}
              />
            </label>
          )}

          <div className="svw-foot">
            <button type="button" className="svw-btn" onClick={() => setStep(1)}>
              <Icon name="arrowR" size={12} style={{ transform: "rotate(180deg)" }} /> Back
            </button>
            <button type="button" className="svw-btn svw-btn--pri" onClick={() => setStep(3)}>
              Next: schedule &amp; send <Icon name="arrowR" size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="ds-card svw-card">
          <div className="svw-card__head">
            <span className="svw-card__art" aria-hidden>
              <img src={`${KIT}/campaigns/scheduled.svg`} alt="" />
            </span>
            <div>
              <h3 className="svw-card__title">Schedule &amp; send</h3>
              <p className="svw-card__sub">
                Send now or in a few hours. Each recipient gets a single-use link that expires in 14
                days.
              </p>
            </div>
          </div>

          <div className="svw-summary">
            <Summary label="Recipients" value={String(recipients.length)} />
            <Summary
              label="Template"
              value={
                templateChoice === "blank"
                  ? "Quick NPS"
                  : (templates.find((t) => t.id === templateChoice)?.name ?? "—")
              }
            />
            <Summary label="Expires" value="14 days" />
          </div>

          <label className="svw-field">
            <span className="svw-lbl">When to send</span>
            <select
              className="svw-input svw-input--select"
              value={scheduleHours}
              onChange={(e) => setScheduleHours(Number(e.target.value))}
            >
              <option value={0}>Send now</option>
              <option value={1}>In 1 hour</option>
              <option value={4}>In 4 hours</option>
              <option value={24}>Tomorrow</option>
            </select>
          </label>

          {error && <div className="svw-error">{error}</div>}

          <div className="svw-foot">
            <button type="button" className="svw-btn" onClick={() => setStep(2)} disabled={pending}>
              <Icon name="arrowR" size={12} style={{ transform: "rotate(180deg)" }} /> Back
            </button>
            <button
              type="button"
              className="svw-btn svw-btn--pri"
              onClick={finish}
              disabled={pending || recipients.length === 0}
            >
              <Icon name="send" size={12} />
              {pending
                ? "Sending…"
                : scheduleHours === 0
                  ? `Send to ${recipients.length}`
                  : `Schedule for ${recipients.length}`}
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
    <ol className="svw-steps">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step;
        const done = n < step;
        return (
          <li
            key={label}
            className={`svw-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="svw-step__n">{done ? <Icon name="check" size={12} /> : n}</span>
            <span className="svw-step__lbl">{label}</span>
          </li>
        );
      })}
    </ol>
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
      className={`svw-option${active ? " is-active" : ""}`}
      aria-pressed={active}
    >
      <span aria-hidden className="svw-option__icon">
        <Icon name={icon} size={15} />
      </span>
      <span className="svw-option__text">
        <span className="svw-option__title">{title}</span>
        <span className="svw-option__sub">{subtitle}</span>
      </span>
      {active && <Icon name="checkCircle" size={18} className="svw-option__check" />}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="svw-summary__item">
      <div className="svw-summary__lbl">{label}</div>
      <div className="svw-summary__val">{value}</div>
    </div>
  );
}
