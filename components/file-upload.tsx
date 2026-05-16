"use client";

import { useState, useTransition } from "react";
import { uploadFile } from "@/lib/uploads/actions";
import type { UploadContext } from "@/lib/uploads/blob";

/**
 * Reusable file-upload widget.
 *
 * Usage:
 *   <FileUpload context="org_logo" defaultUrl={org.logoUrl} name="logoUrl" />
 *
 * Renders a hidden `<input name={name}>` so the URL flows through the parent form.
 * Shows a preview + replace button when there's an existing URL.
 */
export function FileUpload({
  context,
  defaultUrl,
  name,
  label,
  accept,
}: {
  context: UploadContext;
  defaultUrl: string | null | undefined;
  name: string;
  label?: string;
  accept?: string;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("context", context);
    fd.set("file", file);
    startTransition(async () => {
      try {
        const result = await uploadFile(fd);
        setUrl(result.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <div className="space-y-2">
      {label && <span className="block text-sm font-medium">{label}</span>}
      <input type="hidden" name={name} value={url} />
      <div className="flex items-start gap-3">
        {url ? (
          <div className="h-20 w-20 shrink-0 rounded-md border bg-slate-50 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Uploaded" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-md border bg-slate-50 flex items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        <div className="flex-1 space-y-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm hover:bg-slate-50">
            <input
              type="file"
              accept={accept ?? "image/*"}
              className="hidden"
              onChange={handleChange}
              disabled={pending}
            />
            <span>{pending ? "Uploading…" : url ? "Replace" : "Upload"}</span>
          </label>
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="ml-2 text-xs text-muted-foreground hover:text-rose-600"
              disabled={pending}
            >
              Remove
            </button>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {url && !error && (
            <p className="text-xs text-muted-foreground break-all">{url.slice(0, 80)}{url.length > 80 ? "…" : ""}</p>
          )}
        </div>
      </div>
    </div>
  );
}
