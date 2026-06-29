"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/shell/icon";
import { deleteAutomationRule, toggleAutomationRule } from "@/lib/chat/automation-actions";
import type { AiBehaviour, AutomationRuleView } from "@/lib/chat/automation-shared";
import { AutomationRuleForm } from "./automation-rule-form";
import "../support-ops.css";

/**
 * AutomationsPanel (Module 09 — Inbox, Automation tab) — client island, rebuilt
 * to the delivered "Automation" design kit.
 *
 * Active state: a KPI strip + a workflow table of every `ChatAutomationRule` (its
 * trigger as "launch logic", channels, AI behaviour as "response path", reply cap,
 * a Live/Paused mode pill, and last-updated), with enable/disable, edit, delete,
 * and create. Empty state: the kit's workflow-diagram canvas + quick-start rail.
 *
 * LIVE DATA ONLY. Active-rules KPI is a real count. The other KPIs (triggered
 * today, auto-resolved, avg response time) have no execution-log FK to attribute
 * yet, so they render "—" rather than invent numbers — the table itself is fully
 * real. The create/edit form is the sibling <AutomationRuleForm/>; this component
 * owns the list + which row (if any) is being edited.
 *
 * The shell does the (fail-soft) server read and feeds us serialized `rules`; if
 * the delta columns aren't migrated yet `rules` is [] and the empty state shows —
 * the inbox never 500s.
 */

const CHANNEL_LABELS: Record<string, { label: string; icon: IconName }> = {
  webchat: { label: "Live chat", icon: "chat" },
  facebook_msg: { label: "Facebook", icon: "fb" },
  instagram_dm: { label: "Instagram", icon: "insta" },
  whatsapp: { label: "WhatsApp", icon: "chat" },
  email: { label: "Email", icon: "mail" },
  sms: { label: "SMS", icon: "phone" },
  gbp_qa: { label: "Google Q&A", icon: "google" },
};

const BEHAVIOUR_LABELS: Record<AiBehaviour, { label: string; steps: string[] }> = {
  kb_reply: {
    label: "AI knowledge base",
    steps: ["Draft reply from knowledge base", "Send instantly"],
  },
  fixed_template: {
    label: "Fixed reply",
    steps: ["Send the saved template", "Merge customer details"],
  },
  kb_then_escalate: {
    label: "AI, then human",
    steps: ["Reply from knowledge base", "Escalate to an agent"],
  },
};

/** Sentinel for "create a new rule" mode (vs editing an existing id). */
const NEW = "__new__";

