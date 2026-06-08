"use client";

import { Icon } from "@/components/shell/icon";
import { type JSX, useMemo, useState } from "react";
import { ModalShell } from "./caption-modal";

/**
 * `<LibraryModal>` (Module 10) — Content-Library picker.
 *
 * A grid of the org's `ContentLibraryAsset` thumbnails with multi-select and a
 * folder filter. "Use in Post" hands the chosen assets back to the composer's
 * media list. This is the *picker* (distinct from the full Library management
 * tab). Assets are passed in as a prop (server-fetched on the page so the client
 * island never imports the server library module).
 */

export type LibraryAsset = {
  id: string;
  url: string;
  kind: "image" | "video";
  folder: string | null;
  caption: string | null;
  sizeBytes: number | null;
};

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LibraryModal({
  open,
  onClose,
  assets,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  assets: LibraryAsset[];
  onUse: (chosen: LibraryAsset[]) => void;
}): JSX.Element | null {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState<string>("__all");

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.folder) set.add(a.folder);
    return [...set].sort();
  }, [assets]);

  const visible = useMemo(
    () => (folder === "__all" ? assets : assets.filter((a) => a.folder === folder)),
    [assets, folder],
  );

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosen = assets.filter((a) => selected.has(a.id));

  return (
    <ModalShell
      title="Content library"
      subtitle="Pick media to add to this post."
      icon="image"
      onClose={onClose}
      wide
    >
      {folders.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <FolderChip label="All" on={folder === "__all"} onClick={() => setFolder("__all")} />
          {folders.map((f) => (
            <FolderChip key={f} label={f} on={folder === f} onClick={() => setFolder(f)} />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 36,
            color: "var(--rl-muted)",
            fontSize: 13,
          }}
        >
          <Icon name="image" size={26} style={{ color: "var(--rl-muted-2)" }} />
          <p style={{ marginTop: 8 }}>No media in your library yet. Upload from the Library tab.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
            gap: 10,
            maxHeight: "44vh",
            overflowY: "auto",
            padding: 2,
          }}
        >
          {visible.map((a) => {
            const isSel = selected.has(a.id);
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => toggle(a.id)}
                aria-pressed={isSel}
                title={a.caption ?? undefined}
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  borderRadius: 10,
                  overflow: "hidden",
                  border: isSel ? "2px solid var(--pri)" : "1px solid var(--line)",
                  background: "var(--surface-3)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {a.kind === "video" ? (
                  <div style={{ position: "absolute", inset: 0, background: "#0b1220" }}>
                    {/* biome-ignore lint/performance/noImgElement: library thumbnail (blob asset) */}
                    <img
                      src={a.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.65 }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon name="play" size={18} style={{ color: "#fff" }} />
                    </span>
                  </div>
                ) : (
                  // biome-ignore lint/performance/noImgElement: library thumbnail (blob asset)
                  <img
                    src={a.url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
                {isSel && (
                  <span
                    style={{
                      position: "absolute",
                      top: 5,
                      right: 5,
                      background: "var(--pri)",
                      color: "#fff",
                      borderRadius: 999,
                      width: 20,
                      height: 20,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon name="check" size={12} />
                  </span>
                )}
                {a.sizeBytes != null && (
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      bottom: 4,
                      fontSize: 9.5,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {fmtSize(a.sizeBytes)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--rl-muted)" }}>
          {chosen.length} selected
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--pri btn--sm"
            disabled={chosen.length === 0}
            onClick={() => {
              onUse(chosen);
              onClose();
            }}
          >
            <Icon name="plus" size={12} />
            Use in post
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function FolderChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${on ? "chip--pri" : "chip--out"}`}
      style={{ cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
