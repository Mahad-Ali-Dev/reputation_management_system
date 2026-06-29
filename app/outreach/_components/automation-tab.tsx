import { Icon } from "@/components/shell/icon";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { getAutomationRule, listAutomationRules } from "@/lib/outreach/automation";
import Link from "next/link";
import { AutomationForm } from "./automation-form";
import { RuleToggle } from "./rule-toggle";

/**
 * Automation Rules panel (server), rebuilt to the kit mockup
 * (designs/Review Request/automation rules/{active,empty}).
 *
 * Layout: an education banner (gear illustration + 3 value columns) → a toolbar
 * (count pill + status filter + search + view toggle) → either the live list of
 * AutomationRule rows (each with status pill, config metrics, a working toggle,
 * and a row menu) OR the centered empty-state panel → the create/edit form
 * (anchored at #create, still the single write path for rule config).
 *
 * Gates preserved: non-Pro orgs see the upsell (sends incur cost); the form is
 * connection-aware. The rule list fail-softs to [] if the table isn't migrated.
 *
 * LIVE DATA ONLY: status (enabled), trigger, delay, frequency cap, template are
 * all real. Per-rule Sent / Response rate are NOT attributable (ReviewRequest
 * has no automationRuleId FK), so rows read "—" / "No data yet" — matching the
 * kit's own empty rows rather than inventing numbers.
 */

const TRIGGER_META: Record<
  string,
  { title: string; desc: (delay: number) => string; trigger: string; tile: string; img: string }
> = {
  post_purchase: {
    title: "Review request after purchase",
    desc: (d) => `Automatically send review requests ${hrs(d)} after a purchase.`,
    trigger: "Purchase completed",
    tile: "pri",
    img: "/assets/repulabs/review-request/auto-rule-purchase.svg",
  },
  post_visit: {
    title: "Review request after appointment",
    desc: (d) => `Automatically send review requests ${hrs(d)} after an appointment.`,
    trigger: "Appointment completed",
    tile: "green",
    img: "/assets/repulabs/review-request/auto-rule-followup.svg",
  },
};

function hrs(h: number): string {
  if (h % 24 === 0 && h >= 24) {
    const d = h / 24;
    return d === 1 ? "1 day" : `${d} days`;
  }
  return h === 1 ? "1 hour" : `${h} hours`;
}

