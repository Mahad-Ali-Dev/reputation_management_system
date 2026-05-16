"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateRequestBody } from "@/lib/outreach/ai-generate";
import { createReviewRequest } from "@/lib/outreach/actions";

type Establishment = { id: string; name: string };

export function SendOneOffForm({
  establishments,
  businessName,
  logoUrl,
}: {
  establishments: Establishment[];
  businessName: string;
  logoUrl: string | null;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [greeting, setGreeting] = useState("Hi {{customerName}},");
  const [body, setBody] = useState(
    `We'd love to hear your feedback on your recent experience with ${businessName}!\n\nLeave a review: {{reviewLink}}`,
  );
  const [tone, setTone] = useState<"friendly" | "formal" | "brief" | "warm" | "playful">("friendly");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? "");
  const [scheduleHours, setScheduleHours] = useState(0);
  const [consentAttested, setConsentAttested] = useState(false);

  const [aiPending, startAiTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const previewName = customerName || "Customer";
  const filled = (s: string) =>
    s
      .replaceAll("{{customerName}}", previewName)
      .replaceAll("{{businessName}}", businessName)
      .replaceAll("{{reviewLink}}", "https://g.page/r/your-review-link");

  function handleGenerateAI() {
    setError(null);
    const channel = sendEmail ? "email" : "sms";
    const fd = new FormData();
    fd.set("channel", channel);
    fd.set("tone", tone);
    startAiTransition(async () => {
      try {
        const result = await generateRequestBody(fd);
        // Strip greeting line if AI included it
        setBody(result.body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI generation failed");
      }
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sendEmail && !sendSms) {
      setError("Pick at least one delivery channel.");
      return;
    }
    if (sendEmail && !customerEmail.trim()) {
      setError("Email channel requires an email address.");
      return;
    }
    if (sendSms && !customerPhone.trim()) {
      setError("SMS channel requires a phone number.");
      return;
    }
    if (sendSms && !consentAttested) {
      setError("SMS requires TCPA consent attestation.");
      return;
    }

    startSendTransition(async () => {
      try {
        // Send via each channel separately (server action expects one channel per call)
        const tasks: Array<Promise<void>> = [];
        const fullBody = `${greeting}\n\n${body}`;

        if (sendEmail) {
          const fd = new FormData();
          fd.set("establishmentId", establishmentId);
          fd.set("channel", "email");
          fd.set("recipient", customerEmail);
          if (customerName) fd.set("recipientName", customerName);
          fd.set("scheduleHours", scheduleHours.toString());
          fd.set("customBody", fullBody);
          tasks.push(createReviewRequest(fd));
        }
        if (sendSms) {
          const fd = new FormData();
          fd.set("establishmentId", establishmentId);
          fd.set("channel", "sms");
          fd.set("recipient", customerPhone);
          if (customerName) fd.set("recipientName", customerName);
          fd.set("scheduleHours", scheduleHours.toString());
          fd.set("customBody", fullBody);
          fd.set("consentAttested", "on");
          tasks.push(createReviewRequest(fd));
        }

        await Promise.all(tasks);
        setSuccess(`Sent! Customer will receive ${sendEmail && sendSms ? "both messages" : sendEmail ? "an email" : "an SMS"} ${scheduleHours > 0 ? `in ${scheduleHours}h` : "now"}.`);
        setCustomerName("");
        setCustomerPhone("");
        setCustomerEmail("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send failed");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: form */}
      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">1. Contact info</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm col-span-2">
              <span className="font-medium">Customer name</span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Phone (E.164)</span>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Email</span>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">2. Message</h3>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Greeting</span>
              <input
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Body</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
                className="rounded-md border border-input px-2 py-1 text-xs"
              >
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="brief">Brief</option>
                <option value="warm">Warm</option>
                <option value="playful">Playful</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={aiPending}
                onClick={handleGenerateAI}
              >
                {aiPending ? "Generating…" : "✨ Generate with AI"}
              </Button>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">3. Delivery</h3>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Send via Email
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              Send via SMS
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">4. Routing</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium">Business location</span>
              <select
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              >
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Send timing</span>
              <select
                value={scheduleHours}
                onChange={(e) => setScheduleHours(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              >
                <option value={0}>Now</option>
                <option value={1}>In 1 hour</option>
                <option value={24}>In 1 day</option>
                <option value={72}>In 3 days</option>
                <option value={168}>In 1 week</option>
              </select>
            </label>
          </div>
        </div>

        {sendSms && (
          <label className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3">
            <input type="checkbox" checked={consentAttested} onChange={(e) => setConsentAttested(e.target.checked)} className="mt-0.5" />
            <span>
              I attest this recipient has previously given written consent to receive marketing SMS from my business (TCPA / A2P 10DLC compliance).
            </span>
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-700">{success}</p>}

        <Button type="submit" disabled={sendPending}>
          {sendPending ? "Sending…" : "Send"}
        </Button>
      </form>

      {/* Right: live preview */}
      <div className="space-y-4">
        <div className="rounded-lg border bg-white">
          <div className="border-b px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            Email preview
          </div>
          <div className="p-4">
            <div className="text-xs text-muted-foreground mb-2">
              <strong>From:</strong> {businessName}
              <br />
              <strong>To:</strong> {customerEmail || "customer@example.com"}
              <br />
              <strong>Subject:</strong> How was your experience at {businessName}?
            </div>
            <hr className="my-3" />
            <div className="font-sans text-sm space-y-2">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-12 mb-2" />
              )}
              <p className="font-semibold text-slate-900">{filled(greeting)}</p>
              <div className="whitespace-pre-wrap text-slate-700">{filled(body)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white">
          <div className="border-b px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            SMS preview (logos not supported)
          </div>
          <div className="p-4">
            <div className="text-xs text-muted-foreground mb-2">
              <strong>To:</strong> {customerPhone || "+1 555 123 4567"}
            </div>
            <div className="rounded-md bg-emerald-50 p-3 text-sm whitespace-pre-wrap">
              {filled(greeting)}
              {"\n"}
              {filled(body)}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Reply STOP to opt out. SMS includes our standard unsubscribe footer automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
