"use client";

import { Icon } from "@/components/shell/icon";
import { type JSX, useState, useTransition } from "react";

/**
 * `<CaptionModal>` (Module 10) — AI Caption Generator.
 *
 * Inputs: topic + tone (Professional/Casual/Friendly/Funny/Promotional) +
 * primary platform + toggles (CTA / Emoji / Hashtags). Calls the injected
 * `generate` action (the server `generateCaptions`, bound + passed by the
 * server page so the client never imports the server module directly) which
 * returns up to 3 caption options. The user picks one → "Use Selected" hands
 * `{ caption, hashtags }` back to the composer.
 *
 * Server-action drift insulation: the action is a prop, so if the backend
 * export name/signature shifts, only the server page's binding changes.
 */

export type CaptionOption = { caption: string; hashtags: string[] };

/**
 * The shape the modal calls — the server page adapts `generateCaptions` to this.
 *
 * RETURNS a result envelope; it must never THROW to convey a message. Next.js
 * redacts errors thrown out of a server action in production, so the friendly
 * text ("AI captions aren't enabled for this workspace yet") was replaced by a
 * generic transport failure and the user saw "network error" for every cause.
 */
export type CaptionGenResult =
  | { ok: true; options: CaptionOption[] }
  | { ok: false; error: string };

export type GenerateCaptionsFn = (input: {
  topic: string;
  tone: string;
  platform: string;
  includeCta: boolean;
  includeEmoji: boolean;
  includeHashtags: boolean;
}) => Promise<CaptionGenResult>;

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "funny", label: "Funny" },
  { value: "promotional", label: "Promotional" },
] as const;

export function CaptionModal({
  open,
  onClose,
  onUse,
  generate,
  platforms,
  defaultPlatform,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (option: CaptionOption) => void;
  generate: GenerateCaptionsFn;
  /** Platforms currently selected in the composer (for the platform picker). */
  platforms: string[];
  defaultPlatform: string;
}): JSX.Element | null {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<string>("friendly");
  const [platform, setPlatform] = useState(defaultPlatform || platforms[0] || "facebook");
  const [includeCta, setIncludeCta] = useState(true);
  const [includeEmoji, setIncludeEmoji] = useState(false);
  const [includeHashtags, setIncludeHashtags] = useState(true);

  const [options, setOptions] = useState<CaptionOption[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return null;

  function run() {
    setError(null);
    setSelected(null);
    start(async () => {
      try {
        const result = await generate({
          topic: topic.trim(),
          tone,
          platform,
          includeCta,
          includeEmoji,
          includeHashtags,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const safe = result.options.slice(0, 3);
        setOptions(safe);
        if (safe.length > 0) setSelected(0);
        if (safe.length === 0) setError("No suggestions came back. Try a different topic.");
      } catch {
        // Only a genuine transport failure reaches here now.
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <ModalShell
      onClose={onClose}
      title="AI caption generator"
      subtitle="Describe the post we'll draft 3 options you can drop straight in."
      icon="sparkle"
    >
      {/* Controls */}
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "block" }}>
          <span className="lbl">Topic</span>
          <input
            className="ds-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={400}
            placeholder="Friday happy hour, new spring menu, 5-star customer shout-out…"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span className="lbl">Tone</span>
            <select className="ds-select" value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span className="lbl">Optimize for</span>
            <select
              className="ds-select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {(platforms.length ? platforms : ["facebook", "instagram", "linkedin"]).map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Toggle label="Call to action" on={includeCta} onClick={() => setIncludeCta((v) => !v)} />
          <Toggle label="Emoji" on={includeEmoji} onClick={() => setIncludeEmoji((v) => !v)} />
          <Toggle
            label="Hashtags"
            on={includeHashtags}
            onClick={() => setIncludeHashtags((v) => !v)}
          />
        </div>

        <div>
          <button type="button" className="btn btn--pri btn--sm" onClick={run} disabled={pending}>
            <Icon name="sparkle" size={12} />
            {pending ? "Generating…" : options.length ? "Regenerate" : "Generate 3 options"}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--bad)" }} role="alert">
          {error}
        </p>
      )}

      {/* Options */}
      {options.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {options.map((opt, i) => {
            const isSel = selected === i;
            return (
              <button
                type="button"
                key={`${opt.caption.slice(0, 12)}-${i}`}
                onClick={() => setSelected(i)}
                className="ds-card"
                style={{
                  textAlign: "left",
                  padding: 14,
                  cursor: "pointer",
                  border: isSel ? "1.5px solid var(--pri)" : "1px solid var(--line)",
                  boxShadow: isSel ? "var(--sh-glow)" : "none",
                  background: isSel ? "var(--pri-50)" : "var(--surface)",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="lbl-mono" style={{ margin: 0 }}>
                    Option {i + 1}
                  </span>
                  {isSel && <Icon name="checkCircle" size={16} style={{ color: "var(--pri)" }} />}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {opt.caption}
                </p>
                {opt.hashtags.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {opt.hashtags.map((h) => (
                      <span key={h} className="chip chip--info" style={{ fontSize: 10.5 }}>
                        {h.startsWith("#") ? h : `#${h}`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn btn--sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--pri btn--sm"
          disabled={selected === null}
          onClick={() => {
            if (selected !== null && options[selected]) {
              onUse(options[selected]);
              onClose();
            }
          }}
        >
          <Icon name="check" size={12} />
          Use selected
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------------- shared modal shell + toggle (used by all 3 modals) ------- */

export function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`chip ${on ? "chip--pri" : "chip--out"}`}
      style={{ cursor: "pointer", gap: 5 }}
    >
      <Icon name={on ? "check" : "plus"} size={11} />
      {label}
    </button>
  );
}

export function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  icon?: import("@/components/shell/icon").IconName;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15,23,42,0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "6vh 16px 16px",
        overflowY: "auto",
      }}
    >
      <div className="ds-card" style={{ width: "100%", maxWidth: wide ? 720 : 520, padding: 0 }}>
        <div className="ds-card__head">
          <div className="row" style={{ gap: 8 }}>
            {icon && <Icon name={icon} size={16} style={{ color: "var(--pri)" }} />}
            <div>
              <h3 className="ds-card__title">{title}</h3>
              {subtitle && <div className="ds-card__sub">{subtitle}</div>}
            </div>
          </div>
          <button type="button" className="btn btn--xs" onClick={onClose} aria-label="Close">
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="ds-card__body">{children}</div>
      </div>
    </div>
  );
}
