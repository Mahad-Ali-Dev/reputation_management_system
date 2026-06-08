"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/shell/icon";
import type { WidgetConfigView } from "@/lib/inbox/widget";
import {
  generateWidgetKey,
  saveWidgetAiSettings,
  saveWidgetAppearance,
  saveWidgetOrigins,
} from "@/lib/inbox/widget-actions";
import { SmsHandoff, type SmsHandoffData } from "./sms-handoff";

/**
 * Live Chat — Widget settings (client island). Four inner sub-tabs:
 *   Customize : appearance form + live preview of the bubble/panel.
 *   Deploy    : the embed snippet (copy) + origin allowlist (or generate a key).
 *   AI        : aiMode (Always On / After Hours / AI + Human Handoff) +
 *               escalate-after-N + business hours.
 *   SMS       : provision a handoff number + active handoff numbers (<SmsHandoff/>).
 *
 * The inner sub-tabs are client-side (no server round-trip) — the data for all
 * four is fetched once by the server loader. Matches 05_support-inbox (.ds-card).
 */

export type WidgetSettingsData = {
  config: WidgetConfigView;
  key: {
    id: string;
    publicKey: string;
    originAllowlist: string[];
    aiMode: string;
    embedSnippet: string;
  } | null;
  twilioConfigured: boolean;
  handoffNumbers: { id: string; phoneE164: string; monthlyCostCents: number }[];
};

type Sub = "customize" | "deploy" | "ai" | "sms";

export function WidgetSettings({
  data,
  initialSub = "customize",
}: {
  data: WidgetSettingsData;
  initialSub?: Sub;
}) {
  const [sub, setSub] = useState<Sub>(initialSub);

  const subs: { key: Sub; label: string; icon: IconName }[] = [
    { key: "customize", label: "Customize", icon: "edit" },
    { key: "deploy", label: "Deploy", icon: "share" },
    { key: "ai", label: "AI behaviour", icon: "sparkle" },
    { key: "sms", label: "SMS handoff", icon: "smartphone" },
  ];

  return (
    <div className="ds-card">
      <div className="ds-card__body" style={{ padding: 18 }}>
        {/* Inner sub-tab chips */}
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {subs.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSub(s.key)}
              className={`chip${sub === s.key ? " chip--ink" : " chip--out"}`}
              style={{ cursor: "pointer", border: "none" }}
            >
              <Icon name={s.icon} size={12} />
              {s.label}
            </button>
          ))}
        </div>

        {sub === "customize" && <CustomizeTab config={data.config} />}
        {sub === "deploy" && <DeployTab keyData={data.key} />}
        {sub === "ai" && (
          <AiTab
            config={data.config}
            keyId={data.key?.id ?? null}
            currentMode={data.key?.aiMode ?? "always_on"}
          />
        )}
        {sub === "sms" && (
          <SmsHandoff
            data={
              {
                twilioConfigured: data.twilioConfigured,
                smsHandoffEnabled: data.config.smsHandoffEnabled,
                numbers: data.handoffNumbers,
              } satisfies SmsHandoffData
            }
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Customize -------------------------------- */

function CustomizeTab({ config }: { config: WidgetConfigView }) {
  const [brandColor, setBrandColor] = useState(config.brandColor);
  const [headerText, setHeaderText] = useState(config.headerText);
  const [greeting, setGreeting] = useState(config.greeting);
  const [position, setPosition] = useState(config.position);
  const [presence, setPresence] = useState(config.agentPresence);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20 }}>
      {/* Form */}
      <form action={saveWidgetAppearance} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Brand color">
          <div className="row" style={{ gap: 8 }}>
            <input
              type="color"
              name="brandColor"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              aria-label="Brand color"
              style={{ width: 44, height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: 2, background: "#fff" }}
            />
            <input
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              aria-label="Brand color hex"
              className="mono"
              style={inputStyle}
            />
          </div>
        </Field>

        <Field label="Header text">
          <input
            type="text"
            name="headerText"
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            maxLength={80}
            style={inputStyle}
          />
        </Field>

        <Field label="Greeting message">
          <textarea
            name="greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            maxLength={500}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>

        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <Field label="Position">
            <select
              name="position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              style={inputStyle}
            >
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </Field>
          <Field label="Agent presence">
            <select
              name="agentPresence"
              value={presence}
              onChange={(e) => setPresence(e.target.value)}
              style={inputStyle}
            >
              <option value="online">Online</option>
              <option value="away">Away</option>
            </select>
          </Field>
        </div>

        <div>
          <button type="submit" className="btn btn--pri">
            <Icon name="check" size={13} />
            Save appearance
          </button>
        </div>
      </form>

      {/* Live preview */}
      <WidgetPreview brandColor={brandColor} headerText={headerText} greeting={greeting} position={position} />
    </div>
  );
}

