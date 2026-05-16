import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import {
  createOutboundCampaign,
  deleteCampaign,
  pauseCampaign,
  startCampaign,
} from "@/lib/phone/campaign-actions";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { orgId } = await getOrgContext();

  const [campaigns, phoneNumbers] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.phoneCampaign.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      tx.phoneNumber.findMany({
        where: { status: "active" },
        select: { id: true, phoneE164: true, friendlyName: true },
      }),
    ]),
  );

  return (
    <AppShellServer topBar={<TopBar title="Outbound campaigns" />}>
      <PageHeader
        title="Outbound campaigns"
        description="AI-powered review request, NPS survey, and win-back calls."
        breadcrumb={[{"label":"AI Phone","href":"/phone"},{"label":"Campaigns"}]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-lg">New campaign</CardTitle>
            <CardDescription>Upload phone numbers, pick a script, schedule.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createOutboundCampaign} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Campaign name</span>
                  <input
                    name="name"
                    required
                    maxLength={120}
                    placeholder="January review-request blitz"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Purpose</span>
                  <select
                    name="purpose"
                    required
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  >
                    <option value="review_request">Review request</option>
                    <option value="nps_survey">NPS survey</option>
                    <option value="win_back">Win-back</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="font-medium">Calling from (Twilio number)</span>
                <select
                  name="phoneNumberId"
                  required
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                >
                  {phoneNumbers.length === 0 ? (
                    <option disabled>No numbers — add one at /phone/setup</option>
                  ) : (
                    phoneNumbers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.phoneE164} {p.friendlyName ? `· ${p.friendlyName}` : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block text-sm">
                <span className="font-medium">Opening script (optional)</span>
                <textarea
                  name="script"
                  rows={3}
                  maxLength={2000}
                  placeholder="Leave blank for a default script based on purpose."
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Call window start</span>
                  <input
                    type="time"
                    name="callWindowStart"
                    defaultValue="09:00"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">End</span>
                  <input
                    type="time"
                    name="callWindowEnd"
                    defaultValue="20:00"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Calls/minute</span>
                  <input
                    type="number"
                    name="ratePerMinute"
                    min={1}
                    max={50}
                    defaultValue={5}
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="font-medium">Recipients (CSV)</span>
                <textarea
                  name="csvText"
                  required
                  rows={6}
                  placeholder={`phone,name\n+15551234567,Alice\n+15559876543,Bob`}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
                />
              </label>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>TCPA compliance.</strong> You must attest each recipient has given prior express
                written consent to receive marketing calls. We record this attestation timestamp on
                every target row for audit purposes.
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="consentAttested" className="mt-1" />
                <span>I attest every recipient has given prior consent.</span>
              </label>

              <Button type="submit">Create campaign (draft)</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Campaigns ({campaigns.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              <ul className="space-y-3">
                {campaigns.map((c) => (
                  <li key={c.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {c.purpose.replace(/_/g, " ")} · {c.completedTargets}/{c.totalTargets} completed · {c.failedTargets} failed
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                            c.status === "running"
                              ? "bg-emerald-50 text-emerald-700"
                              : c.status === "paused"
                                ? "bg-amber-50 text-amber-700"
                                : c.status === "completed"
                                  ? "bg-slate-100 text-slate-700"
                                  : c.status === "failed"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {c.status}
                        </span>
                        {c.status === "draft" && (
                          <form action={startCampaign}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button type="submit" size="sm">Start</Button>
                          </form>
                        )}
                        {c.status === "running" && (
                          <form action={pauseCampaign}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button type="submit" size="sm" variant="outline">Pause</Button>
                          </form>
                        )}
                        {c.status === "paused" && (
                          <form action={startCampaign}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button type="submit" size="sm">Resume</Button>
                          </form>
                        )}
                        {(c.status === "draft" || c.status === "completed" || c.status === "failed") && (
                          <form action={deleteCampaign}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button type="submit" size="sm" variant="ghost">Delete</Button>
                          </form>
                        )}
                      </div>
                    </div>
                    {c.callWindowTimezone && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Call window: {c.callWindowTimezone}, {new Date(c.callWindowStart).getUTCHours().toString().padStart(2, "0")}:00 –
                        {" "}{new Date(c.callWindowEnd).getUTCHours().toString().padStart(2, "0")}:00 ·
                        {" "}{c.ratePerMinute} call/min
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
