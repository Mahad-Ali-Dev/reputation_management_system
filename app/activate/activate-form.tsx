"use client";

import { Icon } from "@/components/shell/icon";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import { parseSlug } from "@/lib/hardware/slug";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
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

  const shownSlug = parseSlug(qrLink);
  const confirmed = !!detectedQrUrl && !manualOpen;

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

  return (
    <form action={formAction} className="af">
      {deviceState === "yours" && detectedSlug && (
        <div className="af-banner af-banner--ok">
          <strong>
            QR <code>{detectedSlug}</code> is already active on your account
          </strong>
          Nothing to do here — you can change where it points from{" "}
          <Link href="/hardware">My devices</Link>. To set up a different stand, use the link below.
        </div>
      )}

      {deviceState === "unavailable" && detectedSlug && (
        <div className="af-banner af-banner--warn">
          <strong>
            We don&rsquo;t recognize QR <code>{detectedSlug}</code>
          </strong>
          It may already belong to another business. Check the link matches the one printed on your
          stand, or contact support.
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
            <div className="af-scan">
              <span className="af-scan__tile" aria-hidden>
                <Icon name="qr" size={22} />
              </span>
              <div className="af-scan__body">
                <div className="af-scan__t">Scan your stand&rsquo;s QR with your phone</div>
                <div className="af-scan__d">
                  Open the link it lands on and we&rsquo;ll identify your stand automatically —
                  nothing to type here.
                </div>
              </div>
            </div>
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
          defaultValue={establishments[0]?.id}
          className="af-select"
        >
          {establishments.map((e) => (
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
          automatically from your business — you can always change it later via Edit on the QR card.
        </span>
      </label>

      <div className="af-actions">
        <Link href="/hardware" className="af-cancel">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
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
