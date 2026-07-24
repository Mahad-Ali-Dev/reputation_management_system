import { Icon, type IconName } from "@/components/shell/icon";
import Image from "next/image";
import Link from "next/link";
import { relativeTime } from "../training/_components/shared-utils";

/**
 * Knowledge tab — the kit dashboard (active AND empty states), server-rendered.
 *
 * Every figure is a LIVE tenant value passed down from the /ai page:
 *   - readiness %      → computeReadiness(profile, indexedDocs, hasWidget)
 *   - total / active   → real ai_documents counts
 *   - last updated     → newest doc lastIndexedAt (or "—")
 *   - status           → derived from counts
 *   - business overview → AiTrainingProfile.businessOverview / servicesProducts / pricingDetails
 *   - business location → establishment.address + operatingHours
 *   - recent learning   → answered knowledge gaps (real learning events)
 * Sections with no real data render a tasteful empty/zero state — never a
 * fabricated value. Interactive source management lives in <SourcePanel>
 * (rendered by the page) which wraps the existing KbAddForms + doc list.
 */

const ASSET = "/assets/repulabs/ai-kb";

const DAY_LABELS: Array<[string, string]> = [
  ["monday", "Mo"],
  ["tuesday", "Tu"],
  ["wednesday", "We"],
  ["thursday", "Th"],
  ["friday", "Fr"],
  ["saturday", "Sa"],
  ["sunday", "Su"],
];

