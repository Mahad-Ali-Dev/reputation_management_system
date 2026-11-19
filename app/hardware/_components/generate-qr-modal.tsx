"use client";

import { BodyPortal } from "@/components/ui/body-portal";
import { GlassSelect } from "@/components/ui/glass-select";
import { generateSelfServiceQr } from "@/lib/hardware/actions";
import {
  Building2,
  ChevronDown,
  CircleHelp,
  Download,
  Link2,
  QrCode,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import "@/components/ui/glass-sheet.css";

/**
 * Generate a QR code: a frosted Apple-style sheet over the Device Manager
 * (replaces the old /hardware/new page, which now redirects to
 * /hardware?generate=1 so every old link still lands here).
 *
 * Same `generateSelfServiceQr` server action and field names as before
 * (establishmentId, reviewUrl, displayName); on success the action redirects
 * to /hardware?activated=… where the new QR card appears.
 */

export type QrBusiness = { id: string; name: string; hasGoogle: boolean };

const LABEL_PRESETS = ["Front desk", "Receipt insert", "Counter sign", "Window sticker"];

const HOW = [
  {
    icon: Building2,
    title: "Pick the business",
    body: "Each QR points to one business's Google review page. Add as many as you need.",
  },
  {
    icon: Link2,
    title: "Paste a Google link, or skip it",
    body: "If the business is on Google we build the review link for you. A pasted share link works too.",
  },
  {
    icon: Download,
    title: "Download, print, share",
    body: "Your QR appears straight away. Download PNG or SVG for receipts, signs, cards or your website.",
  },
];

export function GenerateQrModal({
  businesses,
  defaultOpen = false,
  error = false,
  triggerClassName = "btn",
  triggerLabel = "Generate QR",
}: {
  businesses: QrBusiness[];
  defaultOpen?: boolean;
  error?: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [howOpen, setHowOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const close = () => {
    setOpen(false);
    // Drop ?generate / ?error so a refresh doesn't pop the sheet back open.
    if (params.has("generate") || params.has("error")) {
      const next = new URLSearchParams(params.toString());
      next.delete("generate");
      next.delete("error");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  // A client navigation to ?generate=1 (e.g. the Connect-a-device sheet's
  // "Create a free digital QR" link) keeps this component mounted, so open on
  // the prop changing, not only on first render.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  // Latest close() for the Esc listener without re-binding it every render.
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const selected = businesses.find((b) => b.id === businessId);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        <QrCode size={14} strokeWidth={1.8} />
        {triggerLabel}
      </button>

      {open && (
        <BodyPortal>
          // biome-ignore lint/a11y/useSemanticElements: overlay dialog; a native dialog top layer
          would sit above the portalled dropdown menus
          <div className="gs-overlay" role="dialog" aria-modal="true" aria-labelledby="gs-title">
            <button type="button" className="gs-scrim" aria-label="Close" onClick={close} />
            <div className="gs">
              <button type="button" className="gs__close" aria-label="Close" onClick={close}>
                <X size={16} strokeWidth={2.2} />
              </button>

              <div className="gs__hero">
                <span className="gs__badge" aria-hidden="true">
                  <QrCode size={28} strokeWidth={1.7} />
                </span>
                <h2 id="gs-title" className="gs__title">
                  Generate a QR code
                </h2>
                <p className="gs__sub">
                  Free, no hardware needed. Customers scan it and land on your Google review page.
                </p>
              </div>

              {/* How it works: a collapsible panel, closed by default. */}
              <div className={`gs-how${howOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="gs-how__toggle"
                  aria-expanded={howOpen}
                  aria-controls="gs-how-body"
                  onClick={() => setHowOpen((v) => !v)}
                >
                  <CircleHelp size={16} strokeWidth={1.8} aria-hidden="true" />
                  How it works
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className="gs-how__chev"
                    aria-hidden="true"
                  />
                </button>
                <div id="gs-how-body" className="gs-how__body" hidden={!howOpen}>
                  <ol className="gs-how__list">
                    {HOW.map((s, i) => (
                      <li key={s.title}>
                        <span className="gs-how__num">{i + 1}</span>
                        <div>
                          <div className="gs-how__title">{s.title}</div>
                          <p className="gs-how__text">{s.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {businesses.length === 0 ? (
                <div className="gs-empty">
                  <p>
                    A QR points to one business&apos;s review page. Add your first business to
                    start.
                  </p>
                  <Link href="/establishments" className="gs-btn gs-btn--pri">
                    Add a business
                  </Link>
                </div>
              ) : (
                <form action={generateSelfServiceQr} className="gs__form">
                  <div className="gs__body">
                    {error && (
                      <p className="gs-error" role="alert">
                        <TriangleAlert size={15} strokeWidth={1.8} />
                        We couldn&apos;t make that QR. Check the link and try again.
                      </p>
                    )}

                    <div className="gs-group">
                      <div className="gs-field">
                        <span className="gs-field__lbl">Business</span>
                        <GlassSelect
                          name="establishmentId"
                          options={businesses.map((b) => ({
                            value: b.id,
                            label: b.name,
                            hint: b.hasGoogle ? undefined : "No Google link",
                          }))}
                          value={businessId}
                          onChange={setBusinessId}
                          searchable={businesses.length > 6}
                          icon={<Building2 size={16} strokeWidth={1.8} />}
                          ariaLabel="Business this QR points to"
                        />
                      </div>

                      <label className="gs-field">
                        <span className="gs-field__lbl">
                          Google review link <span className="gs-opt">Optional</span>
                        </span>
                        <input
                          type="url"
                          name="reviewUrl"
                          placeholder="https://g.page/r/…"
                          autoComplete="off"
                          className="gs-input"
                        />
                        <span className="gs-hint">
                          {selected && !selected.hasGoogle
                            ? "This business isn't linked to Google yet, so paste its review link here (Google profile → Share → Get review link)."
                            : "Leave blank and we'll use the business's Google profile."}
                        </span>
                      </label>

                      <label className="gs-field">
                        <span className="gs-field__lbl">
                          Label <span className="gs-opt">Optional</span>
                        </span>
                        <input
                          type="text"
                          name="displayName"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          placeholder="Where will you use it?"
                          maxLength={40}
                          autoComplete="off"
                          className="gs-input"
                        />
                        <span className="gs-chips">
                          {LABEL_PRESETS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`gs-chip${label === p ? " is-on" : ""}`}
                              onClick={() => setLabel(p)}
                            >
                              {p}
                            </button>
                          ))}
                        </span>
                        <span className="gs-hint">Only you see this, in Device Manager.</span>
                      </label>
                    </div>
                  </div>

                  <div className="gs__foot">
                    <button type="button" className="gs-btn" onClick={close}>
                      Cancel
                    </button>
                    <SubmitButton />
                  </div>
                </form>
              )}
            </div>
          </div>
        </BodyPortal>
      )}
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="gs-btn gs-btn--pri" disabled={pending}>
      <QrCode size={16} strokeWidth={1.8} />
      {pending ? "Generating…" : "Generate QR code"}
    </button>
  );
}
