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
import "../support-ops.css";

/**
 * ModerationRuleForm (Module 09 — Inbox) — client island, rebuilt to the kit's
 * Moderation "Rules" workspace.
 *
 * Two-pane layout matching the delivered design:
 *   LEFT  — the editable rules: automatic-moderation toggles (the rule builder's
 *           conditions/actions, bound to Organization.settings.moderation) and the
 *           keyword blacklist (the "Rule Library", bound to CommentBlacklist rows).
 *   RIGHT — a read-only rule-flow visualisation (Trigger → Conditions → Exceptions
 *           → Action → Fallback) using the kit's flow-block style, plus the
 *           Tips & best-practices card.
 *
 * The two kinds of rule and their real behaviour:
 *   1. Keyword rules (CommentBlacklist) — contains / exact word / regex. AUTO-HIDE
 *      matching FB/IG/webchat content (the explicit-keyword auto-hide path).
 *   2. Config toggles (Organization.settings.moderation):
 *        - Block profanity  → AUTO-HIDE built-in profanity      (explicit rule)
 *        - Flag negativity  → FLAG-FOR-REVIEW (DEFAULT; never auto-hides)
 *        - Auto-hide spam   → off by default (opt-in)
 *        - Negativity threshold (0.1–1.0)
 *
 * The auto-hide vs flag-for-review distinction stays visually explicit so an
 * operator can never accidentally auto-hide on sentiment alone. LIVE DATA ONLY —
 * no invented rule rows; the empty keyword list shows a real empty state.
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
    <div className="sops-rules-grid">
      <div style={{ display: "grid", gap: 14 }}>
        <ConfigCard config={config} />
        <KeywordCard keywords={keywords} />
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        <RuleFlowCard config={config} keywordCount={keywords.filter((k) => k.isActive).length} />
        <TipsCard />
      </div>
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
    <div className="sops-card">
      <div className="sops-card__head">
        <div>
          <h3 className="sops-card__title">Automatic moderation</h3>
          <p className="sops-card__sub">FB · IG · Live chat — Google reviews are never moderated</p>
        </div>
        <span className="sops__mono" style={{ fontSize: 10, color: "var(--sops-faint)" }}>
          RULE BUILDER
        </span>
      </div>
      <form className="sops-card__body" onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
        <ToggleRow
          name="enabled"
          defaultChecked={config.enabled}
          title="Enable automatic moderation"
          help="Master switch. When off, nothing is auto-flagged or auto-hidden."
        />

        <div style={{ height: 1, background: "var(--sops-divider)" }} />

        <ToggleRow
          name="blockProfanity"
          defaultChecked={config.blockProfanity}
          title="Block profanity"
          badge={{ label: "Auto-hide", cls: "sops-chip--danger" }}
          help="Slurs and explicit profanity are hidden immediately (explicit-rule auto-hide)."
        />
        <ToggleRow
          name="autoHideSpam"
          defaultChecked={config.autoHideSpam}
          title="Auto-hide obvious spam"
          badge={{ label: "Auto-hide", cls: "sops-chip--warn" }}
          help="Link-stuffing / scam patterns. Off by default — turn on only if you see spam."
        />
        <ToggleRow
          name="flagNegativity"
          defaultChecked={config.flagNegativity}
          title="Flag negative content for review"
          badge={{ label: "Flag only", cls: "sops-chip--info" }}
          help="Strongly negative/abusive content is sent to the queue for a human to review — NEVER auto-hidden. Legitimate criticism stays visible."
        />

        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            Negativity sensitivity{" "}
            <span className="sops__mono" style={{ color: "var(--sops-muted)" }}>
              ({threshold.toFixed(2)})
            </span>
          </span>
          <input
            type="range"
            name="negativityThreshold"
            min={0.1}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: "100%", maxWidth: 340, accentColor: "var(--sops-pri)" }}
          />
          <span style={{ fontSize: 11.5, color: "var(--sops-muted)" }}>
            Lower = flags more content. Only affects the flag-for-review queue.
          </span>
        </label>

        {error && (
          <div className="sops-error" role="alert">
            <Icon name="alert" size={13} />
            {error}
          </div>
        )}

        <div>
          <button type="submit" className="sops-btn sops-btn--sm sops-btn--pri" disabled={pending}>
            <Icon name="check" size={13} />
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
    <div className="sops-card">
      <div className="sops-card__head">
        <div>
          <h3 className="sops-card__title">Rule Library</h3>
          <p className="sops-card__sub">
            Keyword rules — {keywords.length} total · {totalHidden} hidden so far
          </p>
        </div>
        <span className="sops-chip sops-chip--danger">Auto-hide</span>
      </div>
      <div className="sops-card__body" style={{ display: "grid", gap: 14 }}>
        <form onSubmit={add} className="sops" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 5, flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Keyword or phrase</span>
            <input name="keyword" required maxLength={120} placeholder="scam, fraud, ripoff" className="sops-input" />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Match</span>
            <select name="matchMode" defaultValue="contains" className="sops-select" style={{ width: 130 }}>
              <option value="contains">Contains</option>
              <option value="exact">Exact word</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <button type="submit" className="sops-btn sops-btn--pri" disabled={pending}>
            <Icon name="plus" size={13} />
            Create Rule
          </button>
        </form>

        {error && (
          <div className="sops-error" role="alert">
            <Icon name="alert" size={13} />
            {error}
          </div>
        )}

        {keywords.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "28px 16px",
              color: "var(--sops-muted)",
              border: "1px dashed var(--sops-line-strong)",
              borderRadius: "var(--sops-r-sm)",
            }}
          >
            <Icon name="flag" size={24} style={{ color: "var(--sops-pri)" }} />
            <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: "var(--sops-ink)" }}>
              No keyword rules yet
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12 }}>Add one above to start auto-hiding matching content.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {keywords.map((k) => (
              <div
                key={k.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  border: "1px solid var(--sops-line)",
                  borderRadius: "var(--sops-r-sm)",
                }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 11,
                    display: "grid",
                    placeItems: "center",
                    background: "var(--sops-danger-soft)",
                    flexShrink: 0,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/repulabs/unified-inbox/mod-rule-shield.svg" alt="" aria-hidden="true" style={{ width: 26, height: 26 }} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="sops__mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--sops-ink)" }}>
                    {k.keyword}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--sops-muted)" }}>
                    {k.matchMode} · {k.hiddenCount} hidden
                  </div>
                </div>
                <button
                  type="button"
                  className={`sops-chip ${k.isActive ? "sops-chip--ok" : "sops-chip--out"}`}
                  style={{ cursor: "pointer", height: 24 }}
                  onClick={() => runRow(toggleBlacklistKeyword, k.id)}
                  disabled={pending}
                  aria-label={k.isActive ? `Pause rule ${k.keyword}` : `Activate rule ${k.keyword}`}
                >
                  {k.isActive ? "Active" : "Paused"}
                </button>
                <button
                  type="button"
                  className="sops-btn sops-btn--icon"
                  onClick={() => runRow(removeBlacklistKeyword, k.id)}
                  disabled={pending}
                  aria-label={`Delete keyword ${k.keyword}`}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only rule-flow visualisation. Reflects the LIVE config so the operator
 * sees what their active settings actually do (Trigger → Conditions → Exceptions
 * → Action → Fallback), in the kit's flow-block style.
 */
