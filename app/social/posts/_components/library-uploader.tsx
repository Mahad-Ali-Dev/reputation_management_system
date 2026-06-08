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

const LIBRARY_NOT_MIGRATED = "Storage isn’t set up yet — ask your admin to finish setup.";

export function LibraryUploader({ folder }: { folder?: string | null }): JSX.Element {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

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

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <button
        type="button"
        className="btn btn--pri btn--sm"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <Icon name="upload" size={12} />
        {busy ? "Uploading…" : "Upload media"}
      </button>
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
      {error && (
        <span style={{ fontSize: 11, color: "var(--bad)", maxWidth: 240, textAlign: "right" }} role="alert">
          {error}
        </span>
      )}
      {!error && count > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--ok)" }}>{count} uploaded</span>
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
