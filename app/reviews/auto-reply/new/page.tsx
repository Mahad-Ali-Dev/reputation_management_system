import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { createAutoReplyRule } from "@/lib/auto-reply/actions";
import { listEstablishmentsForRuleForm } from "@/lib/auto-reply/queries";
import Link from "next/link";
import { AutoReplyRuleForm } from "../rule-form";

export const dynamic = "force-dynamic";

/**
 * Create a new auto-reply rule. Sensible defaults so a host can save right
 * away and tighten later:
 *
 *   - 5-only rating (most common: thank-you flow)
 *   - Empty keywords / sources (catch-all)
 *   - Action: draft_only — never auto-publish on first creation
 *   - Tone: warm — matches the default brand voice
 *
 * If the form's server action returns an error, we re-render this page
 * with the error state preserved by useActionState.
 */
export default async function NewAutoReplyRulePage() {
  const { orgId } = await getOrgContext();
  const establishments = await listEstablishmentsForRuleForm(orgId);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Auto-reply", "New rule"]}>
      <PageHeader
        title="New auto-reply rule"
        description="When an incoming review matches, we'll draft a reply (or auto-publish it after a delay)."
        breadcrumb={[{ label: "Auto-reply", href: "/reviews/auto-reply" }, { label: "New rule" }]}
        actions={
          <Link href="/reviews/auto-reply" className="btn">
            Cancel
          </Link>
        }
      />

      <div className="ds-card" style={{ padding: 20, maxWidth: 760 }}>
        <AutoReplyRuleForm
          mode="create"
          initial={{
            name: "",
            enabled: true,
            establishmentId: null,
            matchMinRating: 5,
            matchMaxRating: 5,
            matchKeywords: [],
            matchSources: [],
            action: "draft_only",
            delayMinutes: 5,
            replyTone: "warm",
          }}
          establishments={establishments}
          serverAction={createAutoReplyRule}
        />
      </div>
    </AppShellServer>
  );
}
