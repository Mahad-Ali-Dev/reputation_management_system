"use client";

import { connectWebsite, uploadAiDocument } from "@/lib/ai/actions";
import { Check, CircleCheck, Globe, Loader2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import "@/components/ui/glass-sheet.css";

/**
 * Interaction layer for the Knowledge dashboard's source cards.
 *
 * Replaces the old "everything lives in one long disclosure of forms" design:
 * the cards were `<a href="#add-source">` anchors that revealed a stack of
 * inline forms below the fold. Now:
 *   - "Upload documents" opens the OS FILE PICKER directly and uploads on pick.
 *   - "Connect website" opens a small modal (business name + URL) and runs the
 *     crawl as a BACKGROUND JOB, polling /api/ai/kb-crawl-status to show real
 *     per-stage progress instead of an indeterminate spinner.
 *
 * The dashboard stays a server component: it just marks its cards with
 * `data-kb-action="upload" | "connect"` and this island listens for the click.
 * That keeps the RSC boundary intact (no onClick in the server tree) while
 * giving the cards real behaviour.
 */

type Stage = "queued" | "crawling" | "indexing" | "done" | "failed";

const STEPS: Array<{ stage: Stage; label: string }> = [
  { stage: "queued", label: "Queued" },
  { stage: "crawling", label: "Reading your website" },
  { stage: "indexing", label: "Teaching it to your AI" },
  { stage: "done", label: "Ready" },
];

const ORDER: Stage[] = ["queued", "crawling", "indexing", "done"];

export function KbSourceActions({ establishmentId }: { establishmentId?: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [showConnect, setShowConnect] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [chunks, setChunks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- Card click delegation -------------------------------------------
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-kb-action]");
      if (!el) return;
      const action = (el as HTMLElement).dataset.kbAction;
      if (action !== "upload" && action !== "connect") return;
      e.preventDefault();
      setError(null);
      setNotice(null);
      if (action === "upload") fileRef.current?.click();
      else setShowConnect(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // ---- Upload ------------------------------------------------------------
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the SAME file twice still fires onChange.
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", file.name.replace(/\.[^.]+$/, ""));
      if (establishmentId) fd.set("establishmentId", establishmentId);
      const res = await uploadAiDocument(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`“${file.name}” added to your knowledge base.`);
      router.refresh();
    });
  }

  // ---- Connect website ---------------------------------------------------
  const poll = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/ai/kb-crawl-status?documentId=${id}`, { cache: "no-store" });
      if (!res.ok) return false;
      const d = (await res.json()) as {
        stage: Stage;
        chunks: number;
        message: string | null;
      };
      setStage(d.stage);
      setChunks(d.chunks);
      if (d.stage === "failed") {
        setError(d.message ?? "That site couldn't be read.");
        return true;
      }
      if (d.stage === "done") {
        router.refresh();
        return true;
      }
      return false;
    },
    [router],
  );

  // Poll while a crawl is in flight. Stops on done/failed, and cleans up on
  // unmount so a closed modal can't keep hitting the endpoint.
  useEffect(() => {
    if (!docId || stage === "done" || stage === "failed") return;
    let alive = true;
    const t = setInterval(async () => {
      if (!alive) return;
      const finished = await poll(docId);
      if (finished) clearInterval(t);
    }, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [docId, stage, poll]);

  function submitConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("businessName", businessName.trim());
      fd.set("url", url.trim());
      if (establishmentId) fd.set("establishmentId", establishmentId);
      const res = await connectWebsite(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDocId(res.documentId);
      setStage("queued");
    });
  }

  // Esc closes the sheet; lock the page behind it.
  useEffect(() => {
    if (!showConnect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConnect();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showConnect]);

  // Upload toast fades out on its own after a few seconds.
  useEffect(() => {
    if (!notice && !error) return;
    if (showConnect) return;
    const t = setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [notice, error, showConnect]);

  function closeConnect() {
    setShowConnect(false);
    setDocId(null);
    setStage(null);
    setChunks(0);
    setError(null);
    setBusinessName("");
    setUrl("");
  }

  const running = docId !== null;
  const stageIdx = stage ? ORDER.indexOf(stage) : -1;
  const finished = stage === "done" || stage === "failed";

  return (
    <>
      {/* Native picker — the "Upload documents" card triggers this directly. */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,text/plain,application/pdf"
        style={{ display: "none" }}
        onChange={onFilePicked}
      />

      {/* Upload status: a floating Apple-style toast. */}
      {!showConnect && (pending || notice || error) && (
        <output className={`kb-toast${error ? " is-bad" : notice ? " is-ok" : ""}`}>
          {error ? (
            <TriangleAlert size={16} strokeWidth={1.8} />
          ) : notice ? (
            <CircleCheck size={16} strokeWidth={2} />
          ) : (
            <Loader2 size={16} strokeWidth={2} className="kb-spin" />
          )}
          {error ?? notice ?? "Uploading…"}
        </output>
      )}

      {showConnect && (
        // biome-ignore lint/a11y/useSemanticElements: overlay dialog; matches the other glass sheets
        <div
          role="dialog"
          className="gs-overlay"
          aria-modal="true"
          aria-labelledby="kb-connect-title"
        >
          <button
            type="button"
            className="gs-scrim"
            aria-label="Close"
            onClick={() => {
              if (!running || finished) closeConnect();
            }}
          />
          <div className="gs">
            <button type="button" className="gs__close" aria-label="Close" onClick={closeConnect}>
              <X size={16} strokeWidth={2.2} />
            </button>
            <div className="gs__hero">
              <span className="gs__badge kb-badge--blue" aria-hidden="true">
                <Globe size={28} strokeWidth={1.7} />
              </span>
              <h2 id="kb-connect-title" className="gs__title">
                {stage === "done" ? "Your AI is up to date" : "Connect your website"}
              </h2>
              <p className="gs__sub">
                {stage === "done"
                  ? "We read your site and taught your AI what your business does."
                  : "We'll read your public pages and teach your AI what your business does."}
              </p>
            </div>

            {!running ? (
              <form onSubmit={submitConnect} className="gs__form">
                <div className="gs__body">
                  {error && (
                    <p className="gs-error" role="alert">
                      <TriangleAlert size={15} strokeWidth={1.8} />
                      {error}
                    </p>
                  )}
                  <div className="gs-group">
                    <label className="gs-field">
                      <span className="gs-field__lbl">Business name</span>
                      <input
                        className="gs-input"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="e.g. Summit Dental Studio"
                        required
                      />
                    </label>
                    <label className="gs-field">
                      <span className="gs-field__lbl">Website</span>
                      <input
                        className="gs-input"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://yourbusiness.com"
                        required
                      />
                      <span className="gs-hint">
                        Your home page is enough. We follow the links from there.
                      </span>
                    </label>
                  </div>
                </div>
                <div className="gs__foot">
                  <button type="button" className="gs-btn" onClick={closeConnect}>
                    Cancel
                  </button>
                  <button type="submit" className="gs-btn gs-btn--pri" disabled={pending}>
                    {pending ? "Starting…" : "Connect & train"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="gs__body">
                  {error && (
                    <p className="gs-error" role="alert">
                      <TriangleAlert size={15} strokeWidth={1.8} />
                      {error}
                    </p>
                  )}
                  <ol className="gs-group kb-steps">
                    {STEPS.map((s, i) => {
                      const done = stageIdx > i || stage === "done";
                      const active = stageIdx === i && stage !== "done";
                      const failed = stage === "failed" && i === Math.max(stageIdx, 0);
                      const state = failed ? "bad" : done ? "ok" : active ? "on" : "off";
                      return (
                        <li key={s.stage} className={`kb-step is-${state}`}>
                          <span className="kb-step__dot" aria-hidden="true">
                            {failed ? (
                              <X size={13} strokeWidth={2.6} />
                            ) : done ? (
                              <Check size={13} strokeWidth={2.6} />
                            ) : active ? (
                              <Loader2 size={13} strokeWidth={2.6} className="kb-spin" />
                            ) : null}
                          </span>
                          <span className="kb-step__label">
                            {s.label}
                            {s.stage === "indexing" && chunks > 0 && (
                              <span className="kb-step__meta"> · {chunks} sections</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {!finished && (
                    <p className="gs-hint kb-center">
                      This runs in the background, so you can close this and come back.
                    </p>
                  )}
                </div>
                <div className="gs__foot">
                  <button
                    type="button"
                    className={`gs-btn${finished ? " gs-btn--pri" : ""}`}
                    onClick={closeConnect}
                  >
                    {stage === "done" ? "Done" : finished ? "Close" : "Close for now"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
