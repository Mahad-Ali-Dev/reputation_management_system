import { LazyFrog } from "@/components/ui/lazy-frog";
import {
  BadgeDollarSign,
  Building2,
  ChevronRight,
  CircleCheck,
  FileUp,
  Globe,
  GraduationCap,
  type LucideIcon,
  MapPin,
  MessageSquareText,
  Package,
  PenLine,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { relativeTime } from "../training/_components/shared-utils";
import { LocationHoursEditor } from "./location-hours-editor";

/**
 * Knowledge tab (Apple look), server-rendered.
 *
 * Every figure is a LIVE tenant value passed down from the /ai page:
 *   - readiness %      → computeReadiness(profile, indexedDocs, hasWidget)
 *   - total / active   → real ai_documents counts
 *   - last updated     → newest doc lastIndexedAt (or "—")
 *   - business overview → AiTrainingProfile.businessOverview / servicesProducts / pricingDetails
 *   - business location → establishment.address + operatingHours
 *   - recent learning   → answered knowledge gaps (real learning events)
 * Sections with no real data render an Apple-style empty state, never a
 * fabricated value. Source buttons carry `data-kb-action` so <KbSourceActions>
 * (rendered by the page) can open the file picker / connect-website sheet.
 */

export type BusinessDetailRow = {
  id: string;
  /** Kept for API compatibility; the Apple look maps icons by `id`. */
  icon?: string;
  title: string;
  body: string | null;
};
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

const DETAIL_ICONS: Record<string, LucideIcon> = {
  overview: Building2,
  services: Package,
  pricing: BadgeDollarSign,
};

/** Readiness ring + live stats, one frosted card above the tabs. */
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
  const pct = Math.max(0, Math.min(100, readinessPct));
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pct / 100);
  const headline =
    pct >= 90
      ? "Ready for anything."
      : pct >= 40
        ? "Off to a strong start."
        : "Let's teach it more.";
  const copy =
    pct >= 90
      ? "Your AI knows your business deeply and answers with confidence."
      : pct >= 40
        ? "A solid foundation. Add a few more sources to raise answer confidence."
        : "Add your website or a document and your AI starts learning straight away.";

  return (
    <section className="kb-ready" aria-label="Brain readiness">
      <div className="kb-ring" aria-hidden="true">
        <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="kb-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8a5cff" />
              <stop offset="100%" stopColor="#4b3bff" />
            </linearGradient>
          </defs>
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="rgba(120,120,128,0.14)"
            strokeWidth="12"
          />
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="url(#kb-ring-grad)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <span className="kb-ring__pct">
          {pct}
          <small>%</small>
        </span>
      </div>

      <div className="kb-ready__text">
        <span className="kb-ready__eyebrow">Brain readiness</span>
        <h2 className="kb-ready__title">{headline}</h2>
        <p className="kb-ready__copy">{copy}</p>
      </div>

      <dl className="kb-ready__stats">
        <div>
          <dt>Sources</dt>
          <dd>{totalSources}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{activeSources}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd className="kb-ready__small">{lastUpdated ? relativeTime(lastUpdated) : "—"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={`kb-ready__status${totalSources > 0 ? " is-on" : ""}`}>
            {totalSources > 0 ? "Learning" : "Getting started"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Sources + next steps, then business overview / location / recent learning. */
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
  const hasLocation = Boolean(location.address && location.address.trim().length > 0);

  return (
    <div className="kb-body">
      <div className="kb-row kb-row--top">
        {/* sources */}
        <section className="kb-card" aria-labelledby="kb-sources-title">
          <header className="kb-card__head">
            <div>
              <h3 id="kb-sources-title" className="kb-card__title">
                Teach your AI
              </h3>
              <p className="kb-card__sub">
                {hasSources
                  ? "Add more sources any time. Your AI re-learns automatically."
                  : "Start with your website or a document. It takes a minute."}
              </p>
            </div>
            <Link className="kb-link" href="/ai?tab=sources">
              All sources <ChevronRight size={15} strokeWidth={2} />
            </Link>
          </header>
          <div className="kb-sources">
            <button type="button" className="kb-source" data-kb-action="upload">
              <span className="kb-badge" aria-hidden="true">
                <FileUp size={22} strokeWidth={1.8} />
              </span>
              <span className="kb-source__title">Upload documents</span>
              <span className="kb-source__desc">PDF, DOCX or TXT. Drop them here or browse.</span>
            </button>
            <button type="button" className="kb-source" data-kb-action="connect">
              <span className="kb-badge kb-badge--blue" aria-hidden="true">
                <Globe size={22} strokeWidth={1.8} />
              </span>
              <span className="kb-source__title">
                Connect website
                {websiteActive && <span className="kb-dot-label">Active</span>}
              </span>
              <span className="kb-source__desc">We read your site and keep it in sync.</span>
            </button>
          </div>
        </section>

        {/* next steps with the AI frog */}
        <section className="kb-card kb-next" aria-labelledby="kb-next-title">
          <div className="kb-next__frog" aria-hidden="true">
            <LazyFrog size={118} name="Repulabs AI" state="idle" followPointer />
          </div>
          <h3 id="kb-next-title" className="kb-card__title">
            Next steps
          </h3>
          <ul className="kb-list">
            <li>
              <button type="button" className="kb-list__row" data-kb-action="upload">
                <span className="kb-list__icon" aria-hidden="true">
                  <Plus size={16} strokeWidth={2} />
                </span>
                <span className="kb-list__text">
                  <span className="kb-list__t">Add a source</span>
                  <span className="kb-list__d">Upload docs or connect a website</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="kb-list__chev" />
              </button>
            </li>
            <li>
              <Link className="kb-list__row" href="/ai?tab=test">
                <span className="kb-list__icon" aria-hidden="true">
                  <MessageSquareText size={16} strokeWidth={1.8} />
                </span>
                <span className="kb-list__text">
                  <span className="kb-list__t">Test your AI</span>
                  <span className="kb-list__d">Ask it what customers ask</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="kb-list__chev" />
              </Link>
            </li>
            <li>
              <Link className="kb-list__row" href="/ai?tab=behaviour">
                <span className="kb-list__icon" aria-hidden="true">
                  <Sparkles size={16} strokeWidth={1.8} />
                </span>
                <span className="kb-list__text">
                  <span className="kb-list__t">Tune its voice</span>
                  <span className="kb-list__d">Tone, complaints and support style</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="kb-list__chev" />
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <div className="kb-row kb-row--three">
        {/* business overview */}
        <section className="kb-card" aria-labelledby="kb-bo-title">
          <header className="kb-card__head">
            <div>
              <h3 id="kb-bo-title" className="kb-card__title">
                About your business
              </h3>
              <p className="kb-card__sub">What your AI knows about you.</p>
            </div>
          </header>
          {filledDetails.length > 0 ? (
            <>
              <ul className="kb-list kb-list--inset">
                {filledDetails.map((d) => {
                  const DIcon = DETAIL_ICONS[d.id] ?? Building2;
                  return (
                    <li key={d.id}>
                      <Link
                        href="/ai/training#knowledge"
                        className="kb-list__row kb-list__row--top"
                        aria-label={`Edit ${d.title}`}
                      >
                        <span className="kb-list__icon" aria-hidden="true">
                          <DIcon size={16} strokeWidth={1.8} />
                        </span>
                        <span className="kb-list__text">
                          <span className="kb-list__t">
                            {d.title}
                            <CircleCheck size={13} strokeWidth={2} className="kb-saved" />
                          </span>
                          <span className="kb-list__d kb-clamp">{d.body}</span>
                        </span>
                        <PenLine size={14} strokeWidth={1.8} className="kb-list__chev" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link className="kb-link kb-card__foot" href="/ai/training#knowledge">
                Edit all details <ChevronRight size={15} strokeWidth={2} />
              </Link>
            </>
          ) : (
            <KbEmpty
              icon={Building2}
              title="Tell your AI about you"
              text="What you do, what you sell and how you price it. The basics it needs to answer well."
              href="/ai/training#knowledge"
              cta="Add business details"
            />
          )}
        </section>

        {/* location */}
        <section className="kb-card" aria-labelledby="kb-loc-title">
          <header className="kb-card__head">
            <div>
              <h3 id="kb-loc-title" className="kb-card__title">
                Location &amp; hours
              </h3>
              <p className="kb-card__sub">
                So it can answer &ldquo;where&rdquo; and &ldquo;when&rdquo;.
              </p>
            </div>
          </header>
          {hasLocation ? (
            <LocationHoursEditor address={location.address} hours={location.hours} />
          ) : (
            <KbEmpty
              icon={MapPin}
              title="Add your location"
              text="Your address and opening hours make every answer local and accurate."
              href="/establishments"
              cta="Add location"
            />
          )}
        </section>

        {/* recent learning */}
        <section className="kb-card" aria-labelledby="kb-rl-title">
          <header className="kb-card__head">
            <div>
              <h3 id="kb-rl-title" className="kb-card__title">
                Recently learned
              </h3>
              <p className="kb-card__sub">Answers you&apos;ve taught it.</p>
            </div>
          </header>
          {recentLearning.length > 0 ? (
            <>
              <ul className="kb-timeline">
                {recentLearning.map((r) => (
                  <li key={r.id}>
                    <Link href="/ai?tab=test" className="kb-timeline__row">
                      <span className={`kb-timeline__dot is-${r.tone}`} aria-hidden="true" />
                      <span className="kb-list__text">
                        <span className="kb-list__t kb-clamp-1">{r.title}</span>
                        <span className="kb-list__d">Learned {r.when}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link className="kb-link kb-card__foot" href="/ai?tab=test">
                All learning <ChevronRight size={15} strokeWidth={2} />
              </Link>
            </>
          ) : (
            <KbEmpty
              icon={GraduationCap}
              title="Nothing learned yet"
              text="When you teach your AI an answer in Test, it shows up here."
              href="/ai?tab=test"
              cta="Teach an answer"
            />
          )}
        </section>
      </div>
    </div>
  );
}

/** Apple-style empty state: soft icon, short title, one line, one action. */
export function KbEmpty({
  icon: EIcon,
  title,
  text,
  href,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="kb-empty">
      <span className="kb-empty__icon" aria-hidden="true">
        <EIcon size={24} strokeWidth={1.6} />
      </span>
      <div className="kb-empty__t">{title}</div>
      <p className="kb-empty__d">{text}</p>
      {href && cta && (
        <Link href={href} className="kb-pill">
          {cta}
        </Link>
      )}
    </div>
  );
}