/** Format a "HH:MM" 24h time to the kit's "09:00 AM" 12h display. */
function to12h(t: string | undefined): string {
  if (!t) return "—";
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return t;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

export type BusinessDetailRow = { id: string; icon: IconName; title: string; body: string | null };
export type RecentLearningRow = {
  id: string;
  title: string;
  when: string;
  tone: "success" | "warning" | "info";
};
export type LocationData = {
  address: string | null;
  hours: Record<string, { open?: string; close?: string }>;
};

/**
 * Readiness + stats summary row. In the kit this sits ABOVE the tabs strip on
 * the Knowledge surface, so the page renders it between the hero and the tabs
 * (and only on the Knowledge tab).
 */
export function KnowledgeSummary({
  readinessPct,
  totalSources,
  activeSources,
  lastUpdated,
}: {
  readinessPct: number;
  totalSources: number;
  activeSources: number;
  lastUpdated: Date | null;
}) {
  const hasSources = totalSources > 0;
  const statusLabel = hasSources ? "Active" : "Getting started";

  // readiness ring geometry
  const R = 60;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.max(0, Math.min(100, readinessPct)) / 100);
  const readinessCopy =
    readinessPct >= 90
      ? "Excellent! Your AI has a deep understanding of your business."
      : readinessPct >= 40
        ? "Solid foundation — keep adding sources to raise answer confidence."
        : "Let's get started! Build your knowledge base to make your AI smarter.";

  return (
    <div className="akb-summary">
        {/* knowledge strength */}
        <section className="akb-card akb-readiness" aria-label="Knowledge strength">
          <span className="akb-readiness__tile" aria-hidden="true">
            <Image
              src={`${ASSET}/knowledge-strength.svg`}
              alt=""
              width={76}
              height={76}
              unoptimized
            />
          </span>
          <div className="akb-readiness__body">
            <span className="akb-eyebrow">
              Knowledge strength
              <Icon name="info" size={12} />
            </span>
            <h3 className="akb-readiness__metric">
              Brain readiness: <span style={{ color: "var(--akb-success)" }}>{readinessPct}%</span>
            </h3>
            <p className="akb-readiness__copy">{readinessCopy}</p>
            {/* biome-ignore lint/a11y/useFocusableInteractive: progressbar is a display-only ARIA value, not a focusable control */}
            <div
              className="akb-progress"
              role="progressbar"
              aria-label={`Brain readiness ${readinessPct} percent`}
              aria-valuenow={readinessPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="akb-progress__fill" style={{ width: `${readinessPct}%` }} />
            </div>
          </div>
          <div className="akb-ring" aria-hidden="true">
            <svg width="134" height="134" viewBox="0 0 134 134" aria-hidden="true">
              <circle cx="67" cy="67" r={R} fill="none" stroke="var(--akb-track)" strokeWidth="8" />
              <circle
                cx="67"
                cy="67"
                r={R}
                fill="none"
                stroke="var(--akb-success)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
              />
            </svg>
            <span className="akb-ring__label">{readinessPct}%</span>
          </div>
        </section>

        {/* stats 2x2 */}
        <section className="akb-card akb-stats" aria-label="Knowledge base stats">
          <div className="akb-stat">
            <div className="akb-stat__head">
              <span className="akb-stat__tile" aria-hidden="true">
                <Image
                  src={`${ASSET}/stat-total-sources.svg`}
                  alt=""
                  width={30}
                  height={30}
                  unoptimized
                />
              </span>
              <span className="akb-stat__label">Total sources</span>
            </div>
            <div className="akb-stat__value">{totalSources}</div>
          </div>
          <div className="akb-stat">
            <div className="akb-stat__head">
              <span className="akb-stat__tile" aria-hidden="true">
                <Image
                  src={`${ASSET}/stat-active-sources.svg`}
                  alt=""
                  width={30}
                  height={30}
                  unoptimized
                />
              </span>
              <span className="akb-stat__label">Active sources</span>
              {activeSources > 0 && <span className="akb-stat__dot" aria-hidden="true" />}
            </div>
            <div className="akb-stat__value">{activeSources}</div>
          </div>
          <div className="akb-stat">
            <div className="akb-stat__head">
              <span className="akb-stat__tile" aria-hidden="true">
                <Image
                  src={`${ASSET}/stat-last-updated.svg`}
                  alt=""
                  width={30}
                  height={30}
                  unoptimized
                />
              </span>
              <span className="akb-stat__label">Last updated</span>
            </div>
            <div className="akb-stat__value akb-stat__value--sm">
              {lastUpdated ? relativeTime(lastUpdated) : "—"}
            </div>
          </div>
          <div className="akb-stat">
            <div className="akb-stat__head">
              <span className="akb-stat__tile" aria-hidden="true">
                <Image src={`${ASSET}/stat-status.svg`} alt="" width={30} height={30} unoptimized />
              </span>
              <span className="akb-stat__label">Status</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <span
                className={`akb-pill ${hasSources ? "akb-pill--success" : "akb-pill--warning"}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        </section>
    </div>
  );
}

/**
 * Knowledge body — sources + quick actions row, then the business
 * overview / location / recent-learning bottom row. Rendered AFTER the tabs
 * strip (the readiness/stats summary renders before the tabs).
 */
export function KnowledgeBody({
  hasSources,
  websiteActive,
  businessDetails,
  location,
  recentLearning,
}: {
  hasSources: boolean;
  websiteActive: boolean;
  businessDetails: BusinessDetailRow[];
  location: LocationData;
  recentLearning: RecentLearningRow[];
}) {
  const filledDetails = businessDetails.filter((d) => d.body && d.body.trim().length > 0);
  const hasOverview = filledDetails.length > 0;
  const hasLocation = Boolean(location.address && location.address.trim().length > 0);
  const activeDay = DAY_LABELS.find(([k]) => location.hours[k]?.open)?.[0] ?? "monday";
  const openTime = location.hours[activeDay]?.open ?? "09:00";
  const closeTime = location.hours[activeDay]?.close ?? "17:00";
  const hasLearning = recentLearning.length > 0;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* sources + quick actions */}
      <div className="akb-main-row">
        {/* knowledge sources */}
        <section className="akb-card akb-card__pad" aria-label="Knowledge sources">
          <h3 className="akb-card__title">Knowledge sources</h3>
          <p className="akb-card__sub">
            Upload documents or connect sources for your AI to learn from.
          </p>
          {hasSources ? (
            <div className="akb-sources__grid">
              <a className="akb-source akb-source--upload" href="#add-source">
                <span className="akb-source__icon" aria-hidden="true">
                  <Image
                    src={`${ASSET}/upload-doc.svg`}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                  />
                </span>
                <span className="akb-source__title">Upload documents</span>
                <span className="akb-source__desc">PDF, DOCX, TXT</span>
                <span className="akb-source__desc">Drag &amp; drop or click to browse</span>
              </a>
              <a className="akb-source akb-source--full" href="#add-source">
                <span className="akb-source__icon" aria-hidden="true">
                  <Image
                    src={`${ASSET}/connect-website.svg`}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                  />
                </span>
                <span className="akb-source__body">
                  <span className="akb-source__title">Connect website</span>
                  <span className="akb-source__desc">Auto-scrape your website</span>
                </span>
                {websiteActive && <span className="akb-pill akb-pill--success">Active</span>}
              </a>
            </div>
          ) : (
            <div className="akb-sources__empty">
              {/* large "Business grid" dashed dropzone (kit empty layout) */}
              <a className="akb-source akb-source--grid" href="#add-source">
                <span className="akb-source__icon" aria-hidden="true">
                  <Image
                    src={`${ASSET}/upload-doc.svg`}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                  />
                </span>
                <span className="akb-source__title">Business grid</span>
                <span className="akb-source__desc">
                  Upload documents or connect a website to be searchable for AI knowledge.
                </span>
              </a>
              {/* right column: two stacked dashed action boxes */}
              <div className="akb-sources__empty-col">
                <a className="akb-source akb-source--box" href="#add-source">
                  <span className="akb-source__icon" aria-hidden="true">
                    <Image
                      src={`${ASSET}/upload-doc.svg`}
                      alt=""
                      width={34}
                      height={34}
                      unoptimized
                    />
                  </span>
                  <span className="akb-source__body">
                    <span className="akb-source__title">Upload documents</span>
                    <span className="akb-source__desc">PDF, DOCX, TXT</span>
                  </span>
                </a>
                <a className="akb-source akb-source--box" href="#add-source">
                  <span className="akb-source__icon" aria-hidden="true">
                    <Image
                      src={`${ASSET}/connect-website.svg`}
                      alt=""
                      width={34}
                      height={34}
                      unoptimized
                    />
                  </span>
                  <span className="akb-source__body">
                    <span className="akb-source__title">Connect website</span>
                    <span className="akb-source__desc">Auto-scrape your website</span>
                  </span>
                </a>
              </div>
            </div>
          )}
          <div className="akb-card__foot">
            <a className="akb-link" href="#add-source">
              View all sources <Icon name="arrowR" size={13} />
            </a>
          </div>
        </section>

        {/* quick actions */}
        <section className="akb-card akb-card__pad" aria-label="Quick actions">
          <h3 className="akb-card__title">Quick actions</h3>
          <div className="akb-qa" style={{ marginTop: 14 }}>
            <div className="akb-qa__list">
              <a className="akb-qa__row" href="#add-source">
                <span className="akb-qa__icon" aria-hidden="true">
                  <Image
                    src={`${ASSET}/qa-add-source.svg`}
                    alt=""
                    width={42}
                    height={42}
                    unoptimized
                  />
                </span>
                <span>
                  <div className="akb-qa__title">Add new source</div>
                  <div className="akb-qa__desc">Upload docs or connect a website</div>
                </span>
              </a>
              <Link className="akb-qa__row" href="/ai?tab=test">
                <span className="akb-qa__icon" aria-hidden="true">
                  <Image
                    src={`${ASSET}/qa-test-ai.svg`}
                    alt=""
                    width={42}
                    height={42}
                    unoptimized
                  />
                </span>
                <span>
                  <div className="akb-qa__title">Test AI knowledge</div>
                  <div className="akb-qa__desc">See how your AI responds</div>
                </span>
              </Link>
              <Link className="akb-qa__row" href="/ai?tab=test">
                <span className="akb-qa__icon" aria-hidden="true">
                  <Image
                    src={`${ASSET}/qa-insights.svg`}
                    alt=""
                    width={42}
                    height={42}
                    unoptimized
                  />
                </span>
                <span>
                  <div className="akb-qa__title">View learning insights</div>
                  <div className="akb-qa__desc">Track what AI knows and learns.</div>
                </span>
              </Link>
            </div>
            <div className="akb-qa__art" aria-hidden="true">
              <Image
                src={`${ASSET}/quick-actions-robot.svg`}
                alt=""
                width={200}
                height={182}
                unoptimized
              />
            </div>
          </div>
        </section>
      </div>

      {/* bottom row */}
      <div className="akb-bottom-row">
        {/* business overview */}
        <section className="akb-card akb-card__pad" aria-label="Business overview">
          <h3 className="akb-card__title">Business overview</h3>
          <p className="akb-card__sub">Give AI context about who you are and what you do.</p>
          {hasOverview ? (
            <>
              <div style={{ marginTop: 8 }}>
                {filledDetails.map((d) => (
                  <div className="akb-bo__row" key={d.id}>
                    <span className="akb-bo__tile" aria-hidden="true">
                      <Icon name={d.icon} size={16} />
                    </span>
                    <div className="akb-bo__body">
                      <div className="akb-bo__t">
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {d.title}
                        </span>
                        <span className="akb-saved">
                          <Icon name="checkCircle" size={11} /> Saved
                        </span>
                      </div>
                      <div className="akb-bo__d">{d.body}</div>
                    </div>
                    <Link
                      href="/ai/training#knowledge"
                      className="akb-icon-btn"
                      aria-label={`Edit ${d.title}`}
                    >
                      <Icon name="edit" size={12} />
                    </Link>
                  </div>
                ))}
              </div>
              <div className="akb-card__foot">
                <Link className="akb-link" href="/ai/training#knowledge">
                  View all business details <Icon name="arrowR" size={13} />
                </Link>
              </div>
            </>
          ) : (
            <div className="akb-empty">
              <span className="akb-empty__icon" aria-hidden="true">
                <Image
                  src={`${ASSET}/business-overview.svg`}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                />
              </span>
              <div className="akb-empty__t">No business details yet</div>
              <div className="akb-empty__d">
                Add information about your business to help AI answer better.
              </div>
              <Link
                href="/ai/training#knowledge"
                className="akb-btn-outline"
                style={{
                  marginTop: 6,
                  height: 34,
                  color: "var(--akb-primary)",
                  borderColor: "var(--akb-hero-border)",
                }}
              >
                <Icon name="plus" size={14} /> Add business details
              </Link>
            </div>
          )}
        </section>

        {/* business location */}
        <section className="akb-card akb-card__pad" aria-label="Business location">
          <h3 className="akb-card__title">Business location</h3>
          <p className="akb-card__sub">Where is your business based?</p>
          {hasLocation ? (
            <>
              <div className="akb-loc__addr">
                <span className="akb-loc__pin" aria-hidden="true">
                  <Icon name="pin" size={15} />
                </span>
                <span className="akb-loc__addr-text">{location.address}</span>
                <span className="akb-saved">
                  <Icon name="checkCircle" size={11} /> Saved
                </span>
                <Link
                  href="/ai/training#knowledge"
                  className="akb-icon-btn"
                  aria-label="Edit location"
                >
                  <Icon name="edit" size={12} />
                </Link>
              </div>
              <div className="akb-loc__hours-head">
                <div className="akb-bo__t" style={{ justifyContent: "flex-start" }}>
                  Operating hours
                </div>
                <div className="akb-card__sub" style={{ marginTop: 2 }}>
                  Set your business operating hours.
                </div>
              </div>
              <div className="akb-loc__days">
                {DAY_LABELS.map(([k, l]) => (
                  <span key={k} className={`akb-day ${location.hours[k]?.open ? "is-on" : ""}`}>
                    {l}
                  </span>
                ))}
              </div>
              {/* Read-only mirror of the profile's hours. Editing lives in the
                  AI Training workspace (per-day open/close inputs + autosave), so
                  the whole row links there instead of faking in-place controls —
                  otherwise the times/toggle looked interactive but did nothing. */}
              <Link
                href="/ai/training#knowledge"
                className="akb-loc__times"
                aria-label="Edit operating hours in AI Training"
              >
                <span className="akb-time">
                  {to12h(openTime)} <Icon name="chevD" size={12} />
                </span>
                <span className="akb-time__to">to</span>
                <span className="akb-time">
                  {to12h(closeTime)} <Icon name="chevD" size={12} />
                </span>
                <span className="akb-toggle is-on" role="img" aria-label="Operating hours enabled">
                  <span className="akb-toggle__knob" />
                </span>
              </Link>
            </>
          ) : (
            <div className="akb-empty">
              <span className="akb-empty__icon" aria-hidden="true">
                <Image src={`${ASSET}/location.svg`} alt="" width={44} height={44} unoptimized />
              </span>
              <div className="akb-empty__t">No location added</div>
              <div className="akb-empty__d">
                Add your business location to get localized AI answers.
              </div>
              <Link
                href="/establishments"
                className="akb-btn-outline"
                style={{
                  marginTop: 6,
                  height: 34,
                  color: "var(--akb-primary)",
                  borderColor: "var(--akb-hero-border)",
                }}
              >
                <Icon name="plus" size={14} /> Add business location
              </Link>
            </div>
          )}
        </section>

        {/* recent learning */}
        <section className="akb-card akb-card__pad" aria-label="Recent learning">
          <h3 className="akb-card__title">Recent learning</h3>
          <p className="akb-card__sub">Last learned or updated by AI.</p>
          {hasLearning ? (
            <>
              <div style={{ marginTop: 6 }}>
                {recentLearning.map((r) => (
                  <Link href="/ai?tab=test" className="akb-rl__row" key={r.id}>
                    <span className={`akb-rl__dot akb-rl__dot--${r.tone}`} aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <div className="akb-rl__t">{r.title}</div>
                      <div className="akb-rl__meta">Learned {r.when}</div>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="akb-card__foot">
                <Link className="akb-link" href="/ai?tab=test">
                  View all insights <Icon name="arrowR" size={13} />
                </Link>
              </div>
            </>
          ) : (
            <div className="akb-empty">
              <span className="akb-empty__icon" aria-hidden="true">
                <Image
                  src={`${ASSET}/recent-learning.svg`}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                />
              </span>
              <div className="akb-empty__t">No learning activity yet</div>
              <div className="akb-empty__d">
                AI learning updates will appear here once you add sources.
              </div>
              <Link href="/ai?tab=test" className="akb-link" style={{ marginTop: 6 }}>
                View all insights <Icon name="arrowR" size={13} />
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
