"use client";

import { Icon } from "@/components/shell/icon";
import { Button } from "@/components/ui/button";
import {
  type AiIngestResult,
  ingestAiDocumentFromUrl,
  uploadAiDocument,
} from "@/lib/ai/actions";
import { useActionState, useRef } from "react";

/**
 * "Add knowledge" + "Import from URL" forms for the AI KB page (client
 * island). The previous bare `<form action>` wiring crashed the whole /ai
 * page when the action threw — oversized PDF, scanned PDF, plan gating
 * (bug 009 in the June 2026 assessment). The actions now return
 * `AiIngestResult`; these forms render it inline and pre-check the PDF size
 * client-side so an 8MB+ file never even leaves the browser.
 */

const MAX_PDF_BYTES = 8 * 1024 * 1024;

type FormState = { error: string | null; success: string | null };
const IDLE: FormState = { error: null, success: null };

function toState(res: AiIngestResult): FormState {
  return res.ok
    ? { error: null, success: res.message ?? "Saved." }
    : { error: res.error, success: null };
}

function ResultNote({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="chip chip--bad" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>
        <Icon name="alert" size={11} />
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="chip chip--ok" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>
        <Icon name="checkCircle" size={11} />
        {state.success}
      </p>
    );
  }
  return null;
}

function EstablishmentSelect({
  establishments,
}: {
  establishments: { id: string; name: string }[];
}) {
  return (
    <select name="establishmentId" className="aikb-select">
      <option value="">All locations</option>
      {establishments.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}

export function KbAddForms({
  establishments,
}: {
  establishments: { id: string; name: string }[];
}) {
  const uploadFormRef = useRef<HTMLFormElement | null>(null);
  const urlFormRef = useRef<HTMLFormElement | null>(null);

  const [uploadState, uploadAction, uploadPending] = useActionState(
    async (_prev: FormState, form: FormData): Promise<FormState> => {
      const file = form.get("file");
      if (file instanceof File && file.size > MAX_PDF_BYTES) {
        return { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`, success: null };
      }
      const res = await uploadAiDocument(form);
      if (res.ok) uploadFormRef.current?.reset();
      return toState(res);
    },
    IDLE,
  );

  const [urlState, urlAction, urlPending] = useActionState(
    async (_prev: FormState, form: FormData): Promise<FormState> => {
      const res = await ingestAiDocumentFromUrl(form);
      if (res.ok) urlFormRef.current?.reset();
      return toState(res);
    },
    IDLE,
  );

  return (
    <>
      {/* Knowledge base upload (action: uploadAiDocument) */}
      <h4 className="aikb-subhead">
        <Icon name="upload" size={14} /> Add knowledge
      </h4>
      <form ref={uploadFormRef} action={uploadAction} className="space-y-3">
        <div className="aikb-formgrid">
          <label className="aikb-label">
            Title
            <input name="title" placeholder="Business FAQ" className="aikb-input" />
          </label>
          <label className="aikb-label">
            Establishment (optional)
            <EstablishmentSelect establishments={establishments} />
          </label>
        </div>
        <label className="aikb-label">
          Content (markdown supported)
          <textarea
            name="content"
            rows={8}
            placeholder={`## Hours\nMon-Fri 9am-9pm, Sat 10am-10pm, closed Sundays.\n\n## Location\n123 Main St, Springfield...\n\n## Pricing\nHaircuts from $35...`}
            className="aikb-textarea"
          />
          <span className="aikb-hint">
            Use ## headings to organize sections — the AI uses them as context. Re-uploading the
            same title replaces the previous version.
          </span>
        </label>
        <div className="aikb-dropzone">
          <label className="aikb-label">
            Or upload a document (.pdf, .txt, .md)
            <input
              type="file"
              name="file"
              accept=".pdf,text/plain,.md,application/pdf"
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
            />
            <span className="aikb-hint">
              PDFs are text-extracted server-side (max 8 MB). Scanned/image-only PDFs won&apos;t
              extract — paste the text instead. A file takes priority over pasted content.
            </span>
          </label>
        </div>
        <ResultNote state={uploadState} />
        <Button type="submit" disabled={uploadPending}>
          {uploadPending ? "Uploading…" : "Upload document"}
        </Button>
      </form>

      <hr className="aikb-divider" />

      {/* URL crawler (action: ingestAiDocumentFromUrl) */}
      <h4 className="aikb-subhead">
        <Icon name="download" size={14} /> Import from URL
      </h4>
      <form ref={urlFormRef} action={urlAction} className="space-y-3">
        <div className="aikb-formgrid">
          <label className="aikb-label">
            Title
            <input name="title" required placeholder="Pricing page" className="aikb-input" />
          </label>
          <label className="aikb-label">
            Establishment (optional)
            <EstablishmentSelect establishments={establishments} />
          </label>
        </div>
        <label className="aikb-label">
          URL
          <input
            type="url"
            name="url"
            required
            placeholder="https://yourwebsite.com/faq"
            className="aikb-input"
          />
          <span className="aikb-hint">
            HTTPS only. Max 2 MB. We honor robots.txt and block private/internal IPs.
          </span>
        </label>
        <ResultNote state={urlState} />
        <Button type="submit" variant="outline" disabled={urlPending}>
          {urlPending ? "Crawling…" : "Crawl & index"}
        </Button>
      </form>
    </>
  );
}
