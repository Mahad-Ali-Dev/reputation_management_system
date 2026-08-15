"use client";

import { Icon } from "@/components/shell/icon";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import { parseSlug } from "@/lib/hardware/slug";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import "./connect-device-modal.css";

/**
 * My Devices kit — the 3-step "Connect a device" wizard, restyled to the
 * stp1/stp2/stp3 mockups.
 *
 *   1. Select Your Business      — <select name="establishmentId">
 *   2. Enter Your Device Code     — 6 code slots over one real <input name="activationCode">
 *   3. Choose Review Platform     — Google live + selected; others "coming soon"
 *
 * It WRAPS the existing `activateDevice` server action via `useActionState`
 * (2-arg `(prevState, formData)` signature is untouched — changing it would
 * break /activate). All three fields live in ONE <form> and stay mounted across
 * steps so a submit always carries `establishmentId` + `activationCode`; only
 * the active step's panel is shown. The action's inline `{ error }` renders in
 * the footer/body; on success the action `redirect()`s to /hardware?activated=…
 *
 * Visuals come from app/hardware/connect-device-modal.css (.cdm- prefix). The
 * decorative right-side illustration is built with CSS/SVG, aria-hidden.
 */

const initialState: ActivateDeviceState = { error: null };

const SETUP_VIDEO_URL = process.env.NEXT_PUBLIC_SETUP_VIDEO_URL ?? null;
const ASSET = "/assets/repulabs/my-devices";

type PlatformDef = { id: string; label: string; icon: string; live: boolean };
// Real kit brand glyphs (designs/.../stp3/illustrations → public brand-*.svg).
const PLATFORMS: PlatformDef[] = [
  { id: "google", label: "Google", icon: "brand-google.svg", live: true },
  { id: "facebook", label: "Facebook", icon: "brand-facebook.svg", live: false },
  { id: "linkedin", label: "LinkedIn", icon: "brand-linkedin.svg", live: false },
  { id: "twitter-x", label: "Twitter / X", icon: "brand-twitter.svg", live: false },
  { id: "instagram", label: "Instagram", icon: "brand-instagram.svg", live: false },
  { id: "tiktok", label: "TikTok", icon: "brand-tiktok.svg", live: false },
  { id: "yelp", label: "Yelp", icon: "brand-yelp.svg", live: false },
  { id: "tripadvisor", label: "Tripadvisor", icon: "brand-tripadvisor.svg", live: false },
  { id: "fiverr", label: "Fiverr", icon: "brand-fiverr.svg", live: false },
  { id: "upwork", label: "Upwork", icon: "brand-upwork.svg", live: false },
];

