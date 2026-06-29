"use client";

import { Icon } from "@/components/shell/icon";
import { OUTREACH_MERGE_TAGS, resolveMergeTags, sampleContext } from "@/lib/outreach/merge-tags";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

/**
 * Template editor (Overview hub, middle column) — a rich inline preview of the
 * org's REAL OutreachTemplates with the kit's SMS / Email pill tabs, soft-gray
 * message preview panel, merge-tag chips, and Preview / Default / Edit footer.
 *
 * Read-mostly by design: full editing stays on /outreach/templates/[id] (the
 * existing editor with save/AI/validation) — the "Edit template" button deep-
 * links there, so there is exactly ONE write path for template bodies. What this
 * island adds is the merge-tag-aware body render + the live "filled" preview
 * using the SAME `resolveMergeTags` the dispatcher uses at send time.
 */

export type StudioTemplate = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  isDefault: boolean;
};

/** Split a body on {{tags}} so each tag renders as a chip. */
const TAG_SPLIT_RE = /(\{\{\s*[\w.]+\s*\}\})/g;
/** Non-global matcher for "is this part a tag" (global regexes are stateful). */
const TAG_EXACT_RE = /^\{\{\s*[\w.]+\s*\}\}$/;

export function TemplateStudio({
  templates,
  businessName,
}: {
  templates: StudioTemplate[];
  businessName: string;
}) {
  const channels = useMemo(() => {
    const set = new Set(templates.map((t) => (t.channel === "email" ? "email" : "sms")));
    // Stable pill order: SMS first (mockup), then Email — only existing channels.
    return (["sms", "email"] as const).filter((c) => set.has(c));
  }, [templates]);

  const [channel, setChannel] = useState<string>(channels[0] ?? "sms");
  const inChannel = templates.filter((t) => (t.channel === "email" ? "email" : "sms") === channel);
  const [selectedId, setSelectedId] = useState<string>(inChannel[0]?.id ?? "");
  const [showFilled, setShowFilled] = useState(false);

  const active = inChannel.find((t) => t.id === selectedId) ?? inChannel[0] ?? null;

  function pickChannel(c: string) {
    setChannel(c);
    const first = templates.find((t) => (t.channel === "email" ? "email" : "sms") === c);
    setSelectedId(first?.id ?? "");
  }

  if (templates.length === 0) {
    return (
      <div className="rr-miniempty">
        {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
        <img src="/assets/repulabs/review-request/editor.svg" alt="" aria-hidden="true" />
        <div className="rr-miniempty__title">No templates yet</div>
        <p className="rr-miniempty__sub">Create your first template to get started</p>
        <Link href="/outreach/templates/new" className="btn btn--pri btn--sm">
          <Icon name="edit" size={11} />
          Edit template
        </Link>
      </div>
    );
  }

  const previewCtx = sampleContext(businessName);

  return (
    <div>
      <div className="rr-pills" role="tablist" aria-label="Template channel">
        {channels.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={channel === c}
            className={channel === c ? "rr-pill is-active" : "rr-pill"}
            onClick={() => pickChannel(c)}
          >
            <Icon name={c === "email" ? "mail" : "smartphone"} size={12} />
            {c === "email" ? "Email" : "SMS"}
          </button>
        ))}
      </div>

      {inChannel.length > 1 && (
        <div className="rr-tplpick" aria-label="Pick a template">
          {inChannel.map((t) => (
            <button
              key={t.id}
              type="button"
              className={active?.id === t.id ? "rr-tplpick__t is-active" : "rr-tplpick__t"}
              onClick={() => setSelectedId(t.id)}
              title={t.name}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <div className="rr-msg">
            {active.channel === "email" && active.subject && (
              <div className="rr-msg__subject">Subject: {active.subject}</div>
            )}
            {showFilled ? (
              resolveMergeTags(active.body, previewCtx, { keepUnknown: true })
            ) : (
              <TaggedBody body={active.body} />
            )}
          </div>

          <div className="rr-tags" aria-label="Available merge tags">
            {OUTREACH_MERGE_TAGS.map((tag) => (
              <span key={tag.key} className="rr-mergetag" title={`Example: ${tag.example}`}>
                {`{{${tag.key}}}`}
              </span>
            ))}
          </div>

          <div className="rr-studiofoot">
            <button
              type="button"
              className="rr-tplbtn rr-tplbtn--ghost"
              aria-pressed={showFilled}
              onClick={() => setShowFilled((v) => !v)}
            >
              <Icon name={showFilled ? "eyeOff" : "eye"} size={14} />
              {showFilled ? "Show tags" : "Preview"}
            </button>
            <div className="row" style={{ gap: 8 }}>
              {active.isDefault && <span className="rr-tplbtn rr-tplbtn--tonal">Default</span>}
              <Link href={`/outreach/templates/${active.id}`} className="rr-tplbtn rr-tplbtn--pri">
                <Icon name="edit" size={14} />
                Edit template
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Body text with each {{merge_tag}} rendered as a token chip. */
function TaggedBody({ body }: { body: string }) {
  const parts = body.split(TAG_SPLIT_RE);
  return (
    <>
      {parts.map((p, i) =>
        TAG_EXACT_RE.test(p) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split render
          <span key={i} className="rr-mergetag">
            {`{{${p.replace(/[{}\s]/g, "")}}}`}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split render
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
