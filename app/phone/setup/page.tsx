import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { registerPhoneNumber } from "@/lib/phone/actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function PhoneSetupPage() {
  const { orgId } = await getOrgContext();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const voiceWebhookUrl = `${appUrl}/api/voice/incoming`;
  const statusCallbackUrl = `${appUrl}/api/voice/status`;

  return (
    <AppShellServer topBar={<TopBar title="Phone number setup" />}>
      <PageHeader
        title="Phone number setup"
        description="Connect a Twilio number to start receiving calls."
        breadcrumb={[{"label":"AI Phone","href":"/phone"},{"label":"Setup"}]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1 — Buy a number in Twilio</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>1. Go to <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/search" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Twilio Console → Phone Numbers → Buy</a></p>
            <p>2. Pick a number with <strong>Voice</strong> capability (SMS optional).</p>
            <p>3. After purchase, open the number's <strong>Configure</strong> page.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2 — Configure webhooks</CardTitle>
            <CardDescription>Paste these URLs into Twilio's number config.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <div>
              <span className="text-xs font-medium uppercase text-muted-foreground">A call comes in (Webhook)</span>
              <div className="mt-1 rounded-md bg-slate-900 text-slate-100 px-3 py-2 text-xs font-mono break-all">
                {voiceWebhookUrl}
              </div>
              <span className="text-xs text-muted-foreground">Method: POST</span>
            </div>
            <div>
              <span className="text-xs font-medium uppercase text-muted-foreground">Call status changes (Status Callback)</span>
              <div className="mt-1 rounded-md bg-slate-900 text-slate-100 px-3 py-2 text-xs font-mono break-all">
                {statusCallbackUrl}
              </div>
              <span className="text-xs text-muted-foreground">Method: POST · Events: completed, no-answer, busy, failed</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 3 — Register the number here</CardTitle>
            <CardDescription>From the Twilio number's <strong>Properties</strong> page.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={registerPhoneNumber} className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Phone number (E.164)</span>
                <input
                  name="phoneE164"
                  required
                  pattern="^\+[1-9][0-9]{1,14}$"
                  placeholder="+15551234567"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Twilio SID (starts with PN)</span>
                <input
                  name="twilioSid"
                  required
                  placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Friendly name (optional)</span>
                <input
                  name="friendlyName"
                  placeholder="Main line · Springfield"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Handoff to (optional)</span>
                <input
                  name="forwardToE164"
                  placeholder="+1 555 999 8888"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm font-mono"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Forward calls here when the AI is disabled or after handoff.
                </span>
              </label>
              <Button type="submit">Register number</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 4 — Configure the AI assistant</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="mb-3">
              Set the greeting, voice, and behavior on the{" "}
              <Link href="/phone/assistant" className="text-primary hover:underline">assistant config page</Link>.
              Enable it when you're ready for the AI to start answering.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