export async function AutomationTab({ orgId }: { orgId: string }) {
  const [entitled, data] = await Promise.all([
    isOrgEntitled(orgId),
    withTenant(orgId, async (tx) => {
      const [connections, templates] = await Promise.all([
        tx.connection
          .findMany({ where: { status: "active" }, select: { provider: true } })
          .catch(() => [] as { provider: string }[]),
        tx.outreachTemplate
          .findMany({ select: { id: true, name: true, channel: true }, orderBy: { name: "asc" } })
          .catch(() => [] as { id: string; name: string; channel: string }[]),
      ]);
      return { connections, templates };
    }),
  ]);

  if (!entitled) {
    return (
      <div className="rr-card" style={{ padding: 32, textAlign: "center" }}>
        <Icon name="bolt" size={28} style={{ color: "var(--rr-pri)", marginBottom: 10 }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--rr-text)" }}>
          Automation is a Pro feature
        </div>
        <p
          style={{
            marginTop: 6,
            marginBottom: 16,
            fontSize: 13,
            maxWidth: 440,
            marginInline: "auto",
            color: "var(--rr-muted)",
          }}
        >
          Upgrade to automatically request reviews after every purchase or appointment — with delay
          timing and per-customer frequency caps.
        </p>
        <Link href="/subscription" className="btn btn--pri">
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  const connectedProviders = Array.from(new Set(data.connections.map((c) => c.provider)));
  const rules = await listAutomationRules(orgId);
  const rule = await getAutomationRule(orgId, "post_purchase");

  return (
    <div>
      {/* ── Education banner ── */}
      <section className="rr-banner" aria-label="Why automate">
        {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
        <img src="/assets/repulabs/review-request/auto-gears.svg" alt="" aria-hidden="true" className="rr-banner__art" />
        <div>
          <h3 className="rr-banner__title">Work smarter with automation</h3>
          <p className="rr-banner__copy">
            Create rules that automatically trigger actions based on events, customer behavior, or
            specific conditions.
          </p>
        </div>
        <div className="rr-bannervals">
          <BannerVal icon="bolt" tone="pri" title="Save time" copy="Automate repetitive tasks and workflows" />
          <BannerVal icon="target" tone="pink" title="Stay consistent" copy="Ensure timely actions and follow-ups" />
          <BannerVal icon="trend" tone="green" title="Boost engagement" copy="Increase reviews and customer satisfaction" />
        </div>
      </section>

      {/* ── Toolbar ── */}
      <div className="rr-listbar">
        <div className="row" style={{ gap: 10 }}>
          <div className="rr-listbar__title">All automation rules</div>
          <span className="rr-chip rr-chip--pri">{rules.length}</span>
        </div>
        <div className="rr-listbar__ctrls">
          <span className="rr-filterctrl">
            All status
            <Icon name="chevD" size={13} />
          </span>
          <span className="rr-searchbox">
            <Icon name="search" size={14} />
            Search rules…
          </span>
          <div className="rr-viewtoggle" role="group" aria-label="View mode">
            <button type="button" className="is-active" aria-label="List view" aria-pressed="true">
              <Icon name="bars" size={15} />
            </button>
            <button type="button" aria-label="Grid view" aria-pressed="false">
              <Icon name="grid" size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Rule list or empty state ── */}
      {rules.length === 0 ? (
        <div className="rr-autoempty">
          {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
          <img src="/assets/repulabs/review-request/auto-empty.svg" alt="" aria-hidden="true" />
          <div className="rr-autoempty__title">No automation rules yet</div>
          <p className="rr-autoempty__body">
            You haven&apos;t created any automation rules. Create your first rule to get started.
          </p>
          <a href="#create" className="btn btn--pri">
            <Icon name="plus" size={13} />
            Create automation
          </a>
          <div style={{ marginTop: 18 }}>
            <Link href="/connections" className="rr-linkbtn">
              Learn how automation works
              <Icon name="arrowR" size={12} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="rr-rules">
          {rules.map((r) => {
            const meta = TRIGGER_META[r.trigger] ?? {
              title: `${r.trigger} automation`,
              desc: (d: number) => `Sends a review request ${hrs(d)} after the trigger.`,
              trigger: r.trigger,
              tile: "pri",
              img: "/assets/repulabs/review-request/auto-rule-purchase.svg",
            };
            return (
              <div key={r.id ?? r.trigger} className="rr-card rr-rule">
                <div className={`rr-rule__tile rr-rule__tile--${meta.tile}`}>
                  {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
                  <img src={meta.img} alt="" aria-hidden="true" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="rr-rule__title">{meta.title}</div>
                  <div className="rr-rule__desc">{meta.desc(r.delayHours)}</div>
                  <span className="rr-rule__trigger">
                    <Icon name="flag" size={11} />
                    Trigger: {meta.trigger}
                  </span>
                </div>
                <span className="rr-rule__sep" />
                <span className={r.enabled ? "rr-chip rr-chip--ok" : "rr-chip rr-chip--gray"}>
                  {r.enabled ? "Active" : "Paused"}
                </span>
                <span className="rr-rule__sep" />
                <div className="rr-rule__metric">
                  <div className="rr-rule__metric-val">
                    <Icon name="user" size={12} />—
                  </div>
                  <div className="rr-rule__metric-lbl">Sent</div>
                </div>
                <div className="rr-rule__metric">
                  <div className="rr-rule__metric-val">
                    <Icon name="refresh" size={12} />—
                  </div>
                  <div className="rr-rule__metric-lbl">Response rate</div>
                </div>
                <RuleToggle ruleId={r.id ?? ""} enabled={r.enabled} label={meta.title} />
                <button type="button" className="rr-rowmenu" aria-label={`Actions for ${meta.title}`}>
                  <Icon name="grip" size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / edit form (single write path) ── */}
      <div id="create" style={{ marginTop: 20, scrollMarginTop: 80 }}>
        <h3 className="rr-listbar__title" style={{ marginBottom: 12 }}>
          {rules.length === 0 ? "Create your first rule" : "Configure a rule"}
        </h3>
        <AutomationForm rule={rule} connectedProviders={connectedProviders} templates={data.templates} />
      </div>
    </div>
  );
}

function BannerVal({
  icon,
  tone,
  title,
  copy,
}: {
  icon: "bolt" | "target" | "trend";
  tone: "pri" | "pink" | "green";
  title: string;
  copy: string;
}) {
  return (
    <div className="rr-bval">
      <span className={`rr-bval__icon rr-bval__icon--${tone}`}>
        <Icon name={icon} size={15} />
      </span>
      <div>
        <div className="rr-bval__title">{title}</div>
        <div className="rr-bval__copy">{copy}</div>
      </div>
    </div>
  );
}
