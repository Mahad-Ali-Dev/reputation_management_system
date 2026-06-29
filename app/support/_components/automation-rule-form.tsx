"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { MergeTagEditor } from "@/components/merge-tag/merge-tag-editor";
import { upsertAutomationRule } from "@/lib/chat/automation-actions";
import type { AiBehaviour, AutomationRuleView, RuleTrigger } from "@/lib/chat/automation-shared";
import { COMMON_TAGS, sampleDataFromTags } from "@/lib/merge-tags";
import "../support-ops.css";

/**
 * AutomationRuleForm (Module 09 — Inbox, Automation tab) — client island, rebuilt
 * to the kit's "New automation rule" form-builder.
 *
 * Each setting is a large horizontal section card (left icon-tile + intro, right
 * controls): Rule name + Enabled switch, When this runs (radio cards), Channels
 * (toggle chips with check dots), How the assistant replies (radio cards), Safety
 * limit (max auto-replies). Submits as FormData to `upsertAutomationRule`, which
 * re-validates with the same `parseRuleForm` invariants — the inline guards here
 * are early UX only, not the source of truth.
 *
 * Presentation + a tiny bit of conditional state only — no data fetching.
 */

/** The seven inbox channels, with a friendly label + brand icon for the chips. */
const CHANNEL_OPTIONS: {
  key: string;
  label: string;
  icon: "fb" | "insta" | "chat" | "mail" | "phone" | "google";
}[] = [
  { key: "webchat", label: "Live chat", icon: "chat" },
  { key: "facebook_msg", label: "Facebook", icon: "fb" },
  { key: "instagram_dm", label: "Instagram", icon: "insta" },
  { key: "whatsapp", label: "WhatsApp", icon: "chat" },
  { key: "email", label: "Email", icon: "mail" },
  { key: "sms", label: "SMS", icon: "phone" },
  { key: "gbp_qa", label: "Google Q&A", icon: "google" },
];

const BEHAVIOUR_OPTIONS: { key: AiBehaviour; label: string; help: string }[] = [
  {
    key: "kb_reply",
    label: "Answer from knowledge base",
    help: "The assistant drafts a reply using your AI knowledge base.",
  },
  {
    key: "fixed_template",
    label: "Send a fixed reply",
    help: "Always send the same canned message (merge tags supported).",
  },
  {
    key: "kb_then_escalate",
    label: "Answer, then hand to a human",
    help: "Reply from the knowledge base, then escalate to an agent after a few turns.",
  },
];