function WidgetPreview({
  brandColor,
  headerText,
  greeting,
  position,
}: {
  brandColor: string;
  headerText: string;
  greeting: string;
  position: string;
}) {
  const onRight = position !== "bottom-left";
  return (
    <div>
      <p className="dim" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 8px" }}>
        Live preview
      </p>
      <div
        style={{
          position: "relative",
          height: 360,
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
          overflow: "hidden",
        }}
      >
        {/* Panel */}
        <div
          style={{
            position: "absolute",
            bottom: 64,
            right: onRight ? 14 : undefined,
            left: onRight ? undefined : 14,
            width: 230,
            borderRadius: 12,
            background: "#fff",
            boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ background: brandColor, color: "#fff", padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>
            {headerText || "Chat with us"}
          </div>
          <div style={{ padding: 12, background: "#f8fafc", minHeight: 90 }}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12,
                color: "#0f172a",
                maxWidth: "85%",
              }}
            >
              {greeting || "Hi! How can I help you today?"}
            </div>
          </div>
        </div>
        {/* Bubble */}
        <div
          style={{
            position: "absolute",
            bottom: 14,
            right: onRight ? 14 : undefined,
            left: onRight ? undefined : 14,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: brandColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          }}
        >
          <Icon name="chat" size={20} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Deploy ---------------------------------- */

function DeployTab({
  keyData,
}: {
  keyData: WidgetSettingsData["key"];
}) {
  const [copied, setCopied] = useState(false);

  if (!keyData) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          Generate a widget key
        </h4>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
          Create a unique key for your website, then copy the embed snippet. You can restrict the
          key to specific origins for security.
        </p>
        <form action={generateWidgetKey} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Allowed origins (optional, comma-separated)">
            <input
              type="text"
              name="originAllowlist"
              placeholder="https://example.com, https://www.example.com"
              style={inputStyle}
            />
          </Field>
          <div>
            <button type="submit" className="btn btn--pri">
              <Icon name="plus" size={13} />
              Generate widget key
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          Embed snippet
        </h4>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>
          Paste this just before <code className="mono">{"</body>"}</code> on every page where you
          want the chat widget.
        </p>
        <div
          className="mono"
          style={{
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 12,
            lineHeight: 1.5,
            wordBreak: "break-all",
            position: "relative",
          }}
        >
          {keyData.embedSnippet}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(keyData.embedSnippet).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                },
                () => {},
              );
            }}
            className="btn btn--sm"
            style={{ position: "absolute", top: 8, right: 8 }}
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="dim mono" style={{ fontSize: 11, marginTop: 8 }}>
          Public key: {keyData.publicKey}
        </p>
      </div>

      <div>
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          Allowed origins
        </h4>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>
          Only these origins may load the widget. Leave blank to allow any origin.
        </p>
        <form action={saveWidgetOrigins} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="widgetKeyId" value={keyData.id} />
          <textarea
            name="originAllowlist"
            defaultValue={keyData.originAllowlist.join("\n")}
            rows={3}
            placeholder="https://example.com"
            className="mono"
            style={{ ...inputStyle, resize: "vertical", fontSize: 12 }}
          />
          <div>
            <button type="submit" className="btn btn--sm">
              <Icon name="check" size={12} />
              Save origins
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------- AI ------------------------------------ */

function AiTab({
  config,
  keyId,
  currentMode,
}: {
  config: WidgetConfigView;
  keyId: string | null;
  currentMode: string;
}) {
  const [mode, setMode] = useState<string>(currentMode);

  const MODES: { value: string; label: string; help: string }[] = [
    {
      value: "always_on",
      label: "Always on",
      help: "The AI answers every visitor instantly, 24/7.",
    },
    {
      value: "after_hours",
      label: "After hours only",
      help: "The AI answers outside your business hours; in-hours chats wait for a human.",
    },
    {
      value: "ai_human_handoff",
      label: "AI + human handoff",
      help: "The AI assists, then offers to text the visitor so a human can follow up.",
    },
  ];

  return (
    <form action={saveWidgetAiSettings} style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
      {keyId && <input type="hidden" name="widgetKeyId" value={keyId} />}

      <div>
        <h4 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px", color: "var(--ink)" }}>
          When should the AI respond?
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MODES.map((m) => (
            <label
              key={m.value}
              className="row"
              style={{
                gap: 10,
                alignItems: "flex-start",
                padding: 12,
                border: `1px solid ${mode === m.value ? "var(--pri)" : "var(--line)"}`,
                borderRadius: 10,
                cursor: "pointer",
                background: mode === m.value ? "var(--pri-tint, #eef2ff)" : "#fff",
              }}
            >
              <input
                type="radio"
                name="aiMode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                style={{ marginTop: 2 }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{m.label}</span>
                <span className="dim" style={{ display: "block", fontSize: 12.5, marginTop: 2 }}>
                  {m.help}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Escalate to a human after N AI replies">
          <input
            type="number"
            name="escalateAfterTurns"
            defaultValue={config.escalateAfterTurns}
            min={0}
            max={50}
            style={{ ...inputStyle, width: 120 }}
          />
        </Field>
        <label className="row" style={{ gap: 8, fontSize: 13, paddingBottom: 8 }}>
          <input type="checkbox" name="smsHandoffEnabled" defaultChecked={config.smsHandoffEnabled} />
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>Offer SMS handoff</span>
        </label>
      </div>

      <p className="dim" style={{ fontSize: 12, margin: 0 }}>
        Set 0 to never auto-escalate by turn count. Business-hours windows are configured in your
        AI Phone settings and reused here for the After-hours mode.
      </p>

      <div>
        <button type="submit" className="btn btn--pri">
          <Icon name="check" size={13} />
          Save AI settings
        </button>
      </div>
    </form>
  );
}

/* --------------------------------- shared --------------------------------- */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "#fff",
  color: "var(--ink)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--ink-2)",
          marginBottom: 5,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