function RuleFlowCard({ config, keywordCount }: { config: ModerationConfigView; keywordCount: number }) {
  const conditionChips: string[] = [];
  if (config.blockProfanity) conditionChips.push("Profanity");
  if (config.autoHideSpam) conditionChips.push("Spam patterns");
  if (keywordCount > 0) conditionChips.push(`${keywordCount} keyword rule${keywordCount === 1 ? "" : "s"}`);
  if (config.flagNegativity) conditionChips.push(`Negative > ${config.negativityThreshold.toFixed(2)}`);
  if (conditionChips.length === 0) conditionChips.push("No active conditions");

  const actionChips: string[] = [];
  if (config.blockProfanity || config.autoHideSpam || keywordCount > 0) actionChips.push("Hide content");
  if (config.flagNegativity) actionChips.push("Flag for review");
  if (actionChips.length === 0) actionChips.push("No action");

  return (
    <div className="sops-card">
      <div className="sops-card__head">
        <div>
          <h3 className="sops-card__title">Rule Builder</h3>
          <p className="sops-card__sub">How your active rules flow</p>
        </div>
        <span className={`sops-chip ${config.enabled ? "sops-chip--ok" : "sops-chip--out"}`}>
          <Icon name="check" size={10} />
          {config.enabled ? "Active" : "Paused"}
        </span>
      </div>
      <div className="sops-card__body">
        <div className="sops-flow">
          <FlowBlock asset="mod-flow-trigger.svg" tone="purple" title="Trigger" chips={["New social comment, DM or chat message"]} variant />
          <FlowBlock asset="mod-flow-conditions.svg" tone="blue" title="Conditions" chips={conditionChips} />
          <FlowBlock asset="mod-flow-exception.svg" tone="amber" title="Exceptions" chips={["Approved keywords", "Allowed senders"]} />
          <FlowBlock asset="mod-flow-action.svg" tone="green" title="Action" chips={actionChips} />
          <FlowBlock asset="mod-flow-fallback.svg" tone="gray" title="Fallback" chips={["Send to review queue"]} />
        </div>
      </div>
    </div>
  );
}

function FlowBlock({
  asset,
  tone,
  title,
  chips,
  variant,
}: {
  asset: string;
  tone: "purple" | "blue" | "amber" | "green" | "gray";
  title: string;
  chips: string[];
  variant?: boolean;
}) {
  return (
    <div className={`sops-flowblk${variant ? " sops-flowblk--trigger" : ""}`}>
      <span className={`sops-flowblk__ico sops-flowblk__ico--${tone}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/assets/repulabs/unified-inbox/${asset}`} alt="" aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="sops-flowblk__t">{title}</div>
        <div className="sops-flowblk__chips">
          {chips.map((c) => (
            <span key={c} className="sops-chip sops-chip--out">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TipsCard() {
  return (
    <div className="sops-tips">
      <div className="sops-tips__body">
        <div className="sops-tips__t">
          <Icon name="sparkle" size={13} style={{ verticalAlign: -2, marginRight: 5, color: "var(--sops-pri)" }} />
          Tips &amp; best practices
        </div>
        <p className="sops-tips__p">
          Use the negativity threshold to reduce false positives, and combine keyword rules with AI
          detection for the best results. Negative sentiment is only ever flagged for review — never
          auto-hidden.
        </p>
      </div>
      <span className="sops-tips__art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/repulabs/unified-inbox/mod-tips.svg" alt="" aria-hidden="true" />
      </span>
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
    <label className="sops" style={{ display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="sops-checkbox"
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</span>
          {badge && <span className={`sops-chip ${badge.cls}`}>{badge.label}</span>}
        </div>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--sops-muted)", lineHeight: 1.45 }}>{help}</p>
      </div>
    </label>
  );
}
