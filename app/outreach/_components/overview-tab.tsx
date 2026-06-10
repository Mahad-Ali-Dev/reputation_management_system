import { EmptyIllustration } from "@/components/empty-state";
import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { listAutomationRules } from "@/lib/outreach/automation";
import { listReviewRequests, reviewRequestStats } from "@/lib/outreach/queries";
import Link from "next/link";
import { type StudioTemplate, TemplateStudio } from "./template-studio";

/**
 * Overview tab — the campaign-hub landing (target mockup: outreach-after.png).
 *
 * 3-column workspace + full-width queue, ALL live tenant data:
 *   1. Campaigns — real "programs": AutomationRules (Live when enabled, Ready
 *      when configured-but-off) + OutreachTemplates not bound to a rule (Ready
 *      when default, Draft otherwise). There is NO Campaign model — nothing is
 *      invented, statuses are derived from the rule/template rows.
 *   2. Template studio — inline SMS/Email preview of real templates with
 *      merge-tag chips (client island); editing deep-links to the existing
 *      /outreach/templates/[id] editor (single write path).
 *   3. Deliverability — Delivered % / Clicked % tiles + Opened/Reviews rows from
 *      `reviewRequestStats` (the same 30-day funnel powering Sent History).
 *   4. Recipients — the next-send queue (status queued/scheduled, soonest
 *      first); falls back to the most recent requests when nothing is queued.
 *
 * Fail-soft everywhere: every findMany is .catch(() => []) mirroring the
 * isMissingRelation patterns elsewhere (automation_rules may not be migrated).
 */

type Program = {
  key: string;
  name: string;
  sub: string;
  status: "Live" | "Ready" | "Draft";
  icon: IconName;
  href: string;
};

const TRIGGER_LABEL: Record<string, string> = {
  post_purchase: "After purchase",
  post_visit: "After appointment",
};

const STATUS_CHIP: Record<Program["status"], string> = {
  Live: "chip chip--ok",
  Ready: "chip chip--info",
  Draft: "chip chip--out",
};

const QUEUE_STATUS_TONE: Record<string, string> = {
  queued: "chip--out",
  scheduled: "chip--warn",
  sending: "chip--info",
  sent: "chip--info",
  delivered: "chip--info",
  opened: "chip--pri",
  clicked: "chip--pri",
  reviewed: "chip--ok",
  unsubscribed: "chip--out",
  bounced: "chip--bad",
  failed: "chip--bad",
};

