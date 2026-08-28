"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Dashboard strip for in-flight Knowledge Base website crawls.
 *
 * The crawl is a BACKGROUND job, so the owner can start it and close the modal
 * (or the tab). Without a persistent indicator there'd be nowhere to see that
 * the work is still happening — this is that surface.
 *
 * Renders NOTHING when there's nothing in flight and nothing recently finished,
 * so a quiet dashboard stays quiet. Polls only while a crawl is actually
 * running, and stops as soon as everything settles.
 */

type CrawlRow = {
  documentId: string;
  title: string;
  stage: "queued" | "crawling" | "indexing" | "done" | "failed";
  chunks: number;
  message: string | null;
};

const STAGE_COPY: Record<CrawlRow["stage"], string> = {
  queued: "Queued",
  crawling: "Reading your website…",
  indexing: "Teaching it to your AI…",
  done: "Knowledge base updated",
  failed: "Couldn't read that site",
};

export function KbCrawlStrip({ initial }: { initial: CrawlRow[] }) {
  const [rows, setRows] = useState<CrawlRow[]>(initial);

  const active = rows.filter((r) => r.stage !== "done" && r.stage !== "failed");

  useEffect(() => {
    if (active.length === 0) return;
    let alive = true;
    const t = setInterval(async () => {
      const next = await Promise.all(
        rows.map(async (r) => {
          if (r.stage === "done" || r.stage === "failed") return r;
          try {
            const res = await fetch(`/api/ai/kb-crawl-status?documentId=${r.documentId}`, {
              cache: "no-store",
            });
            if (!res.ok) return r;
            const d = (await res.json()) as CrawlRow;
            return { ...r, ...d };
          } catch {
            return r;
          }
        }),
      );
      if (alive) setRows(next);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [rows, active.length]);

  if (rows.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      {rows.map((r) => {
        const failed = r.stage === "failed";
        const done = r.stage === "done";
        return (
          <div
            key={r.documentId}
            className="ds-card"
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12.5,
              borderColor: failed ? "#fecaca" : done ? "#bbf7d0" : undefined,
              background: failed ? "#fef2f2" : done ? "#f0fdf4" : undefined,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: failed ? "#e14d62" : done ? "#10b981" : "var(--rl-primary, #2563eb)",
              }}
            >
              <Icon name={failed ? "alert" : done ? "checkCircle" : "refresh"} size={14} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ fontWeight: 600 }}>{r.title}</strong>{" "}
              <span style={{ color: "var(--rl-muted)" }}>
                {STAGE_COPY[r.stage]}
                {r.stage === "indexing" && r.chunks > 0 && ` ${r.chunks} sections`}
                {done && r.chunks > 0 && ` · ${r.chunks} sections`}
              </span>
              {failed && r.message && (
                <span style={{ display: "block", color: "#e14d62", marginTop: 2 }}>
                  {r.message}
                </span>
              )}
            </span>
            <Link
              href={done || failed ? "/ai?tab=sources" : "/ai?tab=knowledge"}
              className="btn btn--xs"
              style={{ flexShrink: 0 }}
            >
              {failed ? "Retry" : done ? "View" : "Details"}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
