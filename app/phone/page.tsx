import { AppShellServer } from "@/components/app-shell-server";
import { ComingSoonPage } from "@/components/coming-soon";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import "./phone-receptionist.css";

/**
 * AI Phone Receptionist — main dashboard, rebuilt to the delivered design kit
 * (designs/Ai phone receptionist/main section — active + empty states).
 *
 * Kit composition (exact): hero ("Answer calls and turn great moments into
 * reviews", with a headset + review-card illustration) · KPI row (Calls·30d /
 * Minutes handled / AI cost·30d / Reviews ask from calls) · Number-provisioning
 * card · Call-log table · Transcript-to-review card · Voice→Review automation
 * card.
 *
 * EVERY figure is live tenant data — the same reads/aggregates that already
 * powered this page: PhoneNumber list, recent PhoneCall list (intent/summary
 * are real columns), 30-day aggregates, PhoneAssistant config, and the REVIEW
 * column joins ReviewRequest rows (triggerSource="voice_call") matched on the
 * call's lead contact — the exact keys lib/phone/voice-review.ts writes. Empty
 * account → the kit's empty states (no fabricated numbers).
 */

export const dynamic = "force-dynamic";

// Active story panel → audio/play+waveform art (kit "transcript to review_active").
// Empty panel → document+chat art (kit "transcript to review_empty", real raster).
const TRANSCRIPT_ILLO = "/assets/repulabs/phone/transcript-to-review.svg";
const TRANSCRIPT_EMPTY_ILLO = "/assets/repulabs/phone/transcript-empty.svg";

export default async function PhoneDashboardPage() {
  // LOCKED: not released yet — locked on every plan, Pro included.
  // To release: delete these two lines (the dashboard below is intact).
  return <ComingSoonPage module="phone" />;
}

