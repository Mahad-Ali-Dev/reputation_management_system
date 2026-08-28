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
 * Automations tab (Module 11), re-skinned to the "Customer Surveys" kit. Lists
 * `SurveyAutomation` rules in a kit table and lets a manager
 * create/edit/toggle/delete them. Connection-aware: a trigger that needs an
 * integration the org hasn't connected renders a "Connect" CTA → /connections
 * instead of an enabled control. When there are no rules, the kit's
 * workflow-illustration empty state + benefit cards run the show.
 */

const KIT = "/assets/repulabs/customer-surveys/automation";

const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  manual: "Manual",
  post_purchase: "After purchase",
  post_visit: "After visit",
  shopify_order: "Shopify order",
  square_sale: "Square sale",
};

/** "When this happens" sub-label per trigger. */
const TRIGGER_WHEN: Record<TriggerEvent, string> = {
  manual: "Sent manually",
  post_purchase: "Order completed",
  post_visit: "Visit completed",
  shopify_order: "Shopify order placed",
  square_sale: "Square sale closed",
};

/** Kit icon tile per trigger (real kit assets). */
const TRIGGER_ART: Record<TriggerEvent, { art: string; tile: string }> = {
  manual: { art: "trigger", tile: "surv-tile--violet" },
  post_purchase: { art: "post-purchase", tile: "surv-tile--violet" },
  post_visit: { art: "service", tile: "surv-tile--green" },
  shopify_order: { art: "post-purchase", tile: "surv-tile--blue" },
  square_sale: { art: "post-purchase", tile: "surv-tile--orange" },
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

  const activeCount = automations.filter((a) => a.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="surv-tabrow" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="surv-tab-action" style={{ marginLeft: "auto" }} onClick={openCreate}>
          <Icon name="plus" size={14} />
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
        <AutomationsEmpty onCreate={openCreate} />
      ) : (
        <>
          <div className="ds-card" style={{ padding: "18px 20px 8px" }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 className="surv-card-h">
                  Active automations
                  <span
                    style={{
                      display: "inline-grid",
                      placeItems: "center",
                      minWidth: 21,
                      height: 21,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: "var(--surv-pri-pale)",
                      color: "var(--surv-pri)",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {activeCount}
                  </span>
                </h2>
                <p className="surv-card-sub">
                  Your automations are running and sending surveys based on customer interactions.
                </p>
              </div>
            </div>

            <div className="surv-table-wrap" style={{ marginTop: 18 }}>
              <table className="surv-table">
                <caption className="sr-only">Active survey automations</caption>
                <thead>
                  <tr>
                    <th scope="col">Automation</th>
                    <th scope="col">When this happens</th>
                    <th scope="col">What it does</th>
                    <th scope="col">Wait time</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {automations.map((row) => {
                    const provider = TRIGGER_PROVIDER[row.triggerEvent as TriggerEvent] ?? null;
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
                </tbody>
              </table>
            </div>
          </div>

          <div className="surv-section-head">
            <h3>Make every interaction count</h3>
            <p>Automate surveys at the right moment and get more responses.</p>
          </div>
          <div className="surv-benefits">
            <Benefit art="trigger" tile="surv-tile--violet" title="Trigger smartly" body="Send surveys after purchases, visits, appointments, and more." />
            <Benefit art="boost-response" tile="surv-tile--green" title="Boost responses" body="Reach customers at the perfect time for higher response rates." />
            <Benefit art="improve-reputation" tile="surv-tile--yellow" title="Improve reputation" body="Collect more 5-star reviews and reduce negative feedback." />
            <Benefit art="save-time" tile="surv-tile--blue" title="Save time" body="Set it once and let automation do the rest." />
          </div>
        </>
      )}
    </div>
  );
}

function AutomationsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <>
      <div className="ds-card surv-auto-empty">
        <div className="surv-auto-empty__art" aria-hidden>
          <img src={`${KIT}/workflow-main.svg`} alt="" />
        </div>
        <div className="surv-auto-empty__body">
          <span className="surv-eyebrow">
            <Icon name="sparkle" size={11} />
            YOU&apos;RE ALL SET!
          </span>
          <h2 className="surv-auto-empty__title">No automations yet</h2>
          <p className="surv-auto-empty__desc">
            Create a rule to send a survey automatically after a customer interaction.
          </p>
          <div className="surv-auto-empty__cta">
            <button type="button" className="btn btn--pri btn--lg" onClick={onCreate}>
              <Icon name="plus" size={14} />
              New automation
            </button>
            <Link href="/surveys/templates" className="surv-tab-action">
              <Icon name="file" size={14} />
              Explore automation templates
            </Link>
          </div>
        </div>
      </div>

      <div className="surv-section-head">
        <h3>Make every interaction count</h3>
        <p>Automate surveys at the right moment and get more responses.</p>
      </div>
      <div className="surv-benefits">
        <Benefit art="trigger" tile="surv-tile--violet" title="Trigger smartly" body="Send surveys after purchases, visits, appointments, and more." />
        <Benefit art="boost-response" tile="surv-tile--green" title="Boost responses" body="Reach customers at the perfect time for higher response rates." />
        <Benefit art="improve-reputation" tile="surv-tile--yellow" title="Improve reputation" body="Collect more 5-star reviews and reduce negative feedback." />
        <Benefit art="save-time" tile="surv-tile--blue" title="Save time" body="Set it once and let automation do the rest." />
      </div>
    </>
  );
}

function Benefit({ art, tile, title, body }: { art: string; tile: string; title: string; body: string }) {
  return (
    <div className="ds-card surv-benefit">
      <span className={`surv-benefit__tile ${tile}`} aria-hidden>
        <img src={`${KIT}/${art}.svg`} alt="" />
      </span>
      <div className="surv-benefit__title">{title}</div>
      <div className="surv-benefit__body">{body}</div>
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
  const trigger = row.triggerEvent as TriggerEvent;
  const art = TRIGGER_ART[trigger] ?? { art: "trigger", tile: "surv-tile--violet" };

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
    <tr>
      <td>
        <div className="surv-auto-name">
          <span className={`surv-auto-tile ${art.tile}`} aria-hidden>
            <img src={`${KIT}/${art.art}.svg`} alt="" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="surv-auto-primary">{TRIGGER_LABEL[trigger] ?? row.triggerEvent}</div>
            <div className="surv-auto-secondary">
              {row.campaignName ? `Sends “${row.campaignName}”` : "No template selected"}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="surv-auto-primary">{TRIGGER_WHEN[trigger] ?? "Custom trigger"}</div>
        <div className="surv-auto-secondary">Trigger</div>
      </td>
      <td>
        <div className="surv-auto-primary">Send survey</div>
        <div className="surv-auto-secondary">Action</div>
      </td>
      <td>
        <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {row.delayMinutes > 0 ? formatDelay(row.delayMinutes) : "Immediate"}
        </span>
      </td>
      <td>
        {needsConnection && provider ? (
          <Link href="/connections" className="surv-tab-action" style={{ height: 30, padding: "0 12px", fontSize: 12 }}>
            <Icon name="plug" size={12} />
            Connect {PROVIDER_LABEL[provider] ?? provider}
          </Link>
        ) : (
          <span className={`surv-status--dot${isActive ? "" : " is-paused"}`}>
            {isActive ? "Active" : "Paused"}
          </span>
        )}
      </td>
      <td>
        <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
          {!needsConnection && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={toggle}
              disabled={pending}
              aria-pressed={isActive}
              aria-label={isActive ? "Pause automation" : "Activate automation"}
              title={isActive ? "Pause" : "Activate"}
            >
              <Icon name={isActive ? "pause" : "play"} size={13} />
            </button>
          )}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onEdit}
            disabled={pending}
            aria-label="Edit automation"
          >
            <Icon name="edit" size={13} />
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={remove}
            disabled={pending}
            aria-label="Delete automation"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </td>
    </tr>
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
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--surv-ink)" }}>
        {editing ? "Edit automation" : "New automation"}
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="surv-field-lbl">Trigger</span>
          <select
            name="triggerEvent"
            className="surv-input"
            value={triggerEvent}
            onChange={(e) => setTriggerEvent(e.target.value as TriggerEvent)}
            style={{ fontFamily: "inherit" }}
          >
            {TRIGGER_EVENTS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="surv-field-lbl">Survey template</span>
          <select name="campaignId" className="surv-input" defaultValue={editing?.campaignId ?? ""} style={{ fontFamily: "inherit" }}>
            <option value=""> Select </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="surv-field-lbl">Delay (minutes)</span>
          <input
            name="delayMinutes"
            type="number"
            min={0}
            max={43200}
            defaultValue={editing?.delayMinutes ?? 0}
            className="surv-input"
            style={{ fontFamily: "inherit" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <span className="surv-field-lbl">Status</span>
          <select name="status" className="surv-input" defaultValue={editing?.status ?? "paused"} style={{ fontFamily: "inherit" }}>
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
          style={{ gap: 8, alignItems: "center", fontSize: 12, color: "var(--surv-warn)", background: "var(--surv-warn-soft)", padding: "8px 12px", borderRadius: 8 }}
        >
          <Icon name="alert" size={13} />
          {PROVIDER_LABEL[provider] ?? provider} isn&apos;t connected. The rule saves as paused until you{" "}
          <Link href="/connections" style={{ color: "var(--surv-warn)", textDecoration: "underline" }}>
            connect it
          </Link>
          .
        </div>
      )}

      {error && <div style={{ color: "var(--surv-bad)", fontSize: 12.5 }}>{error}</div>}

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
