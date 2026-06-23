import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { AssistantConfigForm } from "./_components/assistant-config-form";
import "../phone-receptionist.css";

/**
 * Phone assistant config — rebuilt to the delivered design kit
 * (designs/Ai phone receptionist/Phone Assistant). Four stepped cards:
 * Greeting & voice · Behavior · Custom instructions · Enable/disable, with the
 * kit's purple step-number badges + Save CTA.
 *
 * Live data: the real PhoneAssistant row for this org. The form is a thin client
 * island wrapping the EXISTING `saveAssistantConfig` action (field names + flow
 * unchanged) — see ./_components/assistant-config-form.tsx.
 */

export const dynamic = "force-dynamic";

export default async function AssistantConfigPage() {
  const { orgId } = await getOrgContext();

  const assistant = await withTenant(orgId, async (tx) =>
    tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
  ).catch(() => null);

  return (
    <div className="pr">
      <AppShellServer topBar={<TopBar title="Phone assistant config" />}>
        <PageHeader
          title="Phone assistant config"
          description="Make your AI receptionist sound and behave."
          breadcrumb={[{ label: "AI Phone", href: "/phone" }, { label: "Assistant" }]}
          actions={
            // Real kit robot illustration — floats in the header (not a tile).
            // biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration
            <img
              className="pr-header-robot"
              src="/assets/repulabs/phone/robot.svg"
              alt=""
              aria-hidden="true"
            />
          }
        />

        <AssistantConfigForm
          assistant={
            assistant
              ? {
                  greeting: assistant.greeting,
                  voice: assistant.voice,
                  language: assistant.language,
                  maxTurns: assistant.maxTurns,
                  handoffNumber: assistant.handoffNumber,
                  endCallPhrases: assistant.endCallPhrases,
                  handoffPhrases: assistant.handoffPhrases,
                  customInstructions: assistant.customInstructions,
                  enabled: assistant.enabled,
                }
              : null
          }
        />
      </AppShellServer>
    </div>
  );
}