async function PhoneDashboardPageLocked() {
  const { orgId } = await getOrgContext();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const loadPhone = () =>
    withTenant(orgId, async (tx) =>
      Promise.all([
        tx.phoneNumber.findMany({
          where: { status: "active" },
          orderBy: { createdAt: "desc" },
        }),
        tx.phoneCall.findMany({
          orderBy: { startedAt: "desc" },
          take: 8,
        }),
        tx.phoneCall.aggregate({
          where: { startedAt: { gte: since30d } },
          _count: { _all: true },
          _sum: { aiCostMicros: true, durationSeconds: true },
        }),
        tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
        // Latest call WITH an AI summary — drives the "Transcript to review"
        // narrative card (may be older than the 8 most recent calls).
        tx.phoneCall.findFirst({
          where: { summary: { not: null } },
          orderBy: { startedAt: "desc" },
        }),
      ]),
    );
  type PhoneData = Awaited<ReturnType<typeof loadPhone>>;
  // Fail-soft: a transient DB error / pre-migration window must not 500 the page.
  let phoneNumbers: PhoneData[0] = [];
  let recentCalls: PhoneData[1] = [];
  let stats: PhoneData[2] = {
    _count: { _all: 0 },
    _sum: { aiCostMicros: null, durationSeconds: null },
  };
  let assistant: PhoneData[3] = null;
  let storyCall: PhoneData[4] = null;
  try {
    [phoneNumbers, recentCalls, stats, assistant, storyCall] = await loadPhone();
  } catch {
    /* render empty/zero */
  }

  // Voice → Review funnel status (Module 15). Fail-soft: autopilot_configs may
  // not be migrated yet, and review_requests is long-existing but guard anyway.
  const voiceReview = await getVoiceReviewStatus(orgId, since30d);

  // REVIEW column: voice-originated review requests for the listed calls'
  // contacts (recipient = leadPhone | leadEmail — the keys voice-review.ts
  // enqueues with). Most recent request per recipient wins.
  const reviewByRecipient = await getVoiceReviewRequests(orgId, [
    ...recentCalls,
    ...(storyCall ? [storyCall] : []),
  ]);

  const totalCalls = stats._count._all ?? 0;
  const totalMinutes = Math.round((stats._sum.durationSeconds ?? 0) / 60);
  const totalCost = ((stats._sum.aiCostMicros ?? 0) / 1_000_000).toFixed(2);
  const avgMinutes = totalCalls > 0 ? (totalMinutes / totalCalls).toFixed(1) : null;
  // Empty account = no calls AND no number → show the kit's "--" placeholders.
  const hasActivity = totalCalls > 0;

  const [mainNumber, ...extraNumbers] = phoneNumbers;

  return (
    <div className="pr">
      <AppShellServer
        topBar={<TopBar />}
        crumbs={["Intelligence", "Phone Receptionist"]}
      >
        {/* ── Hero — kit composition: copy left, actions top-right, headset
            illustration lower-right (real kit asset main.svg) ── */}
        <header className="pr-hero">
          <div className="pr-hero__copy">
            <span className="pr-hero__pill">
              <Icon name="sparkle" size={12} stroke={2.2} />
              {assistant?.enabled
                ? "VOICE · LIVE, ANSWERING 24/7"
                : "VOICE · PAUSED"}
            </span>
            <h1 className="pr-hero__title">
              Answer calls and turn
              <br />
              great moments into{" "}
              <span className="pr-hero__title-em">reviews</span>
            </h1>
            <p className="pr-hero__sub">
              Number provisioning, AI receptionist settings, call logs, and
              review conversion — your AI answers, qualifies, books, and asks
              happy callers for a review.
            </p>
          </div>
          <div className="pr-hero__right">
            <div className="pr-hero__actions">
              <Link href="/phone/voices" className="pr-btn pr-btn--sec">
                <Icon name="sound" size={14} />
                Voice cloning
              </Link>
              <Link href="/phone/assistant" className="pr-btn pr-btn--sec">
                <Icon name="bot" size={14} />
                Assistant
              </Link>
              <Link href="/phone/setup" className="pr-btn pr-btn--pri">
                <Icon name="sparkle" size={14} />
                Provision number
              </Link>
            </div>
            {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration; next/image optimizer 400s on these */}
            <img
              className="pr-hero__art"
              src="/assets/repulabs/phone/hero-main.svg"
              alt=""
              aria-hidden="true"
            />
          </div>
        </header>

        {/* ── KPI row — all live aggregates ── */}
        <div className="pr-kpis">
          <Kpi
            tone="lav"
            icon="phone"
            label="Calls · 30d"
            value={hasActivity ? String(totalCalls) : "—"}
            sub={avgMinutes ? `${avgMinutes}m avg per call` : "— vs last 30d"}
            positive={hasActivity}
          />
          <Kpi
            tone="lav"
            icon="sound"
            label="Minutes handled"
            value={hasActivity ? String(totalMinutes) : "—"}
            sub={hasActivity ? "AI on the phone" : "— vs last 30d"}
            positive={hasActivity}
          />
          <Kpi
            tone="green"
            icon="card"
            label="AI cost · 30d"
            value={hasActivity ? `$${totalCost}` : "—"}
            sub={hasActivity ? "Pay-as-you-talk" : "— vs last 30d"}
            positive={hasActivity}
          />
          <Kpi
            tone="yellow"
            icon="star"
            label="Reviews ask from calls"
            value={
              voiceReview.last30d > 0
                ? String(voiceReview.last30d)
                : hasActivity
                  ? "0"
                  : "—"
            }
            sub={voiceReview.enabled ? "Voice → Review on" : "Voice → Review off"}
            positive={voiceReview.enabled && voiceReview.last30d > 0}
          />
        </div>

        {/* ── middle grid: number provisioning | call log ── */}
        <div className="pr-mid">
          {/* Number provisioning */}
          <div className="pr-card">
            <div className="pr-card__head">
              <h3 className="pr-card__title">Number provisioning</h3>
              <Link href="/phone/setup" className="pr-card__link">
                Local voice line
              </Link>
            </div>
            {mainNumber ? (
              <div className="pr-prov-body">
                <div className="pr-prov-illo" aria-hidden="true">
                  {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
                  <img
                    className="pr-prov-illo__img"
                    src="/assets/repulabs/phone/number-provisioning.svg"
                    alt=""
                  />
                  <span className="pr-numpill">
                    {formatE164(mainNumber.phoneE164)}
                    <span className="pr-numpill__dot">
                      <Icon name="check" size={9} stroke={3} />
                    </span>
                  </span>
                </div>
                <p className="pr-prov-copy">
                  {mainNumber.friendlyName || "Local line"} is live and the AI is
                  answering
                  {extraNumbers.length > 0
                    ? ` · ${extraNumbers.length + 1} numbers leased.`
                    : "."}
                </p>
                <Link href="/phone/setup" className="pr-btn pr-btn--pri">
                  <Icon name="plus" size={13} />
                  Buy local number
                </Link>
              </div>
            ) : (
              <div className="pr-prov-body">
                <div className="pr-prov-illo" aria-hidden="true">
                  {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
                  <img
                    className="pr-prov-illo__img"
                    src="/assets/repulabs/phone/number-provisioning.svg"
                    alt=""
                  />
                  <span className="pr-numpill">
                    (555) 123-4567
                    <span className="pr-numpill__dot">
                      <Icon name="check" size={9} stroke={3} />
                    </span>
                  </span>
                </div>
                <p className="pr-prov-copy">
                  No numbers leased yet. Lease a local line and the AI starts
                  answering.
                </p>
                <Link href="/phone/setup" className="pr-btn pr-btn--pri">
                  Buy local number
                </Link>
              </div>
            )}
          </div>

          {/* Call log */}
          <div className="pr-card">
            <div className="pr-card__head">
              <h3 className="pr-card__title">Call log</h3>
              <div
                className="row"
                style={{ gap: 10, marginLeft: "auto", alignItems: "center" }}
              >
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: "#252f67" }}
                >
                  Recent calls
                </span>
                <Link href="/phone/calls" className="pr-btn pr-btn--sec pr-btn--xs">
                  View all
                </Link>
              </div>
            </div>
            {recentCalls.length === 0 ? (
              <div className="pr-empty">
                <span className="pr-circle" style={{ width: 72, height: 72 }}>
                  <Icon name="phone" size={30} />
                </span>
                <div className="pr-empty__title">No calls yet</div>
                <div className="pr-empty__body">
                  Calls will appear here as they come in.
                </div>
              </div>
            ) : (
              <div className="pr-tablewrap">
                <table className="pr-tbl">
                  <thead>
                    <tr>
                      <th>Caller</th>
                      <th>Intent</th>
                      <th>Outcome</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCalls.map((c) => {
                      const outcome = callOutcome(
                        c.status,
                        c.forwardedTo,
                        c.intent,
                      );
                      const review = reviewChip(
                        reviewByRecipient.get(c.leadPhone ?? "") ??
                          reviewByRecipient.get(c.leadEmail ?? ""),
                      );
                      return (
                        <tr key={c.id}>
                          <td>
                            <Link
                              href={`/phone/calls/${c.id}`}
                              className="pr-caller"
                            >
                              <span className="pr-caller__name">
                                {c.leadName || formatE164(c.fromE164)}
                              </span>
                              <span className="pr-caller__sub">
                                {c.leadName ? `${formatE164(c.fromE164)} · ` : ""}
                                {c.durationSeconds
                                  ? `${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s`
                                  : "—"}{" "}
                                · {c.startedAt ? relativeTime(c.startedAt) : "—"}
                              </span>
                            </Link>
                          </td>
                          <td className="pr-intent">
                            {c.intent?.replace(/_/g, " ") || "—"}
                          </td>
                          <td>
                            <span className={`pr-chip ${outcome.tone}`}>
                              {outcome.label}
                            </span>
                          </td>
                          <td>{review}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Transcript to review ── */}
        <div className="pr-card" style={{ marginBottom: 14 }}>
          <div className="pr-card__head">
            <h3 className="pr-card__title">Transcript to review</h3>
            <span className="pr-card__action">All responses</span>
          </div>
          {storyCall?.summary ? (
            <div className="pr-story">
              <div style={{ minWidth: 0 }}>
                <p className="pr-story__quote">{storyCall.summary}</p>
                <div className="pr-story__meta">
                  <strong style={{ color: "var(--pr-ink-strong)" }}>
                    {storyCall.leadName || formatE164(storyCall.fromE164)}
                  </strong>
                  {storyCall.intent && (
                    <span className="pr-chip pr-chip--info pr-intent">
                      {storyCall.intent.replace(/_/g, " ")}
                    </span>
                  )}
                  {reviewChip(
                    reviewByRecipient.get(storyCall.leadPhone ?? "") ??
                      reviewByRecipient.get(storyCall.leadEmail ?? ""),
                    true,
                  )}
                  <span>
                    {storyCall.startedAt ? relativeTime(storyCall.startedAt) : ""}
                  </span>
                  <Link
                    href={`/phone/calls/${storyCall.id}`}
                    className="pr-link"
                  >
                    Read full transcript →
                  </Link>
                </div>
              </div>
              <div className="pr-story__art">
                {/* biome-ignore lint/performance/noImgElement: static brand illustration */}
                <img src={TRANSCRIPT_ILLO} alt="" aria-hidden="true" />
              </div>
            </div>
          ) : (
            <div className="pr-story pr-story--empty">
              <div className="pr-story__art">
                {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
                <img src={TRANSCRIPT_EMPTY_ILLO} alt="" aria-hidden="true" />
              </div>
              <div>
                <div className="pr-empty__title">No transcripts yet</div>
                <p className="pr-story__empty-copy" style={{ marginTop: 6 }}>
                  Transcripts of calls will appear here after your AI receptionist
                  has conversations.
                </p>
                <Link
                  href="/phone/calls"
                  className="pr-btn pr-btn--outline"
                  style={{ marginTop: 14 }}
                >
                  View transcripts
                  <Icon name="chevR" size={13} />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Voice → Review automation card ── */}
        <Link
          href="/autopilot"
          className="pr-card pr-v2r"
          style={{
            marginBottom: 14,
            borderColor: voiceReview.enabled
              ? "var(--pr-pri)"
              : "var(--pr-line)",
          }}
        >
          <span className="pr-tile pr-tile--grad pr-v2r__tile">
            <Icon name="chat" size={26} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 15, color: "var(--pr-ink-strong)" }}>
                Voice → Review
              </strong>
              <span
                className={`pr-chip ${voiceReview.enabled ? "pr-chip--ok" : "pr-chip--info"}`}
              >
                {voiceReview.enabled ? "On" : "Off"}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--pr-ink-3)",
                marginTop: 3,
              }}
            >
              {voiceReview.enabled
                ? `Resolved calls become Google review requests automatically — ${voiceReview.last30d} created in the last 30 days.`
                : "Turn resolved phone calls into Google reviews automatically. Manage in Autopilot."}
            </div>
          </div>
          <span className="pr-v2r__chevron">
            <Icon name="chevR" size={16} />
          </span>
        </Link>

        {!assistant?.enabled && (
          <div className="pr-card" style={{ padding: 18 }}>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <Icon
                name="alert"
                size={18}
                style={{ color: "var(--pr-warn)", flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 13, color: "var(--pr-ink-strong)" }}>
                  The AI assistant is paused
                </strong>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--pr-muted)",
                    marginTop: 2,
                  }}
                >
                  Configure the voice + prompt, then flip it live to start
                  answering calls.
                </div>
              </div>
              <Link href="/phone/assistant" className="pr-btn pr-btn--pri">
                Configure
              </Link>
            </div>
          </div>
        )}
      </AppShellServer>
    </div>
  );
}

