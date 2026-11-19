"use client";

import { BodyPortal } from "@/components/ui/body-portal";
import { GlassSelect } from "@/components/ui/glass-select";
import { generateRequestBody } from "@/lib/outreach/ai-generate";
import { resolveMergeTags, sampleContext } from "@/lib/outreach/merge-tags";
import { saveOutreachTemplate } from "@/lib/outreach/template-actions";
import { ImageIcon, Mail, Smartphone, Sparkles, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MergeTagBody } from "./merge-tag-body";
import "@/components/ui/glass-sheet.css";
import "./template-modal.css";

/**
 * Create / edit an outreach template in a wide Apple-style sheet: fields on
 * the left, a live recipient preview on the right. Opened from the URL
 * (/outreach?tab=templates&template=new|<id>) so every old link — including
 * the retired /outreach/templates/[id] page — lands here.
 *
 * Saves through `saveOutreachTemplate` ({ok|error}); on success the sheet
 * closes and the list refreshes.
 */

/** SMS is disabled for launch (2026-08): email only. Existing SMS templates
 *  still open and save; they just can't be created from here meanwhile. */
const SMS_ENABLED = false;

const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

export type TemplateInitial = {
  id: string | null;
  name: string;
  channel: "email" | "sms";
  subject: string;
  body: string;
  logoUrl: string;
  isDefault: boolean;
};

const TONES = [
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "brief", label: "Brief" },
  { value: "warm", label: "Warm" },
  { value: "playful", label: "Playful" },
];