export function AutomationsPanel({ rules }: { rules: AutomationRuleView[] }) {
  // `editing` is a rule id, the NEW sentinel, or null (list only).
  const [editing, setEditing] = useState<string | null>(null);

  if (editing) {
    const rule = editing === NEW ? null : (rules.find((r) => r.id === editing) ?? null);
    return (
      <div className="sops">
        <AutomationRuleForm rule={rule} onDone={() => setEditing(null)} />
      </div>
    );
  }

  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <div className="sops">
      <div className="sops-toprow">
        <div>
          <h3 className="sops-toprow__h">Automation rules</h3>
          <p className="sops-toprow__p">
            Auto-reply to inbound messages and hand off to a human on your terms. Rules apply to the
            channels you choose and respect a per-conversation reply limit.
          </p>
        </div>
        <button type="button" className="sops-btn sops-btn--pri" onClick={() => setEditing(NEW)}>
          <Icon name="plus" size={14} />
          New rule
        </button>
      </div>

      {/* KPI strip — Active rules is a live count; the rest need an execution log
          to attribute, so they show "—" rather than fabricate numbers. */}
      <div className="sops-kpis">
        <Kpi tone="pri" asset="auto-stat-active.svg" label="Active rules" value={String(activeCount)} />
        <Kpi tone="blue" asset="auto-kpi-chat.svg" label="Triggered today" value="—" />
        <Kpi tone="green" asset="auto-stat-templates.svg" label="Auto-resolved" value="—" />
        <Kpi tone="orange" asset="auto-kpi-clock.svg" label="Avg response time" value="—" />
      </div>

      {rules.length === 0 ? (
        <EmptyState onCreate={() => setEditing(NEW)} />
      ) : (
        <div className="sops-card" style={{ overflow: "hidden" }}>
          <div className="sops-card__head">
            <h3 className="sops-card__title">Workflows</h3>
            <span className="sops__mono" style={{ fontSize: 11, color: "var(--sops-muted)" }}>
              {rules.length} {rules.length === 1 ? "rule" : "rules"}
            </span>
          </div>
          <div>
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} onEdit={() => setEditing(r.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  tone,
  asset,
  label,
  value,
}: {
  tone: "pri" | "blue" | "green" | "orange";
  asset: string;
  label: string;
  value: string;
}) {
  return (
    <div className="sops-kpi">
      <span className={`sops-kpi__tile sops-kpi__tile--${tone}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/assets/repulabs/unified-inbox/${asset}`} alt="" aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="sops-kpi__lab">{label}</div>
        <div className="sops-kpi__val">{value}</div>
      </div>
    </div>
  );
}

function RuleRow({ rule, onEdit }: { rule: AutomationRuleView; onEdit: () => void }) {
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
  const tile = ruleTile(rule.aiBehaviour);

  return (
    <div className="sops-wfrow">
      {/* Workflow + channels */}
      <div className="sops-wfrow__main">
        <span
          className="sops-wfrow__tile"
          style={{ background: tile.bg }}
        >
          <Icon name={tile.icon} size={20} style={{ color: tile.fg }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="sops-wfrow__name">{rule.name}</div>
          <p className="sops-wfrow__desc">
            {behaviour.label} · max {rule.maxRepliesPerConversation}/conversation
            {rule.aiBehaviour === "kb_then_escalate" ? ` · escalate after ${rule.escalateAfterTurns}` : ""}
          </p>
          <div className="sops-wfrow__chips">
            {rule.channels.length === 0 ? (
              <span className="sops-chip sops-chip--out">No channels</span>
            ) : (
              rule.channels.map((c) => {
                const meta = CHANNEL_LABELS[c] ?? { label: c, icon: "chat" as IconName };
                return (
                  <span key={c} className="sops-chip sops-chip--out">
                    <Icon name={meta.icon} size={10} />
                    {meta.label}
                  </span>
                );
              })
            )}
          </div>
          {error && (
            <div className="sops-error" role="alert" style={{ marginTop: 8 }}>
              <Icon name="alert" size={12} />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Launch logic + response path */}
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div className="sops-wfrow__logic">
          <b>Starts when</b>
          {rule.trigger === "keyword" && rule.triggerKeyword
            ? `An inbound message contains “${rule.triggerKeyword}”.`
            : "Any inbound message arrives on a selected channel."}
        </div>
        <div className="sops-wfrow__chips">
          {behaviour.steps.map((s) => (
            <span key={s} className="sops-chip sops-chip--pri">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Mode + actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        <span className={`sops-mode ${rule.isActive ? "sops-mode--live" : "sops-mode--off"}`}>
          <span
            className="sops-mode__dot"
            style={{ background: rule.isActive ? "var(--sops-ok)" : "var(--sops-faint)" }}
          />
          {rule.isActive ? "Live" : "Paused"}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--sops-faint)" }}>Updated {relAge(rule.updatedAt)}</span>
        <div className="sops-wfrow__actions">
          <button
            type="button"
            className={`sops-chip ${rule.isActive ? "sops-chip--ok" : "sops-chip--out"}`}
            style={{ cursor: "pointer", height: 26 }}
            onClick={() => run(toggleAutomationRule)}
            disabled={pending}
            aria-pressed={rule.isActive}
            title={rule.isActive ? "Pause this rule" : "Activate this rule"}
          >
            {rule.isActive ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="sops-btn sops-btn--icon"
            onClick={onEdit}
            disabled={pending}
            aria-label={`Edit rule ${rule.name}`}
          >
            <Icon name="edit" size={14} />
          </button>
          <button
            type="button"
            className="sops-btn sops-btn--icon"
            onClick={onDelete}
            disabled={pending}
            aria-label={`Delete rule ${rule.name}`}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ruleTile(b: AiBehaviour): { icon: IconName; bg: string; fg: string } {
  switch (b) {
    case "fixed_template":
      return { icon: "chat", bg: "var(--sops-info-soft)", fg: "var(--sops-info)" };
    case "kb_then_escalate":
      return { icon: "users", bg: "var(--sops-warn-soft)", fg: "#c56a00" };
    default:
      return { icon: "sparkle", bg: "var(--sops-pri-soft)", fg: "var(--sops-pri)" };
  }
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="sops-empty" style={{ gridTemplateColumns: "minmax(300px, 360px) minmax(0, 1fr)" }}>
      <div>
        <h2 className="sops-empty__h">
          No automation rules yet
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/repulabs/unified-inbox/auto-sparkles.svg" alt="" aria-hidden="true" />
        </h2>
        <p className="sops-empty__p">
          Create rules to auto-reply, route conversations, send templates, and hand off to your team.
        </p>
        <div className="sops-empty__actions">
          <button type="button" className="sops-btn sops-btn--pri" onClick={onCreate}>
            <Icon name="plus" size={15} />
            Create first rule
          </button>
        </div>
      </div>
      <div className="sops-empty__art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/repulabs/unified-inbox/auto-empty-flow.svg"
          alt=""
          aria-hidden="true"
          style={{ maxWidth: 520 }}
        />
      </div>
    </div>
  );
}

/** Compact relative age (e.g. "2m ago", "3h ago", "5d ago"). */
function relAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
