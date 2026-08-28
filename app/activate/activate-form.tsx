"use client";

import { QrCameraScanner } from "@/components/qr-scanner";
import { Icon } from "@/components/shell/icon";
import {
  type CreateEstablishmentQuickState,
  createEstablishmentQuick,
} from "@/lib/establishments/actions";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import { parseSlug } from "@/lib/hardware/slug";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import "./activate.css";

/**
 * Activation form (client component).
 *
 * Why client + useActionState: when the user enters a wrong code, the server
 * action returns `{ error }` instead of throwing. We render the error inline
 * above the form — much friendlier than the default `error.tsx` page that
 * blank-slates whatever they were doing.
 *
 * Two design decisions worth keeping:
 *
 *  1. The device is presented as a CARD, not a text box, whenever we already
 *     know which stand was scanned (see page.tsx for how). The customer's job
 *     is to confirm, not to transcribe a URL — and the card is where the
 *     Product ID / Serial live so support can be quoted them. A "different
 *     stand?" toggle swaps in the raw input, so a stale detection is never a
 *     dead end.
 *  2. The code is a 5-slot segmented display over one real input, mirroring
 *     the Connect-a-device wizard. The wrapper is a <label>, so clicking any
 *     slot focuses the input natively — no click handler, no a11y trade-off.
 *
 * Field names (`slug`, `activationCode`, `establishmentId`, `reviewUrl`) are
 * unchanged — activateDevice's contract is untouched.
 */

const initialState: ActivateDeviceState = { error: null };
const createBusinessInitialState: CreateEstablishmentQuickState = { error: null };

const CATEGORY_OPTIONS = [
  "Cafe",
  "Restaurant",
  "Retail",
  "Dental",
  "Salon",
  "Fitness",
  "Automotive",
  "IT Services",
  "Professional Services",
  "Other",
];

/** Matches ACTIVATION_LEN in lib/hardware/codes.ts. */
const CODE_LEN = 5;

export type DeviceState = "claimable" | "yours" | "unavailable" | "none";

function normalizeCode(value: string): string {
  return value
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LEN);
}

