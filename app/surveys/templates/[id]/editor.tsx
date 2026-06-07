"use client";

import { Icon } from "@/components/shell/icon";
import { COMMON_TAGS, renderMergeTags, sampleDataFromTags } from "@/lib/merge-tags";
import { saveSurveyTemplate } from "@/lib/surveys/template-actions";
import type { QuestionType, SurveyTemplate, TemplateBranding, TemplateQuestion } from "@/lib/surveys/templates";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

/**
 * Two-column live-preview survey template editor (Module 11).
 *
 * Left: question builder (add / reorder / delete; types Rating Stars, Multiple
 * Choice, Text, NPS Scale, Yes/No) + branding (logo, color, greeting, thank-you).
 * Right: a real mobile preview that re-renders on EVERY keystroke (AC
 * "live-preview updates in real time"). Greeting/thank-you support `{{tag}}`
 * merge tags via the canonical `lib/merge-tags` (NOT a forked resolver).
 *
 * Local fallback for the shared `SurveyTemplateEditor` primitive (not present in
 * Wave-0). TODO(shared): hoist to `components/editor/survey-template-editor.tsx`
 * once that primitive lands, so Step 7 can reuse it.
 */

const TYPE_OPTIONS: { value: QuestionType; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { value: "nps", label: "NPS Scale", icon: "trend" },
  { value: "rating", label: "Rating Stars", icon: "star" },
  { value: "multichoice", label: "Multiple Choice", icon: "grid" },
  { value: "yes_no", label: "Yes / No", icon: "check" },
  { value: "text", label: "Text", icon: "chat" },
];

const TYPE_LABEL: Record<QuestionType, string> = {
  nps: "NPS Scale",
  rating: "Rating Stars",
  multichoice: "Multiple Choice",
  yes_no: "Yes / No",
  text: "Text",
};

const DEFAULT_PROMPTS: Record<QuestionType, string> = {
  nps: "How likely are you to recommend us to a friend or colleague?",
  rating: "How would you rate your experience?",
  multichoice: "What did you like most?",
  yes_no: "Would you visit us again?",
  text: "What's the main reason for your score?",
};

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `q_${Date.now()}_${keyCounter}`;
}

type EditableQuestion = TemplateQuestion & { _key: string };

