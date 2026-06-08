"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { MergeTagEditor } from "@/components/merge-tag/merge-tag-editor";
import { upsertAutomationRule } from "@/lib/chat/automation-actions";
import type { AiBehaviour, AutomationRuleView, RuleTrigger } from "@/lib/chat/automation-shared";
import { COMMON_TAGS, sampleDataFromTags } from "@/lib/merge-tags";

/**
 * AutomationRuleForm (Module 09 — Inbox, Automation tab) — client island.
 *
 * The create/edit form for a single `ChatAutomationRule`. Driven entirely by
 * local state and submitted as FormData to the `upsertAutomationRule` server
 * action (which validates with the SAME `parseRuleForm` invariants — the inline
 * guards here are just early UX, not the source of truth).
 *
 * A rule says: when an inbound message arrives on the selected CHANNELS, matching
 * ALL messages or a KEYWORD, the assistant replies per the chosen AI BEHAVIOUR,
 * optionally with a merge-tag TEMPLATE, bounded by a per-conversation reply cap.
 *
 * Presentation + a tiny bit of conditional state only — no data fetching.
 */

/** The six inbox channels, with a friendly label + brand icon for the chips. */
const CHANNEL_OPTIONS: {
  key: string;
  label: string;
  icon: "fb" | "insta" | "chat" | "mail" | "phone" | "google";
}[] = [
  { key: "webchat", label: "Live chat", icon: "chat" },
  { key: "facebook_msg", label: "Facebook", icon: "fb" },
  { key: "instagram_dm", label: "Instagram", icon: "insta" },
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
    setChannels((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
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
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">{editing ? "Edit rule" : "New automation rule"}</h3>
        <span className="dim mono" style={{ fontSize: 10 }}>
          AUTO-REPLY
        </span>
      </div>

      <form className="ds-card__body" onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Name + active */}
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Rule name</span>
            <input
              className="ds-input"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="After-hours auto-reply"
              style={{ fontSize: 12.5 }}
            />
          </label>
          <label className="row" style={{ gap: 8, cursor: "pointer", fontSize: 12.5, paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--pri)" }}
            />
            Enabled
          </label>
        </div>

        <Divider />

        {/* Trigger */}
        <Section
          title="When this runs"
          help="Pick whether the rule reacts to every inbound message or only ones containing a keyword."
        >
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <RadioChip
              name={`${formId}-trigger`}
              checked={trigger === "all"}
              onChange={() => setTrigger("all")}
              label="All messages"
            />
            <RadioChip
              name={`${formId}-trigger`}
              checked={trigger === "keyword"}
              onChange={() => setTrigger("keyword")}
              label="Matches a keyword"
            />
          </div>
          {trigger === "keyword" && (
            <label style={{ display: "grid", gap: 4, maxWidth: 360 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>Trigger keyword or phrase</span>
              <input
                className="ds-input"
                value={keyword}
                maxLength={120}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="hours, pricing, refund"
                style={{ fontSize: 12.5 }}
              />
              <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
                Case-insensitive. The rule fires when an inbound message contains this text.
              </span>
            </label>
          )}
        </Section>

        <Divider />

        {/* Channels */}
        <Section title="Channels" help="The rule only applies to inbound messages on the channels you select.">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {CHANNEL_OPTIONS.map((c) => {
              const on = channels.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleChannel(c.key)}
                  className={`chip ${on ? "chip--pri" : "chip--out"}`}
                  style={{ cursor: "pointer", gap: 5, fontSize: 11 }}
                  aria-pressed={on}
                >
                  <Icon name={c.icon} size={11} />
                  {c.label}
                  {on && <Icon name="check" size={10} />}
                </button>
              );
            })}
          </div>
        </Section>

        <Divider />

        {/* AI behaviour */}
        <Section title="How the assistant replies" help="Choose what the assistant does when the rule fires.">
          <div style={{ display: "grid", gap: 8 }}>
            {BEHAVIOUR_OPTIONS.map((b) => (
              <BehaviourRow
                key={b.key}
                name={`${formId}-behaviour`}
                checked={behaviour === b.key}
                onChange={() => setBehaviour(b.key)}
                label={b.label}
                help={b.help}
              />
            ))}
          </div>

          {behaviour === "fixed_template" && (
            <div style={{ marginTop: 6 }}>
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
            <label style={{ display: "grid", gap: 4, maxWidth: 320, marginTop: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>Escalate to a human after</span>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  className="ds-input"
                  min={0}
                  max={20}
                  value={escalateAfter}
                  onChange={(e) => setEscalateAfter(clampInt(e.target.value, 0, 20, 3))}
                  style={{ fontSize: 12.5, width: 90 }}
                />
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>assistant replies (0 = right away)</span>
              </div>
            </label>
          )}
        </Section>

        <Divider />

        {/* Limits */}
        <Section title="Safety limit" help="Caps how many times the assistant auto-replies in a single conversation so it never loops a customer.">
          <label style={{ display: "grid", gap: 4, maxWidth: 320 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Max auto-replies per conversation</span>
            <input
              type="number"
              className="ds-input"
              min={1}
              max={20}
              value={maxReplies}
              onChange={(e) => setMaxReplies(clampInt(e.target.value, 1, 20, 3))}
              style={{ fontSize: 12.5, width: 90 }}
            />
            <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
              After this, the conversation waits for a human.
            </span>
          </label>
        </Section>

        {error && (
          <div className="chip chip--bad" role="alert" style={{ display: "inline-flex" }}>
            {error}
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn--pri btn--sm" disabled={pending}>
            <Icon name="check" size={12} />
            {pending ? "Saving…" : editing ? "Save changes" : "Create rule"}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDone} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</div>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
          {help}
        </p>
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--line)" }} />;
}

function RadioChip({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={`chip ${checked ? "chip--ink" : "chip--out"}`}
      style={{ cursor: "pointer", gap: 6, fontSize: 11.5 }}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ width: 13, height: 13, accentColor: "var(--pri)" }}
      />
      {label}
    </label>
  );
}

function BehaviourRow({
  name,
  checked,
  onChange,
  label,
  help,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  help: string;
}) {
  return (
    <label
      className="row"
      style={{
        gap: 10,
        alignItems: "flex-start",
        cursor: "pointer",
        padding: "10px 12px",
        border: `1px solid ${checked ? "var(--pri)" : "var(--line)"}`,
        borderRadius: "var(--r-sm)",
        background: checked ? "var(--surface-2, #f8fafc)" : "transparent",
      }}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 2, width: 15, height: 15, accentColor: "var(--pri)" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
          {help}
        </p>
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
