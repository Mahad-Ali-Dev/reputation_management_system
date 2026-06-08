"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/shell/icon";
import { deleteAutomationRule, toggleAutomationRule } from "@/lib/chat/automation-actions";
import type { AiBehaviour, AutomationRuleView } from "@/lib/chat/automation-shared";
import { AutomationRuleForm } from "./automation-rule-form";

/**
 * AutomationsPanel (Module 09 — Inbox, Automation tab) — client island.
 *
 * The rule-builder home: lists every `ChatAutomationRule` for the org with its
 * trigger, channels, AI behaviour and reply cap, and lets a Manager+ enable/
 * disable, edit, delete, or create a rule. The create/edit form is the sibling
 * <AutomationRuleForm/>; this component owns the list + which row (if any) is
 * being edited.
 *
 * The shell does the (fail-soft) server read and feeds us serialized `rules`.
 * If the delta columns aren't migrated yet, `rules` is simply [] and the empty
 * state shows — the inbox never 500s.
 */

const CHANNEL_LABELS: Record<string, { label: string; icon: IconName }> = {
  webchat: { label: "Live chat", icon: "chat" },
  facebook_msg: { label: "Facebook", icon: "fb" },
  instagram_dm: { label: "Instagram", icon: "insta" },
  email: { label: "Email", icon: "mail" },
  sms: { label: "SMS", icon: "phone" },
  gbp_qa: { label: "Google Q&A", icon: "google" },
};

const BEHAVIOUR_LABELS: Record<AiBehaviour, { label: string; cls: string }> = {
  kb_reply: { label: "AI knowledge base", cls: "chip--info" },
  fixed_template: { label: "Fixed reply", cls: "chip--out" },
  kb_then_escalate: { label: "AI, then human", cls: "chip--pri" },
};

/** Sentinel for "create a new rule" mode (vs editing an existing id). */
const NEW = "__new__";

export function AutomationsPanel({ rules }: { rules: AutomationRuleView[] }) {
  // `editing` is a rule id, the NEW sentinel, or null (list only).
  const [editing, setEditing] = useState<string | null>(null);

  if (editing) {
    const rule = editing === NEW ? null : (rules.find((r) => r.id === editing) ?? null);
    return <AutomationRuleForm rule={rule} onDone={() => setEditing(null)} />;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>Automation rules</h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
            Auto-reply to inbound messages and hand off to a human on your terms. Rules apply to the
            channels you choose and respect a per-conversation reply limit.
          </p>
        </div>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => setEditing(NEW)}>
          <Icon name="plus" size={12} />
          New rule
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState onCreate={() => setEditing(NEW)} />
      ) : (
        <div className="ds-card" style={{ padding: 4 }}>
          {rules.map((r, i) => (
            <RuleRow key={r.id} rule={r} first={i === 0} onEdit={() => setEditing(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  first,
  onEdit,
}: {
  rule: AutomationRuleView;
  first: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (fd: FormData) => Promise<void>) {
    setError(null);
    const fd = new FormData();
    fd.set("id", rule.id);
    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete the rule “${rule.name}”? This can't be undone.`)) return;
    run(deleteAutomationRule);
  }

  const behaviour = BEHAVIOUR_LABELS[rule.aiBehaviour] ?? BEHAVIOUR_LABELS.kb_reply;

  return (
    <div
      style={{
        padding: 12,
        borderTop: first ? "none" : "1px solid var(--line)",
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <Icon
          name="bolt"
          size={16}
          style={{ marginTop: 2, color: rule.isActive ? "var(--pri)" : "var(--ink-3, #94a3b8)" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{rule.name}</span>
            <span className={`chip ${rule.isActive ? "chip--ok" : "chip--out"}`} style={{ fontSize: 9.5 }}>
              {rule.isActive ? "Active" : "Paused"}
            </span>
            <span className={`chip ${behaviour.cls}`} style={{ fontSize: 9.5, gap: 3 }}>
              <Icon name="sparkle" size={9} />
              {behaviour.label}
            </span>
          </div>

          {/* Trigger + channels summary */}
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="chip chip--out" style={{ fontSize: 9.5, gap: 3 }} title="Trigger">
              <Icon name="filter" size={9} />
              {rule.trigger === "keyword" && rule.triggerKeyword ? (
                <>
                  Keyword
                  <span className="mono" style={{ opacity: 0.8 }}>
                    {rule.triggerKeyword}
                  </span>
                </>
              ) : (
                "All messages"
              )}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3, #94a3b8)" }}>·</span>
            {rule.channels.length === 0 ? (
              <span className="chip chip--out" style={{ fontSize: 9.5 }}>
                No channels
              </span>
            ) : (
              rule.channels.map((c) => {
                const meta = CHANNEL_LABELS[c] ?? { label: c, icon: "chat" as IconName };
                return (
                  <span key={c} className="chip chip--out" style={{ fontSize: 9.5, gap: 3 }}>
                    <Icon name={meta.icon} size={9} />
                    {meta.label}
                  </span>
                );
              })
            )}
            <span style={{ fontSize: 11, color: "var(--ink-3, #94a3b8)" }}>·</span>
            <span className="dim mono" style={{ fontSize: 10 }} title="Max auto-replies per conversation">
              max {rule.maxRepliesPerConversation}/conv
            </span>
            {rule.aiBehaviour === "kb_then_escalate" && (
              <span className="dim mono" style={{ fontSize: 10 }} title="Escalates to a human after N replies">
                escalate after {rule.escalateAfterTurns}
              </span>
            )}
          </div>

          {error && (
            <div className="chip chip--bad" role="alert" style={{ display: "inline-flex", marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="row" style={{ gap: 4, alignItems: "center" }}>
          <button
            type="button"
            className={`chip ${rule.isActive ? "chip--ok" : "chip--out"}`}
            style={{ cursor: "pointer", fontSize: 10 }}
            onClick={() => run(toggleAutomationRule)}
            disabled={pending}
            title={rule.isActive ? "Pause this rule" : "Activate this rule"}
          >
            {rule.isActive ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onEdit}
            disabled={pending}
            aria-label={`Edit rule ${rule.name}`}
            style={{ padding: "3px 7px" }}
          >
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onDelete}
            disabled={pending}
            aria-label={`Delete rule ${rule.name}`}
            style={{ padding: "3px 7px" }}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="ds-card">
      <div className="ds-card__body dim" style={{ textAlign: "center", padding: 44 }}>
        <Icon name="bolt" size={26} style={{ color: "var(--pri)" }} />
        <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>
          No automation rules yet
        </h3>
        <p style={{ fontSize: 12.5, marginTop: 6, maxWidth: 440, marginInline: "auto", lineHeight: 1.55 }}>
          Create a rule to auto-reply to inbound messages — answer from your knowledge base, send a
          fixed template, or reply then hand off to a human. You stay in control with a
          per-conversation reply cap.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          <button type="button" className="btn btn--pri btn--sm" onClick={onCreate}>
            <Icon name="plus" size={12} />
            Create your first rule
          </button>
        </div>
      </div>
    </div>
  );
}
