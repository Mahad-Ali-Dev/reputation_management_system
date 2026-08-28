"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { createSocialPost } from "@/lib/social/post-actions";
import { useState, useTransition } from "react";

/**
 * `<BulkScheduleForm>` (Module 10) — bulk-queue caption list, rebuilt to the kit
 * (.sk-bulk-* / .sk-platform / .sk-queue-btn).
 *
 * One caption per line → queued across the selected platforms at a fixed
 * interval starting from the chosen time. Preserves the original submission
 * logic (parse rows → loop `createSocialPost` with per-row progress).
 */

type Establishment = { id: string; name: string };

const PLATFORMS: { id: string; label: string; icon: IconName; color: string }[] = [
  { id: "facebook", label: "Facebook", icon: "fb", color: "#1877F2" },
  { id: "instagram", label: "Instagram", icon: "insta", color: "#E1306C" },
  { id: "linkedin", label: "LinkedIn", icon: "linkedin", color: "#0A66C2" },
  // X/Twitter delisted 2026-08 — not shipping this launch. Kept in
  // PLATFORM_LIMITS / previews / calendar so ALREADY-PUBLISHED posts still
  // render; only the picker drops it. Re-add this line to bring it back.
  // { id: "twitter", label: "X (Twitter)", icon: "twitter", color: "#0F1419" },
];

const MAX_ROWS = 100;
// Tightest platform char limit (X) — the kit caption counter mirrors the composer.
const MAX_CHARS = 2200;

function defaultStartIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 15));
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const longest = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const counterTone = longest > MAX_CHARS ? "over" : longest > MAX_CHARS * 0.9 ? "warn" : "";

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
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 22 }}>
      {/* schedule settings — 3 columns */}
      <div className="sk-bulk-grid">
        <label>
          <span className="sk-lbl">Post as</span>
          <select
            value={establishmentId}
            onChange={(e) => setEstablishmentId(e.target.value)}
            className="sk-select"
            style={{ height: 54 }}
          >
            {establishments.length === 0 && <option value="">All locations</option>}
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sk-lbl">First post at</span>
          <input
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            className="sk-input"
            style={{ height: 54 }}
          />
        </label>

        <label>
          <span className="sk-lbl">Interval between posts</span>
          <select
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="sk-select"
            style={{ height: 54 }}
          >
            <option value={15}>Every 15 minutes</option>
            <option value={60}>Hourly</option>
            <option value={60 * 4}>Every 4 hours</option>
            <option value={60 * 12}>Twice a day</option>
            <option value={60 * 24}>Once a day</option>
            <option value={60 * 24 * 7}>Once a week</option>
          </select>
        </label>
      </div>

      {/* platforms — 4 columns */}
      <div>
        <span className="sk-lbl">Select platforms</span>
        <div className="sk-platform-grid">
          {PLATFORMS.map((p) => {
            const on = platforms.includes(p.id);
            return (
              // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox input is rendered inside this label
              <label key={p.id} className={`sk-platform${on ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => togglePlatform(p.id)}
                  style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                />
                <span className="sk-platform__check" aria-hidden>
                  <Icon name="check" size={13} />
                </span>
                <span className="sk-platform__icon" style={{ color: p.color }}>
                  <Icon name={p.icon} size={22} />
                </span>
                <span className="sk-platform__label">{p.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* captions */}
      <div>
        <span className="sk-lbl">Captions (one per line)</span>
        <div style={{ position: "relative" }}>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={`Discover the future of productivity ⚡\nSimplify your workflow and save time.\nBuilt for teams that move fast. #Productivity`}
            className="sk-textarea"
            style={{ minHeight: 150, paddingBottom: 28 }}
          />
          <span
            className={`sk-counter${counterTone ? ` sk-counter--${counterTone}` : ""}`}
            style={{ position: "absolute", right: 14, bottom: 12 }}
          >
            {longest}/{MAX_CHARS}
          </span>
        </div>
        <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--sk-muted)" }}>
          {rows.length}/{MAX_ROWS} posts · captions over a platform’s limit (X: 280) will fail split
          those into shorter lines first.
        </span>
      </div>

      {/* AI optimization action bar */}
      <div className="sk-bulk-ai">
        <div className="sk-bulk-ai__info">
          <span className="sk-bulk-ai__icon" aria-hidden>
            <Icon name="sparkle" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="sk-bulk-ai__title">AI will optimize each post for every platform</div>
            <div className="sk-bulk-ai__body">
              We’ll adjust formatting, hashtags, and media to match best practices for each channel
              automatically.
            </div>
          </div>
        </div>
        <div className="sk-bulk-ai__actions">
          <button type="submit" className="sk-queue-btn" disabled={pending || rows.length === 0}>
            <Icon name="send" size={16} />
            {pending ? "Queueing…" : "Queue posts"}
          </button>
        </div>
      </div>

      {/* status */}
      {error && (
        <div className="sk-alert sk-alert--err" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="sk-alert sk-alert--ok">{success}</div>
      )}
      {pending && progress.total > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--sk-muted)" }}>
          Queueing {progress.done}/{progress.total}…
          {progress.failed > 0 ? ` (${progress.failed} failed)` : ""}
        </div>
      )}
    </form>
  );
}