export function TemplateModal({
  initial,
  businessName,
  sampleAddress,
  changeLogoHref,
}: {
  initial: TemplateInitial;
  businessName: string;
  sampleAddress: string;
  changeLogoHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [name, setName] = useState(initial.name);
  const [channel, setChannel] = useState<"email" | "sms">(initial.channel);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [isDefault, setIsDefault] = useState(initial.isDefault);
  const [tone, setTone] = useState("friendly");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [aiPending, startAi] = useTransition();

  const ctx = useMemo(
    () => sampleContext(businessName, sampleAddress),
    [businessName, sampleAddress],
  );
  const previewSubject = resolveMergeTags(subject, ctx, { keepUnknown: true });
  const previewBody = resolveMergeTags(body, ctx, { keepUnknown: true });
  const isNew = initial.id === null;

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete("template");
    if (!next.get("tab")) next.set("tab", "templates");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  function handleAi() {
    setError(null);
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("tone", tone);
    startAi(async () => {
      try {
        const result = await generateRequestBody(fd);
        setBody(result.body.slice(0, BODY_MAX));
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI writing failed. Try again.");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    if (initial.id) fd.set("id", initial.id);
    fd.set("name", name.trim());
    fd.set("channel", channel);
    fd.set("subject", channel === "email" ? subject : "");
    fd.set("body", body);
    fd.set("logoUrl", initial.logoUrl);
    if (isDefault) fd.set("isDefault", "on");
    startSave(async () => {
      const res = await saveOutreachTemplate(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <BodyPortal>
      // biome-ignore lint/a11y/useSemanticElements: overlay dialog; a native dialog top layer would
      sit above the portalled dropdown menus
      <div role="dialog" className="gs-overlay" aria-modal="true" aria-labelledby="tm-title">
        <button type="button" className="gs-scrim" aria-label="Close" onClick={close} />
        <div className="gs tm">
          <button type="button" className="gs__close" aria-label="Close" onClick={close}>
            <X size={16} strokeWidth={2.2} />
          </button>

          <form onSubmit={submit} className="tm__grid">
            {/* ---- left: fields ---- */}
            <div className="tm__fields">
              <header className="tm__head">
                <span className="gs__badge tm__badge" aria-hidden="true">
                  {channel === "email" ? (
                    <Mail size={22} strokeWidth={1.8} />
                  ) : (
                    <Smartphone size={22} strokeWidth={1.8} />
                  )}
                </span>
                <div>
                  <h2 id="tm-title" className="tm__title">
                    {isNew ? "New template" : "Edit template"}
                  </h2>
                  <p className="tm__sub">Write once, reuse for every review request.</p>
                </div>
              </header>

              <div className="tm__scroll">
                {error && (
                  <p className="gs-error" role="alert">
                    <TriangleAlert size={15} strokeWidth={1.8} />
                    {error}
                  </p>
                )}

                <div className="gs-group">
                  <label className="gs-field">
                    <span className="gs-field__lbl">Template name</span>
                    <input
                      className="gs-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={120}
                      placeholder="e.g. After-visit thank you"
                    />
                  </label>

                  {SMS_ENABLED && (
                    <div className="gs-field">
                      <span className="gs-field__lbl">Channel</span>
                      <div className="tm-seg" aria-label="Channel">
                        {(["email", "sms"] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={channel === c}
                            className={`tm-seg__t${channel === c ? " is-active" : ""}`}
                            onClick={() => setChannel(c)}
                          >
                            {c === "email" ? "Email" : "SMS"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {channel === "email" && (
                    <label className="gs-field">
                      <span className="gs-field__lbl">Subject line</span>
                      <input
                        className="gs-input"
                        value={subject}
                        maxLength={SUBJECT_MAX}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="How was your visit to {{business_name}}?"
                      />
                    </label>
                  )}

                  {channel === "email" && (
                    <div className="gs-field">
                      <span className="gs-field__lbl">Email logo</span>
                      <div className="tm-logo">
                        {initial.logoUrl ? (
                          // org logo from blob storage
                          <img src={initial.logoUrl} alt="" className="tm-logo__img" />
                        ) : (
                          <span className="gs-hint">
                            No logo yet, so your business name is used.
                          </span>
                        )}
                        <Link href={changeLogoHref} className="gs-btn tm-btn-sm">
                          <ImageIcon size={14} strokeWidth={1.8} />
                          Change logo
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <div className="gs-group tm-body">
                  <MergeTagBody
                    value={body}
                    onChange={(v) => setBody(v.slice(0, BODY_MAX))}
                    channel={channel}
                    businessName={businessName}
                    sampleAddress={sampleAddress}
                    maxLength={BODY_MAX}
                  />
                  <div className="tm-ai">
                    <div className="tm-ai__tone">
                      <GlassSelect
                        value={tone}
                        onChange={setTone}
                        options={TONES}
                        ariaLabel="Tone"
                      />
                    </div>
                    <button
                      type="button"
                      className="gs-btn tm-btn-sm"
                      onClick={handleAi}
                      disabled={aiPending}
                    >
                      <Sparkles size={14} strokeWidth={1.8} />
                      {aiPending ? "Writing…" : "Write with AI"}
                    </button>
                  </div>
                </div>

                <label className="tm-default">
                  <span>
                    <span className="tm-default__t">Default {channel} template</span>
                    <span className="gs-hint">Used automatically when you send a request.</span>
                  </span>
                  <input
                    type="checkbox"
                    className="tm-switch"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                </label>
              </div>

              <div className="tm__foot">
                <button type="button" className="gs-btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="gs-btn gs-btn--pri" disabled={saving}>
                  {saving ? "Saving…" : isNew ? "Create template" : "Save changes"}
                </button>
              </div>
            </div>

            {/* ---- right: live preview ---- */}
            <aside className="tm__preview" aria-label="Preview">
              <span className="tm__plabel">Preview</span>
              {channel === "email" ? (
                <div className="tm-mail">
                  <div className="tm-mail__bar">
                    <span className="tm-mail__dot" />
                    <span className="tm-mail__dot" />
                    <span className="tm-mail__dot" />
                  </div>
                  <div className="tm-mail__meta">
                    <div>
                      <b>From</b> {businessName}
                    </div>
                    <div>
                      <b>Subject</b> {previewSubject || `How was your visit to ${businessName}?`}
                    </div>
                  </div>
                  <div className="tm-mail__canvas">
                    <div className="tm-mail__card">
                      {initial.logoUrl ? (
                        // org logo from blob storage
                        <img src={initial.logoUrl} alt="" className="tm-mail__logo" />
                      ) : (
                        <div className="tm-mail__brand">{businessName}</div>
                      )}
                      <div className="tm-mail__body">
                        {previewBody || "Your message appears here."}
                      </div>
                      <span className="tm-mail__cta">Leave a review</span>
                      <p className="tm-mail__foot">
                        Don&apos;t want these emails? Unsubscribe anytime.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="tm-phone">
                  <div className="tm-phone__notch" />
                  <div className="tm-phone__to">{businessName}</div>
                  <div className="tm-phone__bubble">
                    {previewBody || "Your message appears here."}
                  </div>
                  <p className="tm-phone__foot">Reply STOP to opt out.</p>
                </div>
              )}
              <p className="tm__pnote">Merge tags are filled with sample data.</p>
            </aside>
          </form>
        </div>
      </div>
    </BodyPortal>
  );
}
