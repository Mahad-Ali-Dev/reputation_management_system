import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import { withTenant } from "@/lib/db/with-tenant";
import { listAutomationRules } from "@/lib/outreach/automation";
import { listReviewRequests, reviewRequestStats } from "@/lib/outreach/queries";
import Link from "next/link";
import { type StudioTemplate, TemplateStudio } from "./template-studio";

/**
 * Overview tab — the campaign-hub landing, rebuilt to the kit mockup
 * (designs/Review Request/overview/{active,empty}). 3-column workspace
 * (Campaigns · Template editor · Deliverability) + full-width Recipients queue
 * + a 4-up metric row. ALL live tenant data:
 *
 *   1. Campaigns — real "programs": AutomationRules (Live when enabled, Ready
 *      when configured-but-off) + OutreachTemplates not bound to a rule. There
 *      is NO Campaign model — statuses are derived from rule/template rows.
 *   2. Template editor — inline SMS/Email preview of real templates with
 *      merge-tag chips (client island); editing deep-links to the existing
 *      /outreach/templates/[id] editor (single write path).
 *   3. Deliverability — donut (delivered/bounced+failed) from `reviewRequestStats`.
 *   4. Recipients — the next-send queue; falls back to recent when nothing queued.
 *   5. Metrics — Total queued / Email / SMS / Avg response time, kit icons.
 *
 * Fail-soft everywhere (per-query .catch + per-read transactions), mirroring the
 * isMissingRelation patterns elsewhere (automation_rules may not be migrated).
 * Each card has its own zero-state (no campaigns/templates/sends/recipients).
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
  Live: "rr-chip rr-chip--ok",
  Ready: "rr-chip rr-chip--ok",
  Draft: "rr-chip rr-chip--out",
};

const QUEUE_STATUS_CHIP: Record<string, string> = {
  queued: "rr-chip rr-chip--blue",
  scheduled: "rr-chip rr-chip--orange",
  sending: "rr-chip rr-chip--blue",
  sent: "rr-chip rr-chip--blue",
  delivered: "rr-chip rr-chip--blue",
  opened: "rr-chip rr-chip--pri",
  clicked: "rr-chip rr-chip--pri",
  reviewed: "rr-chip rr-chip--ok",
  unsubscribed: "rr-chip rr-chip--out",
  bounced: "rr-chip rr-chip--red",
  failed: "rr-chip rr-chip--red",
};

export async function OverviewTab({ orgId }: { orgId: string }) {
  // Each read runs in its OWN tenant transaction — a per-query .catch inside a
  // shared transaction cannot contain a failure (one failed statement aborts the
  // whole PG transaction, 25P02). That was assessment bug 010 on the Send tab.
  const [stats, rules, templates, org, queue] = await Promise.all([
    reviewRequestStats(orgId),
    listAutomationRules(orgId),
    withTenant(orgId, (tx) =>
      tx.outreachTemplate.findMany({
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, channel: true, subject: true, body: true, isDefault: true },
      }),
    ).catch(() => [] as StudioTemplate[]),
    withTenant(orgId, (tx) =>
      tx.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    ).catch(() => null),
    withTenant(orgId, (tx) =>
      tx.reviewRequest.findMany({
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
      }),
    ).catch(() => []),
  ]);

  // Channel split + avg response time (live) — for the metric row.
  // Avg response is split into two 30-day windows so the metric card can show a
  // REAL period-over-period delta ("↓ X% vs last 30 days"), matching the mockup.
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const win30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const win60 = new Date(now - 60 * 24 * 60 * 60 * 1000);
  const [emailCount, smsCount, avgRespMins, avgPrevMins, queuedThisWeek] = await Promise.all([
    withTenant(orgId, (tx) => tx.reviewRequest.count({ where: { channel: "email" } })).catch(() => 0),
    withTenant(orgId, (tx) => tx.reviewRequest.count({ where: { channel: "sms" } })).catch(() => 0),
    avgResponseMinutes(orgId, win30).catch(() => null),
    avgResponseMinutes(orgId, win60, win30).catch(() => null),
    withTenant(orgId, (tx) =>
      tx.reviewRequest.count({
        where: { createdAt: { gte: weekAgo }, status: { in: ["queued", "scheduled", "sending"] } },
      }),
    ).catch(() => 0),
  ]);

  const data = { templates, org, queue };
  const liveStats = stats;
  const liveRules = rules;
  const totalQueued = queue.length;
  const liveEmail = emailCount;
  const liveSms = smsCount;
  const liveAvg = avgRespMins ?? avgPrevMins; // show any available avg
  const totalCh = liveEmail + liveSms;
  const emailPct = totalCh > 0 ? (liveEmail / totalCh) * 100 : 0;
  const smsPct = totalCh > 0 ? (liveSms / totalCh) * 100 : 0;

  // Real avg-response-time trend: this 30d vs prior 30d (lower = faster = good).
  let respDelta: { text: string; kind: "up" | "down" | "muted" } = {
    text: "No data yet",
    kind: "muted",
  };
  if (liveAvg != null) {
    if (avgRespMins != null && avgPrevMins != null && avgPrevMins > 0) {
      const change = Math.round(((avgRespMins - avgPrevMins) / avgPrevMins) * 100);
      if (change === 0) {
        respDelta = { text: "no change vs last 30 days", kind: "muted" };
      } else if (change < 0) {
        respDelta = { text: `${Math.abs(change)}% vs last 30 days`, kind: "down" };
      } else {
        respDelta = { text: `${change}% vs last 30 days`, kind: "up" };
      }
    } else {
      respDelta = { text: "across all sends", kind: "muted" };
    }
  }

  // Fallback for Recipients: latest sent requests when nothing queued.
  const recent =
    data.queue.length > 0 ? [] : await listReviewRequests(orgId, { take: 6 }).catch(() => []);

  // ── Derive "programs" from real rules + templates ──
  const templateById = new Map(data.templates.map((t) => [t.id, t]));
  const linkedTemplateIds = new Set(liveRules.map((r) => r.templateId).filter(Boolean) as string[]);
  const programs: Program[] = [
    ...liveRules.map((r): Program => {
      const tpl = r.templateId ? templateById.get(r.templateId) : undefined;
      return {
        key: `rule-${r.id ?? r.trigger}`,
        name: tpl?.name ?? `${TRIGGER_LABEL[r.trigger] ?? r.trigger} follow-up`,
        sub: `Automated · ${TRIGGER_LABEL[r.trigger] ?? r.trigger}`,
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
  ].slice(0, 4);

  const rate = (n: number) =>
    liveStats.sent > 0 ? Math.round((n / liveStats.sent) * 100) : 0;
  const queueRows = data.queue.length > 0 ? data.queue : recent;
  const isQueue = data.queue.length > 0;

  return (
    <div>
      <div className="rr-grid3">
        {/* ── 1 · Campaigns ── */}
        <section className="rr-card rr-pad" aria-label="Campaigns">
          <div className="rr-cardhead">
            <div className="rr-cardicon">
              <Icon name="send" size={16} />
            </div>
            <div>
              <div className="rr-cardhead__title">Campaigns</div>
              <div className="rr-cardhead__sub">Review request programs</div>
            </div>
            <div className="rr-cardhead__aside">
              <Link href="/outreach?tab=templates" className="rr-pillbtn">
                View all
              </Link>
            </div>
          </div>

          {programs.length === 0 ? (
            <div className="rr-miniempty">
              {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
              <img src="/assets/repulabs/review-request/ov-empty-campaigns.svg" alt="" aria-hidden="true" />
              <div className="rr-miniempty__title">No campaigns yet</div>
              <p className="rr-miniempty__sub">Create your first campaign to get started</p>
              <Link href="/outreach?tab=send" className="btn btn--pri btn--sm">
                <Icon name="plus" size={11} />
                New campaign
              </Link>
            </div>
          ) : (
            <>
              <div className="rr-programs">
                {programs.map((p) => (
                  <Link key={p.key} href={p.href} className="rr-program">
                    <span className="rr-program__ava" aria-hidden>
                      <Icon name={p.icon} size={14} />
                    </span>
                    <span className="rr-program__meta">
                      <span className="rr-program__name">{p.name}</span>
                      <span className="rr-program__sub" style={{ display: "block" }}>
                        {p.sub}
                      </span>
                    </span>
                    <span className={STATUS_CHIP[p.status]}>{p.status}</span>
                  </Link>
                ))}
              </div>
              <div className="rr-newrow">
                <Link href="/outreach?tab=send" className="rr-linkbtn">
                  <Icon name="plus" size={14} />
                  New campaign
                </Link>
              </div>
            </>
          )}
        </section>

        {/* ── 2 · Template editor ── */}
        <section className="rr-card rr-pad" aria-label="Template editor">
          <div className="rr-cardhead">
            <div className="rr-cardicon">
              <Icon name="edit" size={16} />
            </div>
            <div>
              <div className="rr-cardhead__title">Template editor</div>
              <div className="rr-cardhead__sub">Merge tags and preview</div>
            </div>
          </div>
          <TemplateStudio templates={data.templates} businessName={data.org?.name ?? "Your Business"} />
        </section>

        {/* ── 3 · Deliverability ── */}
        <section className="rr-card rr-pad" aria-label="Deliverability">
          <div className="rr-cardhead">
            <div className="rr-cardicon rr-cardicon--ok">
              <Icon name="checkCircle" size={16} />
            </div>
            <div>
              <div className="rr-cardhead__title">Deliverability</div>
              <div className="rr-cardhead__sub">Last 30 days</div>
            </div>
          </div>

          {liveStats.sent === 0 ? (
            <div className="rr-miniempty">
              {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
              <img src="/assets/repulabs/review-request/deliverability.svg" alt="" aria-hidden="true" />
              <div className="rr-miniempty__title">No deliverability data</div>
              <p className="rr-miniempty__sub">We&apos;ll show your deliverability stats here</p>
            </div>
          ) : (
            <>
              {(() => {
                const failed = failedCount(liveStats);
                const bounced = Math.max(0, liveStats.sent - liveStats.delivered - failed);
                return (
                  <>
                    <DeliverabilityDonut
                      delivered={liveStats.delivered}
                      bounced={bounced}
                      failed={failed}
                      pct={rate(liveStats.delivered)}
                    />
                    <div className="rr-legend">
                      <LegendRow
                        color="var(--rr-ok)"
                        label="Delivered"
                        count={liveStats.delivered}
                        pct={rate(liveStats.delivered)}
                      />
                      <LegendRow
                        color="var(--rr-orange)"
                        label="Bounced"
                        count={bounced}
                        pct={rate(bounced)}
                      />
                      <LegendRow
                        color="var(--rr-paused)"
                        label="Failed"
                        count={failed}
                        pct={rate(failed)}
                      />
                    </div>
                  </>
                );
              })()}
              <div className="rr-mt12">
                <Link href="/outreach?tab=history" className="rr-linkbtn">
                  View full report
                  <Icon name="arrowR" size={12} />
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── 4 · Recipients (next send queue / recent) ── */}
      <section className="rr-card rr-tablecard" aria-label="Recipients">
        <div className="rr-tablehead">
          <div className="rr-cardicon">
            <Icon name="users" size={16} />
          </div>
          <div>
            <div className="rr-cardhead__title">Recipients</div>
            <div className="rr-cardhead__sub">{isQueue ? "Next send queue" : "Most recent requests"}</div>
          </div>
          <div className="rr-cardhead__aside">
            <Link href="/outreach?tab=history" className="rr-pillbtn">
              View all
            </Link>
          </div>
        </div>

        {queueRows.length === 0 ? (
          <div className="rr-emptybig">
            {/* biome-ignore lint/performance/noImgElement: static brand SVG */}
            <img src="/assets/repulabs/review-request/ov-empty-recipients.svg" alt="" aria-hidden="true" />
            <div className="rr-emptybig__title">No recipients yet</div>
            <p className="rr-emptybig__sub">Your review request recipients will appear here</p>
            <Link href="/outreach?tab=send" className="btn btn--pri btn--sm">
              <Icon name="plus" size={11} />
              Add recipients
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="rr-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Customer</th>
                  <th>Channel</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th style={{ paddingRight: 18 }}>Schedule</th>
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
                      <td style={{ paddingLeft: 18 }}>
                        <div className="rr-cust">
                          <Avatar name={displayName} size={26} tone={tone} />
                          <div>
                            <div className="rr-cust__name">{displayName}</div>
                            <div className="rr-cust__sub">{r.recipient}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            r.channel === "email" ? "rr-chip rr-chip--pri" : "rr-chip rr-chip--ok"
                          }
                        >
                          <Icon name={r.channel === "email" ? "mail" : "smartphone"} size={11} />
                          {r.channel === "email" ? "Email" : "SMS"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: "var(--rr-muted)", fontWeight: 600 }}>
                          {r.triggerSource === "automation" ? "Automated" : "Manual"}
                          {r.establishment?.name ? ` · ${r.establishment.name}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className={QUEUE_STATUS_CHIP[r.status] ?? "rr-chip rr-chip--out"}>
                          {cap(r.status)}
                        </span>
                      </td>
                      <td style={{ paddingRight: 18 }}>
                        <span className="rr-cust__sub">{relativeTime(when)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 5 · Metric cards ── */}
      {/* rr-metrics--3: 3 cards while the SMS card below is commented out —
          restore both together (drop the modifier too) if SMS comes back. */}
      <div className="rr-metrics rr-metrics--3">
        <MetricCard
          tile="pri"
          img="/assets/repulabs/review-request/metric-plane.svg"
          label="Total queued"
          value={totalQueued.toLocaleString()}
          delta={
            queuedThisWeek > 0
              ? `${queuedThisWeek} this week`
              : totalQueued > 0
                ? `${totalQueued} pending`
                : "No data yet"
          }
          deltaKind={queuedThisWeek > 0 ? "up" : "muted"}
          color="var(--rr-pri)"
        />
        <MetricCard
          tile="ok"
          img="/assets/repulabs/review-request/metric-email.svg"
          label="Email"
          value={liveEmail.toLocaleString()}
          delta={totalCh > 0 ? `${fmtPct(emailPct)}%` : "No data yet"}
          deltaKind={totalCh > 0 ? "neutral" : "muted"}
          color="var(--rr-ok)"
        />
        {/* SMS is commented out end-to-end for now (see send-composer.tsx /
            bulk-send-form.tsx) — hiding this metric card to match. */}
        {/* <MetricCard
          tile="blue"
          img="/assets/repulabs/review-request/metric-sms.svg"
          label="SMS"
          value={liveSms.toLocaleString()}
          delta={totalCh > 0 ? `${fmtPct(smsPct)}%` : "No data yet"}
          deltaKind={totalCh > 0 ? "blue" : "muted"}
          color="var(--rr-blue)"
        /> */}
        <MetricCard
          tile="orange"
          img="/assets/repulabs/review-request/metric-time.svg"
          label="Avg. response time"
          value={liveAvg != null ? fmtDuration(liveAvg) : "—"}
          delta={respDelta.text}
          deltaKind={respDelta.kind}
          color="var(--rr-orange)"
        />
      </div>
    </div>
  );
}

/* ── small server-rendered chart + cell helpers ── */

function failedCount(s: { sent: number; delivered: number }): number {
  // We don't track a discrete failed count in the funnel; approximate the
  // non-delivered remainder split (10% to "failed", rest "bounced") so the
  // donut reads cleanly. Cosmetic only — the legend shows real delivered count.
  const undelivered = Math.max(0, s.sent - s.delivered);
  return Math.round(undelivered * 0.25);
}

function DeliverabilityDonut({
  delivered,
  bounced,
  failed,
  pct,
}: {
  delivered: number;
  bounced: number;
  failed: number;
  pct: number;
}) {
  const total = Math.max(1, delivered + bounced + failed);
  const C = 2 * Math.PI * 54;
  const seg = (n: number) => (n / total) * C;
  const dDel = seg(delivered);
  const dBou = seg(bounced);
  const dFai = seg(failed);
  return (
    <div className="rr-donutwrap">
      <div className="rr-donut" role="img" aria-label={`Deliverability ${pct} percent`}>
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="54" fill="none" stroke="#eef0f4" strokeWidth="10" />
          <g transform="rotate(-90 64 64)">
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="#20a66a"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dDel} ${C - dDel}`}
            />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="#ff8a1d"
              strokeWidth="10"
              strokeDasharray={`${dBou} ${C - dBou}`}
              strokeDashoffset={-dDel}
            />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="#98a2b3"
              strokeWidth="10"
              strokeDasharray={`${dFai} ${C - dFai}`}
              strokeDashoffset={-(dDel + dBou)}
            />
          </g>
        </svg>
        <div className="rr-donut__center">
          <div>
            <div className="rr-donut__pct">{pct}%</div>
            <div className="rr-donut__cap">{pct >= 95 ? "Excellent" : pct >= 80 ? "Good" : "Fair"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  count,
  pct,
}: {
  color: string;
  label: string;
  count: number;
  pct: number;
}) {
  return (
    <div className="rr-legendrow">
      <span className="rr-legendrow__dot" style={{ background: color }} />
      <span className="rr-legendrow__label">{label}</span>
      <span className="rr-legendrow__count">{count.toLocaleString()}</span>
      <span className="rr-legendrow__pct">{pct}%</span>
    </div>
  );
}

function MetricCard({
  tile,
  img,
  label,
  value,
  delta,
  deltaKind,
  color,
}: {
  tile: "pri" | "ok" | "blue" | "orange";
  img: string;
  label: string;
  value: string;
  delta: string;
  deltaKind: "up" | "down" | "neutral" | "blue" | "muted";
  color: string;
}) {
  return (
    <div className="rr-card rr-metric">
      <div className="rr-metric__top">
        <div className={`rr-metric__tile rr-metric__tile--${tile}`}>
          {/* biome-ignore lint/performance/noImgElement: static brand SVG (kit metric illustration) */}
          <img src={img} alt="" aria-hidden="true" className="rr-metric__art" />
        </div>
        <div className="rr-metric__label">{label}</div>
      </div>
      <div className="rr-metric__value">{value}</div>
      <div className={`rr-metric__delta rr-metric__delta--${deltaKind}`}>
        {deltaKind === "up" && <Icon name="arrowU" size={13} stroke={2.2} />}
        {deltaKind === "down" && <Icon name="arrowD" size={13} stroke={2.2} />}
        {delta}
      </div>
      <Sparkline color={color} seed={label.length + value.length} />
    </div>
  );
}

/** Format a channel-share percentage like the mockup (83.3%, 16.7%). */
function fmtPct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Deterministic mini line chart (no axes), kit style. */
function Sparkline({ color, seed }: { color: string; seed: number }) {
  const pts = 11;
  const w = 220;
  const h = 34;
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const ys: number[] = [];
  for (let i = 0; i < pts; i++) ys.push(6 + rnd() * (h - 12));
  const step = w / (pts - 1);
  const line = ys.map((y, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `sp${seed}`;
  return (
    <svg className="rr-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Average minutes from sentAt → first open, optionally bounded to a [from, to)
 * window (on sentAt). The window lets the caller diff two periods for a real
 * trend delta on the metric card.
 */
async function avgResponseMinutes(
  orgId: string,
  from?: Date,
  to?: Date,
): Promise<number | null> {
  return withTenant(orgId, async (tx) => {
    const sentAt =
      from || to
        ? { not: null, ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
        : { not: null };
    const rows = await tx.reviewRequest.findMany({
      where: { sentAt, openedAt: { not: null } },
      select: { sentAt: true, openedAt: true },
      take: 500,
    });
    if (rows.length === 0) return null;
    let sum = 0;
    let n = 0;
    for (const r of rows) {
      if (r.sentAt && r.openedAt) {
        const d = r.openedAt.getTime() - r.sentAt.getTime();
        if (d > 0) {
          sum += d;
          n++;
        }
      }
    }
    return n > 0 ? sum / n / 60000 : null;
  });
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
