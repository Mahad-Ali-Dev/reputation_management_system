"use client";

import { Icon } from "@/components/shell/icon";
import type { AutomationRuleView } from "@/lib/outreach/automation";
import { upsertAutomationRule } from "@/lib/outreach/automation-actions";
import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * Automation Rules form (client). Bound to `upsertAutomationRule`.
 *
 * Connection-aware: the trigger picker + master toggle are DISABLED when no
 * matching platform is connected; a "Connect a platform" CTA → /connections is
 * shown instead. (Satisfies "automation fires only when a platform is connected".)
 *
 * The After-Purchase trigger needs Shopify/WooCommerce; After-Appointment needs
 * HubSpot. We receive the set of connected providers and gate accordingly.
 */

type TemplateOpt = { id: string; name: string; channel: string };

// Trigger keys match the DB CHECK (post_purchase / post_visit). The product
// labels are "After Purchase" / "After Appointment".
const TRIGGER_PROVIDERS: Record<string, string[]> = {
  post_purchase: ["shopify", "woocommerce"],
  post_visit: ["hubspot"],
};

export function AutomationForm({
  rule,
  connectedProviders,
  templates,
}: {
  rule: AutomationRuleView | null;
  connectedProviders: string[];
  templates: TemplateOpt[];
}) {
  const connected = new Set(connectedProviders);
  const purchaseConnected = TRIGGER_PROVIDERS.post_purchase!.some((p) => connected.has(p));
  const apptConnected = TRIGGER_PROVIDERS.post_visit!.some((p) => connected.has(p));
  const anyConnected = purchaseConnected || apptConnected;

  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [trigger, setTrigger] = useState(
    rule?.trigger ?? (purchaseConnected ? "post_purchase" : "post_visit"),
  );
  const [delayHours, setDelayHours] = useState(rule?.delayHours ?? 72);
  const [capPer, setCapPer] = useState(rule?.frequencyCapPerCustomer ?? 1);
  const [capWindow, setCapWindow] = useState(rule?.frequencyCapWindowDays ?? 30);
  const [templateId, setTemplateId] = useState(rule?.templateId ?? "");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    if (enabled) fd.set("enabled", "on");
    fd.set("trigger", trigger);
    const provider = TRIGGER_PROVIDERS[trigger]?.find((p) => connected.has(p));
    if (provider) fd.set("provider", provider);
    fd.set("delayHours", String(delayHours));
    fd.set("frequencyCapPerCustomer", String(capPer));
    fd.set("frequencyCapWindowDays", String(capWindow));
    if (templateId) fd.set("templateId", templateId);
    startTransition(async () => {
      try {
        await upsertAutomationRule(fd);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save rule");
      }
    });
  }

  if (!anyConnected) {
    return (
      <div className="ds-card" style={{ padding: 32, textAlign: "center" }}>
        <Icon name="plug" size={28} style={{ color: "var(--pri)", marginBottom: 10 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
          Connect a platform to automate requests
        </div>
        <p
          className="dim"
          style={{
            marginTop: 6,
            marginBottom: 16,
            fontSize: 13,
            maxWidth: 440,
            marginInline: "auto",
          }}
        >
          Automated review requests fire when a connected platform reports an event e.g. a
          completed Shopify order. Connect a store or CRM to turn this on.
        </p>
        <Link href="/connections" className="btn btn--pri">
          <Icon name="plug" size={12} />
          Connect a platform
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rr-card"
      style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 620, padding: 22 }}
    >
      {/* Master toggle */}
      <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>
            Enable Automated Requests
          </span>
          <span className="dim" style={{ display: "block", fontSize: 12 }}>
            Automatically send a review request after a triggering event.
          </span>
        </span>
      </label>

      <label className="lbl">
        Trigger
        <select className="ds-input" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
          <option value="post_purchase" disabled={!purchaseConnected}>
            After Purchase (Shopify / WooCommerce){purchaseConnected ? "" : " not connected"}
          </option>
          <option value="post_visit" disabled={!apptConnected}>
            After Appointment (HubSpot){apptConnected ? "" : " not connected"}
          </option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <label className="lbl">
          Delay (hours)
          <input
            className="ds-input"
            type="number"
            min={0}
            max={720}
            value={delayHours}
            onChange={(e) => setDelayHours(Number(e.target.value))}
          />
        </label>
        <label className="lbl">
          Max per customer
          <input
            className="ds-input"
            type="number"
            min={1}
            max={20}
            value={capPer}
            onChange={(e) => setCapPer(Number(e.target.value))}
          />
        </label>
        <label className="lbl">
          Window (days)
          <input
            className="ds-input"
            type="number"
            min={1}
            max={365}
            value={capWindow}
            onChange={(e) => setCapWindow(Number(e.target.value))}
          />
        </label>
      </div>

      {templates.length > 0 && (
        <label className="lbl">
          Template (optional)
          <select
            className="ds-input"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Default body</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.channel})
              </option>
            ))}
          </select>
        </label>
      )}

      <div
        className="row"
        style={{
          gap: 8,
          alignItems: "flex-start",
          fontSize: 12,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <Icon name="info" size={14} style={{ color: "var(--pri)", marginTop: 1 }} />
        <span className="dim">
          Automated requests go out by email, and the frequency cap prevents duplicate contacts.
          Recipients who unsubscribe are skipped automatically.
        </span>
      </div>

      {error && <p style={{ color: "var(--bad)", fontSize: 13 }}>{error}</p>}
      {saved && <p style={{ color: "var(--ok)", fontSize: 13 }}>Automation rule saved.</p>}

      <div>
        <button type="submit" className="btn btn--pri" disabled={pending}>
          {pending ? "Saving…" : "Save rule"}
        </button>
      </div>
    </form>
  );
}
