"use client";

import { Icon } from "@/components/shell/icon";
import {
  type AutoReplyRuleFormState,
  initialAutoReplyRuleState,
} from "@/lib/auto-reply/form-state";
import Link from "next/link";
import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Shared form for create + edit pages. The "mode" prop swaps which server
 * action the form posts to (createAutoReplyRule vs updateAutoReplyRule)
 * and the submit-button label.
 *
 * Two pieces of UX worth calling out:
 *
 * 1. Keyword chip editor — pure CSS + a single <input>. Typing comma or
 *    pressing Enter splits and accumulates chips. The chips are persisted
 *    as a single comma-joined string in a hidden input so the server
 *    action's z.string parser handles it without needing FormData.getAll.
 *
 * 2. Auto-publish gating — when the user picks "Auto-publish" we reveal
 *    the delay-minutes input and a yellow safety nag. The nag is there
 *    so a host can't whip up an "auto-publish 5★ reviews instantly"
 *    rule without seeing the warning.
 */

const SOURCE_OPTIONS = [
  { value: "google", label: "Google" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "facebook", label: "Facebook" },
  { value: "yelp", label: "Yelp" },
  { value: "trustpilot", label: "Trustpilot" },
] as const;

const TONE_OPTIONS = [
  {
    value: "concise",
    label: "Concise",
    hint: "Short and to the point. Best for 4–5★ thank-yous.",
  },
  {
    value: "warm",
    label: "Warm",
    hint: "Friendly, professional. Matches your existing brand voice.",
  },
  {
    value: "detailed",
    label: "Detailed",
    hint: "Acknowledge the issue, take responsibility. Best for 1–3★ replies.",
  },
] as const;

export type RuleFormInitial = {
  id?: string;
  name: string;
  enabled: boolean;
  establishmentId: string | null;
  matchMinRating: number;
  matchMaxRating: number;
  matchKeywords: string[];
  matchSources: string[];
  action: string;
  delayMinutes: number;
  replyTone: string;
};

