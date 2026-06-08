"use client";

import { useMemo, useRef } from "react";
import {
  COMMON_TAGS,
  type MergeTag,
  extractMergeTags,
  renderMergeTags,
} from "@/lib/merge-tags";

/**
 * `<MergeTagEditor>` (00_foundation §A5) — template editor + live preview.
 *
 * A controlled textarea with a toolbar of insertable tag chips and a
 * side-by-side preview rendered against `sampleData`. Used by Steps 7
 * (review-request templates) and 11 (survey invites).
 *
 * Syntax is the canonical DOUBLE-BRACE `{{tag}}` (see `lib/merge-tags`). Clicking
 * a chip inserts `{{key}}` at the caret. The preview calls the SAME pure
 * `renderMergeTags` the server uses at send time, so what you preview is what
 * ships. Unknown tags (present in the template but not in `tags`) raise a subtle
 * inline warning. For `channel="sms"`, a live character counter uses the RENDERED
 * length (not the raw template) and warns past the 160/320 segment thresholds.
 *
 * Presentation only: state lives in the parent via `value`/`onChange`.
 */

/** SMS segment thresholds (GSM-7 single / concatenated). */
const SMS_SINGLE = 160;
const SMS_DOUBLE = 320;

export function MergeTagEditor({
  value,
  onChange,
  tags = COMMON_TAGS,
  sampleData,
  channel,
  label,
  maxLength,
  showPreview = true,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Insertable chips; defaults to COMMON_TAGS. */
  tags?: MergeTag[];
  /** Drives the live preview substitution. */
  sampleData: Record<string, string>;
  /** "sms" shows a rendered-length char counter + segment hint. */
  channel?: "sms" | "email";
  label?: string;
  maxLength?: number;
  /** Render the side preview (default true). */
  showPreview?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Allowed key set for unknown-tag validation.
  const allowedKeys = useMemo(() => tags.map((t) => t.key), [tags]);
  const unknownTags = useMemo(() => {
    const allow = new Set(allowedKeys);
    return extractMergeTags(value).filter((k) => !allow.has(k));
  }, [value, allowedKeys]);

  const rendered = useMemo(
    () => renderMergeTags(value, sampleData, { keepUnknown: true }),
    [value, sampleData],
  );

  const renderedLen = rendered.length;
  const smsSegments =
    renderedLen === 0 ? 0 : renderedLen <= SMS_SINGLE ? 1 : Math.ceil(renderedLen / SMS_DOUBLE);
  const smsOverLimit = channel === "sms" && renderedLen > SMS_DOUBLE;
  const smsApproaching = channel === "sms" && renderedLen > SMS_SINGLE && !smsOverLimit;

  /** Insert `{{key}}` at the caret (or replace the selection), keep focus. */
  function insertTag(key: string) {
    const token = `{{${key}}}`;
    const ta = taRef.current;
    if (!ta) {
      // No DOM handle (shouldn't happen post-mount) — append as a safe fallback.
      onChange(value + token);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    let next = value.slice(0, start) + token + value.slice(end);
    if (typeof maxLength === "number" && next.length > maxLength) {
      next = next.slice(0, maxLength);
    }
    onChange(next);
    // Restore focus + place caret just after the inserted token.
    requestAnimationFrame(() => {
      const pos = Math.min(start + token.length, next.length);
      ta.focus();
      try {
        ta.setSelectionRange(pos, pos);
      } catch {
        /* setSelectionRange can throw on detached nodes — ignore */
      }
    });
  }

  return (
    <div
      className="merge-tag-editor"
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns: showPreview ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
        alignItems: "start",
      }}
    >
      {/* Editor column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {label && <label className="lbl">{label}</label>}

        {/* Tag chips toolbar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tags.map((t) => (
            <button
              key={t.key}
              type="button"
              className="chip chip--info"
              onClick={() => insertTag(t.key)}
              title={`Insert {{${t.key}}} — e.g. “${t.example}”`}
              style={{ cursor: "pointer", border: "1px solid var(--line)" }}
            >
              + {t.label}
            </button>
          ))}
        </div>

        <textarea
          ref={taRef}
          className="ds-textarea"
          value={value}
          maxLength={maxLength}
          rows={channel === "sms" ? 4 : 8}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            channel === "sms"
              ? "Hi {{first_name}}, thanks for visiting {{business_name}}! Mind leaving us a quick review? {{review_link}}"
              : "Write your message. Click a tag above to insert it at the cursor."
          }
          style={{ fontFamily: "var(--f-mono, monospace)", minHeight: channel === "sms" ? 96 : 160 }}
        />

        {/* Footer: SMS counter + unknown-tag warning */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {unknownTags.length > 0 ? (
            <span className="chip chip--warn" title={unknownTags.map((t) => `{{${t}}}`).join(" ")}>
              Unknown tag{unknownTags.length > 1 ? "s" : ""}: {unknownTags.map((t) => `{{${t}}}`).join(", ")}
            </span>
          ) : (
            <span />
          )}

          {channel === "sms" && (
            <span
              style={{
                fontSize: 11.5,
                fontVariantNumeric: "tabular-nums",
                color: smsOverLimit ? "var(--warn)" : smsApproaching ? "var(--warn)" : "var(--rl-muted)",
                fontWeight: smsOverLimit ? 600 : 400,
              }}
              title="Counts the rendered message length (after merge tags resolve)."
            >
              {renderedLen} chars · {smsSegments} SMS segment{smsSegments === 1 ? "" : "s"}
              {smsOverLimit ? " — over limit" : ""}
            </span>
          )}
          {channel !== "sms" && typeof maxLength === "number" && (
            <span
              style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: "var(--rl-muted)" }}
            >
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      </div>

      {/* Live preview column */}
      {showPreview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <label className="lbl">Preview</label>
          <div
            className="ds-card"
            style={{
              padding: "14px 16px",
              minHeight: channel === "sms" ? 96 : 160,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--ink)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "var(--surface-2)",
            }}
          >
            {rendered || (
              <span style={{ color: "var(--rl-muted-2)" }}>Your rendered message appears here.</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "var(--rl-muted-2)" }}>
            Rendered with sample data. Real values are filled in at send time.
          </span>
        </div>
      )}
    </div>
  );
}
