"use client";

import { UpgradeCard } from "@/components/pro-gate";
import { Icon } from "@/components/shell/icon";
import { type JSX, useState, useTransition } from "react";
import { ModalShell } from "./caption-modal";

/**
 * `<CreativesModal>` (Module 10) — AI Image Creatives (Pro-gated, env-gated).
 *
 * Brief + editable brand colors (prefilled from `establishment.brandVoice.colors`
 * best-effort) + style + variation count (1–4) → calls the injected
 * `generate` action (server `generateCreatives`). Renders a grid of variations,
 * each with Approve / Reject / Redo, plus "Regenerate all". Approved creatives
 * flow back into the composer's media list (optionally saved to Library by the
 * server action).
 *
 * NOT-ENABLED / NOT-PRO handling: `generateCreatives` throws a typed
 * `ImageGenNotConfiguredError` (no provider key) or a plan error
 * (`assertEntitled`). We detect those by name/message and render an
 * upgrade/"not enabled" panel — never a crash, never a silent paid call.
 */

export type Creative = { url: string; kind: "image" };

export type GenerateCreativesFn = (input: {
  brief: string;
  brandColors: string[];
  style: string;
  count: number;
}) => Promise<Creative[]>;

const STYLES = [
  { value: "photographic", label: "Photographic" },
  { value: "vibrant", label: "Vibrant / bold" },
  { value: "minimal", label: "Minimal / clean" },
  { value: "illustrated", label: "Illustrated" },
  { value: "lifestyle", label: "Lifestyle" },
] as const;

type Tile = { url: string; status: "pending" | "approved" | "rejected" };

function isNotEnabled(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    name === "ImageGenNotConfiguredError" ||
    /not[_ ]?configured|not[_ ]?enabled|image_gen_disabled/i.test(msg)
  );
}

function isPlanError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    name === "PlanInactiveError" ||
    name === "EntitlementError" ||
    /not[_ ]?entitled|plan_inactive|upgrade|pro[_ ]?required/i.test(msg)
  );
}

