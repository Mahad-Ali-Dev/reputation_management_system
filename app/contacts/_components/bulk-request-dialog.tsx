"use client";

import { Icon } from "@/components/shell/icon";
import { generateRequestBody } from "@/lib/outreach/ai-generate";
import { bulkSendReviewRequest } from "@/lib/contacts/actions";
import { useState, useTransition } from "react";
import { Modal } from "./modal";

/**
 * Bulk Send Review Request composer (client). Reuses the greeting/body
 * `{{token}}` textarea + tone + AI-generate (`lib/outreach/ai-generate`) +
 * establishment select + scheduleHours + TCPA-consent attestation pattern from
 * `app/outreach/send/form.tsx`. On submit calls `bulkSendReviewRequest` which is
 * Pro-gated server-side (`assertEntitled`) and fans out to `createReviewRequest`
 * with suppression/consent handled per-recipient.
 */

type Tone = "friendly" | "formal" | "brief" | "warm" | "playful";

export function BulkRequestDialog({
  open,
  onClose,
  onDone,
  selectedIds,
  selectionCount,
  establishments,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  selectedIds: string[];
  selectionCount: number;
  establishments: { id: string; name: string }[];
}) {
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [greeting, setGreeting] = useState("Hi {{customerName}},");
  const [body, setBody] = useState(
    "We'd love to hear about your recent experience! It only takes a moment.\n\nLeave a review: {{reviewLink}}",
  );
  const [tone, setTone] = useState<Tone>("friendly");
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? "");
  const [scheduleHours, setScheduleHours] = useState(0);
  const [consentAttested, setConsentAttested] = useState(false);

  const [aiPending, startAi] = useTransition();
  const [sendPending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function handleAi() {
    setError(null);
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("tone", tone);
    startAi(async () => {
      try {
        const r = await generateRequestBody(fd);
        setBody(r.body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI generation failed");
      }
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!establishmentId) {
      setError("Pick a business location.");
      return;
    }
    if (channel === "sms" && !consentAttested) {
      setError("SMS requires TCPA consent attestation.");
      return;
    }

    const fd = new FormData();
    fd.set("contactIds", selectedIds.join(","));
    fd.set("channel", channel);
    fd.set("establishmentId", establishmentId);
    fd.set("customBody", `${greeting}\n\n${body}`);
    fd.set("scheduleHours", String(scheduleHours));
    if (channel === "sms") fd.set("consentAttested", "on");

    startSend(async () => {
      try {
        const r = await bulkSendReviewRequest(fd);
        const dropped = r.skipped + r.failed;
        setResult(
          `Queued ${r.sent} request${r.sent === 1 ? "" : "s"}` +
            (dropped > 0 ? ` · skipped ${dropped} (no ${channel} / unsubscribed / recently contacted)` : "") +
            ".",
        );
        // Give the operator a moment to read the summary, then close.
        setTimeout(onDone, 1400);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed");
      }
    });
  }

  if (!open) return null;

  return (
    <Modal title={`Send review request · ${selectionCount} contact${selectionCount === 1 ? "" : "s"}`} onClose={onClose} width={560}>
      <form onSubmit={handleSend}>
        <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Channel */}
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            <button
              type="button"
              className={`seg__t${channel === "email" ? " is-active" : ""}`}
              onClick={() => setChannel("email")}
            >
              <Icon name="mail" size={13} />
              Email
            </button>
            <button
              type="button"
              className={`seg__t${channel === "sms" ? " is-active" : ""}`}
              onClick={() => setChannel("sms")}
            >
              <Icon name="smartphone" size={13} />
              SMS
            </button>
          </div>

          <label style={{ display: "block" }}>
            <span className="lbl">Greeting</span>
            <input className="ds-input" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          </label>

          <label style={{ display: "block" }}>
            <span className="lbl">
              Message
              <span className="dim" style={{ fontWeight: 400, marginLeft: 6 }}>
                {"{{customerName}}"}, {"{{businessName}}"}, {"{{reviewLink}}"}
              </span>
            </span>
            <textarea className="ds-textarea" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="ds-select" style={{ height: 32, width: "auto" }} value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="brief">Brief</option>
              <option value="warm">Warm</option>
              <option value="playful">Playful</option>
            </select>
            <button type="button" className="btn btn--sm" disabled={aiPending} onClick={handleAi}>
              <Icon name="sparkle" size={13} />
              {aiPending ? "Generating…" : "Generate with AI"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "block" }}>
              <span className="lbl">Business location</span>
              <select className="ds-select" value={establishmentId} onChange={(e) => setEstablishmentId(e.target.value)} required>
                {establishments.length === 0 && <option value="">No locations</option>}
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span className="lbl">Send timing</span>
              <select className="ds-select" value={scheduleHours} onChange={(e) => setScheduleHours(Number(e.target.value))}>
                <option value={0}>Now</option>
                <option value={1}>In 1 hour</option>
                <option value={24}>In 1 day</option>
                <option value={72}>In 3 days</option>
                <option value={168}>In 1 week</option>
              </select>
            </label>
          </div>

          {channel === "sms" && (
            <label
              className="row"
              style={{ gap: 8, alignItems: "flex-start", fontSize: 12, background: "var(--warn-soft)", color: "#92400e", padding: 10, borderRadius: "var(--r)" }}
            >
              <input type="checkbox" checked={consentAttested} onChange={(e) => setConsentAttested(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                I attest each recipient has previously given written consent to receive marketing SMS
                (TCPA / A2P 10DLC). Unsubscribed + recently-contacted recipients are skipped automatically.
              </span>
            </label>
          )}

          {error && (
            <p className="chip chip--bad" style={{ display: "inline-flex" }} role="alert">
              {error}
            </p>
          )}
          {result && (
            <p className="chip chip--ok" style={{ display: "inline-flex" }} role="status">
              {result}
            </p>
          )}
        </div>

        <div className="ds-card__head" style={{ borderTop: "1px solid var(--line)", borderBottom: "none", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn--sm" onClick={onClose} disabled={sendPending}>
            Cancel
          </button>
          <button type="submit" className="btn btn--pri btn--sm" disabled={sendPending || !!result}>
            {sendPending ? "Sending…" : `Send to ${selectionCount}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
