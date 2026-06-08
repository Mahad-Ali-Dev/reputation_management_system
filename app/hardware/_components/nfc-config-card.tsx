"use client";

/**
 * My Devices — NFC config card (client island), Module 04 hardware addendum.
 *
 * Shown in place of (or alongside) the QR download panel when a device's
 * `productKind` is an NFC kind ('nfc', 'wifi', 'multi_platform'). It surfaces
 * everything an operator needs to program a physical NFC chip:
 *
 *   1. The encode payload — the `/r/<slug>` scan URL to write to the chip as an
 *      NDEF "URI" record — with a one-tap Copy button.
 *   2. Step-by-step "How to write this to an NFC card" guidance (phone-based,
 *      using a free NFC writer app).
 *   3. A field to record the chip's physical UID (inventory bookkeeping) that
 *      posts to the co-located `recordNfcUid` server action.
 *
 * RSC SAFETY: this is a small client island purely for the copy-to-clipboard
 * interaction + the controlled UID input. The encode URL, slug, current UID,
 * and the server action are all computed server-side and passed in as plain
 * serializable props. Reuses the v3 `.ds-card` / `.btn` / `.chip` primitives —
 * no new CSS.
 *
 * The chip UID is NOT sensitive and NOT part of the scan path (taps resolve by
 * slug through `/r/[slug]`, identical to the QR), so recording it never affects
 * routing — it's only "which tag is this".
 */

import { Icon } from "@/components/shell/icon";
import { useState } from "react";

type NfcKind = "nfc" | "wifi" | "multi_platform" | string;

const KIND_COPY: Record<
  string,
  { label: string; lede: string; payloadLabel: string }
> = {
  nfc: {
    label: "NFC card",
    lede: "Tap-to-review NFC chip. Write the URL below to the chip and a guest's phone opens your review page on tap — no app needed.",
    payloadLabel: "URL to write to the chip",
  },
  wifi: {
    label: "WiFi + review card",
    lede: "Dual-purpose NFC card. Write the review URL below to the chip's NDEF record so a tap opens your review page. (WiFi credentials, if any, are programmed separately by the supplier.)",
    payloadLabel: "URL to write to the chip",
  },
  multi_platform: {
    label: "Multi-platform NFC",
    lede: "Tap-to-choose NFC chip. Write the URL below to the chip — a tap opens the “where would you like to review?” picker page.",
    payloadLabel: "URL to write to the chip",
  },
};

function kindCopy(kind: NfcKind) {
  return KIND_COPY[kind] ?? KIND_COPY.nfc!;
}

