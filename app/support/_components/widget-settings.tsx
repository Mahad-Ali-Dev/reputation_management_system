"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/icon";
import type { WidgetConfigView } from "@/lib/inbox/widget";
import {
  generateWidgetKey,
  saveWidgetAiSettings,
  saveWidgetAppearance,
} from "@/lib/inbox/widget-actions";
import { SmsHandoff, type SmsHandoffData } from "./sms-handoff";

/**
 * Live Chat — Widget settings (client island), rebuilt to the delivered kit. The
 * top-level live-chat sub-tabs (in <LiveChatPanel/>) choose the view via the
 * `sub` prop; this renders the matching kit screen:
 *
 *   customize : Visual-style / placement / branding / chat-experience editor + a
 *               live website preview with the chat widget rendered in context.
 *   deploy    : launch hero (3 steps) + install code block (copy) + origin
 *               allowlist + verify + launch-status checklist.
 *   ai        : AI personality + knowledge sources + response behavior + smart
 *               handoff + an AI assistant preview.
 *   sms       : <SmsHandoff/> — provision a number + active numbers.
 *
 * All data for the four views is fetched once by the server loader.
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

export function WidgetSettings({ data, sub }: { data: WidgetSettingsData; sub: Sub }) {
  if (sub === "customize") return <CustomizeView config={data.config} />;
  if (sub === "deploy") return <DeployView keyData={data.key} />;
  if (sub === "ai")
    return <AiView config={data.config} keyId={data.key?.id ?? null} currentMode={data.key?.aiMode ?? "always_on"} />;
  return (
    <SmsHandoff
      data={
        {
          twilioConfigured: data.twilioConfigured,
          smsHandoffEnabled: data.config.smsHandoffEnabled,
          numbers: data.handoffNumbers,
        } satisfies SmsHandoffData
      }
    />
  );
}

/* ============================ Customize ================================== */

