"use client";

import { Icon } from "@/components/shell/icon";
import { useEffect, useState } from "react";

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

  // The kit dashboard's cards — "Upload documents", "Connect website", "View
  // all sources", the tab-bar "Add source" CTA and the quick-action rows — are
  // all `<a href="#add-source">`. A bare hash anchor only SCROLLS; it never
  // opened this disclosure, so those controls looked dead unless the panel
  // happened to default open (empty KB). Reveal + scroll it whenever it's
  // targeted: on mount (deep-link), on hashchange, and on any such anchor click
  // (covers a repeat click where the hash is unchanged and no event fires).
  useEffect(() => {
    function reveal() {
      setOpen(true);
      requestAnimationFrame(() => {
        document.getElementById("add-source")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    function onHash() {
      if (window.location.hash === "#add-source") reveal();
    }
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('a[href="#add-source"]')) reveal();
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

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
