"use client";

import { Icon } from "@/components/shell/icon";

/**
 * PDF export.
 *
 * Uses the browser's own print-to-PDF rather than rendering a PDF server-side.
 * The alternatives were worse: puppeteer is only present as a dev-script
 * dependency (no Chrome on the VPS, and a headless browser per export is a
 * heavy thing to run on the app server), and a jsPDF-style builder would mean
 * hand-laying-out a second copy of the report that drifts from the real one.
 *
 * Printing the page we already render means the PDF is always exactly what the
 * owner sees, brand header included, with no second layout to maintain. The
 * print stylesheet in business-report.css does the rest.
 */
export function ExportPdfButton() {
  return (
    <button
      type="button"
      className="brp-btn brp-btn--primary no-print"
      onClick={() => window.print()}
    >
      <Icon name="download" size={14} />
      Export PDF
    </button>
  );
}