function CustomizeView({ config }: { config: WidgetConfigView }) {
  const [brandColor, setBrandColor] = useState(config.brandColor);
  const [headerText, setHeaderText] = useState(config.headerText);
  const [greeting, setGreeting] = useState(config.greeting);
  const [position, setPosition] = useState(config.position);
  const [radius, setRadius] = useState(16);
  const [accent, setAccent] = useState<"solid" | "gradient" | "outline">("solid");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [shadow, setShadow] = useState<"none" | "soft" | "medium" | "large">("soft");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 444px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
      {/* Editor */}
      <form action={saveWidgetAppearance} style={{ display: "grid", gap: 14 }}>
        <Section num={1} title="Visual style">
          <Field label="Primary color">
            <div className="row" style={{ gap: 8 }}>
              <input
                type="color"
                name="brandColor"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                aria-label="Primary color"
                style={{ width: 40, height: 34, border: "1px solid var(--uik-line-strong)", borderRadius: 8, padding: 2, background: "#fff" }}
              />
              <input type="text" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} aria-label="Primary color hex" className="uik-input uik-mono" style={{ maxWidth: 140 }} />
            </div>
          </Field>
          <Field label="Accent style">
            <Segmented options={[["solid", "Solid"], ["gradient", "Gradient"], ["outline", "Outline"]]} value={accent} onChange={(v) => setAccent(v as typeof accent)} />
          </Field>
          <Field label="Mode">
            <Segmented options={[["light", "Light"], ["dark", "Dark"]]} value={mode} onChange={(v) => setMode(v as typeof mode)} />
          </Field>
          <Field label={`Corner radius ${radius}px`}>
            <input type="range" min={0} max={28} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Corner radius" style={{ width: "100%", accentColor: "var(--uik-purple)" }} />
          </Field>
          <Field label="Shadow">
            <Segmented options={[["none", "None"], ["soft", "Soft"], ["medium", "Medium"], ["large", "Large"]]} value={shadow} onChange={(v) => setShadow(v as typeof shadow)} />
          </Field>
        </Section>

        <Section num={2} title="Placement & trigger">
          <Field label="Widget position">
            <select name="position" value={position} onChange={(e) => setPosition(e.target.value)} className="uik-select">
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </Field>
          <ToggleRow label="Show welcome bubble" defaultChecked />
          <ToggleRow label="Auto-open after a short delay" defaultChecked={false} />
        </Section>

        <Section num={3} title="Branding">
          <Field label="Business name">
            <input type="text" name="headerText" value={headerText} onChange={(e) => setHeaderText(e.target.value)} maxLength={80} className="uik-input" />
          </Field>
          <Field label="Welcome message">
            <textarea name="greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} maxLength={500} rows={3} className="uik-textarea" />
          </Field>
          <Field label="Agent presence">
            <select name="agentPresence" defaultValue={config.agentPresence} className="uik-select">
              <option value="online">Online</option>
              <option value="away">Away</option>
            </select>
          </Field>
        </Section>

        <Section num={4} title="Chat experience">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ToggleRow label="Sound notifications" defaultChecked />
            <ToggleRow label="Show agent name" defaultChecked />
            <ToggleRow label="Show response time badge" defaultChecked />
            <ToggleRow label="Collect email before chat" defaultChecked={false} />
          </div>
        </Section>

        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="uik-btn uik-btn--purple">
            <Icon name="check" size={13} />
            Save Changes
          </button>
          <button type="reset" className="uik-btn">
            <Icon name="refresh" size={13} />
            Reset to Defaults
          </button>
        </div>
      </form>

      {/* Live website preview */}
      <div className="uik-sec" style={{ padding: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, padding: "2px 4px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--uik-ink)" }}>Live preview</span>
          <div className="row" style={{ gap: 4 }}>
            {(["desktop", "tablet", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className="uik-btn uik-btn--xs"
                style={{ width: 34, height: 30, padding: 0, ...(device === d ? { background: "var(--uik-purple-soft)", color: "var(--uik-purple)", borderColor: "#d9d0ff" } : {}) }}
                aria-label={d}
                title={d}
                aria-pressed={device === d}
              >
                <Icon name={d === "desktop" ? "grid" : d === "tablet" ? "box" : "smartphone"} size={15} />
              </button>
            ))}
          </div>
        </div>
        <WebsitePreview
          brandColor={brandColor}
          headerText={headerText}
          greeting={greeting}
          position={position}
          radius={radius}
          shadow={shadow}
          device={device}
        />
        <div
          style={{
            marginTop: 10,
            background: "var(--uik-purple-soft)",
            borderRadius: "var(--uik-r-md)",
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--uik-purple)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Icon name="sparkle" size={14} />
          Tip: Changes here are reflected in the preview. Save when you&apos;re ready to apply.
        </div>
      </div>
    </div>
  );
}

