"use client";

import { QrCameraScanner } from "@/components/qr-scanner";
import { type GlassOption, GlassSelect } from "@/components/ui/glass-select";
import {
  type CreateEstablishmentQuickState,
  createEstablishmentQuick,
} from "@/lib/establishments/actions";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import { parseSlug } from "@/lib/hardware/slug";
import {
  Building2,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  QrCode,
  ScanLine,
  Tag,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import "@/components/ui/glass-sheet.css";
import "./activate-sheet.css";

/**
 * Activate a review stand: an Apple-style sheet over the Device Manager.
 *
 * /activate (the page every scan, email and old link points at) keeps its
 * signed-out handling and then redirects to /hardware?activate=<slug>, where
 * the page resolves the stand and opens this sheet. The form, field names
 * (`slug`, `activationCode`, `establishmentId`, `reviewUrl`) and the
 * `activateDevice` action are unchanged; on success the action redirects to
 * /hardware?activated=<slug>, which drops ?activate and so closes the sheet.
 *
 * The device is a confirmed CARD when we already know which stand was scanned
 * (with a "different stand?" escape hatch), otherwise a camera-scan button
 * with a manual-link fallback. The code is a 5-box one-time-code display over
 * one real input.
 */

export type DeviceState = "claimable" | "yours" | "unavailable" | "none";

const initialState: ActivateDeviceState = { error: null };
const createBusinessInitialState: CreateEstablishmentQuickState = { error: null };

/** Matches ACTIVATION_LEN in lib/hardware/codes.ts. */
const CODE_LEN = 5;

const CATEGORY_OPTIONS: GlassOption[] = [
  "Cafe",
  "Restaurant",
  "Retail",
  "Dental",
  "Medical",
  "Salon",
  "Fitness",
  "Automotive",
  "IT Services",
  "Professional Services",
  "Other",
].map((c) => ({ value: c, label: c }));

const HOW = [
  {
    title: "Identify the stand",
    body: "Scanning its QR tells us exactly which unit you're holding, and fills it in here. Scanned on another device? Paste the link instead.",
  },
  {
    title: "Enter the code",
    body: "The 5-character code on the card inside the package proves the stand is yours.",
  },
  {
    title: "Pick the business",
    body: "Scans from this stand are counted for that business.",
  },
  {
    title: "Set where scans go",
    body: "Paste your Google review link so customers land right on the review form. Leave it blank and we'll build one from your Google profile.",
  },
];

function normalizeCode(value: string): string {
  return value
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LEN);
}

