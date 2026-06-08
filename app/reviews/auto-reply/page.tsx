import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { deleteAutoReplyRule, toggleAutoReplyRule } from "@/lib/auto-reply/actions";
import { listAutoReplyRules } from "@/lib/auto-reply/queries";
import { MANAGED_5STAR_RULE_NAME } from "@/lib/auto-reply/managed-rule";
import { getReviewSourceMeta } from "@/lib/reviews/source-meta";
import Link from "next/link";
import { ConfirmDeleteRuleButton } from "./confirm-delete-button";

/**
 * Auto-reply rules — list + manage.
 *
 * Each row shows the rule's name, its targeting (org-wide vs listing),
 * match summary, action, and a fire-count badge so the host knows which
 * rules are actually working. Enable/disable is a one-click form-submit;
 * destructive actions (delete) require a confirm step via a native dialog.
 *
 * Evaluation order is rendered in the order rules fire (listing-specific
 * first, then org-wide; within each group, oldest first). The "Order" pill
 * is a hint, not an interactive reorder — moving rules around in the
 * picker-style UI would mean introducing a `sortOrder` column. For 90% of
 * hosts who have ≤5 rules total, the explicit ordering rule is enough.
 */

export const dynamic = "force-dynamic";

export default async function AutoReplyRulesPage() {
  const { orgId } = await getOrgContext();
  const allRules = await listAutoReplyRules(orgId);
  // The managed 5★ rule is driven exclusively by the "Auto-Reply to 5-Star
  // Reviews" toggle on /reviews. Hide it here so a host can't half-edit it
  // into an inconsistent state; surface a pointer to the toggle instead.
  const managed = allRules.find((r) => r.name === MANAGED_5STAR_RULE_NAME && !r.establishmentId);
  const rules = allRules.filter((r) => r.name !== MANAGED_5STAR_RULE_NAME);
  const orgWideCount = rules.filter((r) => !r.establishmentId).length;
  const listingCount = rules.filter((r) => r.establishmentId).length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Auto-reply"]}>
      <PageHeader
        kicker={`${rules.length} rule${rules.length === 1 ? "" : "s"} · ${listingCount} per-listing · ${orgWideCount} org-wide`}
        title="Auto-reply rules"
        description="Match incoming reviews and let the AI draft (or auto-publish) replies in the host's voice."
        actions={
          <Link href="/reviews/auto-reply/new" className="btn btn--pri">
            <Icon name="plus" size={12} />
            New rule
          </Link>
        }
      />

      {managed?.enabled && (
        <div
          className="ds-card"
          style={{
            padding: 14,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--pri-50, #eff6ff)",
            border: "1px solid var(--pri-100, #dbeafe)",
          }}
        >
          <Icon name="sparkle" size={16} style={{ color: "var(--pri, #2563eb)" }} />
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink-2, #475569)" }}>
            <strong>5★ Auto-Reply is on.</strong> Clean 5★ reviews get an AI reply on a randomized
            2–4h delay. Managed from the toggle on the reviews page.
          </div>
          <Link href="/reviews" className="btn" style={{ fontSize: 11.5 }}>
            Manage
          </Link>
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="col" style={{ gap: 10 }}>
          <div
            className="dim"
            style={{
              fontSize: 11,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontWeight: 600,
              padding: "0 4px",
            }}
          >
            Evaluated top-to-bottom — first match wins
          </div>
          {rules.map((r, idx) => (
            <RuleCard key={r.id} rule={r} order={idx + 1} />
          ))}
        </div>
      )}

      <HowItWorks />
    </AppShellServer>
  );
}

function EmptyState() {
  return (
    <div className="ds-card" style={{ padding: 40, textAlign: "center", borderStyle: "dashed" }}>
      <EmptyIllustration name="reviews-empty" />
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: "12px 0 4px" }}>
        No auto-reply rules yet
      </h3>
      <p className="dim" style={{ fontSize: 13, marginBottom: 16 }}>
        Set up your first rule. We&rsquo;ll draft an on-brand reply the second a matching review
        arrives.
      </p>
      <Link href="/reviews/auto-reply/new" className="btn btn--pri">
        <Icon name="plus" size={12} />
        Create your first rule
      </Link>
    </div>
  );
}

