"use client";

import { Icon } from "@/components/shell/icon";
import {
  TRIGGER_EVENTS,
  TRIGGER_PROVIDER,
  type SurveyAutomationRow,
  type TriggerEvent,
} from "@/lib/surveys/automations";
import {
  deleteSurveyAutomation,
  toggleSurveyAutomation,
  upsertSurveyAutomation,
} from "@/lib/surveys/automation-actions";
import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * Automations tab (Module 11). Lists `SurveyAutomation` rules and lets a manager
 * create/edit/toggle/delete them. Connection-aware: a trigger that needs an
 * integration the org hasn't connected renders a "Connect" CTA → /connections
 * instead of an enabled control (the connection-aware-control primitive).
 */

const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  manual: "Manual",
  post_purchase: "After purchase",
  post_visit: "After visit",
  shopify_order: "Shopify order",
  square_sale: "Square sale",
};

const PROVIDER_LABEL: Record<string, string> = {
  shopify: "Shopify",
  square: "Square",
};

type Campaign = { id: string; name: string };

export function AutomationsPanel({
  automations,
  campaigns,
  connectedProviders,
}: {
  automations: SurveyAutomationRow[];
  campaigns: Campaign[];
  /** Provider strings with an ACTIVE connection (server-resolved). */
  connectedProviders: string[];
}) {
  const connected = new Set(connectedProviders);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SurveyAutomationRow | null>(null);

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(row: SurveyAutomationRow) {
    setEditing(row);
    setShowForm(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Automations
          </h3>
          <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5, maxWidth: 540, lineHeight: 1.55 }}>
            Send a survey automatically after a trigger — a purchase, a visit, or an order from a
            connected system.
          </p>
        </div>
        <button type="button" className="btn btn--pri btn--sm" style={{ marginLeft: "auto" }} onClick={openCreate}>
          <Icon name="plus" size={12} />
          New automation
        </button>
      </div>

      {showForm && (
        <AutomationForm
          editing={editing}
          campaigns={campaigns}
          connected={connected}
          onClose={() => setShowForm(false)}
        />
      )}

      {automations.length === 0 ? (
        <div className="ds-card" style={{ padding: 36, textAlign: "center" }}>
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: 13,
              margin: "0 auto 14px",
              background: "var(--pri-50, rgba(37,99,235,0.08))",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="bolt" size={22} />
          </div>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>No automations yet</h4>
          <p className="dim" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6, maxWidth: 380, marginInline: "auto" }}>
            Create a rule to send a survey automatically after a customer interaction.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {automations.map((row) => {
            const provider = TRIGGER_PROVIDER[(row.triggerEvent as TriggerEvent)] ?? null;
            const needsConnection = provider !== null && !connected.has(provider);
            return (
              <AutomationRow
                key={row.id}
                row={row}
                provider={provider}
                needsConnection={needsConnection}
                onEdit={() => openEdit(row)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AutomationRow({
  row,
  provider,
  needsConnection,
  onEdit,
}: {
  row: SurveyAutomationRow;
  provider: string | null;
  needsConnection: boolean;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isActive = row.status === "active";

  function toggle() {
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("status", isActive ? "paused" : "active");
    startTransition(async () => {
      await toggleSurveyAutomation(fd);
    });
  }
  function remove() {
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      await deleteSurveyAutomation(fd);
    });
  }

  return (
    <div className="ds-card" style={{ padding: 16 }}>
      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "var(--surface-3)",
            color: "var(--rl-muted)",
            flexShrink: 0,
          }}
        >
          <Icon name="bolt" size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {TRIGGER_LABEL[(row.triggerEvent as TriggerEvent)] ?? row.triggerEvent}
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            {row.campaignName ? `Sends “${row.campaignName}”` : "No template selected"}
            {row.delayMinutes > 0 && ` · after ${formatDelay(row.delayMinutes)}`}
          </div>
        </div>

        <div className="row" style={{ marginLeft: "auto", gap: 8, alignItems: "center" }}>
          {needsConnection && provider ? (
            <Link href="/connections" className="btn btn--sm btn--accent">
              <Icon name="plug" size={12} />
              Connect {PROVIDER_LABEL[provider] ?? provider}
            </Link>
          ) : (
            <>
              <span
                className={`chip ${isActive ? "chip--ok" : "chip--out"}`}
                style={{ fontSize: 11 }}
              >
                {isActive ? "Active" : "Paused"}
              </span>
              <button
                type="button"
                className="btn btn--sm"
                onClick={toggle}
                disabled={pending}
                aria-pressed={isActive}
              >
                <Icon name={isActive ? "pause" : "play"} size={12} />
                {isActive ? "Pause" : "Activate"}
              </button>
            </>
          )}
          <button type="button" className="btn btn--sm btn--ghost" onClick={onEdit} disabled={pending} aria-label="Edit">
            <Icon name="edit" size={12} />
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={remove} disabled={pending} aria-label="Delete">
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>
      {needsConnection && provider && (
        <p className="dim" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 0 }}>
          This trigger needs {PROVIDER_LABEL[provider] ?? provider} connected before it can run.
        </p>
      )}
    </div>
  );
}

function AutomationForm({
  editing,
  campaigns,
  connected,
  onClose,
}: {
  editing: SurveyAutomationRow | null;
  campaigns: Campaign[];
  connected: Set<string>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>(
    (editing?.triggerEvent as TriggerEvent) ?? "manual",
  );
  const provider = TRIGGER_PROVIDER[triggerEvent] ?? null;
  const needsConnection = provider !== null && !connected.has(provider);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await upsertSurveyAutomation(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="ds-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div style={{ fontSize: 14, fontWeight: 600 }}>{editing ? "Edit automation" : "New automation"}</div>

      <div className="grid-2" style={{ gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="lbl">Trigger</span>
          <select
            name="triggerEvent"
            className="ds-textarea"
            value={triggerEvent}
            onChange={(e) => setTriggerEvent(e.target.value as TriggerEvent)}
            style={{ fontFamily: "inherit", padding: "8px 10px" }}
          >
            {TRIGGER_EVENTS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="lbl">Survey template</span>
          <select name="campaignId" className="ds-textarea" defaultValue={editing?.campaignId ?? ""} style={{ fontFamily: "inherit", padding: "8px 10px" }}>
            <option value="">— Select —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="lbl">Delay (minutes)</span>
          <input
            name="delayMinutes"
            type="number"
            min={0}
            max={43200}
            defaultValue={editing?.delayMinutes ?? 0}
            className="ds-textarea"
            style={{ fontFamily: "inherit", padding: "8px 10px" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="lbl">Status</span>
          <select name="status" className="ds-textarea" defaultValue={editing?.status ?? "paused"} style={{ fontFamily: "inherit", padding: "8px 10px" }}>
            <option value="paused">Paused</option>
            <option value="active" disabled={needsConnection}>
              Active{needsConnection ? " (connect first)" : ""}
            </option>
          </select>
        </label>
      </div>

      {needsConnection && provider && (
        <div
          className="row"
          style={{ gap: 8, alignItems: "center", fontSize: 12, color: "var(--warn)", background: "var(--warn-soft, rgba(217,119,6,0.08))", padding: "8px 12px", borderRadius: 8 }}
        >
          <Icon name="alert" size={13} />
          {PROVIDER_LABEL[provider] ?? provider} isn't connected. The rule saves as paused until you{" "}
          <Link href="/connections" style={{ color: "var(--warn)", textDecoration: "underline" }}>
            connect it
          </Link>
          .
        </div>
      )}

      {error && <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>}

      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn--pri btn--sm" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create automation"}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
  return `${Math.round(minutes / 1440)} day${minutes >= 2880 ? "s" : ""}`;
}
