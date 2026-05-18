import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { updateAutoReplyRule } from "@/lib/auto-reply/actions";
import { getAutoReplyRule, listEstablishmentsForRuleForm } from "@/lib/auto-reply/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoReplyRuleForm } from "../rule-form";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edit an existing auto-reply rule. We pre-load the rule + the
 * establishments list in parallel — both are small, single-org queries.
 *
 * Audit affordance: the kicker shows how often this rule has fired and
 * the relative time of the last fire, so a host editing a rule knows
 * whether they're poking at something live.
 */
export default async function EditAutoReplyRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { orgId } = await getOrgContext();
  const [rule, establishments] = await Promise.all([
    getAutoReplyRule(orgId, id),
    listEstablishmentsForRuleForm(orgId),
  ]);
  if (!rule) notFound();

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Auto-reply", rule.name]}>
      <PageHeader
        kicker={`Fired ${rule.fireCount}× ${
          rule.lastFiredAt ? `· last ${relativeTime(rule.lastFiredAt)}` : "· never fired yet"
        }`}
        title={`Edit “${rule.name}”`}
        description="Changes apply to new reviews going forward. Replies already drafted under this rule are left alone."
        breadcrumb={[{ label: "Auto-reply", href: "/reviews/auto-reply" }, { label: rule.name }]}
        actions={
          <Link href="/reviews/auto-reply" className="btn">
            Back to rules
          </Link>
        }
      />

      <div className="ds-card" style={{ padding: 20, maxWidth: 760 }}>
        <AutoReplyRuleForm
          mode="edit"
          initial={{
            id: rule.id,
            name: rule.name,
            enabled: rule.enabled,
            establishmentId: rule.establishmentId,
            matchMinRating: rule.matchMinRating,
            matchMaxRating: rule.matchMaxRating,
            matchKeywords: rule.matchKeywords,
            matchSources: rule.matchSources,
            action: rule.action,
            delayMinutes: rule.delayMinutes,
            replyTone: rule.replyTone,
          }}
          establishments={establishments}
          serverAction={updateAutoReplyRule}
        />
      </div>
    </AppShellServer>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return d.toLocaleDateString();
}
