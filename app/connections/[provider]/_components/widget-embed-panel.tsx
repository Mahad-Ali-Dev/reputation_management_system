"use client";

/**
 * Live-chat widget EMBED panel (client island) — module 14_connections.
 *
 * Surfaces the website live-chat embed inside the Connections manage route:
 *   - the WidgetKey-based <script> embed snippet + a copy button + the public
 *     key (or, when no key exists yet, a "Generate widget key" form),
 *   - the current WidgetConfig appearance (greeting · brand color · position ·
 *     presence) and the WidgetKey AI mode, read-only here with a link to the
 *     full Customize / AI tabs in the Live Chat settings,
 *   - a small live preview of the bubble + greeting.
 *
 * RSC SAFETY: onClick/state (copy feedback) live here; the snippet + config are
 * computed server-side and passed in as plain strings. Generating a key
 * delegates to a server action. Reuses the same look as
 * `app/support/_components/widget-settings.tsx` (the Deploy + Customize tabs).
 */

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useState } from "react";

/** One recent sync-result row (shared with the OAuth detail client). JSON-safe. */
export type SerializedSyncLog = {
  id: string;
  status: string;
  contactsCreated: number;
  contactsUpdated: number;
  error: string | null;
  durationMs: number | null;
  startedAt: string;
};

type WidgetConfigLite = {
  brandColor: string;
  headerText: string;
  greeting: string;
  position: string;
  agentPresence: string;
};

type WidgetKeyLite = {
  publicKey: string;
  aiMode: string;
  originAllowlist: string[];
  embedSnippet: string;
};

const AI_MODE_LABEL: Record<string, string> = {
  always_on: "Always on",
  after_hours: "After hours only",
  ai_human_handoff: "AI + human handoff",
};

export function WidgetEmbedPanel({
  provider,
  displayName,
  config,
  widgetKey,
  generateKeyAction,
}: {
  provider: string;
  displayName: string;
  config: WidgetConfigLite;
  widgetKey: WidgetKeyLite | null;
  generateKeyAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="col" style={{ gap: 16 }}>
      {/* ── Embed snippet ───────────────────────────────────────────────── */}
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="row" style={{ gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--pri-50)",
                color: "var(--pri)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="chat" size={14} />
            </span>
            <div>
              <h3 className="ds-card__title">Embed code</h3>
              <div className="ds-card__sub">
                One script tag adds the AI chat widget to any website.
              </div>
            </div>
          </div>
        </div>
        <div className="ds-card__body" style={{ padding: 18 }}>
          {widgetKey ? (
            <EmbedSnippet widgetKey={widgetKey} />
          ) : (
            <GenerateKeyForm provider={provider} action={generateKeyAction} />
          )}
        </div>
      </div>

      {/* ── Appearance + AI mode (read-only summary) ────────────────────── */}
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="row" style={{ gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--pri-50)",
                color: "var(--pri)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="sliders" size={14} />
            </span>
            <div>
              <h3 className="ds-card__title">Widget settings</h3>
              <div className="ds-card__sub">Appearance and AI behaviour for {displayName}.</div>
            </div>
          </div>
          <Link href="/support?tab=livechat" className="btn btn--xs">
            <Icon name="edit" size={11} />
            Customize
          </Link>
        </div>
        <div
          className="ds-card__body"
          style={{
            padding: 18,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 260px",
            gap: 20,
          }}
        >
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 16,
              margin: 0,
              alignContent: "start",
            }}
          >
            <SettingItem label="AI mode" value={AI_MODE_LABEL[widgetKey?.aiMode ?? "always_on"] ?? "Always on"} />
            <SettingItem
              label="Brand color"
              value={
                <span className="row" style={{ gap: 6 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: config.brandColor,
                      border: "1px solid var(--line)",
                    }}
                  />
                  <span className="mono" style={{ fontSize: 12 }}>
                    {config.brandColor}
                  </span>
                </span>
              }
            />
            <SettingItem label="Position" value={positionLabel(config.position)} />
            <SettingItem label="Presence" value={presenceLabel(config.agentPresence)} />
            <SettingItem label="Header" value={config.headerText} full />
            <SettingItem label="Greeting" value={config.greeting} full />
          </dl>

          <WidgetPreview
            brandColor={config.brandColor}
            headerText={config.headerText}
            greeting={config.greeting}
            position={config.position}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ embed snippet ----------------------------- */

function EmbedSnippet({ widgetKey }: { widgetKey: WidgetKeyLite }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="dim" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
        Paste this just before <code className="mono">{"</body>"}</code> on every page where you want
        the chat widget to appear.
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
        {widgetKey.embedSnippet}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(widgetKey.embedSnippet).then(
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
      <p className="dim mono" style={{ fontSize: 11, margin: 0 }}>
        Public key: {widgetKey.publicKey}
      </p>
      {widgetKey.originAllowlist.length > 0 && (
        <p className="dim" style={{ fontSize: 11.5, margin: 0 }}>
          Allowed origins: {widgetKey.originAllowlist.join(", ")}
        </p>
      )}
    </div>
  );
}

function GenerateKeyForm({
  provider,
  action,
}: {
  provider: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div style={{ maxWidth: 560 }}>
      <h4 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
        Generate a widget key
      </h4>
      <p className="dim" style={{ fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
        Create a unique key for your website, then copy the embed snippet. You can restrict the key
        to specific origins for security.
      </p>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="hidden" name="provider" value={provider} />
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
            Allowed origins (optional, comma-separated)
          </span>
          <input
            type="text"
            name="originAllowlist"
            placeholder="https://example.com, https://www.example.com"
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "#fff",
              color: "var(--ink)",
            }}
          />
        </label>
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

/* -------------------------------- preview --------------------------------- */

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
      <p
        className="dim"
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          margin: "0 0 8px",
        }}
      >
        Live preview
      </p>
      <div
        style={{
          position: "relative",
          height: 240,
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 60,
            right: onRight ? 12 : undefined,
            left: onRight ? undefined : 12,
            width: 200,
            borderRadius: 12,
            background: "#fff",
            boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: brandColor,
              color: "#fff",
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {headerText || "Chat with us"}
          </div>
          <div style={{ padding: 12, background: "#f8fafc", minHeight: 70 }}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 11.5,
                color: "#0f172a",
                maxWidth: "88%",
              }}
            >
              {greeting || "Hi! How can I help you today?"}
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 12,
            right: onRight ? 12 : undefined,
            left: onRight ? undefined : 12,
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: brandColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          }}
        >
          <Icon name="chat" size={18} />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- shared --------------------------------- */

function positionLabel(p: string): string {
  return p === "bottom-left" ? "Bottom left" : "Bottom right";
}
function presenceLabel(p: string): string {
  return p === "away" ? "Away" : "Online";
}

function SettingItem({
  label,
  value,
  full,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <dt
        className="dim"
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 13, fontWeight: 550, color: "var(--ink)", lineHeight: 1.4 }}>
        {value}
      </dd>
    </div>
  );
}