export function AutoReplyRuleForm({
  mode,
  initial,
  establishments,
  serverAction,
}: {
  mode: "create" | "edit";
  initial: RuleFormInitial;
  establishments: Array<{ id: string; name: string; kind: string | null }>;
  serverAction: (prev: AutoReplyRuleFormState, form: FormData) => Promise<AutoReplyRuleFormState>;
}) {
  const [state, formAction] = useActionState(serverAction, initialAutoReplyRuleState);
  const [keywords, setKeywords] = useState<string[]>(initial.matchKeywords);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [actionMode, setActionMode] = useState(initial.action);
  const [pickedSources, setPickedSources] = useState<string[]>(initial.matchSources);
  const minId = useId();
  const maxId = useId();
  const keywordsHidden = useMemo(() => keywords.join(","), [keywords]);

  const fieldErr = state.fieldErrors ?? {};

  function commitKeywordDraft() {
    const v = keywordDraft.trim();
    if (!v) return;
    setKeywords((cur) => {
      // Dedup case-insensitively. Keeps the host from accidentally
      // listing "Amazing" + "amazing" (which both match anyway).
      const lowered = v.toLowerCase();
      if (cur.some((k) => k.toLowerCase() === lowered)) return cur;
      // Trim to the same 32-cap the server enforces.
      if (cur.length >= 32) return cur;
      return [...cur, v];
    });
    setKeywordDraft("");
  }

  return (
    <form action={formAction} className="col" style={{ gap: 16 }}>
      {mode === "edit" && initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="matchKeywords" value={keywordsHidden} />
      {pickedSources.map((s) => (
        <input key={s} type="hidden" name="matchSources" value={s} />
      ))}

      {state.error && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#7f1d1d",
            fontSize: 13,
          }}
        >
          {state.error}
        </div>
      )}

      {/* Name */}
      <label className="col" style={{ gap: 4 }}>
        <span className="lbl">Name</span>
        <input
          name="name"
          required
          defaultValue={initial.name}
          maxLength={120}
          placeholder='e.g. "Thank-you for 5★ Google"'
          style={inputStyle}
        />
        {fieldErr.name && <FieldError>{fieldErr.name}</FieldError>}
        <span className="dim" style={{ fontSize: 11.5 }}>
          A nickname only you see. Keeps your rule list readable.
        </span>
      </label>

      {/* Listing scope */}
      <label className="col" style={{ gap: 4 }}>
        <span className="lbl">Applies to</span>
        <select
          name="establishmentId"
          defaultValue={initial.establishmentId ?? ""}
          style={inputStyle}
        >
          <option value="">All listings (org-wide)</option>
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.kind === "airbnb_listing" ? " · Airbnb" : ""}
            </option>
          ))}
        </select>
        {fieldErr.establishmentId && <FieldError>{fieldErr.establishmentId}</FieldError>}
        <span className="dim" style={{ fontSize: 11.5 }}>
          Per-listing rules trump org-wide rules in evaluation order.
        </span>
      </label>

      {/* Match criteria */}
      <fieldset
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 16,
          margin: 0,
        }}
      >
        <legend style={{ padding: "0 6px", fontSize: 12, fontWeight: 600 }}>Match criteria</legend>

        <div className="col" style={{ gap: 14 }}>
          {/* Rating range */}
          <div>
            <div className="lbl" style={{ marginBottom: 4 }}>
              Rating range
            </div>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <select
                id={minId}
                name="matchMinRating"
                defaultValue={initial.matchMinRating}
                aria-label="Minimum rating"
                style={selectSmall}
              >
                {[1, 2, 3, 4, 5].map((r) => (
                  <option key={r} value={r}>
                    {r}★
                  </option>
                ))}
              </select>
              <span className="dim" style={{ fontSize: 12 }}>
                to
              </span>
              <select
                id={maxId}
                name="matchMaxRating"
                defaultValue={initial.matchMaxRating}
                aria-label="Maximum rating"
                style={selectSmall}
              >
                {[1, 2, 3, 4, 5].map((r) => (
                  <option key={r} value={r}>
                    {r}★
                  </option>
                ))}
              </select>
            </div>
            {fieldErr.matchMaxRating && <FieldError>{fieldErr.matchMaxRating}</FieldError>}
          </div>

          {/* Sources */}
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>
              Sources
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {SOURCE_OPTIONS.map((s) => {
                const active = pickedSources.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() =>
                      setPickedSources((cur) =>
                        cur.includes(s.value)
                          ? cur.filter((x) => x !== s.value)
                          : [...cur, s.value],
                      )
                    }
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: 11.5,
                      background: active ? "var(--pri-50, #ecfdf7)" : "var(--surface)",
                      borderColor: active ? "var(--pri, #0f766e)" : "var(--line)",
                      color: active ? "var(--pri, #0f766e)" : "var(--ink-2)",
                      fontWeight: active ? 600 : 400,
                    }}
                    aria-pressed={active}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <span className="dim" style={{ fontSize: 11.5, display: "block", marginTop: 4 }}>
              Leave empty to match every platform.
            </span>
          </div>

          {/* Keywords */}
          <div>
            <div className="lbl" style={{ marginBottom: 4 }}>
              Keywords{" "}
              <span className="dim" style={{ fontWeight: 400 }}>
                (optional)
              </span>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {keywords.map((k) => (
                <span
                  key={k}
                  style={{
                    padding: "2px 4px 2px 10px",
                    borderRadius: 999,
                    background: "var(--surface-2, #f1f5f9)",
                    color: "var(--ink-2)",
                    fontSize: 11.5,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => setKeywords((cur) => cur.filter((x) => x !== k))}
                    aria-label={`Remove keyword ${k}`}
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                      padding: "0 4px",
                      lineHeight: 1,
                      color: "var(--rl-muted)",
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitKeywordDraft();
                } else if (
                  e.key === "Backspace" &&
                  keywordDraft.length === 0 &&
                  keywords.length > 0
                ) {
                  // Backspace on empty input pops the last chip. Classic
                  // tag-input UX — keeps keyboard users moving.
                  setKeywords((cur) => cur.slice(0, -1));
                }
              }}
              onBlur={commitKeywordDraft}
              placeholder='Type a phrase and press Enter (e.g. "breakfast", "noisy")'
              style={inputStyle}
              maxLength={64}
            />
            <span className="dim" style={{ fontSize: 11.5, display: "block", marginTop: 4 }}>
              Case-insensitive substring. The review body must contain at least one to match. Leave
              empty if you don&rsquo;t want to filter by content.
            </span>
          </div>
        </div>
      </fieldset>

      {/* Action */}
      <fieldset
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 16,
          margin: 0,
        }}
      >
        <legend style={{ padding: "0 6px", fontSize: 12, fontWeight: 600 }}>Action</legend>

        <div className="col" style={{ gap: 10 }}>
          <RadioCard
            checked={actionMode === "draft_only"}
            onClick={() => setActionMode("draft_only")}
            title="Draft for approval"
            description="Generate a draft reply. You approve and publish from the Reviews inbox."
            iconName="edit"
          />
          <RadioCard
            checked={actionMode === "auto_publish_after_delay"}
            onClick={() => setActionMode("auto_publish_after_delay")}
            title="Auto-publish after delay"
            description="Generate AND publish to the platform after a buffer window. You can still pull the draft before it goes live."
            iconName="bolt"
            warning
          />
          <input type="hidden" name="action" value={actionMode} />

          {actionMode === "auto_publish_after_delay" && (
            <div
              className="col"
              style={{
                gap: 8,
                padding: 12,
                borderRadius: 10,
                background: "var(--warn-50, #fffbeb)",
                border: "1px solid var(--warn-100, #fde68a)",
              }}
            >
              <label className="col" style={{ gap: 4 }}>
                <span className="lbl">Delay (minutes)</span>
                <input
                  type="number"
                  name="delayMinutes"
                  min={0}
                  max={1440}
                  defaultValue={initial.delayMinutes}
                  style={{ ...inputStyle, width: 120 }}
                />
                <span className="dim" style={{ fontSize: 11.5 }}>
                  Time you have to cancel before we publish. 0 = instant (not recommended).
                </span>
              </label>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--warn-700, #92400e)",
                  lineHeight: 1.6,
                }}
              >
                <strong>Heads-up:</strong> Auto-publish goes live without your review. We still run
                a safety classifier and any flagged draft is held for manual approval but the
                normal "drafted, awaiting approval" buffer is skipped.
              </p>
            </div>
          )}
          {/* Always carry delayMinutes so the form is well-formed even when
              draft_only is selected. */}
          {actionMode === "draft_only" && (
            <input type="hidden" name="delayMinutes" value={initial.delayMinutes} />
          )}
        </div>
      </fieldset>

      {/* Tone */}
      <fieldset
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 16,
          margin: 0,
        }}
      >
        <legend style={{ padding: "0 6px", fontSize: 12, fontWeight: 600 }}>Reply tone</legend>
        <div className="col" style={{ gap: 8 }}>
          {TONE_OPTIONS.map((t) => (
            <label
              key={t.value}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="replyTone"
                value={t.value}
                defaultChecked={initial.replyTone === t.value}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  {t.hint}
                </div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Enabled */}
      <label
        className="row"
        style={{
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: 10,
          background: "var(--surface-2, #f8fafc)",
        }}
      >
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial.enabled}
          value="true"
          style={{ width: 16, height: 16 }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Enabled</div>
          <div className="dim" style={{ fontSize: 11.5 }}>
            Disabled rules stay saved but skip evaluation.
          </div>
        </div>
      </label>

      <div className="row" style={{ justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <Link href="/reviews/auto-reply" className="btn">
          Cancel
        </Link>
        <SubmitButton mode={mode} />
      </div>
    </form>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        color: "var(--bad)",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--pri"
      disabled={pending}
      style={{ opacity: pending ? 0.6 : 1, cursor: pending ? "wait" : undefined }}
    >
      <Icon name="check" size={12} />
      {pending ? "Saving…" : mode === "create" ? "Create rule" : "Save changes"}
    </button>
  );
}

function RadioCard({
  checked,
  onClick,
  title,
  description,
  iconName,
  warning,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  description: string;
  iconName: "edit" | "bolt";
  warning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      style={{
        textAlign: "left",
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${checked ? (warning ? "var(--warn, #f59e0b)" : "var(--pri, #0f766e)") : "var(--line)"}`,
        background: checked
          ? warning
            ? "var(--warn-50, #fffbeb)"
            : "var(--pri-50, #ecfdf7)"
          : "var(--surface)",
        cursor: "pointer",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          marginTop: 2,
          borderRadius: 999,
          border: "2px solid",
          borderColor: checked ? (warning ? "var(--warn)" : "var(--pri)") : "var(--rl-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: warning ? "var(--warn)" : "var(--pri)",
            }}
          />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div className="row" style={{ gap: 6, marginBottom: 2 }}>
          <Icon name={iconName} size={12} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        </div>
        <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: "var(--r, 8px)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--f-ui)",
};

const selectSmall: React.CSSProperties = {
  ...inputStyle,
  width: 80,
};
