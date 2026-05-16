import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleChatRule, upsertChatRule } from "@/lib/chat/automation-actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const PRESET_RULES = [
  {
    ruleKey: "greeting",
    name: "Greeting Message",
    defaultMessage: "Hi there! Welcome to our site. Let us know if you need any help navigating or finding information!",
    trigger: "on_open" as const,
    delaySeconds: 0,
  },
  {
    ruleKey: "ask_contact",
    name: "Ask for Contact Details",
    defaultMessage: "We'd love to stay in touch! Could you share your email or phone number so we can assist you better?",
    trigger: "after_seconds" as const,
    delaySeconds: 60,
  },
  {
    ruleKey: "leaving",
    name: "Send Message to Visitor When Leaving",
    defaultMessage: "Wait! Before you go, here's a special offer just for you: Get 10% off your first purchase! Click here to claim it now.",
    trigger: "on_leave_intent" as const,
    delaySeconds: 0,
  },
];

export default async function ChatAutomationPage() {
  const { orgId } = await getOrgContext();

  const rules = await withTenant(orgId, async (tx) =>
    tx.chatAutomationRule.findMany({ orderBy: { ruleKey: "asc" } }),
  );

  const ruleByKey = new Map(rules.map((r) => [r.ruleKey, r]));

  return (
    <AppShellServer topBar={<TopBar title="Chat Automation" />}>
      <PageHeader
        title="Chat Automation"
        description="Customize when your chatbot speaks first."
        breadcrumb={[{"label":"Customer Hub"},{"label":"Chat Automation"}]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-lg">Active rules</CardTitle>
            <CardDescription>{rules.filter((r) => r.isActive).length} of {rules.length} enabled</CardDescription>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules configured. Start with the presets below.</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li key={r.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.trigger.replace(/_/g, " ")} {r.delaySeconds > 0 && `· after ${r.delaySeconds}s`}
                        </div>
                      </div>
                      <form action={toggleChatRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.isActive ? "Active" : "Disabled"}
                        </button>
                      </form>
                    </div>
                    <p className="mt-2 text-xs text-slate-700">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {PRESET_RULES.map((preset) => {
          const existing = ruleByKey.get(preset.ruleKey);
          return (
            <Card key={preset.ruleKey}>
              <CardHeader>
                <CardTitle className="text-base">{preset.name}</CardTitle>
                <CardDescription>
                  Trigger: <code className="text-xs">{preset.trigger.replace(/_/g, " ")}</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={upsertChatRule} className="space-y-3">
                  <input type="hidden" name="ruleKey" value={preset.ruleKey} />
                  <input type="hidden" name="name" value={preset.name} />
                  <input type="hidden" name="trigger" value={preset.trigger} />
                  <label className="block text-sm">
                    <span className="font-medium">Message</span>
                    <textarea
                      name="message"
                      rows={3}
                      maxLength={2000}
                      defaultValue={existing?.message ?? preset.defaultMessage}
                      className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="font-medium">Delay (seconds)</span>
                      <input
                        type="number"
                        name="delaySeconds"
                        min={0}
                        max={3600}
                        defaultValue={existing?.delaySeconds ?? preset.delaySeconds}
                        className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm mt-6">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={existing?.isActive ?? false}
                      />
                      <span className="font-medium">Enable this rule</span>
                    </label>
                  </div>
                  <Button type="submit" variant="outline" size="sm">
                    {existing ? "Update" : "Create"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShellServer>
  );
}
