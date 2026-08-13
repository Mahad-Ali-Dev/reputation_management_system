"use client";

import { Icon } from "@/components/shell/icon";
import { useToast } from "@/components/toast";
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
 *
 * Success/failure surfaces as a themed toast (useToast) instead of an inline
 * banner — this is an upload-and-refresh action, not a form with a fixed spot
 * near a submit button, so a toast is the more natural confirmation here.
 */
export function LogoUploader() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  function upload(file: File | null | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("logo", file);
    startTransition(async () => {
      const res = await uploadOrgLogo(form);
      if (res.ok) {
        toast.success("Logo updated.");
        router.refresh();
      } else {
        toast.error(res.error);
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
    </>
  );
}
