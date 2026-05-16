"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { redeemCouponAction } from "@/lib/surveys/coupon-actions";

export function CouponRedeemForm() {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: boolean; message: string; valueCents?: number; description?: string | null; code?: string }
    | null
  >(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const form = new FormData();
    form.set("code", code.trim().toUpperCase());
    if (note.trim()) form.set("note", note.trim());
    startTransition(async () => {
      try {
        const r = await redeemCouponAction(form);
        setResult(r);
        if (r.ok) {
          setCode("");
          setNote("");
        }
      } catch (err) {
        setResult({
          ok: false,
          message: err instanceof Error ? err.message : "Failed to redeem",
        });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm col-span-2">
          <span className="font-medium">Coupon code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD1234EF"
            maxLength={20}
            autoFocus
            required
            className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-base uppercase"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Staff note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="Receipt #..."
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </label>
      </div>
      <Button type="submit" disabled={pending || code.length < 8}>
        {pending ? "Checking…" : "Redeem"}
      </Button>
      {result && (
        <div
          className={`rounded-md p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}
        >
          {result.message}
          {result.ok && result.description && (
            <div className="text-xs mt-1 opacity-80">{result.description}</div>
          )}
        </div>
      )}
    </form>
  );
}