export function AutomationRuleForm({
  rule,
  onDone,
}: {
  /** The rule to edit, or null/undefined to create a new one. */
  rule?: AutomationRuleView | null;
  /** Called after a successful save (and on Cancel) so the panel can close the form. */
  onDone: () => void;
}) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(rule?.id);

  // ---- local form state ----
  const [name, setName] = useState(rule?.name ?? "");
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [trigger, setTrigger] = useState<RuleTrigger>(rule?.trigger ?? "all");
  const [keyword, setKeyword] = useState(rule?.triggerKeyword ?? "");
  const [channels, setChannels] = useState<string[]>(
    rule?.channels && rule.channels.length > 0 ? rule.channels : ["webchat"],
  );
  const [behaviour, setBehaviour] = useState<AiBehaviour>(rule?.aiBehaviour ?? "kb_reply");
  const [template, setTemplate] = useState(rule?.fixedTemplate ?? "");
  const [maxReplies, setMaxReplies] = useState<number>(rule?.maxRepliesPerConversation ?? 3);
  const [escalateAfter, setEscalateAfter] = useState<number>(rule?.escalateAfterTurns ?? 3);

  function toggleChannel(key: string) {
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Early UX guards (the server re-validates authoritatively).
    if (name.trim().length === 0) {
      setError("Give the rule a name.");
      return;
    }
    if (channels.length === 0) {
      setError("Select at least one channel.");
      return;
    }
    if (trigger === "keyword" && keyword.trim().length === 0) {
      setError("Enter a keyword, or switch the trigger to all messages.");
      return;
    }
    if (behaviour === "fixed_template" && template.trim().length === 0) {
      setError("Add a reply template, or choose a different AI behaviour.");
      return;
    }

    const fd = new FormData();
    if (rule?.id) fd.set("id", rule.id);
    fd.set("name", name.trim());
    fd.set("isActive", isActive ? "on" : "");
    fd.set("trigger", trigger);
    fd.set("triggerKeyword", keyword.trim());
    fd.set("aiBehaviour", behaviour);
    fd.set("fixedTemplate", template);
    fd.set("maxRepliesPerConversation", String(maxReplies));
    fd.set("escalateAfterTurns", String(escalateAfter));
    for (const c of channels) fd.append("channels", c);

    startTransition(async () => {
      try {
        await upsertAutomationRule(fd);
        router.refresh();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the rule.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {/* Header */}
      <div className="sops-toprow" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
          <button
            type="button"
            className="sops-btn sops-btn--icon"
            onClick={onDone}
            aria-label="Back to automation"
            style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0 }}
          >
            <Icon name="chevL" size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h3 className="sops-toprow__h">{editing ? "Edit automation rule" : "New automation rule"}</h3>
            <p className="sops-toprow__p">
              Create smart auto-replies that engage customers and save time.
            </p>
          </div>
        </div>
        <span className="sops-chip sops-chip--pri" style={{ height: 24 }}>
          AUTO-REPLY
        </span>
      </div>

      <div className="sops-formstack">
        {/* Rule name + Enabled */}
        <Section ico="auto-sec-name.svg" tone="pri" title="Rule name" help="Give your rule a clear and short name.">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 132px", gap: 12 }}>
            <input
              className="sops-input"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="After-hours auto-reply"
              aria-label="Rule name"
            />
            <button
              type="button"
              className="sops-switch"
              onClick={() => setIsActive((v) => !v)}
              role="switch"
              aria-checked={isActive}
              aria-label="Enabled"
            >
              <span className={`sops-switch__track${isActive ? " is-on" : ""}`}>
                <span className="sops-switch__thumb" />
              </span>
              Enabled
            </button>
          </div>
        </Section>

        {/* When this runs */}
        <Section
          ico="auto-sec-trigger.svg"
          tone="blue"
          title="When this runs"
          help="Pick when the rule reacts to inbound messages."
        >
          <div className="sops-optgrid">
            <OptionCard
              name={`${formId}-trigger`}
              checked={trigger === "all"}
              onChange={() => setTrigger("all")}
              title="All messages"
              desc="React to every inbound message."
            />
            <OptionCard
              name={`${formId}-trigger`}
              checked={trigger === "keyword"}
              onChange={() => setTrigger("keyword")}
              title="Matches a keyword"
              desc="Only messages containing a keyword."
            />
          </div>
          {trigger === "keyword" && (
            <label style={{ display: "grid", gap: 5, maxWidth: 380, marginTop: 12 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Trigger keyword or phrase</span>
              <input
                className="sops-input"
                value={keyword}
                maxLength={120}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="hours, pricing, refund"
              />
              <span style={{ fontSize: 11.5, color: "var(--sops-muted)" }}>
                Case-insensitive. The rule fires when an inbound message contains this text.
              </span>
            </label>
          )}
        </Section>

        {/* Channels */}
        <Section
          ico="auto-sec-channels.svg"
          tone="green"
          title="Channels"
          help="The rule only applies to inbound messages on the channels you select."
        >
          <div className="sops-chgrid">
            {CHANNEL_OPTIONS.map((c) => {
              const on = channels.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleChannel(c.key)}
                  className={`sops-chchip${on ? " is-on" : ""}`}
                  aria-pressed={on}
                >
                  <Icon name={c.icon} size={14} />
                  {c.label}
                  {on && (
                    <span className="sops-chchip__check">
                      <Icon name="check" size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>

        {/* How the assistant replies */}
        <Section
          ico="auto-sparkles.svg"
          tone="pri"
          title="How the assistant replies"
          help="Choose what the assistant does when the rule fires."
        >
          <div className="sops-optstack">
            {BEHAVIOUR_OPTIONS.map((b) => (
              <OptionCard
                key={b.key}
                name={`${formId}-behaviour`}
                checked={behaviour === b.key}
                onChange={() => setBehaviour(b.key)}
                title={b.label}
                desc={b.help}
              />
            ))}
          </div>

          {behaviour === "fixed_template" && (
            <div style={{ marginTop: 12 }}>
              <MergeTagEditor
                label="Reply template"
                value={template}
                onChange={setTemplate}
                tags={COMMON_TAGS}
                sampleData={sampleDataFromTags(COMMON_TAGS)}
                maxLength={2000}
              />
            </div>
          )}

          {behaviour === "kb_then_escalate" && (
            <label style={{ display: "grid", gap: 5, maxWidth: 320, marginTop: 12 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Escalate to a human after</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  className="sops-input"
                  min={0}
                  max={20}
                  value={escalateAfter}
                  onChange={(e) => setEscalateAfter(clampInt(e.target.value, 0, 20, 3))}
                  style={{ width: 90 }}
                />
                <span style={{ fontSize: 12, color: "var(--sops-muted)" }}>
                  assistant replies (0 = right away)
                </span>
              </div>
            </label>
          )}
        </Section>

        {/* Safety limit */}
        <Section
          ico="auto-sec-safety.svg"
          tone="red"
          title="Safety limit"
          help="Prevent infinite auto-replies in a single conversation."
        >
          <label style={{ display: "grid", gap: 5, maxWidth: 320 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Max auto-replies per conversation</span>
            <input
              type="number"
              className="sops-input"
              min={1}
              max={20}
              value={maxReplies}
              onChange={(e) => setMaxReplies(clampInt(e.target.value, 1, 20, 3))}
              style={{ width: 90 }}
            />
            <span style={{ fontSize: 11.5, color: "var(--sops-muted)" }}>
              After this, the conversation waits for a human.
            </span>
          </label>
        </Section>
      </div>

      {error && (
        <div className="sops-error" role="alert" style={{ marginTop: 14 }}>
          <Icon name="alert" size={13} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
        <button type="submit" className="sops-btn sops-btn--pri" disabled={pending}>
          <Icon name="check" size={14} />
          {pending ? "Saving…" : editing ? "Save changes" : "Create rule"}
        </button>
        <button type="button" className="sops-btn" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  ico,
  tone,
  title,
  help,
  children,
}: {
  ico: string;
  tone: "pri" | "blue" | "green" | "orange" | "red";
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sops-section">
      <div className="sops-section__intro">
        <span className={`sops-section__ico sops-section__ico--${tone}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/repulabs/unified-inbox/${ico}`} alt="" aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="sops-section__t">{title}</div>
          <p className="sops-section__help">{help}</p>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function OptionCard({
  name,
  checked,
  onChange,
  title,
  desc,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label className={`sops-opt${checked ? " is-on" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <div style={{ minWidth: 0 }}>
        <div className="sops-opt__t">{title}</div>
        <p className="sops-opt__d">{desc}</p>
      </div>
    </label>
  );
}

/** Parse an integer input, clamping to [min,max]; falls back to `fallback`. */
function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