function normalizeCode(value: string): string {
  // Activation codes are exactly 5 chars, Crockford base32 (see lib/hardware/codes.ts:
  // ACTIVATION_LEN = 5). Keep A–Z0–9 (real codes are alphanumeric, e.g. "A3M9K" — not
  // digits-only), uppercase, strip separators, and hard-cap at 5.
  return value
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

/** Activation code length — matches ACTIVATION_LEN in lib/hardware/codes.ts. */
const CODE_LEN = 5;

export function ConnectDeviceModal({
  establishments,
  detectedQrUrl = null,
  detectedSerial = null,
  triggerClassName = "btn btn--pri",
  triggerLabel = "Add device",
}: {
  establishments: Array<{ id: string; name: string }>;
  /** QR link of the stand this browser last scanned, resolved server-side. */
  detectedQrUrl?: string | null;
  /** Ops serial of that stand, shown as the support-facing product ID. */
  detectedSerial?: string | null;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  // Seeded from the scan so the customer types nothing but the code. Still
  // editable — a stale detection (second stand, shared browser) must never
  // leave them stuck with the wrong device.
  const [link, setLink] = useState(detectedQrUrl ?? "");
  const [platform, setPlatform] = useState("google");
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? "");
  const [state, formAction] = useActionState(activateDevice, initialState);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Reset to step 1 each time the modal opens.
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const noBusinesses = establishments.length === 0;
  const codeComplete = code.length === CODE_LEN;
  // Shared with /activate and the server action, so all three agree on what a
  // pasted link means (see lib/hardware/slug.ts). null = not a usable slug yet.
  const slug = parseSlug(link);
  const slugComplete = slug !== null;
  // "Detected" holds only while the box still contains what we filled in.
  const autoDetected = !!detectedQrUrl && link === detectedQrUrl;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        <Icon name="plus" size={13} />
        {triggerLabel}
      </button>

      {open && (
        <div className="cdm-backdrop">
          <button
            type="button"
            aria-label="Close add device dialog"
            className="cdm-scrim"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cdm-title"
            className={`cdm-modal cdm-modal--step${step}`}
          >
            <button
              type="button"
              aria-label="Close add device dialog"
              className="cdm-close"
              onClick={() => setOpen(false)}
            >
              <Icon name="x" size={18} stroke={2.2} />
            </button>

            {noBusinesses ? (
              <div className="cdm-pad">
                <Header step={step} />
                <NoBusinessNotice />
              </div>
            ) : (
              <form action={formAction} className="cdm-form">
                <div className="cdm-form__body">
                  <div className="cdm-left">
                    <Header step={step} />

                    {state.error && (
                      <div className="cdm-error" role="alert">
                        {state.error}
                      </div>
                    )}

                    {/* Step 1 — Business */}
                    <div className="cdm-panel" hidden={step !== 1}>
                      <SectionHead n={1} icon="building" title="Select Your Business" />
                      <BusinessSelect
                        establishments={establishments}
                        value={establishmentId}
                        onChange={setEstablishmentId}
                      />
                      <input type="hidden" name="establishmentId" value={establishmentId} />
                      <Callout icon="info">
                        Scans from this device will route to this business&rsquo;s review page.
                      </Callout>
                    </div>

                    {/* Step 2 — QR link (identifies the exact device) + code */}
                    <div className="cdm-panel" hidden={step !== 2}>
                      <SectionHead n={2} icon="qr" title="Enter Your Device" />

                      <p className="cdm-helper">
                        {autoDetected
                          ? "We recognised the stand you scanned, so this is already filled in. Just enter the code below."
                          : "Paste the QR link printed on your product — or scan the QR and copy the link. This is how we bind the right device to your business."}
                      </p>
                      <div className="cdm-field">
                        <span className="cdm-field__icon" aria-hidden>
                          <Icon name="qr" size={20} />
                        </span>
                        <input
                          type="text"
                          value={link}
                          onChange={(e) => setLink(e.target.value)}
                          placeholder="repulabs.com/r/XXXXXXXXXX"
                          aria-label="Your device QR link"
                          autoComplete="off"
                          spellCheck={false}
                          className="cdm-select"
                          style={{ textTransform: "none" }}
                        />
                      </div>
                      {/* the parsed slug is what actually activates the device */}
                      <input type="hidden" name="slug" value={slug ?? ""} />

                      {/* Product ID — the string support needs when a customer
                          gets stuck. Shown as soon as we can read a slug, from
                          the scan or from what they pasted. */}
                      {slug && (
                        <div className="cdm-pid">
                          {autoDetected && (
                            <span className="cdm-pid__chip">
                              <Icon name="check" size={12} />
                              Detected
                            </span>
                          )}
                          <span className="cdm-pid__label">Product ID</span>
                          <code className="cdm-pid__val">{slug}</code>
                          {detectedSerial && autoDetected && (
                            <>
                              <span className="cdm-pid__label">Serial</span>
                              <code className="cdm-pid__val">{detectedSerial}</code>
                            </>
                          )}
                        </div>
                      )}

                      <p className="cdm-helper" style={{ marginTop: 16 }}>
                        Now enter the 5-character code from the card inside your package.
                      </p>
                      {/* biome-ignore lint/a11y/useKeyWithClickEvents: focus-proxy wrapper; the real input handles keyboard */}
                      <div className="cdm-code" onClick={() => codeInputRef.current?.focus()}>
                        <input
                          ref={codeInputRef}
                          name="activationCode"
                          value={code}
                          onChange={(e) => setCode(normalizeCode(e.target.value))}
                          inputMode="text"
                          autoComplete="off"
                          autoCapitalize="characters"
                          maxLength={CODE_LEN}
                          required
                          aria-label="Device code"
                          className="cdm-code__input"
                        />
                        <div className="cdm-code__slots" aria-hidden>
                          {Array.from({ length: CODE_LEN }).map((_, i) => (
                            <span
                              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-slot display
                              key={`slot-${i}`}
                              className={code[i] ? "cdm-slot cdm-slot--has" : "cdm-slot"}
                            >
                              {code[i] ?? ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Callout icon="info" title="Can't find the code?">
                        Check the card inside your package.
                      </Callout>

                      {/* No physical device? The Continue button intentionally
                          stays disabled until a real QR link + code are entered,
                          which left customers without a card stuck here with no
                          way forward. Point them at the free digital-QR path. */}
                      <p className="cdm-helper" style={{ marginTop: 14 }}>
                        Don&rsquo;t have a physical device yet?{" "}
                        <Link
                          href="/hardware/new"
                          style={{ color: "var(--rl-primary, #4f46e5)", fontWeight: 600 }}
                        >
                          Create a free digital QR
                        </Link>{" "}
                        — no card needed.
                      </p>
                    </div>

                    {/* Step 3 — Platform */}
                    <div className="cdm-panel" hidden={step !== 3}>
                      <SectionHead n={3} icon="grid" title="Choose Review Platform" />
                      <div className="cdm-grid" role="radiogroup" aria-label="Review platform">
                        {PLATFORMS.map((p) => {
                          const selected = platform === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-disabled={!p.live}
                              disabled={!p.live}
                              title={p.live ? p.label : "Coming soon"}
                              onClick={() => p.live && setPlatform(p.id)}
                              className={`cdm-plat${selected ? " cdm-plat--sel" : ""}${p.live ? "" : " cdm-plat--soon"}`}
                            >
                              <span className="cdm-plat__main">
                                {/* biome-ignore lint/performance/noImgElement: static brand icon */}
                                <img
                                  src={`${ASSET}/${p.icon}`}
                                  alt=""
                                  aria-hidden
                                  className="cdm-plat__icon"
                                />
                                <span className="cdm-plat__label">{p.label}</span>
                              </span>
                              <span className="cdm-plat__radio" aria-hidden>
                                {selected ? <Icon name="check" size={15} /> : null}
                              </span>
                              {!p.live && <span className="cdm-plat__soon">soon</span>}
                            </button>
                          );
                        })}
                      </div>
                      <Callout icon="info" title="Google is live today.">
                        We&rsquo;ll add more platforms here as they come online.
                      </Callout>
                    </div>
                  </div>

                  {/* Decorative right-side illustration (steps 1 & 2 only) — the
                      real kit art: step 1 = device-on-pedestal + review card,
                      step 2 = device-code card on pedestal with plant. Both stay
                      mounted (only the active one shown) so the large SVGs
                      preload together and never flash blank when advancing. */}
                  {step < 3 && (
                    <div className="cdm-art" aria-hidden>
                      {/* biome-ignore lint/performance/noImgElement: static kit illustration (large SVG) */}
                      <img
                        src={`${ASSET}/add-step1-review.svg`}
                        alt=""
                        aria-hidden
                        className="cdm-art__img"
                        hidden={step !== 1}
                      />
                      {/* biome-ignore lint/performance/noImgElement: static kit illustration (large SVG) */}
                      <img
                        src={`${ASSET}/add-step2-code.svg`}
                        alt=""
                        aria-hidden
                        className="cdm-art__img"
                        hidden={step !== 2}
                      />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <footer className="cdm-footer">
                  {step > 1 ? (
                    <button
                      type="button"
                      className="cdm-back"
                      onClick={() => setStep((s) => s - 1)}
                    >
                      <Icon name="chevL" size={16} />
                      Back
                    </button>
                  ) : (
                    <span />
                  )}

                  {step === 3 && <WatchVideoLink />}

                  {step < 3 ? (
                    <button
                      type="button"
                      className="cdm-cta"
                      disabled={step === 2 && (!slugComplete || !codeComplete)}
                      onClick={() => setStep((s) => s + 1)}
                    >
                      Continue
                      <Icon name="arrowR" size={17} />
                    </button>
                  ) : (
                    <ConnectButton platform={platform} />
                  )}
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/**
 * Custom listbox for the business picker — a native <select>'s OWN styling
 * (border, icon, chevron) matched the kit fine, but its options POPUP is
 * rendered by the OS/browser (plain white rows, hard corners, browser-blue
 * highlight) and can't be restyled to match, which is what looked off. This
 * swaps in a button + absolutely-positioned listbox so the open menu matches
 * the rest of the modal, while still submitting via a plain hidden input
 * (`establishmentId`) so activateDevice's `form.get("establishmentId")` is
 * unchanged.
 */
function BusinessSelect({
  establishments,
  value,
  onChange,
}: {
  establishments: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = establishments.find((e) => e.id === value) ?? establishments[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="cdm-field" ref={rootRef}>
      <span className="cdm-field__icon" aria-hidden>
        <Icon name="building" size={20} />
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="cdm-combo__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select your business"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="cdm-combo__label">
          {selected?.name ?? "Select a business"}
        </span>
      </button>
      <Icon name="chevD" size={18} className={`cdm-field__chev${open ? " is-open" : ""}`} />

      {open && (
        <div className="cdm-combo__list" role="listbox" aria-label="Businesses" tabIndex={-1}>
          {establishments.map((e) => {
            const isSel = e.id === selected?.id;
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={isSel}
                className={`cdm-combo__opt${isSel ? " is-sel" : ""}`}
                onClick={() => {
                  onChange(e.id);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className="cdm-combo__opttext">{e.name}</span>
                {isSel && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Header({ step }: { step: number }) {
  return (
    <div className="cdm-head">
      <span className="cdm-head__tile" aria-hidden>
        <Icon name={step === 3 ? "share" : "smartphone"} size={26} />
      </span>
      <div>
        <h2 id="cdm-title" className="cdm-head__title">
          Connect a device
        </h2>
        {step === 1 && (
          <p className="cdm-head__sub">
            Let&rsquo;s get your device connected and start collecting reviews.
          </p>
        )}
      </div>
      <div className="cdm-stepper">
        {[1, 2, 3].map((n) => {
          const cls = n === step ? "is-active" : n < step ? "is-done" : "is-idle";
          return (
            <span key={n} className="cdm-stepper__group">
              <span className={`cdm-step ${cls}`}>
                {n < step ? <Icon name="check" size={14} stroke={2.4} /> : n}
              </span>
              {n < 3 && <span className="cdm-step__conn" aria-hidden />}
            </span>
          );
        })}
        <span className="cdm-step__pill">STEP {step} OF 3</span>
      </div>
      <p className="cdm-sr">
        Step {step} of 3.{" "}
        {step === 1
          ? "Select your business."
          : step === 2
            ? "Enter your device code."
            : "Choose review platform."}
      </p>
    </div>
  );
}

function SectionHead({
  n,
  icon,
  title,
}: { n: number; icon: "building" | "card" | "grid" | "qr"; title: string }) {
  return (
    <div className="cdm-sec">
      <span className="cdm-sec__badge" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <h3 className="cdm-sec__title">
        {n}. {title}
      </h3>
    </div>
  );
}

function Callout({
  icon,
  title,
  children,
}: {
  icon: "info";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cdm-callout">
      <Icon name={icon} size={20} className="cdm-callout__icon" />
      <div>
        {title && <div className="cdm-callout__title">{title}</div>}
        <div className="cdm-callout__copy">{children}</div>
      </div>
    </div>
  );
}

function NoBusinessNotice() {
  return (
    <div className="col" style={{ gap: 14, marginTop: 24 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--rl-muted)", lineHeight: 1.55 }}>
        Add a business first — a device has to point its scans at one of your listings.
      </p>
      <Link href="/establishments/new" className="cdm-cta" style={{ alignSelf: "flex-start" }}>
        <Icon name="plus" size={15} />
        Add a business
      </Link>
    </div>
  );
}

function ConnectButton({ platform }: { platform: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="cdm-cta" disabled={pending || platform !== "google"}>
      <Icon name="share" size={16} />
      {pending ? "Connecting…" : "Connect Device"}
    </button>
  );
}

function WatchVideoLink() {
  const enabled = !!SETUP_VIDEO_URL;
  if (enabled) {
    return (
      <a href={SETUP_VIDEO_URL} target="_blank" rel="noopener noreferrer" className="cdm-watch">
        <Icon name="play" size={15} />
        Watch setup video
      </a>
    );
  }
  return (
    <span aria-disabled className="cdm-watch cdm-watch--off">
      <Icon name="play" size={15} />
      Watch setup video
    </span>
  );
}