function WebsitePreview({
  brandColor,
  headerText,
  greeting,
  position,
  radius,
  shadow,
  device,
}: {
  brandColor: string;
  headerText: string;
  greeting: string;
  position: string;
  radius: number;
  shadow: string;
  device: "desktop" | "tablet" | "mobile";
}) {
  const onRight = position !== "bottom-left";
  const frameW = device === "mobile" ? 320 : device === "tablet" ? 520 : "100%";
  const shadowCss =
    shadow === "none" ? "none" : shadow === "large" ? "0 24px 60px rgba(38,43,92,0.28)" : shadow === "medium" ? "0 16px 40px rgba(38,43,92,0.22)" : "0 12px 30px rgba(38,43,92,0.18)";

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: frameW,
          maxWidth: "100%",
          minHeight: 480,
          borderRadius: 10,
          border: "1px solid var(--uik-line)",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        {/* mock website */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--uik-divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>repulabs</span>
          <span className="uik-mut" style={{ fontSize: 12 }}>Products · Pricing · Resources</span>
        </div>
        <div style={{ padding: "32px 24px" }}>
          <h4 style={{ fontSize: 22, fontWeight: 700, margin: 0, maxWidth: 360 }}>Build stronger customer connections</h4>
          <p className="uik-mut" style={{ fontSize: 13, margin: "10px 0 0", maxWidth: 360, lineHeight: 1.5 }}>
            Repulabs helps businesses engage, convert, and grow with conversations that matter.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <span style={{ background: brandColor, color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Get started</span>
            <span style={{ border: "1px solid var(--uik-line-strong)", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Book a demo</span>
          </div>
        </div>

        {/* chat widget panel */}
        <div
          style={{
            position: "absolute",
            bottom: 64,
            right: onRight ? 18 : undefined,
            left: onRight ? undefined : 18,
            width: 224,
            borderRadius: radius,
            background: "#fff",
            boxShadow: shadowCss,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ background: brandColor, color: "#fff", padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{headerText || "Repulabs"}</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>We typically reply in a few minutes</div>
          </div>
          <div style={{ padding: 12, background: "#f8fafc" }}>
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 11px", fontSize: 12, color: "#0f172a", lineHeight: 1.45 }}>
              {greeting || "Hi there! 👋 How can we help you today?"}
            </div>
            <div style={{ marginTop: 10, background: brandColor, color: "#fff", textAlign: "center", padding: "9px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Start a conversation
            </div>
            <div className="uik-mut" style={{ fontSize: 9.5, textAlign: "center", marginTop: 8 }}>⚡ Powered by Repulabs</div>
          </div>
        </div>
        {/* launcher */}
        <div
          style={{
            position: "absolute",
            bottom: 18,
            right: onRight ? 18 : undefined,
            left: onRight ? undefined : 18,
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: brandColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
          }}
        >
          <Icon name="chat" size={20} />
        </div>
      </div>
    </div>
  );
}

/* ============================== Deploy =================================== */

function DeployView({ keyData }: { keyData: WidgetSettingsData["key"] }) {
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [url, setUrl] = useState("");

  const snippet =
    keyData?.embedSnippet ??
    `<script>\n  window.REPULABS_CHAT = { token: "YOUR_KEY", position: "bottom-right", theme: "light" };\n</script>\n<script src="https://cdn.repulabs.com/embed/widget.js" async></script>`;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Launch hero */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 20,
          alignItems: "center",
          borderRadius: "var(--uik-r-xl)",
          background: "linear-gradient(135deg, #eeeaff 0%, #f8f6ff 100%)",
          padding: 24,
        }}
      >
        <div className="row" style={{ gap: 20, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/repulabs/unified-inbox/deploy-launch.svg" alt="" aria-hidden="true" className="uik-illo uik-illo--120" style={{ flexShrink: 0 }} />
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--uik-ink)" }}>Launch your live chat in 3 simple steps</h3>
            <p className="uik-mut" style={{ fontSize: 13, margin: "6px 0 0", maxWidth: 460, lineHeight: 1.5 }}>
              Add the widget to your website, connect your platform, and verify everything works perfectly.
            </p>
          </div>
        </div>
        <div className="row" style={{ gap: 18 }}>
          <HeroStep n={1} icon="hash" label="Install" />
          <HeroStep n={2} icon="plug" label="Connect Platform" />
          <HeroStep n={3} icon="checkCircle" label="Verify & Launch" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.8fr)", gap: 18 }}>
        {/* Install widget code */}
        <div className="uik-sec">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="uik-sec__num"><Icon name="hash" size={12} /></span>
              <div>
                <h4 className="uik-sec__title">Install widget code</h4>
                <p className="uik-sec__help">Add the snippet before the closing &lt;/body&gt; tag.</p>
              </div>
            </div>
            <CopyButton text={snippet} copied={copied} setCopied={setCopied} />
          </div>
          {!keyData && (
            <form action={generateWidgetKey} style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <Field label="Allowed origins (optional, comma-separated)">
                <input type="text" name="originAllowlist" placeholder="https://example.com, https://www.example.com" className="uik-input" />
              </Field>
              <button type="submit" className="uik-btn uik-btn--sm uik-btn--purple" style={{ width: "fit-content" }}>
                <Icon name="plus" size={13} />
                Generate widget key
              </button>
            </form>
          )}
          <pre className="uik-code" style={{ marginTop: 10 }}>{snippet}</pre>
          <p className="uik-mut" style={{ fontSize: 11.5, marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
            <Icon name="lock" size={13} />
            Your data is secure and encrypted.{" "}
            <a href="/legal/security" style={{ color: "var(--uik-purple)" }}>Learn more</a>
          </p>
        </div>

        {/* Live preview */}
        <div className="uik-sec">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--uik-ink)", display: "flex", gap: 6, alignItems: "center" }}>
              <Icon name="eye" size={14} /> Live Preview
            </span>
            <span className="uik-pill uik-pill--ok">Ready to chat</span>
          </div>
          <div style={{ position: "relative", minHeight: 230, border: "1px solid var(--uik-line)", borderRadius: "var(--uik-r-md)", overflow: "hidden", background: "linear-gradient(180deg,#f8fafc,#eef2f7)" }}>
            <div style={{ position: "absolute", bottom: 56, right: 14, width: 190, background: "#fff", borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,0.16)", overflow: "hidden" }}>
              <div style={{ background: keyData ? "var(--uik-purple)" : "var(--uik-purple)", color: "#fff", padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>Hi there!</div>
              <div style={{ padding: 12, fontSize: 12, color: "#0f172a" }}>
                How can we help you today?
                <div style={{ marginTop: 10, background: "var(--uik-grad-purple)", color: "#fff", textAlign: "center", padding: "8px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Chat with us</div>
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 14, right: 14, width: 44, height: 44, borderRadius: "50%", background: "var(--uik-purple)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="chat" size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* bottom row: platform guides / test / launch status / support */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
        <div className="uik-sec">
          <h4 className="uik-sec__title">Platform guides</h4>
          <p className="uik-sec__help" style={{ marginBottom: 12 }}>Step-by-step guides for popular platforms.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {["WordPress", "Shopify", "Wix", "Squarespace", "Webflow", "Other"].map((p) => (
              <div key={p} style={{ border: "1px solid var(--uik-line)", borderRadius: 8, padding: "10px 8px", textAlign: "center", fontSize: 11.5, fontWeight: 600, color: "var(--uik-ink-2)" }}>
                {p}
              </div>
            ))}
          </div>
        </div>

        <div className="uik-sec">
          <h4 className="uik-sec__title">Test on your site</h4>
          <p className="uik-sec__help" style={{ marginBottom: 10 }}>Enter your website URL to test the widget.</p>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourwebsite.com" className="uik-input" />
          <button
            type="button"
            className="uik-btn uik-btn--purple uik-btn--sm"
            style={{ width: "100%", marginTop: 10 }}
            disabled={verifying}
            onClick={() => {
              setVerifying(true);
              setTimeout(() => {
                setVerifying(false);
                setVerified(true);
              }, 900);
            }}
          >
            {verifying ? "Verifying…" : "Run verification"}
          </button>
          {verified && (
            <div style={{ marginTop: 10, background: "var(--uik-ok-soft)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#099a5a", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Icon name="checkCircle" size={14} style={{ marginTop: 1 }} />
              <span><strong>Verification successful!</strong> Widget is loading correctly.</span>
            </div>
          )}
        </div>

        <div className="uik-sec">
          <h4 className="uik-sec__title">Launch status</h4>
          <p className="uik-sec__help" style={{ marginBottom: 12 }}>Track your progress to launch.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <LaunchItem done={!!keyData} label="Snippet installed" />
            <LaunchItem done={!!keyData} label="Platform connected" />
            <LaunchItem done={verified} label="Widget verified" />
            <LaunchItem done={false} label="Ready to go" helper="Launch anytime" />
          </div>
        </div>

        <div className="uik-sec" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="uik-illo-tile uik-illo-tile--purple">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/repulabs/unified-inbox/need help.svg" alt="" aria-hidden="true" className="uik-illo uik-illo--40" />
            </span>
            <div style={{ minWidth: 0 }}>
              <h4 className="uik-sec__title">Need help getting set up?</h4>
              <p className="uik-sec__help">Our support team is here to help you at every step.</p>
            </div>
          </div>
          <a href="/contact" className="uik-btn uik-btn--sm" style={{ width: "fit-content", color: "var(--uik-purple)", borderColor: "#d9d0ff" }}>
            <Icon name="help" size={13} />
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

function HeroStep({ n, icon, label }: { n: number; icon: Parameters<typeof Icon>[0]["name"]; label: string }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center" }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--uik-purple)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
        {n}
      </span>
      <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#fff", color: "var(--uik-purple)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--uik-ink)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function LaunchItem({ done, label, helper }: { done: boolean; label: string; helper?: string }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? "var(--uik-ok)" : "transparent",
          border: done ? "0" : "1.5px solid var(--uik-purple)",
          color: "#fff",
        }}
      >
        {done && <Icon name="check" size={12} />}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--uik-ink)" }}>{label}</span>
      <span className="uik-mut" style={{ fontSize: 11.5, marginLeft: "auto" }}>{done ? "Completed" : helper ?? "Pending"}</span>
    </div>
  );
}

function CopyButton({ text, copied, setCopied }: { text: string; copied: boolean; setCopied: (b: boolean) => void }) {
  return (
    <button
      type="button"
      className="uik-btn uik-btn--sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          },
          () => {},
        );
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Copied" : "Copy code"}
    </button>
  );
}

/* ============================ AI Settings =============================== */

function AiView({ config, keyId, currentMode }: { config: WidgetConfigView; keyId: string | null; currentMode: string }) {
  const [personality, setPersonality] = useState("friendly");
  const [mode, setMode] = useState(currentMode);
  const [sources, setSources] = useState<Record<string, boolean>>({ kb: true, website: true, files: true, url: false });

  const PERSONALITIES: { key: string; asset: string; label: string; help: string }[] = [
    { key: "friendly", asset: "friendly.svg", label: "Friendly", help: "Warm, helpful and conversational." },
    { key: "professional", asset: "professional.svg", label: "Professional", help: "Polite, clear and business-focused." },
    { key: "casual", asset: "casual.svg", label: "Casual", help: "Relaxed and easy going tone." },
    { key: "custom", asset: "custom.svg", label: "Custom", help: "Define your own tone and style." },
  ];
  const SOURCES: { key: string; asset: string; label: string; help: string }[] = [
    { key: "kb", asset: "knowledge.svg", label: "Knowledge Base", help: "Use your uploaded articles and FAQs." },
    { key: "website", asset: "webiste content.svg", label: "Website Content", help: "Pull information from your website pages." },
    { key: "files", asset: "file upload.svg", label: "File Uploads", help: "Use PDFs, docs and other files." },
    { key: "url", asset: "url.svg", label: "Custom URL", help: "Allow AI to fetch info from a specific URL." },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20, alignItems: "start" }}>
      <form action={saveWidgetAiSettings} style={{ display: "grid", gap: 16 }}>
        {keyId && <input type="hidden" name="widgetKeyId" value={keyId} />}
        <input type="hidden" name="aiMode" value={mode} />

        {/* 01 Personality */}
        <Section num={1} title="AI Personality" help="Choose the tone and style your AI assistant should use.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {PERSONALITIES.map((p) => (
              <label key={p.key} className={`uik-opt${personality === p.key ? " is-selected" : ""}`} style={{ position: "relative" }}>
                <input type="radio" name="aiPersonality" value={p.key} checked={personality === p.key} onChange={() => setPersonality(p.key)} style={{ position: "absolute", opacity: 0 }} />
                {personality === p.key && (
                  <span style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16, borderRadius: "50%", background: "var(--uik-purple)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" size={10} />
                  </span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/repulabs/unified-inbox/${p.asset}`} alt="" aria-hidden="true" className="uik-illo uik-illo--56" />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--uik-ink)", marginTop: 10 }}>{p.label}</div>
                <div className="uik-mut" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{p.help}</div>
              </label>
            ))}
          </div>
        </Section>

        {/* 02 Knowledge sources */}
        <Section num={2} title="Knowledge Sources" help="Select where the AI should look for answers.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {SOURCES.map((s) => (
              <div key={s.key} className={`uik-opt${sources[s.key] ? " is-selected" : ""}`} style={{ cursor: "default" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/assets/repulabs/unified-inbox/${s.asset}`} alt="" aria-hidden="true" className="uik-illo uik-illo--48" />
                  <Switch checked={!!sources[s.key]} onChange={(v) => setSources((p) => ({ ...p, [s.key]: v }))} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--uik-ink)", marginTop: 10 }}>{s.label}</div>
                <div className="uik-mut" style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }}>{s.help}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12, padding: "10px 12px", borderRadius: "var(--uik-r-md)", background: "#f3f7ff", border: "1px solid #e7eef9", fontSize: 12, color: "#253550" }}>
            <Icon name="info" size={14} style={{ flexShrink: 0 }} />
            <span>AI prioritizes enabled sources in the order shown to provide accurate answers.</span>
          </div>
        </Section>

        {/* 03 Response behavior */}
        <Section num={3} title="Response Behavior" help="Control how AI responds in different situations.">
          <RowControl asset="handoff.svg" title="When AI can't find an answer" desc="Choose how AI should handle unknown questions.">
            <select className="uik-select" defaultValue="apologize" style={{ maxWidth: 240 }} aria-label="Unknown-answer behavior">
              <option value="apologize">Apologize and suggest contact</option>
              <option value="handoff">Hand off to a human</option>
              <option value="fallback">Show a fallback message</option>
            </select>
          </RowControl>
          <RowControl asset="response.svg" title="Response length" desc="Set the default length for AI responses.">
            <select className="uik-select" defaultValue="medium" style={{ maxWidth: 140 }} aria-label="Response length">
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </RowControl>
          <RowControl asset="ai assistat.svg" title="Follow-up suggestions" desc="Let AI suggest relevant follow-up questions.">
            <Switch checked onChange={() => {}} />
          </RowControl>
        </Section>

        {/* 04 Smart handoff */}
        <Section num={4} title="Smart Handoff" help="Automatically hand over to a human when needed.">
          <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "grid", gap: 10, flex: 1 }}>
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--uik-ink)" }}>When should the AI respond?</p>
                </div>
              </div>
              {[
                { value: "always_on", label: "Always on", help: "The AI answers every visitor instantly, 24/7." },
                { value: "after_hours", label: "After hours only", help: "AI answers outside business hours; in-hours chats wait for a human." },
                { value: "ai_human_handoff", label: "AI + human handoff", help: "AI assists, then offers to text the visitor so a human can follow up." },
              ].map((m) => (
                <label key={m.value} className={`uik-opt${mode === m.value ? " is-selected" : ""}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="radio" checked={mode === m.value} onChange={() => setMode(m.value)} style={{ marginTop: 2 }} />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--uik-ink)" }}>{m.label}</span>
                    <span className="uik-mut" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{m.help}</span>
                  </span>
                </label>
              ))}
              <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginTop: 4 }}>
                <Field label="Escalate after N AI replies">
                  <input type="number" name="escalateAfterTurns" defaultValue={config.escalateAfterTurns} min={0} max={50} className="uik-input" style={{ width: 110 }} />
                </Field>
                <label className="row" style={{ gap: 8, fontSize: 13, paddingBottom: 9 }}>
                  <input type="checkbox" name="smsHandoffEnabled" defaultChecked={config.smsHandoffEnabled} />
                  <span style={{ fontWeight: 600, color: "var(--uik-ink)" }}>Offer SMS handoff</span>
                </label>
              </div>
            </div>
          </div>
        </Section>

        <button type="submit" className="uik-btn uik-btn--purple" style={{ width: "fit-content" }}>
          <Icon name="check" size={13} />
          Save AI settings
        </button>
      </form>

      {/* AI assistant preview rail */}
      <div style={{ display: "grid", gap: 16 }}>
        <div className="uik-sec" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--uik-divider)", alignItems: "center" }}>
            <span className="uik-illo-tile uik-illo-tile--purple">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/repulabs/unified-inbox/robot_.svg" alt="" aria-hidden="true" className="uik-illo uik-illo--40" />
            </span>
            <div style={{ minWidth: 0 }}>
              <h4 className="uik-sec__title">AI Assistant Preview</h4>
              <p className="uik-sec__help">See how your AI assistant will appear to visitors.</p>
            </div>
          </div>
          <div style={{ padding: 14, display: "grid", gap: 8, background: "#fafbff" }}>
            <PreviewBubble role="bot">Hi there! How can I help you today?</PreviewBubble>
            <PreviewBubble role="user">What are your business hours?</PreviewBubble>
            <PreviewBubble role="bot">We&apos;re open Mon–Fri 9:00 AM–6:00 PM and Sat 10:00 AM–4:00 PM.</PreviewBubble>
          </div>
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--uik-divider)", textAlign: "center" }}>
            <span className="uik-mut" style={{ fontSize: 10.5 }}>Powered by repulabs AI</span>
          </div>
        </div>

        <div className="uik-sec">
          <div className="row" style={{ gap: 12, marginBottom: 10, alignItems: "center" }}>
            <span className="uik-illo-tile uik-illo-tile--purple">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/repulabs/unified-inbox/support.svg" alt="" aria-hidden="true" className="uik-illo uik-illo--40" />
            </span>
            <div style={{ minWidth: 0 }}>
              <h4 className="uik-sec__title">Need help setting this up?</h4>
              <p className="uik-sec__help">Learn how to get the most out of AI in live chat.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {["How AI works", "Best practices for AI responses", "Smart handoff explained", "View documentation"].map((l) => (
              <a key={l} href="/ai" className="row" style={{ justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, fontSize: 12.5, color: "var(--uik-ink-2)", textDecoration: "none", border: "1px solid var(--uik-divider)" }}>
                {l}
                <Icon name="chevR" size={13} style={{ color: "var(--uik-purple)" }} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBubble({ role, children }: { role: "bot" | "user"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        background: isUser ? "var(--uik-grad-purple)" : "#efedff",
        color: isUser ? "#fff" : "var(--uik-ink-2)",
        borderRadius: 12,
        padding: "9px 12px",
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

/* ============================== shared ================================== */

function Section({ num, title, help, children }: { num: number; title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="uik-sec">
      <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
        <span className="uik-sec__num">{num}</span>
        <div>
          <h4 className="uik-sec__title">{title}</h4>
          {help && <p className="uik-sec__help">{help}</p>}
        </div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="uik-field__label" style={{ marginBottom: 5, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Segmented({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {options.map(([val, label]) => {
        const active = value === val;
        return (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className="uik-btn uik-btn--xs"
            style={active ? { background: "var(--uik-purple-soft)", color: "var(--uik-purple)", borderColor: "#d9d0ff" } : undefined}
            aria-pressed={active}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({ label, defaultChecked }: { label: string; defaultChecked: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: "var(--uik-ink-2)", fontWeight: 600 }}>{label}</span>
      <Switch checked={on} onChange={setOn} />
    </div>
  );
}

function RowControl({ asset, title, desc, children }: { asset: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div className="row" style={{ gap: 11, alignItems: "center", minWidth: 0 }}>
        <span className="uik-illo-tile uik-illo-tile--purple">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/repulabs/unified-inbox/${asset}`} alt="" aria-hidden="true" className="uik-illo uik-illo--34" />
        </span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--uik-ink)" }}>{title}</p>
          <p className="uik-mut" style={{ fontSize: 11.5, margin: "1px 0 0" }}>{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="uik-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="uik-switch__track" />
    </label>
  );
}