export function ActivateForm({
  establishments,
  detectedQrUrl,
  detectedSlug,
  detectedSerial,
  deviceState,
}: {
  establishments: Array<{ id: string; name: string }>;
  detectedQrUrl?: string | null;
  detectedSlug?: string | null;
  /** Ops serial of the detected stand — shown so support has a product ID. */
  detectedSerial?: string | null;
  deviceState?: DeviceState;
}) {
  const [state, formAction] = useActionState(activateDevice, initialState);
  const [qrLink, setQrLink] = useState(detectedQrUrl ?? "");
  const [code, setCode] = useState("");
  // The link box is disclosure-only. Scanning is the path that works for
  // everyone — the slug is NOT printed as readable text on the product (see
  // the manufacturer instructions in lib/hardware/batch.ts), so it exists only
  // inside the QR image. Typing it is a fallback for the one case scanning
  // can't cover: scanned on a phone, activating on a laptop.
  const [manualOpen, setManualOpen] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // The camera scanner hands back raw decoded text; only accept it (and stop
  // the camera) if it's actually one of our slugs — a stray/unrelated QR
  // code should be rejected so the camera keeps looking, not silently fill
  // the link field with garbage.
  function handleScanned(text: string): boolean {
    if (!parseSlug(text)) return false;
    setQrLink(text);
    setManualOpen(true);
    setScannerOpen(false);
    return true;
  }

  // Local copy of the establishments list so adding a business inline (below)
  // drops straight into the normal step-3 picker without navigating away to
  // /establishments/new and losing the scanned-stand context above.
  const [businesses, setBusinesses] = useState(establishments);
  const [showAddForm, setShowAddForm] = useState(false);
  const [createState, createAction] = useActionState(
    createEstablishmentQuick,
    createBusinessInitialState,
  );
  const router = useRouter();

  useEffect(() => {
    const created = createState.establishment;
    if (!created) return;
    setBusinesses((prev) => (prev.some((b) => b.id === created.id) ? prev : [...prev, created]));
    setShowAddForm(false);
    router.refresh();
  }, [createState.establishment, router]);

  const shownSlug = parseSlug(qrLink);
  const confirmed = !!detectedQrUrl && !manualOpen;
  const noBusinesses = businesses.length === 0;

  function openManual() {
    // Clear a detected link on the way in — they've told us this isn't the
    // stand they're holding, so keeping it pre-filled invites binding the
    // wrong unit.
    setQrLink("");
    setManualOpen(true);
  }

  function useDetected() {
    setQrLink(detectedQrUrl ?? "");
    setManualOpen(false);
  }

  if (noBusinesses) {
    return (
      <div className="af">
        {showAddForm ? (
          <InlineAddBusinessForm
            action={createAction}
            error={createState.error}
            fieldErrors={createState.fieldErrors}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <div className="af-warn">
            <strong>Add a location first.</strong> A stand has to point at one of your
            establishments.{" "}
            <button type="button" className="af-linkbtn" onClick={() => setShowAddForm(true)}>
              Add a business
            </button>
            {detectedQrUrl && (
              <>
                {" "}
                We&rsquo;ll still remember the stand you scanned
                {detectedSlug ? ` (${detectedSlug})` : ""} when you do.
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <form action={formAction} className="af">
        {deviceState === "yours" && detectedSlug && (
          <div className="af-banner af-banner--ok">
            <strong>
              QR <code>{detectedSlug}</code> is already active on your account
            </strong>
            Nothing to do here you can change where it points from{" "}
            <Link href="/hardware">My devices</Link>. To set up a different stand, use the link
            below.
          </div>
        )}

        {deviceState === "unavailable" && detectedSlug && (
          <div className="af-banner af-banner--warn">
            <strong>
              We don&rsquo;t recognize QR <code>{detectedSlug}</code>
            </strong>
            It may already belong to another business. Check the link matches the one printed on
            your stand, or contact support.
          </div>
        )}

        {state.error && (
          <div role="alert" className="af-error">
            <strong>Couldn&rsquo;t activate this code.</strong>
            {state.error}
          </div>
        )}

        {/* ── 1 · the device ───────────────────────────────────────────
          The slug is what binds activation to one exact unit; the printed
          code can't, because this batch shares one code. See activateDevice. */}
        <div className="af-field">
          <span className="af-label">
            <span className="af-num">1</span> Your device
            {confirmed && (
              <span className="af-detected">
                <Icon name="check" size={11} />
                Detected from your scan
              </span>
            )}
          </span>

          {confirmed ? (
            <>
              <input type="hidden" name="slug" value={qrLink} />
              <div className="af-device">
                <span className="af-device__tile" aria-hidden>
                  <Icon name="qr" size={22} />
                </span>
                <div className="af-device__body">
                  <div className="af-device__link">{qrLink}</div>
                  <div className="af-pid">
                    <span className="af-pid__label">Product ID</span>
                    <code className="af-pid__val">{shownSlug ?? "—"}</code>
                    {detectedSerial && (
                      <>
                        <span className="af-pid__label">Serial</span>
                        <code className="af-pid__val">{detectedSerial}</code>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button type="button" className="af-swap" onClick={openManual}>
                <Icon name="qr" size={12} />
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
                aria-label="Your device QR link"
                autoComplete="off"
                spellCheck={false}
                // Required so an empty box can't be submitted: the server would
                // fall back to the scan cookie and bind a stand they just told
                // us isn't the one in their hands.
                required
                className="af-input af-input--url"
              />
              {shownSlug && (
                <div className="af-pid">
                  <span className="af-pid__label">Product ID</span>
                  <code className="af-pid__val">{shownSlug}</code>
                </div>
              )}
              <span className="af-hint">
                Open your stand&rsquo;s QR on any phone and copy the link it lands on.
                {detectedSlug && (
                  <>
                    {" "}
                    <button type="button" className="af-linkbtn" onClick={useDetected}>
                      Or go back to the stand you scanned ({detectedSlug})
                    </button>
                  </>
                )}
              </span>
            </>
          ) : (
            <>
              {/* Default when we know nothing: point at the one action that works
                for everyone rather than opening with a URL box. */}
              <button type="button" className="af-scan" onClick={() => setScannerOpen(true)}>
                <span className="af-scan__tile" aria-hidden>
                  <Icon name="qr" size={22} />
                </span>
                <div className="af-scan__body">
                  <div className="af-scan__t">Scan your stand&rsquo;s QR with your phone</div>
                  <div className="af-scan__d">
                    Tap to open your camera we&rsquo;ll fill in the link the moment we recognize
                    it.
                  </div>
                </div>
              </button>
              <button type="button" className="af-swap" onClick={openManual}>
                <Icon name="qr" size={12} />
                Can&rsquo;t scan right now? Enter the link manually
              </button>
            </>
          )}
        </div>

        {/* ── 2 · the code ─────────────────────────────────────────── */}
        <div className="af-field">
          <span className="af-label">
            <span className="af-num">2</span> Activation code
          </span>
          {/* <label> wrapper = click any slot to focus the real input, natively. */}
          <label className="af-code">
            <input
              ref={codeRef}
              name="activationCode"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              required
              maxLength={CODE_LEN}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              aria-label="Activation code"
              className="af-code__input"
            />
            <span className="af-code__slots" aria-hidden>
              {Array.from({ length: CODE_LEN }).map((_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-slot display
                  key={`slot-${i}`}
                  className={code[i] ? "af-slot af-slot--has" : "af-slot"}
                >
                  {code[i] ?? ""}
                </span>
              ))}
            </span>
          </label>
          <span className="af-hint">
            The 5-character code printed on the card inside your package.
          </span>
        </div>

        {/* ── 3 · the business ─────────────────────────────────────── */}
        <label className="af-field">
          <span className="af-label">
            <span className="af-num">3</span> Which business is this QR for?
          </span>
          <select
            name="establishmentId"
            required
            defaultValue={businesses[0]?.id}
            className="af-select"
          >
            {businesses.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <span className="af-hint">
            Need a new listing? <Link href="/establishments/new">Add a listing →</Link>
          </span>
        </label>

        {/* ── 4 · the destination ──────────────────────────────────── */}
        <label className="af-field">
          <span className="af-label">
            <span className="af-num">4</span> Paste your Google review link
            <span className="af-opt">Strongly recommended</span>
          </span>
          <input
            type="url"
            name="reviewUrl"
            placeholder="https://g.page/r/... or https://search.google.com/local/writereview?placeid=..."
            autoComplete="off"
            className="af-input af-input--url"
          />
          <span className="af-hint">
            Where scans should land. Get it from{" "}
            <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer">
              Google Business Profile
            </a>{" "}
            → Customers → Reviews → <strong>Share review form</strong>. Leave blank to derive
            automatically from your business you can always change it later via Edit on the QR
            card.
          </span>
        </label>

        <div className="af-actions">
          <Link href="/hardware" className="af-cancel">
            Cancel
          </Link>
          <SubmitButton />
        </div>
      </form>

      <QrCameraScanner
        open={scannerOpen}
        onScan={handleScanned}
        onClose={() => setScannerOpen(false)}
        title="Scan your stand's QR"
        instructions="Point your camera at the QR on your stand"
      />
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="af-submit" disabled={pending}>
      <Icon name="check" size={13} />
      {pending ? "Activating…" : "Configure + activate"}
    </button>
  );
}

/** Quick inline "add a business" form for the zero-establishments case —
 *  keeps the customer on /activate (with the scanned-stand context intact)
 *  instead of bouncing them to the full /establishments/new page. Only Name +
 *  Category are collected here; timezone defaults to UTC and the rest can be
 *  filled in later from the establishment's own page. */
function InlineAddBusinessForm({
  action,
  error,
  fieldErrors,
  onCancel,
}: {
  action: (formData: FormData) => void;
  error: string | null;
  fieldErrors?: Partial<Record<string, string>>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState("");

  return (
    <form action={action} className="af">
      <input type="hidden" name="timezone" value="UTC" />
      <input type="hidden" name="category" value={category} />

      {error && (
        <div role="alert" className="af-error">
          <strong>Couldn&rsquo;t add that business.</strong>
          {error}
        </div>
      )}

      <label className="af-field">
        <span className="af-label">Business name</span>
        <input
          type="text"
          name="name"
          required
          placeholder="Acme Coffee Downtown"
          autoComplete="off"
          aria-invalid={!!fieldErrors?.name}
          className="af-input"
        />
      </label>

      {/* biome-ignore lint/a11y/noLabelWithoutControl: CategorySelect renders a real <button> descendant at render time (just nested through a child component, which static analysis can't see), so label-click delegation still works */}
      <label className="af-field">
        <span className="af-label">
          Category <span className="af-opt">Optional</span>
        </span>
        <CategorySelect value={category} onChange={setCategory} />
      </label>

      <div className="af-actions">
        <button type="button" className="af-cancel" onClick={onCancel}>
          Cancel
        </button>
        <AddBusinessSubmitButton />
      </div>
    </form>
  );
}

function AddBusinessSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="af-submit" disabled={pending}>
      <Icon name="plus" size={13} />
      {pending ? "Adding…" : "Add business"}
    </button>
  );
}

/** Custom category combobox — matches the same styled trigger + fixed-position
 *  popup used for the "Connect a device" modal's category field, instead of a
 *  native `<select>`'s plain OS-rendered options list, so the two "add a
 *  business" flows read as one consistent dropdown across the app. The
 *  trigger reuses `.af-select`'s own look (border, radius, chevron) — only
 *  the options popup needed swapping. Submits via the hidden `category` input
 *  the parent form already renders. */
function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (category: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  function toggleOpen() {
    if (!open) {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 8, left: r.left, width: r.width });
    }
    setOpen((o) => !o);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        className="af-select af-combo__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Category"
        onClick={toggleOpen}
      >
        <span className={`af-combo__label${value ? "" : " af-combo__label--placeholder"}`}>
          {value || "Select a category"}
        </span>
      </button>

      {open && rect && (
        <div
          className="af-combo__list"
          role="listbox"
          aria-label="Category"
          tabIndex={-1}
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            className={`af-combo__opt${value === "" ? " is-sel" : ""}`}
            onClick={() => choose("")}
          >
            <span className="af-combo__opttext af-combo__opttext--muted">None</span>
          </button>
          {CATEGORY_OPTIONS.map((c) => {
            const isSel = c === value;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={isSel}
                className={`af-combo__opt${isSel ? " is-sel" : ""}`}
                onClick={() => choose(c)}
              >
                <span className="af-combo__opttext">{c}</span>
                {isSel && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
