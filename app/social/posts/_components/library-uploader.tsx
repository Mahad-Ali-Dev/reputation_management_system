"use client";

import { Icon } from "@/components/shell/icon";
import { createLibraryUpload } from "@/lib/social/library";
import { useRouter } from "next/navigation";
import { type JSX, useRef, useState } from "react";

/**
 * `<LibraryUploader>` (Module 10) — the Content Library tab's upload control.
 *
 * A small client island: picks files → POSTs each to `/api/uploads/social`
 * (context `content_library`) → persists a `ContentLibraryAsset` row via
 * `createLibraryUpload` (the landed server action) → refreshes the server tab.
 * Optional folder name groups the uploads. Errors surface inline; a missing
 * `content_library_assets` table (pre-migration) shows a clear "set up storage"
 * note rather than crashing.
 */

const LIBRARY_NOT_MIGRATED = "Storage isn’t set up yet ask your admin to finish setup.";

export function LibraryUploader({
  folder,
  variant = "button",
}: {
  folder?: string | null;
  /** "button" = the kit outline "Upload media" button; "dropzone" = the empty-state dashed zone. */
  variant?: "button" | "dropzone";
}): JSX.Element {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList) {
    setError(null);
    setBusy(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("context", "content_library");
        const res = await fetch("/api/uploads/social", { method: "POST", body: fd });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(uploadCopy(body.error));
        }
        const data = (await res.json()) as {
          url: string;
          pathname: string;
          kind: "image" | "video";
          mimeType: string;
          sizeBytes: number;
        };
        const persist = new FormData();
        persist.set("url", data.url);
        persist.set("pathname", data.pathname);
        persist.set("kind", data.kind);
        persist.set("mimeType", data.mimeType);
        persist.set("sizeBytes", String(data.sizeBytes));
        if (folder) persist.set("folder", folder);
        const result = await createLibraryUpload(persist);
        if ("error" in result) {
          throw new Error(result.error === "library_not_migrated" ? LIBRARY_NOT_MIGRATED : "Couldn’t save to library.");
        }
        ok += 1;
      }
      setCount((c) => c + ok);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const hiddenInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
      multiple
      hidden
      onChange={(e) => {
        if (e.target.files?.length) void handleFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (variant === "dropzone") {
    return (
      <>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the "Upload media" button in the card header is the keyboard-accessible control; this zone is a pointer/drag convenience */}
        <div
          className={`sk-dropzone${dragOver ? " is-drag" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
          }}
          style={{ cursor: "pointer" }}
        >
          <div>
            <div className="sk-dropzone__art" aria-hidden>
              {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
              <img src="/assets/repulabs/post-creator/lib-library.svg" alt="" />
            </div>
            <h3 className="sk-empty-center__title" style={{ fontSize: 18 }}>
              {dragOver ? "Drop files to upload" : "Your library is empty."}
            </h3>
            <p className="sk-empty-center__body">
              {busy
                ? "Uploading…"
                : "Upload images or videos to reuse them across posts or generate AI creatives from the composer."}
            </p>
            {error && (
              <span className="sk-alert sk-alert--err" role="alert">
                {error}
              </span>
            )}
            {!error && count > 0 && (
              <span className="sk-alert sk-alert--ok">{count} uploaded</span>
            )}
          </div>
        </div>
        {hiddenInput}
      </>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <button type="button" className="sk-btn-out" style={{ height: 38 }} disabled={busy} onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={13} />
        {busy ? "Uploading…" : "Upload media"}
      </button>
      {hiddenInput}
      {error && (
        <span style={{ fontSize: 11, color: "#c0344a", maxWidth: 240, textAlign: "right" }} role="alert">
          {error}
        </span>
      )}
      {!error && count > 0 && (
        <span style={{ fontSize: 10.5, color: "#0f8a4d" }}>{count} uploaded</span>
      )}
    </div>
  );
}

function uploadCopy(code?: string): string {
  switch (code) {
    case "file_too_large":
      return "That file is too large (max 50MB).";
    case "no_file":
    case "empty_file":
      return "No file received.";
    default:
      return code?.startsWith("mime_type_not_allowed") || code === "not_allowed"
        ? "That file type isn’t allowed."
        : "Upload failed.";
  }
}