function Kpi({
  tone,
  icon,
  label,
  value,
  sub,
  positive,
}: {
  tone: "lav" | "green" | "yellow";
  icon: "phone" | "sound" | "card" | "star";
  label: string;
  value: string;
  sub: string;
  /** Green chip only for a real positive signal; neutral otherwise. */
  positive?: boolean;
}) {
  return (
    <div className="pr-kpi">
      <span className={`pr-tile pr-tile--${tone} pr-kpi__tile`}>
        {icon === "card" ? (
          // Kit AI-cost glyph: solid green circle with a white $ (handoff §13),
          // not a credit-card outline. No dollar icon exists in the shared set.
          <span className="pr-kpi__dollar" aria-hidden="true">
            $
          </span>
        ) : (
          <Icon name={icon} size={icon === "star" ? 30 : 28} />
        )}
      </span>
      <div className="pr-kpi__body">
        <div className="pr-kpi__label">{label}</div>
        <div className="pr-kpi__value">{value}</div>
        <span className={`pr-trend${positive ? " pr-trend--up" : ""}`}>{sub}</span>
      </div>
    </div>
  );
}

/** +1AAABBBCCCC → (AAA) BBB-CCCC; anything else stays raw E.164. */
function formatE164(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 ?? "—");
}

/** Derive the OUTCOME cell from real call fields (Twilio status + handoff). */
function callOutcome(
  status: string | null,
  forwardedTo: string | null,
  intent: string | null,
): { label: string; tone: string } {
  if (forwardedTo) return { label: "Handoff", tone: "pr-chip--warn" };
  switch (status) {
    case "completed":
      return /book/i.test(intent ?? "")
        ? { label: "Booked", tone: "pr-chip--ok" }
        : { label: "Answered", tone: "pr-chip--ok" };
    case "failed":
    case "busy":
    case "no-answer":
    case "canceled":
      return { label: "Missed", tone: "pr-chip--bad" };
    case "in-progress":
    case "ringing":
      return { label: "Live", tone: "pr-chip--info" };
    default:
      return {
        label: status ? status.replace(/-/g, " ") : "—",
        tone: "pr-chip--out",
      };
  }
}

