"use client";

import { Icon } from "@/components/shell/icon";

/**
 * Saves the just-revealed backup codes as a .txt file. Client-only: the
 * plaintext codes exist ONLY in this render (the server stores sha256 hashes,
 * never the codes themselves), so this reads straight from the `codes` prop
 * already in the DOM rather than fetching anything.
 */
export function DownloadBackupCodesButton({ codes }: { codes: string[] }) {
  function handleDownload() {
    const lines = [
      "Repulabs two-factor authentication backup codes",
      `Generated ${new Date().toLocaleString()}`,
      "",
      "Each code signs you in once if you lose access to your authenticator app.",
      "Keep this file somewhere safe, a password manager or offline. Anyone with",
      "a code can sign in without your authenticator.",
      "",
      ...codes,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repulabs-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="set-btn set-btn--sm" onClick={handleDownload}>
      <Icon name="download" size={14} className="set-btn__ic" />
      Download codes
    </button>
  );
}