export function NfcConfigCard({
  deviceId,
  productKind,
  encodeUrl,
  slug,
  currentNfcUid,
  deviceTitle,
  recordNfcUidAction,
  saveStatus,
}: {
  deviceId: string;
  productKind: NfcKind;
  /** The `/r/<slug>` URL to write to the chip (NDEF URI record). */
  encodeUrl: string;
  slug: string;
  currentNfcUid: string | null;
  /** Friendly device label, e.g. "Counter Card". */
  deviceTitle: string;
  recordNfcUidAction: (formData: FormData) => void | Promise<void>;
  /** Result of the last UID save, surfaced via ?nfc= query param. */
  saveStatus?: "saved" | "duplicate" | "bad_uid" | "not_found" | "unavailable" | "error" | null;
}) {
  const copy = kindCopy(productKind);
  const [copied, setCopied] = useState(false);
  const [uid, setUid] = useState(currentNfcUid ?? "");

  return (
    <div className="ds-card" style={{ padding: 18 }}>
      <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 4 }}>
        <span
          aria-hidden
          style={{
            display: "grid",
            placeItems: "center",
            width: 30,
            height: 30,
            flex: "0 0 30px",
            borderRadius: 8,
            background: "var(--pri-50)",
            color: "var(--pri)",
          }}
        >
          <Icon name="smartphone" size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 className="ds-card__title" style={{ margin: 0 }}>
            NFC for {slug}
          </h3>
          <div className="ds-card__sub" style={{ margin: 0 }}>
            {deviceTitle} ·{" "}
            <span className="chip" style={{ height: 18, fontSize: 10.5, verticalAlign: "middle" }}>
              {copy.label}
            </span>
          </div>
        </div>
      </div>

      <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 8, marginBottom: 14 }}>
        {copy.lede}
      </p>

      {/* ── Encode payload + copy ─────────────────────────────────────────── */}
      <div className="lbl-mono" style={{ marginBottom: 6 }}>
        {copy.payloadLabel}
      </div>
      <div
        className="mono"
        style={{
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
          lineHeight: 1.5,
          wordBreak: "break-all",
          position: "relative",
          paddingRight: 84,
        }}
      >
        {encodeUrl}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(encodeUrl).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              },
              () => {},
            );
          }}
          className="btn btn--sm"
          style={{ position: "absolute", top: 8, right: 8 }}
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="dim" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
        Write this as an NDEF <strong>URI</strong> record. A tap and a QR scan both resolve through
        the same link, so analytics and the destination stay in sync.
      </div>

      {/* ── How-to guidance ───────────────────────────────────────────────── */}
      <details style={{ marginTop: 16 }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            listStyle: "none",
          }}
        >
          <Icon name="info" size={13} style={{ color: "var(--pri)" }} />
          How to write this to an NFC card
        </summary>
        <ol
          style={{
            margin: "10px 0 0",
            paddingLeft: 20,
            fontSize: 12.5,
            lineHeight: 1.7,
            color: "var(--ink-2)",
          }}
        >
          <li>
            On an NFC-capable phone, install a free writer app — e.g.{" "}
            <strong>NFC Tools</strong> (iOS/Android) or <strong>NXP TagWriter</strong> (Android).
          </li>
          <li>
            In the app choose <strong>Write</strong> → <strong>Add a record</strong> →{" "}
            <strong>URL / URI</strong>.
          </li>
          <li>
            Paste the URL above (use the <strong>Copy</strong> button), then tap{" "}
            <strong>Write</strong> and hold the phone to the blank NFC chip until it confirms.
          </li>
          <li>
            Test it: tap any phone to the chip — your review page should open. Optionally{" "}
            <strong>lock</strong> the tag in the app to make it read-only.
          </li>
        </ol>
        <p className="dim" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
          Most chips ship blank so you can program them in seconds. Pre-encoded chips from our store
          already point here — no writing needed.
        </p>
      </details>

      {/* ── Record chip UID ───────────────────────────────────────────────── */}
      <div className="divider" style={{ margin: "16px 0" }} />
      <form action={recordNfcUidAction} className="col" style={{ gap: 8 }}>
        <input type="hidden" name="deviceId" value={deviceId} />
        <label className="lbl-mono" htmlFor={`nfc-uid-${deviceId}`} style={{ marginBottom: 0 }}>
          Chip UID (optional)
        </label>
        <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 2 }}>
          The chip&rsquo;s hardware serial (shown by your writer app after a scan). Recording it lets
          you match a physical tag to this device later — it doesn&rsquo;t change where taps route.
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            id={`nfc-uid-${deviceId}`}
            name="nfcUid"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="04:A2:1B:5C:6D:7E:8F"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            maxLength={64}
            className="mono"
            style={{
              flex: 1,
              minWidth: 200,
              height: 40,
              padding: "0 12px",
              borderRadius: "var(--r)",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              outline: "none",
            }}
          />
          <button
            type="submit"
            className="btn btn--pri"
            style={{ justifyContent: "center" }}
            disabled={(uid.trim() || null) === (currentNfcUid ?? null)}
          >
            <Icon name="check" size={12} />
            {currentNfcUid && uid.trim().length === 0 ? "Clear UID" : "Save UID"}
          </button>
        </div>
        <SaveStatusLine status={saveStatus} />
      </form>
    </div>
  );
}

function SaveStatusLine({
  status,
}: {
  status?: "saved" | "duplicate" | "bad_uid" | "not_found" | "unavailable" | "error" | null;
}) {
  if (!status) return null;
  const map: Record<string, { tone: "ok" | "bad"; text: string }> = {
    saved: { tone: "ok", text: "Chip UID saved." },
    duplicate: { tone: "bad", text: "That UID is already recorded on another device." },
    bad_uid: { tone: "bad", text: "That doesn't look like a valid chip UID (use hex bytes)." },
    not_found: { tone: "bad", text: "Device not found." },
    unavailable: { tone: "bad", text: "UID recording isn't available in this environment yet." },
    error: { tone: "bad", text: "Couldn't save the UID. Please try again." },
  };
  const entry = map[status];
  if (!entry) return null;
  return (
    <div
      role="status"
      className="row"
      style={{
        gap: 6,
        fontSize: 12,
        marginTop: 2,
        color: entry.tone === "ok" ? "var(--ok)" : "var(--bad)",
      }}
    >
      <Icon name={entry.tone === "ok" ? "check" : "alert"} size={12} />
      {entry.text}
    </div>
  );
}