export function CreativesModal({
  open,
  onClose,
  onApprove,
  generate,
  initialBrandColors,
}: {
  open: boolean;
  onClose: () => void;
  onApprove: (urls: string[]) => void;
  generate: GenerateCreativesFn;
  initialBrandColors: string[];
}): JSX.Element | null {
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState<string>("photographic");
  const [count, setCount] = useState(2);
  const [colors, setColors] = useState<string[]>(
    initialBrandColors.length ? initialBrandColors : ["#2563EB", "#0EA5E9"],
  );
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"none" | "not_enabled" | "plan">("none");
  const [pending, start] = useTransition();

  if (!open) return null;

  function generateAll() {
    setError(null);
    setGate("none");
    start(async () => {
      try {
        const result = await generate({
          brief: brief.trim(),
          brandColors: colors,
          style,
          count,
        });
        const safe = Array.isArray(result) ? result : [];
        setTiles(safe.map((c) => ({ url: c.url, status: "pending" })));
        if (safe.length === 0) setError("No creatives came back. Adjust the brief and retry.");
      } catch (e) {
        if (isNotEnabled(e)) setGate("not_enabled");
        else if (isPlanError(e)) setGate("plan");
        else setError(e instanceof Error ? e.message : "Generation failed");
      }
    });
  }

  function redo(index: number) {
    setError(null);
    start(async () => {
      try {
        const result = await generate({ brief: brief.trim(), brandColors: colors, style, count: 1 });
        const next = result?.[0];
        if (next) {
          setTiles((prev) => prev.map((t, i) => (i === index ? { url: next.url, status: "pending" } : t)));
        }
      } catch (e) {
        if (isNotEnabled(e)) setGate("not_enabled");
        else if (isPlanError(e)) setGate("plan");
        else setError(e instanceof Error ? e.message : "Regenerate failed");
      }
    });
  }

  function setStatus(index: number, status: Tile["status"]) {
    setTiles((prev) => prev.map((t, i) => (i === index ? { ...t, status } : t)));
  }

  const approvedUrls = tiles.filter((t) => t.status === "approved").map((t) => t.url);

  return (
    <ModalShell
      title="AI image creatives"
      subtitle="Generate on-brand post images, then approve the ones you want."
      icon="sparkle"
      onClose={onClose}
      wide
    >
      {gate !== "none" ? (
        <GatePanel kind={gate} />
      ) : (
        <>
          {/* Controls */}
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "block" }}>
              <span className="lbl">Creative brief</span>
              <textarea
                className="ds-textarea"
                rows={3}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                maxLength={600}
                placeholder="A warm flat-lay of our signature latte on a marble counter, soft morning light…"
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "block" }}>
                <span className="lbl">Style</span>
                <select className="ds-select" value={style} onChange={(e) => setStyle(e.target.value)}>
                  {STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block" }}>
                <span className="lbl">Variations</span>
                <select
                  className="ds-select"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="lbl">Brand colors</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {colors.map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#2563EB"}
                      onChange={(e) =>
                        setColors((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      style={{
                        width: 30,
                        height: 30,
                        padding: 0,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        background: "none",
                        cursor: "pointer",
                      }}
                      aria-label={`Brand color ${i + 1}`}
                    />
                    <input
                      className="ds-input"
                      value={c}
                      onChange={(e) =>
                        setColors((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      maxLength={7}
                      style={{ width: 92, height: 30, fontFamily: "var(--f-mono)", fontSize: 11.5 }}
                    />
                    {colors.length > 1 && (
                      <button
                        type="button"
                        className="btn btn--xs"
                        onClick={() => setColors((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Remove color"
                      >
                        <Icon name="x" size={11} />
                      </button>
                    )}
                  </span>
                ))}
                {colors.length < 4 && (
                  <button
                    type="button"
                    className="btn btn--xs"
                    onClick={() => setColors((prev) => [...prev, "#10B981"])}
                  >
                    <Icon name="plus" size={11} />
                    Color
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn--pri btn--sm"
                onClick={generateAll}
                disabled={pending || brief.trim().length === 0}
              >
                <Icon name="sparkle" size={12} />
                {pending ? "Generating…" : tiles.length ? "Regenerate all" : "Generate"}
              </button>
            </div>
          </div>

          {error && (
            <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--bad)" }} role="alert">
              {error}
            </p>
          )}

          {/* Variation grid */}
          {tiles.length > 0 && (
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              {tiles.map((t, i) => (
                <div
                  key={`${t.url}-${i}`}
                  className="ds-card"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    opacity: t.status === "rejected" ? 0.5 : 1,
                    border:
                      t.status === "approved" ? "1.5px solid var(--ok)" : "1px solid var(--line)",
                  }}
                >
                  <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-3)" }}>
                    {/* biome-ignore lint/performance/noImgElement: generated creative (blob asset) */}
                    <img
                      src={t.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {t.status === "approved" && (
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          background: "var(--ok)",
                          color: "#fff",
                          borderRadius: 999,
                          width: 22,
                          height: 22,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", borderTop: "1px solid var(--line)" }}>
                    <TileBtn
                      label="Approve"
                      icon="check"
                      active={t.status === "approved"}
                      onClick={() => setStatus(i, t.status === "approved" ? "pending" : "approved")}
                    />
                    <TileBtn
                      label="Reject"
                      icon="x"
                      active={t.status === "rejected"}
                      onClick={() => setStatus(i, t.status === "rejected" ? "pending" : "rejected")}
                    />
                    <TileBtn label="Redo" icon="refresh" onClick={() => redo(i)} disabled={pending} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--rl-muted)" }}>
              {approvedUrls.length} approved
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn--sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--pri btn--sm"
                disabled={approvedUrls.length === 0}
                onClick={() => {
                  onApprove(approvedUrls);
                  onClose();
                }}
              >
                <Icon name="plus" size={12} />
                Add to post
              </button>
            </div>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function TileBtn({
  label,
  icon,
  onClick,
  active,
  disabled,
}: {
  label: string;
  icon: import("@/components/shell/icon").IconName;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "7px 4px",
        fontSize: 11,
        background: active ? "var(--pri-50)" : "none",
        color: active ? "var(--pri)" : "var(--ink-2)",
        border: "none",
        borderRight: "1px solid var(--line)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );
}

function GatePanel({ kind }: { kind: "not_enabled" | "plan" }) {
  if (kind === "plan") {
    // Reuse the shared ProGate upgrade card so the upsell reads as one product.
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "20px 8px" }}>
        <UpgradeCard feature="image_creatives" />
      </div>
    );
  }
  return (
    <div style={{ textAlign: "center", padding: "26px 16px" }}>
      <div
        aria-hidden
        style={{
          display: "inline-flex",
          width: 44,
          height: 44,
          borderRadius: 999,
          background: "var(--surface-3)",
          placeItems: "center",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Icon name="image" size={22} style={{ color: "var(--rl-muted)" }} />
      </div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Image generation isn’t enabled</h3>
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--rl-muted)" }}>
        AI image generation isn’t configured for this workspace yet. You can still upload media or pick
        from your Content Library.
      </p>
    </div>
  );
}
