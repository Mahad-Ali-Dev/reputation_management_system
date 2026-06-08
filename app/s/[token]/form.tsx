"use client";

import { useMemo, useState, useTransition } from "react";

/**
 * Public customer survey form (Module 11). Renders ALL question types in order
 * (NPS scale, rating stars, multiple choice, yes/no, text) and submits a
 * per-question answer array (JSON) to the enhanced `submitSurveyResponse`.
 *
 * Deliberately STANDALONE / native-feeling — this is the customer-facing
 * surface, NOT the app dashboard. No app chrome, no design-system classes; plain
 * Tailwind + an optional brand accent color. Fully mobile-responsive.
 */

export type PublicQuestion = {
  id: string;
  type: "nps" | "rating" | "text" | "multichoice" | "yes_no";
  prompt: string;
  required: boolean;
  choices?: string[];
};

type SubmitResult = {
  thankYou: string;
  route: string | null;
  coupon: { code: string; valueCents: number; description: string | null } | null;
};

type AnswerValue = { number?: number; text?: string; bool?: boolean; choice?: string };

export default function SurveyForm({
  token,
  action,
  questions,
  thankYouMessage,
  accent,
}: {
  token: string;
  action: (form: FormData) => Promise<SubmitResult>;
  questions: PublicQuestion[];
  thankYouMessage: string | null;
  accent: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accentColor = accent || "#4f46e5";

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  const missingRequired = useMemo(() => {
    return questions.some((q) => {
      if (!q.required) return false;
      const a = answers[q.id];
      if (!a) return true;
      if (q.type === "text" || q.type === "multichoice") return !(a.text || a.choice);
      if (q.type === "yes_no") return typeof a.bool !== "boolean";
      return typeof a.number !== "number";
    });
  }, [questions, answers]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missingRequired) {
      setError("Please answer the required questions.");
      return;
    }
    setError(null);
    const payload = questions
      .map((q) => {
        const a = answers[q.id];
        if (!a) return null;
        return { questionId: q.id, ...a };
      })
      .filter((x): x is { questionId: string } & AnswerValue => x !== null);

    const form = new FormData();
    form.set("token", token);
    form.set("answers", JSON.stringify(payload));
    startTransition(async () => {
      try {
        const result = await action(form);
        setSubmitted(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submission failed");
      }
    });
  }

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{submitted.route === "review_request" ? "🌟" : "🙏"}</div>
        <h2 className="text-xl font-bold" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>Thanks!</h2>
        <p style={{ color: "#64748b" }}>{thankYouMessage || submitted.thankYou}</p>
        {submitted.coupon && (
          <div className="mx-auto max-w-xs rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-50 p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Your coupon</div>
            <div className="mt-2 text-2xl font-bold tracking-wider text-emerald-900">{submitted.coupon.code}</div>
            <div className="mt-1 text-sm text-emerald-800">${(submitted.coupon.valueCents / 100).toFixed(2)} off</div>
            {submitted.coupon.description && (
              <div className="mt-1 text-xs text-emerald-700">{submitted.coupon.description}</div>
            )}
            <div className="mt-2 text-[10px] text-emerald-600">Show this at the counter on your next visit.</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions.map((q) => (
        <Question key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} accent={accentColor} />
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending || missingRequired}
        className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ background: accentColor }}
      >
        {pending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

function Question({
  q,
  value,
  onChange,
  accent,
}: {
  q: PublicQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  accent: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium" style={{ color: "#1e293b" }}>
        {q.prompt}
        {q.required && <span className="text-red-500"> *</span>}
      </legend>

      {q.type === "nps" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => {
              const selected = value?.number === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ number: n })}
                  className="h-10 w-10 rounded-md border text-sm font-semibold transition-colors"
                  style={
                    selected
                      ? { borderColor: accent, background: accent, color: "#fff" }
                      : { borderColor: "#e2e8f0", background: "#fff" }
                  }
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-xs" style={{ color: "#64748b" }}>
            <span>Not at all likely</span>
            <span>Extremely likely</span>
          </div>
        </>
      )}

      {q.type === "rating" && (
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => {
            const active = (value?.number ?? 0) >= s;
            return (
              <button
                key={s}
                type="button"
                aria-label={`${s} star${s === 1 ? "" : "s"}`}
                onClick={() => onChange({ number: s })}
                className="transition-transform hover:scale-110"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill={active ? accent : "none"} stroke={active ? accent : "#cbd5e1"} strokeWidth="1.5">
                  <path d="M12 2.5 14.9 8.7l6.6.6-5 4.6 1.5 6.6L12 17l-6 3.5 1.5-6.6-5-4.6 6.6-.6L12 2.5Z" />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {q.type === "yes_no" && (
        <div className="flex gap-2">
          {[
            { label: "Yes", val: true },
            { label: "No", val: false },
          ].map((opt) => {
            const selected = value?.bool === opt.val;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onChange({ bool: opt.val })}
                className="flex-1 rounded-md border py-2.5 text-sm font-medium transition-colors"
                style={
                  selected
                    ? { borderColor: accent, background: accent, color: "#fff" }
                    : { borderColor: "#e2e8f0", background: "#fff" }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "multichoice" && (
        <div className="flex flex-col gap-2">
          {(q.choices ?? []).map((c) => {
            const selected = value?.choice === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ choice: c })}
                className="rounded-md border px-3 py-2.5 text-left text-sm transition-colors"
                style={
                  selected
                    ? { borderColor: accent, background: `${accent}14`, color: "#0f172a" }
                    : { borderColor: "#e2e8f0", background: "#fff" }
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "text" && (
        <textarea
          value={value?.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          maxLength={2000}
          placeholder={q.required ? "" : "Optional"}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = accent;
            e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}33`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "";
            e.currentTarget.style.boxShadow = "";
          }}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none"
        />
      )}
    </fieldset>
  );
}
