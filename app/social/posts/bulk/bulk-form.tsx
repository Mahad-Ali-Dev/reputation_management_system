"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createSocialPost } from "@/lib/social/post-actions";

type Establishment = { id: string; name: string };

const PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

const MAX_ROWS = 100;

function defaultStartIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 15));
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function BulkScheduleForm({ establishments }: { establishments: Establishment[] }) {
  const [bulkText, setBulkText] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["facebook"]);
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? "");
  const [startLocal, setStartLocal] = useState(defaultStartIso());
  const [intervalMinutes, setIntervalMinutes] = useState(60 * 4);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rows = bulkText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  function togglePlatform(id: string) {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (rows.length === 0) {
      setError("Paste at least one caption.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setError(`Max ${MAX_ROWS} captions per batch. You have ${rows.length}.`);
      return;
    }
    if (platforms.length === 0) {
      setError("Pick at least one platform.");
      return;
    }

    const startMs = new Date(startLocal).getTime();
    if (!Number.isFinite(startMs) || startMs < Date.now() - 60_000) {
      setError("Start time must be in the future.");
      return;
    }

    setProgress({ done: 0, total: rows.length, failed: 0 });
    startTransition(async () => {
      let done = 0;
      let failed = 0;
      for (let i = 0; i < rows.length; i++) {
        const caption = rows[i] ?? "";
        const scheduledFor = new Date(startMs + i * intervalMinutes * 60_000).toISOString();
        const fd = new FormData();
        fd.set("caption", caption);
        fd.set("platforms", platforms.join(","));
        fd.set("scheduledFor", scheduledFor);
        if (establishmentId) fd.set("establishmentId", establishmentId);
        try {
          await createSocialPost(fd);
          done++;
        } catch {
          failed++;
        }
        setProgress({ done: done + failed, total: rows.length, failed });
      }
      if (failed === 0) {
        setSuccess(`Queued ${done} posts. They'll publish on your selected platforms at the scheduled times.`);
        setBulkText("");
      } else {
        setError(`Queued ${done}, ${failed} failed. Captions that error usually exceed platform char limits.`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="col" style={{ gap: 14 }}>
      <div className="grid-2" style={{ gap: 12 }}>
        {establishments.length > 0 && (
          <label className="col" style={{ gap: 6 }}>
            <span className="lbl">Post as</span>
            <select
              value={establishmentId}
              onChange={(e) => setEstablishmentId(e.target.value)}
              className="ds-select"
            >
              {establishments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">First post at</span>
          <input
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            className="ds-input"
          />
        </label>
      </div>

      <label className="col" style={{ gap: 6 }}>
        <span className="lbl">Interval between posts (minutes)</span>
        <input
          type="number"
          min={15}
          max={60 * 24 * 7}
          value={intervalMinutes}
          onChange={(e) => setIntervalMinutes(Math.max(15, Number(e.target.value) || 60))}
          className="ds-input"
          style={{ width: 160 }}
        />
        <span className="dim" style={{ fontSize: 11.5 }}>
          15 = every 15 min · 60 = hourly · 240 = every 4h · 1440 = once a day
        </span>
      </label>

      <div className="col" style={{ gap: 6 }}>
        <span className="lbl">Platforms</span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {PLATFORMS.map((p) => (
            <label key={p.id} className="row" style={{ gap: 6, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={platforms.includes(p.id)}
                onChange={() => togglePlatform(p.id)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <label className="col" style={{ gap: 6 }}>
        <span className="lbl">Captions — one per line ({rows.length}/{MAX_ROWS})</span>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={10}
          placeholder={`Friday giveaway — comment your favorite menu item to enter!\nTip Tuesday: hidden bug in the booking flow that costs you tables\nWeekend hours change — open till 11pm now`}
          className="ds-textarea"
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 12.5,
            lineHeight: 1.5,
            minHeight: 200,
          }}
        />
      </label>

      <div
        className="dim"
        style={{ fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}
      >
        Posts queue as <strong>scheduled</strong> drafts. They publish via your connected social
        accounts at the times shown. Captions over the platform character limit (X: 280) will fail
        — split those into shorter lines first.
      </div>

      {error && (
        <div
          style={{
            fontSize: 13,
            padding: 10,
            border: "1px solid var(--bad)",
            borderRadius: 8,
            color: "var(--bad)",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            fontSize: 13,
            padding: 10,
            border: "1px solid var(--ok)",
            borderRadius: 8,
            color: "var(--ok)",
          }}
        >
          {success}
        </div>
      )}

      {pending && progress.total > 0 && (
        <div className="dim" style={{ fontSize: 12 }}>
          Queueing {progress.done}/{progress.total}…
          {progress.failed > 0 ? ` (${progress.failed} failed)` : ""}
        </div>
      )}

      <Button type="submit" disabled={pending || rows.length === 0}>
        {pending ? "Queueing…" : `Queue ${rows.length || ""} posts`.trim()}
      </Button>
    </form>
  );
}