/** REVIEW cell: ReviewRequest status → chip (or a quiet em-dash). */
function reviewChip(
  status: string | undefined,
  hideDash = false,
): React.ReactNode {
  if (!status)
    return hideDash ? null : (
      <span style={{ color: "var(--pr-muted-2)" }}>—</span>
    );
  const map: Record<string, { label: string; tone: string }> = {
    queued: { label: "Queued", tone: "pr-chip--warn" },
    scheduled: { label: "Queued", tone: "pr-chip--warn" },
    sending: { label: "Sent", tone: "pr-chip--info" },
    sent: { label: "Sent", tone: "pr-chip--info" },
    delivered: { label: "Sent", tone: "pr-chip--info" },
    opened: { label: "Opened", tone: "pr-chip--info" },
    clicked: { label: "Clicked", tone: "pr-chip--info" },
    reviewed: { label: "Reviewed", tone: "pr-chip--ok" },
    converted: { label: "Reviewed", tone: "pr-chip--ok" },
    failed: { label: "Failed", tone: "pr-chip--bad" },
    bounced: { label: "Failed", tone: "pr-chip--bad" },
  };
  const c = map[status] ?? { label: status, tone: "pr-chip--out" };
  return <span className={`pr-chip ${c.tone}`}>{c.label}</span>;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/**
 * Map recipient (leadPhone/leadEmail) → latest voice-originated ReviewRequest
 * status, for the calls shown on this page. Matches the write path in
 * lib/phone/voice-review.ts (triggerSource "voice_call", recipient = the lead
 * contact). Fully fail-soft → empty map.
 */
async function getVoiceReviewRequests(
  orgId: string,
  calls: Array<{ leadPhone: string | null; leadEmail: string | null }>,
): Promise<Map<string, string>> {
  const recipients = [
    ...new Set(
      calls
        .flatMap((c) => [c.leadPhone, c.leadEmail])
        .filter((r): r is string => !!r && r.trim().length > 0),
    ),
  ];
  if (recipients.length === 0) return new Map();
  try {
    const rows = await withTenant(orgId, (tx) =>
      tx.reviewRequest.findMany({
        where: { triggerSource: "voice_call", recipient: { in: recipients } },
        orderBy: { createdAt: "desc" },
        select: { recipient: true, status: true },
      }),
    );
    const map = new Map<string, string>();
    for (const r of rows) if (!map.has(r.recipient)) map.set(r.recipient, r.status);
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Voice→Review funnel status for the phone dashboard card (Module 15). Reads the
 * AutopilotConfig toggle (default ON when no row) + a 30-day count of
 * voice-originated review requests. Fully fail-soft (unmigrated tables → off/0).
 */
async function getVoiceReviewStatus(
  orgId: string,
  since: Date,
): Promise<{ enabled: boolean; last30d: number }> {
  try {
    return await withTenant(orgId, async (tx) => {
      let enabled = true;
      try {
        const cfg = await tx.autopilotConfig.findUnique({
          where: { organizationId: orgId },
          select: { enabled: true, voiceToReviewEnabled: true },
        });
        // Surfaced as "on" only when Autopilot is on AND the loop is enabled.
        enabled = cfg ? cfg.enabled && cfg.voiceToReviewEnabled : false;
      } catch {
        enabled = false;
      }
      let last30d = 0;
      try {
        last30d = await tx.reviewRequest.count({
          where: { triggerSource: "voice_call", createdAt: { gte: since } },
        });
      } catch {
        last30d = 0;
      }
      return { enabled, last30d };
    });
  } catch {
    return { enabled: false, last30d: 0 };
  }
}
