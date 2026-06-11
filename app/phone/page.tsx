import { AppShellServer } from "@/components/app-shell-server";
import { EmptyIllustration } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { Sparkline } from "@/components/shell/sparkline";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import "./phone.css";

/**
 * Phone receptionist — repulabs v2 design (target: design-mockups/phone-after.png).
 *
 * Layout: number-provisioning card (large formatted number + live chip + Buy
 * local number) | call-log table (CALLER / INTENT / OUTCOME / REVIEW) on top,
 * then a full-width "Transcript to review" narrative card.
 *
 * ALL live tenant data: PhoneNumber list, recent PhoneCall list (intent/summary
 * are real columns), 30-day aggregates, PhoneAssistant config, and the REVIEW
 * column joins ReviewRequest rows with triggerSource="voice_call" matched on
 * the call's lead contact — the exact keys lib/phone/voice-review.ts writes.
 */

export const dynamic = "force-dynamic";

const VOICE_ILLO = "/assets/repulabs/illustrations/voice-review.png";

export default async function PhoneDashboardPage() {
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
  let stats: PhoneData[2] = { _count: { _all: 0 }, _sum: { aiCostMicros: null, durationSeconds: null } };
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
  const totalCost = ((stats._sum.aiCostMicros ?? 0) / 1_000_000).toFixed(2);
  const totalMinutes = Math.round((stats._sum.durationSeconds ?? 0) / 60);
  const avgMinutes = totalCalls > 0 ? (totalMinutes / totalCalls).toFixed(1) : "0";

  const [mainNumber, ...extraNumbers] = phoneNumbers;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Intelligence", "Phone Receptionist"]}>
      <PageHeader
        kicker={assistant?.enabled ? "Voice · live, answering 24/7" : "Voice · paused"}
        title="Answer calls and turn great moments into reviews"
        description="Number provisioning, AI receptionist settings, call logs, and review conversion — your AI answers, qualifies, books, and asks happy callers for a review."
        actions={
          <>
            <Link href="/phone/voices" className="btn">
              <Icon name="sound" size={12} />
              Voice cloning
            </Link>
            <Link href="/phone/assistant" className="btn">
              <Icon name="sliders" size={12} />
              Assistant
            </Link>
            <Link href="/phone/setup" className="btn btn--pri">
              <Icon name="plus" size={12} />
              Provision number
            </Link>
          </>
        }
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 14 }}>
        <Kpi
          l="Calls · 30d"
          v={String(totalCalls)}
          d={`${avgMinutes}m avg`}
          up={totalCalls > 0}
          spark={[2, 3, 4, 6, 5, 8, 7]}
        />
        <Kpi
          l="Minutes handled"
          v={String(totalMinutes)}
          d="AI on the phone"
          up={totalMinutes > 0}
        />
        <Kpi l="AI cost · 30d" v={`$${totalCost}`} d="Pay-as-you-talk" />
        <Kpi
          l="Reviews from calls"
          v={String(voiceReview.last30d)}
          d={voiceReview.enabled ? "Voice → Review on" : "Voice → Review off"}
          up={voiceReview.last30d > 0}
        />
      </div>

      <div className="ph2-grid">
        {/* ── Number provisioning ── */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Number provisioning</h3>
            <span className="dim" style={{ fontSize: 11 }}>
              Local voice line
            </span>
          </div>
          {mainNumber ? (
            <>
              <div className="ph2-numpanel">
                <div className="ph2-numpanel__label">
                  {mainNumber.friendlyName || "Main line"}
                </div>
                <div className="ph2-num">{formatE164(mainNumber.phoneE164)}</div>
                <div className="ph2-numpanel__meta">
                  <span className="chip chip--ok">
                    {assistant?.enabled ? "Live" : "Active"}
                  </span>
                  {mainNumber.forwardToE164 && (
                    <span className="dim mono" style={{ fontSize: 11 }}>
                      Handoff → {formatE164(mainNumber.forwardToE164)}
                    </span>
                  )}
                </div>
              </div>
              {extraNumbers.map((p) => (
                <Link key={p.id} href="/phone/setup" className="ph2-extra">
                  <Icon name="phone" size={13} style={{ color: "var(--pri)", flexShrink: 0 }} />
                  <span className="mono" style={{ fontWeight: 500 }}>
                    {formatE164(p.phoneE164)}
                  </span>
                  {p.friendlyName && <span className="dim">{p.friendlyName}</span>}
                  <span className="chip chip--ok" style={{ marginLeft: "auto" }}>
                    Active
                  </span>
                </Link>
              ))}
              <div className="ph2-actions">
                <Link href="/phone/setup" className="btn">
                  <Icon name="plus" size={11} />
                  Buy local number
                </Link>
              </div>
            </>
          ) : (
            <div className="ds-card__body" style={{ textAlign: "center", padding: "24px 18px" }}>
              <EmptyIllustration name="phone-empty" size={170} />
              <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>
                No numbers leased yet. Lease a local line and the AI starts answering.
              </p>
              <Link href="/phone/setup" className="btn btn--pri" style={{ marginTop: 12 }}>
                Buy local number
              </Link>
            </div>
          )}
        </div>

        {/* ── Call log ── */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Call log</h3>
            <div className="row" style={{ gap: 8 }}>
              <span className="dim" style={{ fontSize: 11 }}>
                Recent calls
              </span>
              <Link href="/phone/calls" className="btn btn--xs">
                View all
              </Link>
            </div>
          </div>
          {recentCalls.length === 0 ? (
            <div className="ds-card__body dim" style={{ textAlign: "center", padding: 32 }}>
              <Icon name="phone" size={28} style={{ color: "var(--pri)" }} />
              <p style={{ marginTop: 10, fontSize: 13 }}>Calls will appear here as they come in.</p>
            </div>
          ) : (
            <div className="ph2-tablewrap">
              <table className="tbl tbl--compact">
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
                    const outcome = callOutcome(c.status, c.forwardedTo, c.intent);
                    const review = reviewChip(
                      reviewByRecipient.get(c.leadPhone ?? "") ??
                        reviewByRecipient.get(c.leadEmail ?? ""),
                    );
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/phone/calls/${c.id}`} className="ph2-caller">
                            <span className="ph2-caller__name">
                              {c.leadName || formatE164(c.fromE164)}
                            </span>
                            <span className="ph2-caller__sub">
                              {c.leadName ? `${formatE164(c.fromE164)} · ` : ""}
                              {c.durationSeconds
                                ? `${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s`
                                : "—"}{" "}
                              · {c.startedAt ? relativeTime(c.startedAt) : "—"}
                            </span>
                          </Link>
                        </td>
                        <td className="ph2-intent">{c.intent?.replace(/_/g, " ") || "—"}</td>
                        <td>
                          <span className={`chip ${outcome.tone}`}>{outcome.label}</span>
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

      {/* ── Transcript to review (AI narrative) ── */}
      <div className="ds-card" style={{ marginBottom: 14 }}>
        <div className="ds-card__head">
          <h3 className="ds-card__title">Transcript to review</h3>
          <span className="dim" style={{ fontSize: 11 }}>
            AI receptionist
          </span>
        </div>
        {storyCall?.summary ? (
          <div className="ph2-story">
            <div style={{ minWidth: 0 }}>
              <p className="ph2-story__quote">{storyCall.summary}</p>
              <div className="ph2-story__meta">
                <strong style={{ color: "var(--ink)" }}>
                  {storyCall.leadName || formatE164(storyCall.fromE164)}
                </strong>
                {storyCall.intent && (
                  <span className="chip chip--info ph2-intent">
                    {storyCall.intent.replace(/_/g, " ")}
                  </span>
                )}
                {reviewChip(
                  reviewByRecipient.get(storyCall.leadPhone ?? "") ??
                    reviewByRecipient.get(storyCall.leadEmail ?? ""),
                  true,
                )}
                <span>{storyCall.startedAt ? relativeTime(storyCall.startedAt) : ""}</span>
                <Link
                  href={`/phone/calls/${storyCall.id}`}
                  style={{ color: "var(--pri)", fontWeight: 600, textDecoration: "none" }}
                >
                  Read full transcript →
                </Link>
              </div>
            </div>
            <div className="ph2-story__art">
              {/* biome-ignore lint/performance/noImgElement: static brand illustration */}
              <img src={VOICE_ILLO} alt="" aria-hidden="true" />
            </div>
          </div>
        ) : (
          <div className="ph2-story ph2-story--empty">
            <div>
              <EmptyIllustration name={VOICE_ILLO} size={230} />
              <p className="dim" style={{ marginTop: 10, fontSize: 13, maxWidth: 420, marginInline: "auto" }}>
                After each answered call the AI writes a summary here — and when the moment is
                right, it queues a friendly review request automatically.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Voice → Review funnel card (Module 15) */}
      <Link
        href="/autopilot"
        className="ds-card"
        style={{
          display: "block",
          marginBottom: 14,
          padding: 16,
          textDecoration: "none",
          color: "inherit",
          borderColor: voiceReview.enabled ? "var(--pri)" : "var(--line)",
        }}
      >
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: voiceReview.enabled ? "var(--pri)" : "var(--pri-50)",
              color: voiceReview.enabled ? "#fff" : "var(--pri)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="star" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <strong style={{ fontSize: 14 }}>Voice → Review</strong>
              <span className={`chip ${voiceReview.enabled ? "chip--ok" : "chip--info"}`}>
                {voiceReview.enabled ? "On" : "Off"}
              </span>
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              {voiceReview.enabled
                ? `Resolved calls become Google review requests automatically — ${voiceReview.last30d} sent in the last 30 days.`
                : "Turn resolved phone calls into Google reviews automatically. Manage in Autopilot."}
            </div>
          </div>
          <Icon name="chevR" size={14} style={{ color: "var(--rl-muted-2)" }} />
        </div>
      </Link>

      {!assistant?.enabled && (
        <div className="ds-card" style={{ padding: 18 }}>
          <div className="row" style={{ gap: 12 }}>
            <Icon name="alert" size={18} style={{ color: "var(--warn)" }} />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>The AI assistant is paused</strong>
              <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                Configure the voice + prompt, then flip it live to start answering calls.
              </div>
            </div>
            <Link href="/phone/assistant" className="btn btn--pri">
              Configure
            </Link>
          </div>
        </div>
      )}
    </AppShellServer>
  );
}

function Kpi({
  l,
  v,
  d,
  spark,
  up,
}: {
  l: string;
  v: string;
  d: string;
  spark?: number[];
  up?: boolean;
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div
          className="row"
          style={{ alignItems: "flex-end", gap: 8, justifyContent: "space-between" }}
        >
          <span className="stat__value">{v}</span>
          {spark && <Sparkline points={spark} width={68} height={26} />}
        </div>
        <div className={`stat__delta${up ? " up" : ""}`}>
          {up && <Icon name="arrowU" size={10} stroke={2.4} />}
          {d}
        </div>
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
  if (forwardedTo) return { label: "Handoff", tone: "chip--warn" };
  switch (status) {
    case "completed":
      return /book/i.test(intent ?? "")
        ? { label: "Booked", tone: "chip--ok" }
        : { label: "Answered", tone: "chip--ok" };
    case "failed":
    case "busy":
    case "no-answer":
    case "canceled":
      return { label: "Missed", tone: "chip--bad" };
    case "in-progress":
    case "ringing":
      return { label: "Live", tone: "chip--info" };
    default:
      return { label: status ? status.replace(/-/g, " ") : "—", tone: "chip--out" };
  }
}

/** REVIEW cell: ReviewRequest status → chip (or a quiet em-dash). */
function reviewChip(status: string | undefined, hideDash = false): React.ReactNode {
  if (!status) return hideDash ? null : <span className="dim">—</span>;
  const map: Record<string, { label: string; tone: string }> = {
    queued: { label: "Queued", tone: "chip--warn" },
    scheduled: { label: "Queued", tone: "chip--warn" },
    sending: { label: "Sent", tone: "chip--info" },
    sent: { label: "Sent", tone: "chip--info" },
    delivered: { label: "Sent", tone: "chip--info" },
    opened: { label: "Opened", tone: "chip--pri" },
    clicked: { label: "Clicked", tone: "chip--pri" },
    reviewed: { label: "Reviewed", tone: "chip--ok" },
    converted: { label: "Reviewed", tone: "chip--ok" },
    failed: { label: "Failed", tone: "chip--bad" },
    bounced: { label: "Failed", tone: "chip--bad" },
  };
  const c = map[status] ?? { label: status, tone: "chip--out" };
  return <span className={`chip ${c.tone}`}>{c.label}</span>;
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
