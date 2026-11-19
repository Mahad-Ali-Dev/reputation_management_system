"use client";

import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { setEstablishmentImage } from "@/lib/establishments/actions";
import { uploadFile } from "@/lib/uploads/actions";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useRef, useState } from "react";

/**
 * Establishment profile image — shows the uploaded image (or initials) and lets
 * a manager replace it. Uploads via the shared `uploadFile` action
 * (context "establishment_image"), then saves the URL with `setEstablishmentImage`.
 */
export function EstablishmentAvatar({
  id,
  name,
  imageUrl,
  size = 64,
}: {
  id: string;
  name: string;
  imageUrl: string | null;
  size?: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("context", "establishment_image");
      fd.set("file", file);
      const { url } = await uploadFile(fd);
      await setEstablishmentImage(id, url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try a PNG/JPG under the limit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="estab-avup" style={{ width: size, height: size }}>
      <Avatar name={name} src={imageUrl ?? undefined} size={size} tone={5} />

      <button
        type="button"
        className="estab-avup__btn"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={imageUrl ? "Change profile image" : "Upload profile image"}
        title={imageUrl ? "Change image" : "Upload image"}
      >
        {busy ? (
          <span className="estab-avup__spin" aria-hidden="true" />
        ) : (
          <Icon name="upload" size={13} />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={onPick}
        style={{ display: "none" }}
      />

      {error && (
        <span className="estab-avup__err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
