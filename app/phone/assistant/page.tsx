import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveAssistantConfig } from "@/lib/phone/actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const VOICES = [
  { id: "alice", label: "Alice (en-US, female, classic Twilio)" },
  { id: "Polly.Joanna", label: "Polly Joanna (en-US, female, natural)" },
  { id: "Polly.Matthew", label: "Polly Matthew (en-US, male, natural)" },
  { id: "Polly.Amy", label: "Polly Amy (en-GB, female)" },
  { id: "Polly.Brian", label: "Polly Brian (en-GB, male)" },
  { id: "Polly.Aditi", label: "Polly Aditi (en-IN, female)" },
];

const LANGUAGES = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["en-AU", "English (AU)"],
  ["en-IN", "English (India)"],
  ["es-US", "Spanish (US)"],
  ["es-ES", "Spanish (Spain)"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
] as const;

export default async function AssistantConfigPage() {
  const { orgId } = await getOrgContext();

  const assistant = await withTenant(orgId, async (tx) =>
    tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
  );

  return (
    <AppShellServer topBar={<TopBar title="Phone assistant config" />}>
      <PageHeader
        title="Phone assistant config"
        description="How your AI receptionist sounds and behaves."
        breadcrumb={[{"label":"AI Phone","href":"/phone"},{"label":"Assistant"}]}
      />

        
      <div className="space-y-6">
<form action={saveAssistantConfig} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Greeting + voice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Greeting message</span>
                <textarea
                  name="greeting"
                  required
                  rows={3}
                  minLength={5}
                  maxLength={500}
                  defaultValue={assistant?.greeting ?? "Hi, thanks for calling. How can I help you today?"}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  This is the first thing every caller hears.
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Voice</span>
                  <select
                    name="voice"
                    defaultValue={assistant?.voice ?? "alice"}
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Language</span>
                  <select
                    name="language"
                    defaultValue={assistant?.language ?? "en-US"}
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    {LANGUAGES.map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Behavior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Max turns per call</span>
                  <input
                    type="number"
                    name="maxTurns"
                    min={2}
                    max={30}
                    defaultValue={assistant?.maxTurns ?? 12}
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Hard cap on back-and-forth. After this, AI summarizes + ends.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Handoff phone number</span>
                  <input
                    name="handoffNumber"
                    defaultValue={assistant?.handoffNumber ?? ""}
                    placeholder="+1 555 123 4567"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    When caller asks for a human, forward to this number.
                  </span>
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium">End-call phrases</span>
                <input
                  name="endCallPhrases"
                  defaultValue={(assistant?.endCallPhrases ?? ["goodbye", "bye now", "have a good day", "hang up"]).join(", ")}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Comma-separated. When the caller says any of these, AI may wrap up.
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Handoff trigger phrases</span>
                <input
                  name="handoffPhrases"
                  defaultValue={(assistant?.handoffPhrases ?? ["speak to a human", "representative", "manager"]).join(", ")}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Caller intent words that trigger an immediate human handoff.
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custom instructions</CardTitle>
              <CardDescription>
                Layered on top of your <Link href="/ai/training" className="text-primary hover:underline">AI training profile</Link>.
                Use this for phone-specific guidance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                name="customInstructions"
                rows={6}
                maxLength={3000}
                defaultValue={assistant?.customInstructions ?? ""}
                placeholder={`Always ask for the caller's name first if they haven't given it.\n\nIf they're asking about a refund, immediately transfer them — don't try to handle it.\n\nIf the call lasts more than 5 minutes, suggest they email us at support@example.com.`}
                className="w-full rounded-md border border-input px-3 py-2 text-sm font-mono"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enable / disable</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={assistant?.enabled ?? false}
                  className="mt-1"
                />
                <span>
                  <strong>Enable AI receptionist on all configured numbers.</strong>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    If disabled, incoming calls go straight to the forward-to number (or play a message).
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Save configuration</Button>
          </div>
        </form>
      </div>
    </AppShellServer>
  );
}
