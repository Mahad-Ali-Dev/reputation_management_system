"use client";

import { Icon } from "@/components/shell/icon";
import { uploadOrgLogo } from "@/lib/account/actions";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

/**
 * Real logo dropzone for Brand settings. Uploads the selected/dropped image to
 * the org via `uploadOrgLogo` (blob pipeline, data-URL fallback), then
 * `router.refresh()`es so every server-rendered logo preview on the page updates.
 *
 * Replaces the previous disabled `<input type="file" disabled>` stub + a
 * `type="reset"` button mislabeled "Upload logo" that did nothing (reported bug:
 * "Brand → upload file → not working"). The "Logo URL" field remains as the
 * paste-a-URL alternative.
 */
export function LogoUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [dragging, setDragging] = useState(false);

  function upload(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setOk(false);
    const form = new FormData();
    form.set("logo", file);
    startTransition(async () => {
      const res = await uploadOrgLogo(form);
      if (res.ok) {
        setOk(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <label
        className={`set-dropzone${dragging ? " is-dragging" : ""}`}
        aria-label="Upload logo (PNG, JPG or WebP, max 5MB)"
        aria-busy={pending}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files?.[0]);
        }}
      >
        <Icon name={pending ? "refresh" : "upload"} size={24} style={{ color: "#6366f1" }} />
        <span className="set-dropzone__title">
          {pending ? (
            "Uploading…"
          ) : (
            <>
              Drag &amp; drop or <b>click to upload</b>
            </>
          )}
        </span>
        <span className="set-dropzone__sub">PNG, JPG or WebP (max 5MB)</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="set-sr"
          disabled={pending}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "#e14d62" }}>
          {error}
        </p>
      )}
      {ok && !error && (
        <output style={{ display: "block", marginTop: 8, fontSize: 12.5, color: "#10b981" }}>
          Logo updated.
        </output>
      )}
    </>
  );
}
