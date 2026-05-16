import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { disconnectCalCom, saveCalComConfig } from "@/lib/phone/booking-actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function PhoneBookingPage() {
  const { orgId } = await getOrgContext();

  const [assistant, recentBookings] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
      tx.phoneBooking.findMany({ orderBy: { startAt: "desc" }, take: 20 }),
    ]),
  );

  const connected = assistant?.bookingProvider === "cal_com";

  return (
    <AppShellServer topBar={<TopBar title="Booking integration" />}>
      <PageHeader
        title="Booking integration"
        description="Let the AI book appointments directly into your calendar."
        breadcrumb={[{"label":"AI Phone","href":"/phone"},{"label":"Booking"}]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {connected ? "✓ Cal.com connected" : "Connect Cal.com"}
            </CardTitle>
            <CardDescription>
              {connected
                ? `Booking via Cal.com event type ID ${assistant?.calComEventType}.`
                : "Free at cal.com. Paste your API key + event type ID below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action={saveCalComConfig} className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">API key</span>
                <input
                  type="password"
                  name="apiKey"
                  required
                  placeholder={connected ? "•••••••• (paste to replace)" : "cal_live_..."}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Get it at{" "}
                  <a href="https://app.cal.com/settings/developer/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    app.cal.com/settings/developer/api-keys
                  </a>
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Event type ID</span>
                <input
                  type="number"
                  name="eventTypeId"
                  required
                  defaultValue={assistant?.calComEventType ?? ""}
                  placeholder="123456"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  The event type the AI books into. Find it in the URL of any event type page in Cal.com.
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Booking buffer (minutes)</span>
                <input
                  type="number"
                  name="bookingBufferMin"
                  min={0}
                  max={720}
                  defaultValue={assistant?.bookingBufferMin ?? 60}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Don't offer slots within this many minutes of "now".
                </span>
              </label>
              <Button type="submit">{connected ? "Update" : "Connect"}</Button>
            </form>
            {connected && (
              <form action={disconnectCalCom} className="pt-3 border-t">
                <Button type="submit" variant="ghost" size="sm">
                  Disconnect Cal.com
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it works on a call</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-slate-700">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Caller asks to book ("Can I book an appointment for next Tuesday?")</li>
              <li>The AI detects booking intent + fetches available slots from Cal.com</li>
              <li>AI proposes 2-3 viable times in conversational form</li>
              <li>Caller picks a slot + gives their name + email</li>
              <li>The AI confirms + creates the booking via Cal.com API</li>
              <li>Cal.com sends the calendar invite to the caller's email</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent bookings ({recentBookings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {recentBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Attendee</th>
                    <th className="text-left py-1">Email</th>
                    <th className="text-left py-1">Start</th>
                    <th className="text-left py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="py-2">{b.attendeeName ?? "—"}</td>
                      <td className="text-xs">{b.attendeeEmail ?? "—"}</td>
                      <td className="text-xs">{new Date(b.startAt).toLocaleString()}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            b.status === "confirmed"
                              ? "bg-emerald-50 text-emerald-700"
                              : b.status === "cancelled"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
