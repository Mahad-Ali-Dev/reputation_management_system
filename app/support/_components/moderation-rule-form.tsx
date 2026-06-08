"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import {
  addBlacklistKeyword,
  removeBlacklistKeyword,
  saveModerationConfigAction,
  toggleBlacklistKeyword,
} from "@/lib/moderation/blacklist-actions";

/**
 * ModerationRuleForm (Module 09 — Inbox, Wave 3c-A) — client island.
 *
 * The Moderation "Rules" sub-tab editor. Two kinds of rule:
 *   1. Keyword rules (CommentBlacklist) — contains / exact word / regex. These
 *      AUTO-HIDE matching FB/IG/webchat content. This is the explicit-keyword
 *      auto-hide path the guardrail permits.
 *   2. Config toggles (Organization.settings.moderation):
 *        - Block profanity  → AUTO-HIDE built-in profanity      (explicit rule)
 *        - Flag negativity  → FLAG-FOR-REVIEW (DEFAULT; never auto-hides)
 *        - Auto-hide spam   → off by default (opt-in)
 *        - Negativity threshold (0.1–1.0)
 *
 * The form makes the auto-hide vs flag-for-review distinction visually explicit
 * so an operator can never accidentally auto-hide on sentiment alone.
 */

export type KeywordRuleView = {
  id: string;
  keyword: string;
  matchMode: string;
  isActive: boolean;
  hiddenCount: number;
  createdAt: string;
};

export type ModerationConfigView = {
  enabled: boolean;
  blockProfanity: boolean;
  flagNegativity: boolean;
  autoHideSpam: boolean;
  negativityThreshold: number;
};

export function ModerationRuleForm({
  keywords,
  config,
}: {
  keywords: KeywordRuleView[];
  config: ModerationConfigView;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ConfigCard config={config} />
      <KeywordCard keywords={keywords} />
    </div>
  );
}

function ConfigCard({ config }: { config: ModerationConfigView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [threshold, setThreshold] = useState(config.negativityThreshold);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await saveModerationConfigAction(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Automatic moderation</h3>
        <span className="dim mono" style={{ fontSize: 10 }}>
          FB · IG · LIVE CHAT
        </span>
      </div>
      <form className="ds-card__body" onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Applies to social comments, DMs and live-chat messages only. Google reviews are never
          moderated or hidden.
        </p>

        <ToggleRow
          name="enabled"
          defaultChecked={config.enabled}
          title="Enable automatic moderation"
          help="Master switch. When off, nothing is auto-flagged or auto-hidden."
        />

        <div style={{ height: 1, background: "var(--line)" }} />

        <ToggleRow
          name="blockProfanity"
          defaultChecked={config.blockProfanity}
          title="Block profanity"
          badge={{ label: "Auto-hide", cls: "chip--bad" }}
          help="Slurs and explicit profanity are hidden immediately (explicit-rule auto-hide)."
        />
        <ToggleRow
          name="autoHideSpam"
          defaultChecked={config.autoHideSpam}
          title="Auto-hide obvious spam"
          badge={{ label: "Auto-hide", cls: "chip--warn" }}
          help="Link-stuffing / scam patterns. Off by default — turn on only if you see spam."
        />
        <ToggleRow
          name="flagNegativity"
          defaultChecked={config.flagNegativity}
          title="Flag negative content for review"
          badge={{ label: "Flag only", cls: "chip--info" }}
          help="Strongly negative/abusive content is sent to the queue for a human to review — NEVER auto-hidden. Legitimate criticism stays visible."
        />

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            Negativity sensitivity{" "}
            <span className="mono dim">({threshold.toFixed(2)})</span>
          </span>
          <input
            type="range"
            name="negativityThreshold"
            min={0.1}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: "100%", maxWidth: 320 }}
          />
          <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
            Lower = flags more content. Only affects the flag-for-review queue.
          </span>
        </label>

        {error && (
          <div className="chip chip--bad" role="alert" style={{ display: "inline-flex" }}>
            {error}
          </div>
        )}

        <div>
          <button type="submit" className="btn btn--pri btn--sm" disabled={pending}>
            <Icon name="check" size={12} />
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

function KeywordCard({ keywords }: { keywords: KeywordRuleView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    startTransition(async () => {
      try {
        await addBlacklistKeyword(fd);
        formEl.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add keyword");
      }
    });
  }

  function runRow(action: (fd: FormData) => Promise<void>, id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  const totalHidden = keywords.reduce((s, k) => s + k.hiddenCount, 0);

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Keyword blacklist</h3>
        <span className="chip chip--bad" style={{ fontSize: 10 }}>
          Auto-hide
        </span>
      </div>
      <div className="ds-card__body" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Comments or messages containing an active keyword are hidden automatically.{" "}
          <span className="mono dim">{totalHidden} hidden so far.</span>
        </p>

        <form onSubmit={add} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Keyword or phrase</span>
            <input
              name="keyword"
              required
              maxLength={120}
              placeholder="scam, fraud, ripoff"
              className="ds-input"
              style={{ fontSize: 12.5 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Match</span>
            <select name="matchMode" defaultValue="contains" className="ds-input" style={{ fontSize: 12.5 }}>
              <option value="contains">Contains</option>
              <option value="exact">Exact word</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <button type="submit" className="btn btn--pri btn--sm" disabled={pending}>
            <Icon name="plus" size={12} />
            Add
          </button>
        </form>

        {error && (
          <div className="chip chip--bad" role="alert" style={{ display: "inline-flex" }}>
            {error}
          </div>
        )}

        {keywords.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            No keywords yet. Add one above to start auto-hiding.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {keywords.map((k) => (
              <div
                key={k.id}
                className="row"
                style={{
                  gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-sm)",
                  alignItems: "center",
                }}
              >
                <span className="mono" style={{ fontSize: 12 }}>
                  {k.keyword}
                </span>
                <span className="chip chip--out" style={{ fontSize: 10 }}>
                  {k.matchMode}
                </span>
                <span className="dim mono" style={{ fontSize: 10.5, marginLeft: "auto" }}>
                  {k.hiddenCount} hidden
                </span>
                <button
                  type="button"
                  className={`chip ${k.isActive ? "chip--ok" : "chip--out"}`}
                  style={{ cursor: "pointer", fontSize: 10 }}
                  onClick={() => runRow(toggleBlacklistKeyword, k.id)}
                  disabled={pending}
                >
                  {k.isActive ? "Active" : "Paused"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => runRow(removeBlacklistKeyword, k.id)}
                  disabled={pending}
                  aria-label={`Delete keyword ${k.keyword}`}
                  style={{ padding: "2px 6px" }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  name,
  defaultChecked,
  title,
  help,
  badge,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  help: string;
  badge?: { label: string; cls: string };
}) {
  return (
    <label className="row" style={{ gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--pri)" }}
      />
      <div style={{ flex: 1 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
          {badge && (
            <span className={`chip ${badge.cls}`} style={{ fontSize: 9.5 }}>
              {badge.label}
            </span>
          )}
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>
          {help}
        </p>
      </div>
    </label>
  );
}
