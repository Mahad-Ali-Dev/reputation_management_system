"use client";

import { Icon } from "@/components/shell/icon";
import { useState } from "react";

/**
 * Collapsible "Add source" / source-management panel for the Knowledge tab.
 *
 * The kit dashboard shows compact upload / connect-website cards; clicking any
 * of them (or the tab-bar "Add source" CTA via the #add-source anchor) expands
 * this panel, which contains the UNCHANGED existing KB management UI passed as
 * children: the KbAddForms client island (uploadAiDocument /
 * ingestAiDocumentFromUrl), the indexed-document list + delete, and the
 * widget-key setup. Nothing about those actions changes — they're just housed
 * in a disclosure so the dashboard stays clean by default.
 */
export function SourcePanel({
  defaultOpen,
  children,
}: {
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  return (
    <section className="akb-card akb-card__pad" id="add-source">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          background: "none",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          padding: 0,
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="akb-card__title" style={{ display: "block" }}>
            Manage knowledge sources
          </span>
          <span className="akb-card__sub" style={{ display: "block" }}>
            Upload documents, crawl a URL, manage indexed sources and the embed snippet.
          </span>
        </span>
        <Icon name={open ? "chevU" : "chevD"} size={16} />
      </button>

      {open && <div style={{ marginTop: 16 }}>{children}</div>}
    </section>
  );
}
