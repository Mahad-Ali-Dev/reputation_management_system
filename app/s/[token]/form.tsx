"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type SubmitResult = {
  thankYou: string;
  route: string | null;
  coupon: { code: string; valueCents: number; description: string | null } | null;
};

export default function SurveyForm({
  token,
  action,
  npsPrompt,
  textPrompt,
  hasTextQuestion,
}: {
  token: string;
  action: (form: FormData) => Promise<SubmitResult>;
  npsPrompt: string;
  textPrompt: string;
  hasTextQuestion: boolean;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;
    setError(null);
    const form = new FormData();
    form.set("token", token);
    form.set("npsScore", score.toString());
    if (followUp.trim()) form.set("followUp", followUp.trim());
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
        <h2 className="text-xl font-bold">Thanks!</h2>
        <p className="text-muted-foreground">{submitted.thankYou}</p>
        {submitted.coupon && (
          <div className="mx-auto max-w-xs rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-50 p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Your coupon</div>
            <div className="mt-2 text-2xl font-bold tracking-wider text-emerald-900">{submitted.coupon.code}</div>
            <div className="mt-1 text-sm text-emerald-800">
              ${(submitted.coupon.valueCents / 100).toFixed(2)} off
            </div>
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
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{npsPrompt}</legend>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={`h-10 w-10 rounded-md border text-sm font-semibold transition-colors ${
                score === n
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-input bg-white hover:bg-slate-50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </fieldset>

      {hasTextQuestion && (
        <label className="block text-sm">
          <span className="font-medium">{textPrompt}</span>
          <textarea
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={score === null || pending} className="w-full">
        {pending ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}
