import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteClonedVoice,
  revertToTwilioVoice,
  setActiveVoice,
  uploadAndCloneVoice,
} from "@/lib/phone/voice-actions";
import { isElevenLabsConfigured } from "@/lib/phone/elevenlabs";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function PhoneVoicesPage() {
  const { orgId } = await getOrgContext();

  const [voices, assistant] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.phoneVoice.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      }),
      tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
    ]),
  );

  const configured = isElevenLabsConfigured();
  const activeVoiceId = assistant?.elevenlabsVoiceId;

  return (
    <AppShellServer topBar={<TopBar title="Voice cloning" />}>
      <PageHeader
        title="Voice cloning"
        description="Replace stock voices with a custom ElevenLabs clone."
        breadcrumb={[{"label":"AI Phone","href":"/phone"},{"label":"Voices"}]}
      />

        
      <div className="space-y-6">
{!configured && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-base text-amber-900">ElevenLabs not configured</CardTitle>
              <CardDescription className="text-amber-800">
                Add <code className="bg-amber-100 px-1.5 py-0.5 rounded">ELEVENLABS_API_KEY</code> to your environment
                variables. Get a key at{" "}
                <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline">
                  elevenlabs.io/app/settings/api-keys
                </a>.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Active voice: {assistant?.voiceProvider === "elevenlabs" ? "ElevenLabs clone" : "Twilio (stock)"}
            </CardTitle>
            <CardDescription>
              {assistant?.voiceProvider === "elevenlabs"
                ? `Using cloned voice ${voices.find((v) => v.externalVoiceId === activeVoiceId)?.displayName ?? "(unknown)"}.`
                : `Using Twilio's built-in voice "${assistant?.voice ?? "alice"}". Stable and instant — no latency.`}
            </CardDescription>
          </CardHeader>
          {assistant?.voiceProvider === "elevenlabs" && (
            <CardContent>
              <form action={revertToTwilioVoice}>
                <Button type="submit" variant="outline" size="sm">
                  Revert to Twilio stock voice
                </Button>
              </form>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clone a new voice</CardTitle>
            <CardDescription>
              Upload 30–90 seconds of clean speech. WAV, MP3, OGG, or FLAC up to 10 MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={uploadAndCloneVoice} className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Display name</span>
                <input
                  name="displayName"
                  required
                  maxLength={120}
                  placeholder="Owner — Sarah"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Description (optional)</span>
                <input
                  name="description"
                  maxLength={500}
                  placeholder="Female · 30s · warm and professional"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Audio sample</span>
                <input
                  type="file"
                  name="audioSample"
                  accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/flac,audio/x-wav"
                  required
                  className="mt-1 block w-full text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Clean speech, single speaker, no music. 30–90 seconds. Max 10 MB.
                </span>
              </label>
              <Button type="submit" disabled={!configured}>
                Clone voice
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your cloned voices ({voices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {voices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cloned voices yet.</p>
            ) : (
              <ul className="space-y-2">
                {voices.map((v) => {
                  const isActive = v.externalVoiceId === activeVoiceId;
                  return (
                    <li key={v.id} className="rounded-md border bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{v.displayName}</span>
                            {isActive && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          {v.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                          )}
                          {v.previewAudioUrl && (
                            <audio controls className="mt-2 h-8 w-full max-w-md">
                              <source src={v.previewAudioUrl} type="audio/mpeg" />
                            </audio>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {!isActive && (
                            <form action={setActiveVoice}>
                              <input type="hidden" name="voiceId" value={v.externalVoiceId} />
                              <Button type="submit" size="sm" variant="outline">
                                Use this
                              </Button>
                            </form>
                          )}
                          <form action={deleteClonedVoice}>
                            <input type="hidden" name="voiceRecordId" value={v.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Delete
                            </Button>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-100">
          <CardHeader>
            <CardTitle className="text-base">Performance note</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-slate-700">
            <p>
              <strong>Twilio &lt;Say&gt;</strong> renders instantly (zero latency) but uses stock voices.
            </p>
            <p>
              <strong>ElevenLabs &lt;Play&gt;</strong> takes 1–2s per response to synthesize the audio, then plays it.
              Total turn latency goes from ~1.5s to ~3s. Cached after first generation for the same phrase.
            </p>
            <p>
              For high-volume call centers, Phase-2 streaming TTS (Twilio Media Streams + ElevenLabs WebSocket)
              brings latency back under 500ms. Not implemented yet.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