function RuleCard({
  rule,
  order,
}: {
  rule: Awaited<ReturnType<typeof listAutoReplyRules>>[number];
  order: number;
}) {
  const target = rule.establishmentName
    ? `Listing · ${rule.establishmentName}`
    : "All listings (org-wide)";
  const ratingLabel =
    rule.matchMinRating === rule.matchMaxRating
      ? `${rule.matchMinRating}★ only`
      : `${rule.matchMinRating}–${rule.matchMaxRating}★`;
  const actionLabel =
    rule.action === "auto_publish_after_delay"
      ? `Auto-publish after ${rule.delayMinutes}m`
      : "Draft for approval";
  const actionTone = rule.action === "auto_publish_after_delay" ? "var(--bad)" : "var(--rl-muted)";

  return (
    <div
      className={`ds-card ${rule.enabled ? "" : "ds-card--muted"}`}
      style={{
        padding: 16,
        opacity: rule.enabled ? 1 : 0.65,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <div
        title={`Evaluation order: ${order}`}
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--surface-2, #f1f5f9)",
          color: "var(--rl-muted)",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "var(--f-mono)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {order}
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <Link
            href={`/reviews/auto-reply/${rule.id}`}
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            {rule.name}
          </Link>
          {!rule.enabled && (
            <span className="chip chip--out" style={{ fontSize: 10 }}>
              Disabled
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--rl-muted)", fontFamily: "var(--f-mono)" }}>
            {target}
          </span>
        </div>
        <div
          className="row"
          style={{
            gap: 6,
            flexWrap: "wrap",
            fontSize: 11.5,
            color: "var(--ink-2)",
          }}
        >
          <RuleChip>{ratingLabel}</RuleChip>
          {rule.matchSources.length > 0 ? (
            rule.matchSources.map((s) => <SourceChip key={s} source={s} />)
          ) : (
            <RuleChip>Any source</RuleChip>
          )}
          {rule.matchKeywords.length > 0 && (
            <RuleChip>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5 }}>kw:</span>{" "}
              {rule.matchKeywords.slice(0, 3).join(", ")}
              {rule.matchKeywords.length > 3 ? ` +${rule.matchKeywords.length - 3}` : ""}
            </RuleChip>
          )}
          <RuleChip>
            <span style={{ color: actionTone, fontWeight: 600 }}>{actionLabel}</span>
          </RuleChip>
          <RuleChip>Tone · {rule.replyTone}</RuleChip>
        </div>
        <div className="dim" style={{ fontSize: 11, marginTop: 6, fontFamily: "var(--f-mono)" }}>
          Fired {rule.fireCount}× ·{" "}
          {rule.lastFiredAt ? `last ${relativeTime(rule.lastFiredAt)}` : "never fired yet"}
        </div>
      </div>

      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <form action={toggleAutoReplyRule}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="enable" value={(!rule.enabled).toString()} />
          <button
            type="submit"
            className="btn"
            style={{ fontSize: 11.5 }}
            title={rule.enabled ? "Pause this rule" : "Resume this rule"}
          >
            {rule.enabled ? (
              <>
                <Icon name="pause" size={12} />
                Pause
              </>
            ) : (
              <>
                <Icon name="play" size={12} />
                Enable
              </>
            )}
          </button>
        </form>
        <Link href={`/reviews/auto-reply/${rule.id}`} className="btn" style={{ fontSize: 11.5 }}>
          <Icon name="edit" size={12} />
          Edit
        </Link>
        <form action={deleteAutoReplyRule}>
          <input type="hidden" name="id" value={rule.id} />
          <ConfirmDeleteRuleButton ruleName={rule.name} />
        </form>
      </div>
    </div>
  );
}

function RuleChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        background: "var(--surface-2, #f1f5f9)",
        color: "var(--ink-2, #334155)",
        fontSize: 11,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function SourceChip({ source }: { source: string }) {
  const meta = getReviewSourceMeta(source as Parameters<typeof getReviewSourceMeta>[0]);
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        background: meta.bgTint,
        color: meta.fg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        fontFamily: "var(--f-mono)",
      }}
    >
      {meta.label.toUpperCase()}
    </span>
  );
}

function HowItWorks() {
  return (
    <div className="ds-card" style={{ marginTop: 20, padding: 18 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 0, marginBottom: 6 }}>How it works</h3>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 12.5,
          color: "var(--ink-2)",
          lineHeight: 1.65,
        }}
      >
        <li>
          When a review arrives, we evaluate rules top-to-bottom. The first rule whose criteria all
          match wins — others are skipped.
        </li>
        <li>
          <strong>Draft for approval</strong> rules generate a draft and leave it under{" "}
          <Link href="/reviews?status=draft_ready" style={{ color: "var(--pri)" }}>
            Reviews → AI Draft Ready
          </Link>{" "}
          for you to approve.
        </li>
        <li>
          <strong>Auto-publish</strong> rules publish to Google after the delay window — you can
          still pull the draft back before it goes live. We never auto-publish if our safety
          classifier flags the text.
        </li>
        <li>
          Per-listing rules trump org-wide rules. Use org-wide for catch-all behavior, per-listing
          for "this one listing has different rules".
        </li>
      </ul>
    </div>
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
