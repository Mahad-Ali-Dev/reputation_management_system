"use client";

import { Icon } from "@/components/shell/icon";
import { useState } from "react";

/**
 * My Devices kit — the QR product card's action row (client island).
 *
 * Split out from the server-rendered card so the QR itself (an async server
 * component) renders on the server while these clipboard/embed interactions
 * stay client-side. All real:
 *   - Copy link   → clipboard write of the public /r/<slug> scan URL
 *   - Download QR  → the existing /api/devices/[id]/qr PNG stream
 *   - Embed code   → copies a paste-ready <a><img> snippet (same QR endpoint)
 *   - Embed audio  → copies the scan link (audio embed not wired → copy, no fake)
 */
export function QrActions({
  deviceId,
  code,
  url,
  origin,
  downloadHref,
}: {
  deviceId: string;
  code: string;
  url: string;
  /** Absolute origin for the embed snippet's image src. */
  origin: string;
  downloadHref: string;
}) {
  const [flash, setFlash] = useState<string | null>(null);

  function copy(text: string, label: string) {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setFlash(label);
        window.setTimeout(() => setFlash(null), 1600);
      },
      () => setFlash("Copy failed"),
    );
  }

  const embedSnippet = `<a href="${url}" rel="noopener noreferrer"><img src="${origin}/api/devices/${deviceId}/qr?format=png" alt="Scan to leave a review" width="240" height="240" /></a>`;

  return (
    <>
      <div className="md-qr__actions">
        <button
          type="button"
          className="md-qr__btn md-qr__btn--pri"
          onClick={() => copy(url, "Link copied")}
        >
          <Icon name="copy" size={13} />
          {flash === "Link copied" ? "Copied!" : "Copy link"}
        </button>
        <a href={downloadHref} download={`repulabs-${code}.png`} className="md-qr__btn">
          <Icon name="download" size={13} />
          Download QR
        </a>
        <button
          type="button"
          className="md-qr__btn"
          onClick={() => copy(embedSnippet, "Embed copied")}
        >
          <Icon name="hash" size={13} />
          {flash === "Embed copied" ? "Copied!" : "Embed code"}
        </button>
        <button
          type="button"
          className="md-qr__btn"
          onClick={() => copy(url, "Link copied")}
          title="Copies the scan link to embed in an audio QR tool"
        >
          <Icon name="sound" size={13} />
          Embed audio
        </button>
      </div>
      <div aria-live="polite" style={{ minHeight: 0 }}>
        {flash && (
          <div
            style={{
              fontSize: 11,
              color: "var(--md-ok)",
              fontWeight: 600,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {flash}
          </div>
        )}
      </div>
    </>
  );
}
