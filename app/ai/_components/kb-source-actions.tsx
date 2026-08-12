"use client";

import { Icon } from "@/components/shell/icon";
import { connectWebsite, uploadAiDocument } from "@/lib/ai/actions";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

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

      {pending && !showConnect && (
        <output
          style={{ display: "block", marginTop: 10, fontSize: 12.5, color: "var(--rl-muted)" }}
        >
          Uploading…
        </output>
      )}
      {notice && !showConnect && (
        <output style={{ display: "block", marginTop: 10, fontSize: 12.5, color: "#10b981" }}>
          {notice}
        </output>
      )}
      {error && !showConnect && (
        <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: "#e14d62" }}>
          {error}
        </p>
      )}

      {showConnect && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Connect your website"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 60,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !running) closeConnect();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !running) closeConnect();
          }}
        >
          <div
            className="akb-card akb-card__pad"
            style={{ width: "100%", maxWidth: 460, background: "#fff" }}
          >
            <h3 className="akb-card__title">Connect your website</h3>
            <p className="akb-card__sub">
              We&rsquo;ll read your public pages and teach your AI what your business does.
            </p>

            {!running ? (
              <form onSubmit={submitConnect} style={{ marginTop: 16, display: "grid", gap: 12 }}>
                <label className="aikb-label">
                  Business name
                  <input
                    className="aikb-input"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Summit Dental Studio"
                    required
                  />
                </label>
                <label className="aikb-label">
                  Website URL
                  <input
                    className="aikb-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://yourbusiness.com"
                    required
                  />
                </label>

                {error && (
                  <p role="alert" style={{ fontSize: 12.5, color: "#e14d62", margin: 0 }}>
                    {error}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button type="submit" className="akb-btn-primary" disabled={pending}>
                    {pending ? "Starting…" : "Connect & train"}
                  </button>
                  <button type="button" className="akb-btn-outline" onClick={closeConnect}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginTop: 16 }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                  {STEPS.map((s, i) => {
                    const done = stageIdx > i || stage === "done";
                    const active = stageIdx === i && stage !== "done";
                    const failed = stage === "failed" && i === Math.max(stageIdx, 0);
                    return (
                      <li
                        key={s.stage}
                        style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                            background: failed
                              ? "#fee2e2"
                              : done
                                ? "#dcfce7"
                                : active
                                  ? "rgba(37,99,235,0.12)"
                                  : "var(--rl-surface-2, #f1f5f9)",
                            color: failed ? "#e14d62" : done ? "#10b981" : "var(--rl-muted)",
                          }}
                        >
                          <Icon
                            name={failed ? "x" : done ? "check" : active ? "refresh" : "clock"}
                            size={12}
                          />
                        </span>
                        <span style={{ color: done || active ? "var(--ink)" : "var(--rl-muted)" }}>
                          {s.label}
                          {s.stage === "indexing" && chunks > 0 && (
                            <span style={{ color: "var(--rl-muted)" }}> · {chunks} sections</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {error && (
                  <p role="alert" style={{ marginTop: 14, fontSize: 12.5, color: "#e14d62" }}>
                    {error}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  {stage === "done" || stage === "failed" ? (
                    <button type="button" className="akb-btn-primary" onClick={closeConnect}>
                      {stage === "done" ? "Done" : "Close"}
                    </button>
                  ) : (
                    <p style={{ fontSize: 12.5, color: "var(--rl-muted)", margin: 0 }}>
                      This runs in the background — you can close this and come back.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