export async function OverviewTab({ orgId }: { orgId: string }) {
  const [stats, rules, data] = await Promise.all([
    reviewRequestStats(orgId),
    listAutomationRules(orgId),
    withTenant(orgId, async (tx) => {
      const [templates, org, queue] = await Promise.all([
        tx.outreachTemplate
          .findMany({
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
            select: {
              id: true,
              name: true,
              channel: true,
              subject: true,
              body: true,
              isDefault: true,
            },
          })
          .catch(() => [] as StudioTemplate[]),
        tx.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
        tx.reviewRequest
          .findMany({
            where: { status: { in: ["queued", "scheduled", "sending"] } },
            orderBy: { scheduledFor: "asc" },
            take: 6,
            select: {
              id: true,
              channel: true,
              recipient: true,
              recipientName: true,
              status: true,
              triggerSource: true,
              scheduledFor: true,
              establishment: { select: { name: true } },
            },
          })
          .catch(() => []),
      ]);
      return { templates, org, queue };
    }),
  ]);

  // Fallback for the Recipients card: latest sent requests when nothing queued.
  const recent =
    data.queue.length > 0
      ? []
      : await listReviewRequests(orgId, { take: 6 }).catch(() => []);

  // ── Derive the "programs" list from real rules + templates ──
  const templateById = new Map(data.templates.map((t) => [t.id, t]));
  const linkedTemplateIds = new Set(rules.map((r) => r.templateId).filter(Boolean) as string[]);

  const programs: Program[] = [
    ...rules.map((r): Program => {
      const tpl = r.templateId ? templateById.get(r.templateId) : undefined;
      return {
        key: `rule-${r.id ?? r.trigger}`,
        name: tpl?.name ?? `${TRIGGER_LABEL[r.trigger] ?? r.trigger} follow-up`,
        sub: `Automated · ${TRIGGER_LABEL[r.trigger] ?? r.trigger} · ${r.delayHours}h delay`,
        status: r.enabled ? "Live" : "Ready",
        icon: "bolt",
        href: "/outreach?tab=automation",
      };
    }),
    ...data.templates
      .filter((t) => !linkedTemplateIds.has(t.id))
      .map(
        (t): Program => ({
          key: `tpl-${t.id}`,
          name: t.name,
          sub: t.channel === "email" ? "Email template" : "SMS template",
          status: t.isDefault ? "Ready" : "Draft",
          icon: t.channel === "email" ? "mail" : "smartphone",
          href: `/outreach/templates/${t.id}`,
        }),
      ),
  ].slice(0, 5);

  // ── Deliverability rates from the 30-day funnel ──
  const rate = (n: number) => (stats.sent > 0 ? `${Math.round((n / stats.sent) * 100)}%` : "—");
  const queueRows = data.queue.length > 0 ? data.queue : recent;
  const isQueue = data.queue.length > 0;

  return (
    <div>
      <div className="orc-grid">
        {/* ── 1 · Campaigns ── */}
        <section className="ds-card" aria-label="Campaigns">
          <div className="orc-cardhead">
            <div className="orc-cardicon">
              <Icon name="send" size={14} />
            </div>
            <div>
              <div className="orc-cardhead__title">Campaigns</div>
              <div className="orc-cardhead__sub">Review request programs</div>
            </div>
            <div className="orc-cardhead__aside">
              <Link href="/outreach?tab=templates" className="btn btn--xs">
                View all
              </Link>
            </div>
          </div>

          {programs.length === 0 ? (
            <div className="orc-mini-empty">
              <Icon name="send" size={22} style={{ color: "var(--pri)", marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                No programs yet
              </div>
              <p className="dim" style={{ fontSize: 11.5, margin: "4px 0 12px" }}>
                Create a template or an automation rule to start a program.
              </p>
              <Link href="/outreach?tab=automation" className="btn btn--pri btn--sm">
                <Icon name="bolt" size={11} />
                Set up automation
              </Link>
            </div>
          ) : (
            <div className="orc-programs">
              {programs.map((p) => (
                <Link key={p.key} href={p.href} className="orc-program">
                  <span className="orc-program__ava" aria-hidden>
                    <Icon name={p.icon} size={13} />
                  </span>
                  <span className="orc-program__meta">
                    <span className="orc-program__name">{p.name}</span>
                    <span className="orc-program__sub" style={{ display: "block" }}>
                      {p.sub}
                    </span>
                  </span>
                  <span className={STATUS_CHIP[p.status]}>{p.status}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── 2 · Template studio ── */}
        <section className="ds-card" aria-label="Template editor">
          <div className="orc-cardhead">
            <div className="orc-cardicon">
              <Icon name="edit" size={14} />
            </div>
            <div>
              <div className="orc-cardhead__title">Template editor</div>
              <div className="orc-cardhead__sub">Merge tags and preview</div>
            </div>
          </div>
          <TemplateStudio
            templates={data.templates}
            businessName={data.org?.name ?? "Your Business"}
          />
        </section>

        {/* ── 3 · Deliverability ── */}
        <section className="ds-card" aria-label="Deliverability">
          <div className="orc-cardhead">
            <div className="orc-cardicon orc-cardicon--trust">
              <Icon name="trend" size={14} />
            </div>
            <div>
              <div className="orc-cardhead__title">Deliverability</div>
              <div className="orc-cardhead__sub">Last 30 days</div>
            </div>
          </div>

          {stats.sent === 0 ? (
            <div className="orc-mini-empty">
              <Icon name="trend" size={22} style={{ color: "var(--trust)", marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                No sends yet
              </div>
              <p className="dim" style={{ fontSize: 11.5, margin: "4px 0 0" }}>
                Delivered and click rates appear after your first send.
              </p>
            </div>
          ) : (
            <>
              <div className="orc-tiles">
                <div className="orc-tile">
                  <div className="orc-tile__label">Delivered</div>
                  <div className="orc-tile__value">{rate(stats.delivered)}</div>
                  <div className="orc-tile__sub">
                    {stats.delivered.toLocaleString()} of {stats.sent.toLocaleString()}
                  </div>
                </div>
                <div className="orc-tile">
                  <div className="orc-tile__label">Clicks</div>
                  <div className="orc-tile__value">{rate(stats.clicked)}</div>
                  <div className="orc-tile__sub">
                    {stats.clicked.toLocaleString()} of {stats.sent.toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="orc-funnelrow">
                  <span className="orc-funnelrow__label">Opened</span>
                  <span className="orc-funnelrow__val">
                    {rate(stats.opened)} · {stats.opened.toLocaleString()}
                  </span>
                </div>
                <div className="orc-funnelrow">
                  <span className="orc-funnelrow__label">Reviews left</span>
                  <span className="orc-funnelrow__val">
                    {rate(stats.converted)} · {stats.converted.toLocaleString()}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href="/outreach?tab=history" className="btn btn--xs">
                  Full history
                  <Icon name="arrowR" size={10} />
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── 4 · Recipients (next send queue / recent requests) ── */}
      <section className="ds-card" style={{ padding: 0, overflow: "hidden" }} aria-label="Recipients">
        <div className="orc-cardhead" style={{ padding: "16px 16px 0", marginBottom: 12 }}>
          <div className="orc-cardicon">
            <Icon name="users" size={14} />
          </div>
          <div>
            <div className="orc-cardhead__title">Recipients</div>
            <div className="orc-cardhead__sub">
              {isQueue ? "Next send queue" : "Most recent requests"}
            </div>
          </div>
          <div className="orc-cardhead__aside">
            <Link href="/outreach?tab=history" className="btn btn--xs">
              View all
            </Link>
          </div>
        </div>

        {queueRows.length === 0 ? (
          <div style={{ padding: "28px 16px 40px", textAlign: "center" }}>
            <EmptyIllustration name="requests-empty" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
              Nothing queued yet
            </div>
            <p className="dim" style={{ marginTop: 6, marginBottom: 14, fontSize: 12.5 }}>
              Send a request — scheduled and automated sends line up here.
            </p>
            <Link href="/outreach?tab=send" className="btn btn--pri btn--sm">
              <Icon name="send" size={11} />
              Send a request
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl--compact">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Customer</th>
                  <th>Channel</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th style={{ paddingRight: 16 }}>Schedule</th>
                </tr>
              </thead>
              <tbody>
                {queueRows.map((r, i) => {
                  const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                  const displayName = r.recipientName ?? r.recipient ?? "—";
                  const when =
                    "sentAt" in r ? ((r.sentAt as Date | null) ?? r.scheduledFor) : r.scheduledFor;
                  return (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 16 }}>
                        <div className="row" style={{ gap: 10 }}>
                          <Avatar name={displayName} size={24} tone={tone} />
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{displayName}</div>
                            <div className="dim mono" style={{ fontSize: 10.5 }}>
                              {r.recipient}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={r.channel === "email" ? "chip chip--info" : "chip chip--ok"}>
                          <Icon name={r.channel === "email" ? "mail" : "smartphone"} size={10} />
                          {r.channel}
                        </span>
                      </td>
                      <td>
                        <span className="dim" style={{ fontSize: 11.5 }}>
                          {r.triggerSource === "automation" ? "Automated" : "Manual"}
                          {r.establishment?.name ? ` · ${r.establishment.name}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className={`chip ${QUEUE_STATUS_TONE[r.status] ?? "chip--out"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="mono dim" style={{ fontSize: 11.5, paddingRight: 16 }}>
                        {relativeTime(when)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const abs = Math.abs(ms);
  const min = Math.floor(abs / 60000);
  const future = ms < 0;
  if (min < 1) return future ? "any moment" : "just now";
  const fmt = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (min < 60) return fmt(`${min}m`);
  const h = Math.floor(min / 60);
  if (h < 24) return fmt(`${h}h`);
  const days = Math.floor(h / 24);
  return fmt(`${days}d`);
}