export function SurveyTemplateEditorClient({
  template,
  businessName,
}: {
  template: SurveyTemplate;
  businessName: string;
}) {
  const [name, setName] = useState(template.name);
  const [branding, setBranding] = useState<TemplateBranding>({
    primaryColor: template.branding.primaryColor ?? "#2563eb",
    greeting: template.branding.greeting ?? `Hi {{first_name}}, how was your visit to {{business_name}}?`,
    thankYou: template.branding.thankYou ?? "Thanks for your feedback!",
    logoUrl: template.branding.logoUrl ?? "",
  });
  const [questions, setQuestions] = useState<EditableQuestion[]>(
    template.questions.length > 0
      ? template.questions.map((q) => ({ ...q, _key: nextKey() }))
      : [{ type: "nps", prompt: DEFAULT_PROMPTS.nps, required: true, _key: nextKey() }],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addQuestion(type: QuestionType) {
    setQuestions((qs) => [
      ...qs,
      {
        type,
        prompt: DEFAULT_PROMPTS[type],
        required: true,
        choices: type === "multichoice" ? ["Option 1", "Option 2"] : undefined,
        _key: nextKey(),
      },
    ]);
  }
  function updateQuestion(key: string, patch: Partial<EditableQuestion>) {
    setQuestions((qs) => qs.map((q) => (q._key === key ? { ...q, ...patch } : q)));
  }
  function removeQuestion(key: string) {
    setQuestions((qs) => (qs.length <= 1 ? qs : qs.filter((q) => q._key !== key)));
  }
  function move(key: string, dir: -1 | 1) {
    setQuestions((qs) => {
      const i = qs.findIndex((q) => q._key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      const a = copy[i]!;
      const b = copy[j]!;
      copy[i] = b;
      copy[j] = a;
      return copy;
    });
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSurveyTemplate({
        id: template.id,
        name,
        questions: questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          required: q.required,
          choices: q.type === "multichoice" ? (q.choices ?? []).filter((c) => c.trim()) : undefined,
        })),
        branding: {
          primaryColor: branding.primaryColor,
          greeting: branding.greeting,
          thankYou: branding.thankYou,
          logoUrl: branding.logoUrl,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 24, alignItems: "start" }}>
      {/* ── Left: builder ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div className="ds-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="lbl">Template name</span>
            <input
              className="ds-textarea"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              style={{ fontFamily: "inherit", padding: "8px 10px" }}
            />
          </label>
        </div>

        {/* Branding */}
        <div className="ds-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Branding</div>
          <div className="grid-2" style={{ gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
              <span className="lbl">Accent color</span>
              <input
                type="color"
                value={branding.primaryColor ?? "#2563eb"}
                onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
                style={{ width: 56, height: 34, padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
              <span className="lbl">Logo URL (optional)</span>
              <input
                className="ds-textarea"
                value={branding.logoUrl ?? ""}
                onChange={(e) => setBranding((b) => ({ ...b, logoUrl: e.target.value }))}
                placeholder="https://…"
                style={{ fontFamily: "inherit", padding: "8px 10px" }}
              />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <span className="lbl">Greeting (supports merge tags)</span>
            <input
              className="ds-textarea"
              value={branding.greeting ?? ""}
              onChange={(e) => setBranding((b) => ({ ...b, greeting: e.target.value }))}
              maxLength={300}
              style={{ fontFamily: "var(--f-mono, monospace)", padding: "8px 10px" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <span className="lbl">Thank-you message</span>
            <input
              className="ds-textarea"
              value={branding.thankYou ?? ""}
              onChange={(e) => setBranding((b) => ({ ...b, thankYou: e.target.value }))}
              maxLength={300}
              style={{ fontFamily: "inherit", padding: "8px 10px" }}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COMMON_TAGS.slice(0, 4).map((t) => (
              <span key={t.key} className="chip chip--info" style={{ fontSize: 11 }} title={`e.g. ${t.example}`}>
                {`{{${t.key}}}`}
              </span>
            ))}
          </div>
        </div>

        {/* Questions */}
        <div className="ds-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row">
            <div style={{ fontSize: 14, fontWeight: 600 }}>Questions</div>
            <span className="lbl-mono" style={{ marginLeft: "auto", margin: 0 }}>
              {questions.length} total
            </span>
          </div>

          {template.responseCount > 0 && (
            <div
              className="row"
              style={{ gap: 8, fontSize: 11.5, color: "var(--warn)", background: "var(--warn-soft, rgba(217,119,6,0.08))", padding: "8px 12px", borderRadius: 8 }}
            >
              <Icon name="alert" size={13} />
              This survey already has responses. Editing questions affects future responses only.
            </div>
          )}

          {questions.map((q, i) => (
            <QuestionEditor
              key={q._key}
              q={q}
              index={i}
              isFirst={i === 0}
              isLast={i === questions.length - 1}
              canDelete={questions.length > 1}
              onChange={(patch) => updateQuestion(q._key, patch)}
              onMove={(dir) => move(q._key, dir)}
              onRemove={() => removeQuestion(q._key)}
            />
          ))}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>
            {TYPE_OPTIONS.map((t) => (
              <button key={t.value} type="button" className="btn btn--sm btn--ghost" onClick={() => addQuestion(t.value)}>
                <Icon name={t.icon} size={12} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={{ color: "var(--bad)", fontSize: 12.5 }}>{error}</div>}

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--pri" onClick={handleSave} disabled={pending}>
            <Icon name="check" size={13} />
            {pending ? "Saving…" : "Save template"}
          </button>
          {saved && (
            <span className="chip chip--ok" style={{ fontSize: 11.5 }}>
              <Icon name="checkCircle" size={12} /> Saved
            </span>
          )}
          <Link href="/surveys?tab=templates" className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }}>
            Back to templates
          </Link>
        </div>
      </div>

      {/* ── Right: live mobile preview ── */}
      <div style={{ position: "sticky", top: 16 }}>
        <div className="lbl-mono" style={{ marginBottom: 8 }}>
          Live preview
        </div>
        <MobilePreview name={name} branding={branding} questions={questions} businessName={businessName} />
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  index,
  isFirst,
  isLast,
  canDelete,
  onChange,
  onMove,
  onRemove,
}: {
  q: EditableQuestion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onChange: (patch: Partial<EditableQuestion>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="chip chip--out" style={{ fontSize: 10.5 }}>
          {index + 1}
        </span>
        <span className="lbl-mono" style={{ margin: 0 }}>
          {TYPE_LABEL[q.type]}
        </span>
        <div className="row" style={{ marginLeft: "auto", gap: 4 }}>
          <button type="button" className="btn btn--xs btn--ghost" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up">
            <Icon name="arrowU" size={12} />
          </button>
          <button type="button" className="btn btn--xs btn--ghost" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down">
            <Icon name="arrowD" size={12} />
          </button>
          <button type="button" className="btn btn--xs btn--ghost" onClick={onRemove} disabled={!canDelete} aria-label="Delete question">
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      <input
        className="ds-textarea"
        value={q.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        maxLength={300}
        placeholder="Question prompt"
        style={{ fontFamily: "inherit", padding: "7px 10px", fontSize: 13 }}
      />

      {q.type === "multichoice" && (
        <ChoicesEditor choices={q.choices ?? []} onChange={(choices) => onChange({ choices })} />
      )}

      <label className="row" style={{ gap: 6, fontSize: 12, color: "var(--rl-muted)", cursor: "pointer" }}>
        <input type="checkbox" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} />
        Required
      </label>
    </div>
  );
}

function ChoicesEditor({ choices, onChange }: { choices: string[]; onChange: (choices: string[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {choices.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: choice list is positional
        <div key={i} className="row" style={{ gap: 6 }}>
          <input
            className="ds-textarea"
            value={c}
            onChange={(e) => {
              const next = [...choices];
              next[i] = e.target.value;
              onChange(next);
            }}
            maxLength={120}
            style={{ fontFamily: "inherit", padding: "6px 9px", fontSize: 12.5 }}
          />
          <button
            type="button"
            className="btn btn--xs btn--ghost"
            onClick={() => onChange(choices.filter((_, j) => j !== i))}
            disabled={choices.length <= 1}
            aria-label="Remove choice"
          >
            <Icon name="x" size={11} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn--xs btn--ghost"
        onClick={() => onChange([...choices, `Option ${choices.length + 1}`])}
        disabled={choices.length >= 12}
        style={{ alignSelf: "flex-start" }}
      >
        <Icon name="plus" size={11} /> Add choice
      </button>
    </div>
  );
}

/** The customer-facing mobile preview — re-renders on every keystroke. */
function MobilePreview({
  name,
  branding,
  questions,
  businessName,
}: {
  name: string;
  branding: TemplateBranding;
  questions: EditableQuestion[];
  businessName: string;
}) {
  const accent = branding.primaryColor || "#2563eb";
  const sample = useMemo(() => {
    const base = sampleDataFromTags(COMMON_TAGS);
    return { ...base, business_name: businessName, businessName };
  }, [businessName]);
  const greeting = renderMergeTags(branding.greeting ?? "", sample, { keepUnknown: false });

  return (
    <div
      style={{
        borderRadius: 24,
        border: "8px solid #0f172a",
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
        maxWidth: 340,
      }}
    >
      <div style={{ height: 22, background: "#0f172a" }} />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, minHeight: 420 }}>
        {branding.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: external preview logo, not app chrome
          <img src={branding.logoUrl} alt="" style={{ maxHeight: 36, alignSelf: "center", objectFit: "contain" }} />
        ) : (
          <div style={{ height: 4 }} />
        )}
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1.35 }}>
          {greeting || `How was your experience with ${businessName}?`}
        </div>

        {questions.map((q, i) => (
          <PreviewQuestion key={q._key} q={q} accent={accent} first={i === 0} />
        ))}

        <button
          type="button"
          style={{
            marginTop: "auto",
            background: accent,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "11px 16px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "default",
          }}
        >
          Submit
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, color: "#94a3b8", fontSize: 10.5 }}>
          <Icon name="lock" size={11} />
          Secure &amp; private · {name || "Survey"}
        </div>
      </div>
    </div>
  );
}

function PreviewQuestion({ q, accent, first }: { q: EditableQuestion; accent: string; first: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!first && (
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "#0f172a" }}>
          {q.prompt}
          {q.required && <span style={{ color: "#dc2626" }}> *</span>}
        </div>
      )}
      {first && q.type !== "nps" && q.type !== "rating" && (
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "#0f172a" }}>{q.prompt}</div>
      )}

      {q.type === "nps" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {Array.from({ length: 11 }, (_, n) => n).map((n) => (
            <span
              key={n}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                color: "#475569",
              }}
            >
              {n}
            </span>
          ))}
        </div>
      )}

      {q.type === "rating" && (
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Icon key={s} name="star" size={22} style={{ color: s <= 4 ? accent : "#e2e8f0" }} />
          ))}
        </div>
      )}

      {q.type === "yes_no" && (
        <div style={{ display: "flex", gap: 8 }}>
          {["Yes", "No"].map((opt) => (
            <span key={opt} style={{ flex: 1, textAlign: "center", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 0", fontSize: 13, color: "#475569" }}>
              {opt}
            </span>
          ))}
        </div>
      )}

      {q.type === "multichoice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.choices ?? []).filter((c) => c.trim()).map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional preview choices
            <span key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#475569" }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {q.type === "text" && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: "#94a3b8", minHeight: 56 }}>
          Type your answer…
        </div>
      )}
    </div>
  );
}