export function ActivateSheet({
  establishments,
  detectedQrUrl,
  detectedSlug,
  detectedSerial,
  deviceState,
}: {
  establishments: Array<{ id: string; name: string }>;
  detectedQrUrl: string | null;
  detectedSlug: string | null;
  /** Ops serial of the detected stand, shown so support has a product ID. */
  detectedSerial: string | null;
  deviceState: DeviceState;
}) {
  const [open, setOpen] = useState(true);
  const [howOpen, setHowOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [state, formAction] = useActionState(activateDevice, initialState);
  // Only a claimable stand is pre-filled; an unknown/taken/already-yours one
  // starts on the scan step instead of looking "detected".
  const usableDetection = deviceState === "claimable" ? detectedQrUrl : null;
  const [qrLink, setQrLink] = useState(usableDetection ?? "");
  const [code, setCode] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [businesses, setBusinesses] = useState(establishments);
  const [businessId, setBusinessId] = useState(establishments[0]?.id ?? "");
  const [showAddForm, setShowAddForm] = useState(false);
  const [createState, createAction] = useActionState(
    createEstablishmentQuick,
    createBusinessInitialState,
  );

  // A business added inline drops straight into the picker, selected.
  useEffect(() => {
    const created = createState.establishment;
    if (!created) return;
    setBusinesses((prev) => (prev.some((b) => b.id === created.id) ? prev : [...prev, created]));
    setBusinessId(created.id);
    setShowAddForm(false);
    router.refresh();
  }, [createState.establishment, router]);

  const close = () => {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    next.delete("activate");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The camera scanner owns Esc while it's up.
      if (e.key === "Escape" && !scannerOpen) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, scannerOpen]);

  function handleScanned(text: string): boolean {
    if (!parseSlug(text)) return false;
    setQrLink(text);
    setManualOpen(true);
    setScannerOpen(false);
    return true;
  }

  function openManual() {
    // They've said this isn't the stand in their hands: clear the detection
    // so it can't be bound by mistake.
    setQrLink("");
    setManualOpen(true);
  }

  if (!open) return null;

  const shownSlug = parseSlug(qrLink);
  const confirmed = !!usableDetection && !manualOpen;
  const noBusinesses = businesses.length === 0;
  const ready = deviceState === "claimable";

  return (
    // biome-ignore lint/a11y/useSemanticElements: overlay dialog; a native dialog top layer would sit above the portalled dropdown menus
    <div className="gs-overlay" role="dialog" aria-modal="true" aria-labelledby="as-title">
      <button type="button" className="gs-scrim" aria-label="Close" onClick={close} />
      <div className="gs as">
        <button type="button" className="gs__close" aria-label="Close" onClick={close}>
          <X size={16} strokeWidth={2.2} />
        </button>

        <div className="gs__hero">
          <span className="gs__badge" aria-hidden="true">
            <ScanLine size={28} strokeWidth={1.7} />
          </span>
          <h2 id="as-title" className="gs__title">
            {ready ? "Activate your stand" : "Activate a review stand"}
          </h2>
          <p className="gs__sub">
            {ready
              ? "We found the stand you scanned. Enter the code from its card and choose the business."
              : "Scan the QR on your stand, then enter the 5-character code from the card in the box."}
          </p>
        </div>

        {/* How it works: collapsible, closed by default. */}
        <div className={`gs-how${howOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="gs-how__toggle"
            aria-expanded={howOpen}
            aria-controls="as-how-body"
            onClick={() => setHowOpen((v) => !v)}
          >
            <CircleHelp size={16} strokeWidth={1.8} aria-hidden="true" />
            How activation works
            <ChevronDown size={16} strokeWidth={2} className="gs-how__chev" aria-hidden="true" />
          </button>
          <div id="as-how-body" className="gs-how__body" hidden={!howOpen}>
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
            <p className="gs-how__note">
              One stand belongs to one business. After activating you can change where it points any
              time from Device Manager, no re-printing needed.
            </p>
          </div>
        </div>

        {noBusinesses ? (
          showAddForm ? (
            <form action={createAction} className="gs__form">
              <input type="hidden" name="timezone" value="UTC" />
              <div className="gs__body">
                {createState.error && (
                  <p className="gs-error" role="alert">
                    <TriangleAlert size={15} strokeWidth={1.8} />
                    {createState.error}
                  </p>
                )}
                <div className="gs-group">
                  <label className="gs-field">
                    <span className="gs-field__lbl">Business name</span>
                    <input
                      name="name"
                      required
                      placeholder="Acme Coffee Downtown"
                      autoComplete="off"
                      aria-invalid={!!createState.fieldErrors?.name}
                      className="gs-input"
                    />
                  </label>
                  <div className="gs-field">
                    <span className="gs-field__lbl">
                      Category <span className="gs-opt">Optional</span>
                    </span>
                    <GlassSelect
                      name="category"
                      options={CATEGORY_OPTIONS}
                      placeholder="Choose a category"
                      icon={<Tag size={16} strokeWidth={1.8} />}
                      ariaLabel="Category"
                    />
                  </div>
                </div>
              </div>
              <div className="gs__foot">
                <button type="button" className="gs-btn" onClick={() => setShowAddForm(false)}>
                  Back
                </button>
                <PendingButton idle="Add business" busy="Adding…" />
              </div>
            </form>
          ) : (
            <div className="gs-empty">
              <p>
                A stand has to point at one of your businesses. Add one first
                {detectedSlug ? ", and we'll keep the stand you scanned ready" : ""}.
              </p>
              <button
                type="button"
                className="gs-btn gs-btn--pri"
                onClick={() => setShowAddForm(true)}
              >
                <Building2 size={16} strokeWidth={1.8} />
                Add a business
              </button>
            </div>
          )
        ) : (
          <form action={formAction} className="gs__form">
            <div className="gs__body">
              {deviceState === "yours" && detectedSlug && (
                <p className="gs-ok">
                  <CircleCheck size={16} strokeWidth={2} />
                  <span>
                    Stand <b>{detectedSlug}</b> is already active on your account. To set up a
                    different one, use &ldquo;Setting up a different stand?&rdquo; below.
                  </span>
                </p>
              )}
              {deviceState === "unavailable" && detectedSlug && (
                <p className="gs-error">
                  <TriangleAlert size={15} strokeWidth={1.8} />
                  <span>
                    Stand <b>{detectedSlug}</b> is already set up on another account, or the link
                    isn&apos;t one of ours. Check the QR on the stand in your hands, or contact
                    support and quote this ID.
                  </span>
                </p>
              )}
              {state.error && (
                <p className="gs-error" role="alert">
                  <TriangleAlert size={15} strokeWidth={1.8} />
                  <span>{state.error}</span>
                </p>
              )}

              {/* 1 · the stand */}
              <div className="gs-group">
                <div className="gs-field">
                  <span className="gs-field__lbl">
                    Your stand
                    {confirmed && (
                      <span className="as-detected">
                        <CircleCheck size={13} strokeWidth={2} />
                        Detected from your scan
                      </span>
                    )}
                  </span>

                  {confirmed ? (
                    <>
                      <input type="hidden" name="slug" value={qrLink} />
                      <div className="as-device">
                        <span className="as-device__icon" aria-hidden="true">
                          <QrCode size={20} strokeWidth={1.8} />
                        </span>
                        <div className="as-device__body">
                          <div className="as-device__id">{shownSlug ?? "—"}</div>
                          <div className="as-device__meta">
                            {detectedSerial ? `Serial ${detectedSerial}` : qrLink}
                          </div>
                        </div>
                      </div>
                      <button type="button" className="as-link" onClick={openManual}>
                        Setting up a different stand?
                      </button>
                    </>
                  ) : manualOpen ? (
                    <>
                      <input
                        type="text"
                        name="slug"
                        value={qrLink}
                        onChange={(e) => setQrLink(e.target.value)}
                        placeholder="repulabs.com/r/XXXXXXXXXX"
                        aria-label="Your stand's QR link"
                        autoComplete="off"
                        spellCheck={false}
                        // Required: an empty box would make the server fall back to
                        // the scan cookie and bind a stand they just said isn't theirs.
                        required
                        className="gs-input as-mono"
                      />
                      <span className="gs-hint">
                        {shownSlug ? (
                          <>
                            Product ID <b>{shownSlug}</b>
                          </>
                        ) : (
                          "Open the stand's QR on any phone and copy the link it lands on."
                        )}
                        {usableDetection && detectedSlug && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="as-link"
                              onClick={() => {
                                setQrLink(usableDetection);
                                setManualOpen(false);
                              }}
                            >
                              Use the stand I scanned ({detectedSlug})
                            </button>
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="as-scan"
                        onClick={() => setScannerOpen(true)}
                      >
                        <span className="as-scan__icon" aria-hidden="true">
                          <ScanLine size={20} strokeWidth={1.8} />
                        </span>
                        <span className="as-scan__body">
                          <span className="as-scan__t">Scan your stand&apos;s QR</span>
                          <span className="as-scan__d">
                            Opens your camera, and fills the stand in the moment it&apos;s
                            recognised.
                          </span>
                        </span>
                      </button>
                      <button type="button" className="as-link" onClick={openManual}>
                        Can&apos;t scan? Enter the link instead
                      </button>
                    </>
                  )}
                </div>

                {/* 2 · the code: one real input under 5 display boxes */}
                <div className="gs-field">
                  <span className="gs-field__lbl">Activation code</span>
                  <label className="as-code">
                    <input
                      name="activationCode"
                      value={code}
                      onChange={(e) => setCode(normalizeCode(e.target.value))}
                      required
                      maxLength={CODE_LEN}
                      inputMode="text"
                      autoComplete="one-time-code"
                      autoCapitalize="characters"
                      aria-label="Activation code"
                      className="as-code__input"
                    />
                    <span className="as-code__boxes" aria-hidden="true">
                      {Array.from({ length: CODE_LEN }).map((_, i) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-box display
                          key={`box-${i}`}
                          className={`as-box${code[i] ? " is-filled" : ""}${i === code.length ? " is-next" : ""}`}
                        >
                          {code[i] ?? ""}
                        </span>
                      ))}
                    </span>
                  </label>
                  <span className="gs-hint">Printed on the card inside your package.</span>
                </div>
              </div>

              {/* 3 + 4 · business and destination */}
              <div className="gs-group">
                <div className="gs-field">
                  <span className="gs-field__lbl">Business</span>
                  <GlassSelect
                    name="establishmentId"
                    options={businesses.map((b) => ({ value: b.id, label: b.name }))}
                    value={businessId}
                    onChange={setBusinessId}
                    searchable={businesses.length > 6}
                    icon={<Building2 size={16} strokeWidth={1.8} />}
                    ariaLabel="Which business is this stand for?"
                  />
                  <span className="gs-hint">
                    Need another? <Link href="/establishments">Add a business</Link>
                  </span>
                </div>
                <label className="gs-field">
                  <span className="gs-field__lbl">
                    Google review link <span className="gs-opt">Recommended</span>
                  </span>
                  <input
                    type="url"
                    name="reviewUrl"
                    placeholder="https://g.page/r/…"
                    autoComplete="off"
                    className="gs-input"
                  />
                  <span className="gs-hint">
                    Google Business Profile → Ask for reviews → copy the link. Leave blank and
                    we&apos;ll build it for you.
                  </span>
                </label>
              </div>
            </div>

            <div className="gs__foot">
              <button type="button" className="gs-btn" onClick={close}>
                Cancel
              </button>
              <PendingButton idle="Activate stand" busy="Activating…" />
            </div>
          </form>
        )}
      </div>

      <QrCameraScanner
        open={scannerOpen}
        onScan={handleScanned}
        onClose={() => setScannerOpen(false)}
        title="Scan your stand's QR"
        instructions="Point your camera at the QR on your stand"
      />
    </div>
  );
}

function PendingButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="gs-btn gs-btn--pri" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}
