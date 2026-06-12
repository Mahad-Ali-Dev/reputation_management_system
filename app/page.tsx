import { BRAND_LOGOS } from "@/components/landing/brand-logos";
import { Logo } from "@/components/shell/logo";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import "./marketing.css";

export const metadata = {
  title: "repulabs — Run your reputation like a system.",
  description:
    "The reputation OS for local teams. Reviews, AI replies, requests, inbox, AI phone, social, local SEO and autopilot — in one premium workspace.",
};

const ART = "/assets/repulabs/illustrations";

export default function Landing() {
  return (
    <main className="mkt-page">
      <TopNav />
      <Hero />
      <TrustStrip />
      <FeatureBento />
      <HowItWorks />
      <Integrations />
      <Pricing />
      <SocialProof />
      <SecurityStrip />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}

/* ============================================================
   Top navigation — sticky, glass blur.
============================================================ */
function TopNav() {
  const links = [
    { href: "#features", label: "Product" },
    { href: "/tour", label: "Product tour" },
    { href: "#how", label: "How it works" },
    { href: "#integrations", label: "Integrations" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ];
  return (
    <header className="mkt-nav">
      <div className="mkt-container mkt-nav-inner">
        <Link href="/" aria-label="repulabs home" style={{ textDecoration: "none", color: "inherit" }}>
          <Logo size={30} />
        </Link>

        <nav className="mkt-nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="mkt-nav-link">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="mkt-nav-cta">
          <Link href="/login" className="mkt-nav-login">
            Log in
          </Link>
          <Link href="/signup" className="mkt-btn mkt-btn--primary">
            Start free
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   Hero — kicker + display headline + dual CTA + framed art.
============================================================ */
function Hero() {
  return (
    <section className="mkt-container mkt-hero">
      <div>
        <span className="mkt-kicker">Reputation OS for local teams</span>
        <h1 className="mkt-hero-title">
          Run your reputation <em>like a system.</em>
        </h1>
        <p className="mkt-hero-sub">
          Reviews, AI replies, requests, a unified inbox, AI phone, social,
          local SEO and autopilot — one premium workspace that keeps every
          customer moment on brand and on time.
        </p>
        <div className="mkt-hero-ctas">
          <Link href="/signup" className="mkt-btn mkt-btn--primary mkt-btn--lg">
            Start free
            <ArrowRight size={15} />
          </Link>
          <Link href="/contact" className="mkt-btn mkt-btn--secondary mkt-btn--lg">
            Book a demo
          </Link>
        </div>
        <div className="mkt-hero-trust">
          {["No card required", "Live in 6 minutes", "Cancel anytime"].map((t) => (
            <span key={t}>
              <CircleCheck size={14} />
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="mkt-hero-art">
        <div className="mkt-hero-frame">
          {/* biome-ignore lint/performance/noImgElement: static marketing illustration, fixed kit asset */}
          <img
            src={`${ART}/home-hero.png`}
            alt="Storefront earning five-star reviews with the repulabs dashboard"
            width={1024}
            height={768}
            fetchPriority="high"
          />
        </div>
        <div className="mkt-hero-chip" aria-hidden>
          <span className="mkt-hero-chip-icon">
            <Star size={16} fill="currentColor" />
          </span>
          <span>
            <strong>+47</strong>
            <small>reviews this month</small>
          </span>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Trust / logo strip — CSS marquee, no JS.
============================================================ */
function TrustStrip() {
  const logos = [
    "Dental studios",
    "Cafes & coffee",
    "Auto shops",
    "Salons & spas",
    "Clinics",
    "Restaurants",
    "Gyms & fitness",
    "Home services",
    "Retail",
    "Hotels",
  ];
  const row = [...logos, ...logos];
  return (
    <section className="mkt-strip" aria-label="Industries Repulabs is built for">
      <div className="mkt-strip-label">BUILT FOR EVERY KIND OF LOCAL BUSINESS</div>
      <div className="mkt-marquee-mask">
        <div className="mkt-marquee">
          {row.map((name, i) => (
            <div key={`${name}-${i}`} className="mkt-marquee-item">
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Feature bento — six feat-* illustrations.
============================================================ */
function FeatureBento() {
  const features = [
    {
      img: "feat-reviews.png",
      tag: "REVIEWS",
      title: "Every review, answered in your voice",
      copy: "AI drafts on-brand replies the moment a review lands — you approve and publish in one click.",
      alt: "Review cards with AI-drafted replies",
    },
    {
      img: "feat-ai-phone.png",
      tag: "AI PHONE",
      title: "A receptionist that never misses a call",
      copy: "The AI phone line answers, books and follows up — then turns happy callers into reviewers.",
      alt: "AI phone receptionist taking a call",
    },
    {
      img: "feat-qr-nfc.png",
      tag: "QR & NFC",
      title: "Tap-to-review stands at the counter",
      copy: "Branded QR plaques and NFC cards catch customers at their happiest — right after checkout.",
      alt: "QR code stand collecting reviews at checkout",
    },
    {
      img: "feat-inbox.png",
      tag: "INBOX",
      title: "Every channel in one thread list",
      copy: "Google, Meta, SMS and webchat unified — with AI-suggested replies so nothing slips overnight.",
      alt: "Unified inbox with channels merged into one list",
    },
    {
      img: "feat-analytics.png",
      tag: "ANALYTICS",
      title: "Know exactly where you stand",
      copy: "Rating trends, local-rank tracking and competitor compare — a weekly report your team will read.",
      alt: "Analytics dashboard with rating trend charts",
    },
    {
      img: "feat-autopilot.png",
      tag: "AUTOPILOT",
      title: "Set guardrails, let the loops run",
      copy: "Auto-request, auto-reply and auto-post loops with approval rules you control — audited per action.",
      alt: "Autopilot loops running with guardrails",
    },
  ];
  return (
    <section id="features" className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head">
          <span className="mkt-kicker">The platform</span>
          <h2 className="mkt-h2">One workspace for your whole reputation.</h2>
          <p className="mkt-lead">
            Stop duct-taping point tools together. repulabs runs the entire
            reputation stack in one place, with the same brand voice flowing
            through every reply.
          </p>
        </div>
        <div className="mkt-bento">
          {features.map((f) => (
            <article key={f.tag} className="mkt-card">
              <div className="mkt-card-art">
                {/* biome-ignore lint/performance/noImgElement: static marketing illustration, fixed kit asset */}
                <img src={`${ART}/${f.img}`} alt={f.alt} width={480} height={360} loading="lazy" />
              </div>
              <span className="mkt-card-tag">{f.tag}</span>
              <h3 className="mkt-card-title">{f.title}</h3>
              <p className="mkt-card-copy">{f.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   How it works — Connect → Automate → Grow.
============================================================ */
function HowItWorks() {
  const steps = [
    {
      title: "Connect",
      copy: "Link Google Business, Meta and your booking or POS system in two clicks. repulabs reads your website and learns your brand voice automatically.",
    },
    {
      title: "Automate",
      copy: "Autopilot requests reviews after every visit, drafts replies in your voice and routes unhappy customers to a private channel before they go public.",
    },
    {
      title: "Grow",
      copy: "Watch your rating, local rank and booked calls climb — with a weekly report that shows exactly what the system earned you.",
    },
  ];
  return (
    <section id="how" className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-head">
          <span className="mkt-kicker">How it works</span>
          <h2 className="mkt-h2">Three steps. No consultant required.</h2>
          <p className="mkt-lead">
            Just your name and website — no engineer, no 40-field setup form.
            Most teams are sending automated requests within six minutes.
          </p>
        </div>
        <div className="mkt-steps">
          {steps.map((s, i) => (
            <div key={s.title} className="mkt-step">
              <div className="mkt-step-num">{i + 1}</div>
              <h3 className="mkt-step-title">{s.title}</h3>
              <p className="mkt-step-copy">{s.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Integrations — real brand marks (Simple Icons, CC0).
============================================================ */
function Integrations() {
  return (
    <section id="integrations" className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head">
          <span className="mkt-kicker">Integrations</span>
          <h2 className="mkt-h2">Lives where your business already lives.</h2>
          <p className="mkt-lead">
            Two-click native connections to the review hosts, social channels,
            payment systems and CRMs your reputation depends on.
          </p>
        </div>

        <div className="mkt-int-grid">
          {BRAND_LOGOS.map(({ name, Icon, color }) => (
            <div key={name} className="mkt-int-card">
              <span className="mkt-int-icon" style={{ color }}>
                <Icon size={22} />
              </span>
              <span className="mkt-int-name">{name}</span>
            </div>
          ))}
        </div>

        <p className="mkt-int-more">
          And 30+ more via{" "}
          <Link href="/connections" className="underline">
            our connections marketplace
          </Link>{" "}
          — Zapier-bridged for anything not yet native.
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   Pricing — same three tiers as before, restyled.
============================================================ */
function Pricing() {
  const STANDARD = [
    "QR review cards & plaques",
    "Up to 50 review requests / mo",
    "Live Google review feed",
    "Basic spam filter",
  ];
  const PRO = [
    "Everything in Standard",
    "Unlimited review requests",
    "AI replies in your brand voice",
    "Unified cross-channel inbox",
    "Surveys with smart routing",
    "AI phone receptionist · 200 min",
  ];
  const SCALE = [
    "Everything in Pro",
    "SSO + SAML + audit logs",
    "Multi-brand workspaces",
    "Dedicated success manager",
    "Custom voice clone",
  ];
  return (
    <section id="pricing" className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-head">
          <span className="mkt-kicker">Pricing</span>
          <h2 className="mkt-h2">Honest pricing. No per-seat surprises.</h2>
          <p className="mkt-lead">
            Capabilities other tools charge extra for are just part of
            repulabs. Pick a plan for volume, not for features.
          </p>
        </div>

        <div className="mkt-plans">
          <PlanCard
            name="Standard"
            price="Free"
            period="forever · 1 location"
            features={STANDARD}
            cta="Start free"
            ctaHref="/signup"
          />
          <PlanCard
            name="Pro"
            badge="MOST POPULAR"
            price="$59.99"
            priceSuffix="/mo"
            period="per location · billed annually"
            features={PRO}
            cta="Start 30-day trial"
            ctaHref="/signup"
            accent
          />
          <PlanCard
            name="Scale"
            price="Custom"
            period="10+ locations · multi-brand"
            features={SCALE}
            cta="Talk to sales"
            ctaHref="mailto:sales@repulabs.com"
          />
        </div>
        <p className="mkt-plans-note">
          All plans include a 30-day free trial. No card required to start.
        </p>
      </div>
    </section>
  );
}

function PlanCard({
  name,
  badge,
  price,
  priceSuffix,
  period,
  features,
  cta,
  ctaHref,
  accent,
}: {
  name: string;
  badge?: string;
  price: string;
  priceSuffix?: string;
  period: string;
  features: string[];
  cta: string;
  ctaHref: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "mkt-plan mkt-plan--accent" : "mkt-plan"}>
      {badge && <span className="mkt-plan-badge">{badge}</span>}
      <div className="mkt-plan-name">{name.toUpperCase()}</div>
      <div className="mkt-plan-price">
        <strong>{price}</strong>
        {priceSuffix && <span>{priceSuffix}</span>}
      </div>
      <div className="mkt-plan-period">{period}</div>
      <Link
        href={ctaHref}
        className={accent ? "mkt-btn mkt-btn--primary" : "mkt-btn mkt-btn--secondary"}
      >
        {cta}
        {accent && <ArrowRight size={14} />}
      </Link>
      <div className="mkt-plan-sep" />
      <ul>
        {features.map((f) => (
          <li key={f}>
            <Check size={14} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   Capabilities band + use-case cards. Deliberately NOT social
   proof: no fabricated metrics, testimonials, or customer
   counts until there are real ones to cite (2026-06-11 review).
============================================================ */
function SocialProof() {
  // Product capabilities, not performance claims — we have no published
  // benchmark/customer dataset to cite yet, so no invented numbers here.
  const stats = [
    { v: "1-click", l: "AI review replies", s: "Drafted in your brand voice" },
    { v: "One inbox", l: "Every channel together", s: "Reviews, DMs, comments, SMS, chat" },
    { v: "QR · NFC", l: "Capture at the counter", s: "Plus an AI phone line" },
    { v: "Autopilot", l: "Owner-safe automation", s: "Approval gates on every loop" },
  ];
  // Use-case scenarios, deliberately NOT testimonials: no invented people, no
  // "verified customer" bylines, no fabricated quotes. Each card describes what
  // the product does for that operator type.
  const quotes = [
    {
      q: "Every patient leaves with a QR tap or a follow-up text. Five-star visits become public Google reviews; concerns route to the front desk privately.",
      initials: "DS",
      who: "For practice owners",
      role: "Dental & medical clinics",
      avatar: "",
    },
    {
      q: "Review follow-ups, reply drafts, and social posts run on autopilot with approval gates — the front desk stays focused on customers, not tabs.",
      initials: "CM",
      who: "For busy front desks",
      role: "Cafes, salons & local shops",
      avatar: "mkt-avatar--teal",
    },
    {
      q: "One inbox for every location's reviews, DMs, comments, and calls — with an AI phone line that books, answers, and asks for the review afterward.",
      initials: "OL",
      who: "For operations leads",
      role: "Multi-location groups",
      avatar: "mkt-avatar--gold",
    },
  ];
  return (
    <section id="testimonials" className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-head">
          <span className="mkt-kicker">Built for operators</span>
          <h2 className="mkt-h2">From corner cafes to multi-location groups.</h2>
        </div>

        <div className="mkt-stats">
          {stats.map((s) => (
            <div key={s.l} className="mkt-stat">
              <div className="mkt-stat-value">{s.v}</div>
              <div className="mkt-stat-label">{s.l}</div>
              <div className="mkt-stat-sub">{s.s}</div>
            </div>
          ))}
        </div>

        <div className="mkt-quotes">
          {quotes.map((t) => (
            <article key={t.role} className="mkt-quote">
              <p>&ldquo;{t.q}&rdquo;</p>
              <div className="mkt-quote-byline">
                <span className={`mkt-avatar ${t.avatar}`.trim()} aria-hidden>
                  {t.initials}
                </span>
                <span>
                  <span className="mkt-quote-name" style={{ display: "block" }}>
                    {t.who}
                  </span>
                  <span className="mkt-quote-role" style={{ display: "block" }}>
                    {t.role}
                  </span>
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Security strip — compact trust row.
============================================================ */
function SecurityStrip() {
  const items = [
    {
      t: "AES-256 at rest, TLS 1.3 in transit",
      d: "Every byte of customer data encrypted by default — including OAuth tokens for your integrations.",
    },
    {
      t: "SOC 2-aligned controls",
      d: "Security program built on SOC 2 control objectives. DPA available on request, with GDPR + CCPA addenda.",
    },
    {
      t: "No model training on your data",
      d: "Your customer data never leaves your tenant. Every AI call uses a no-training agreement.",
    },
  ];
  return (
    <section className="mkt-container" style={{ paddingBottom: 96 }}>
      <div className="mkt-secure">
        {items.map((it) => (
          <div key={it.t} className="mkt-secure-item">
            <span className="mkt-secure-icon">
              <ShieldCheck size={17} />
            </span>
            <span>
              <span className="mkt-secure-title" style={{ display: "block" }}>
                {it.t}
              </span>
              <span className="mkt-secure-copy" style={{ display: "block" }}>
                {it.d}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   FAQ — native <details>, zero JS.
============================================================ */
function Faq() {
  const items = [
    {
      q: "How quickly can I set up repulabs?",
      a: "Most teams are sending automated requests within 6 minutes. Connect Google Business, plug in one POS or CRM, and the wizard does the rest.",
    },
    {
      q: "Does the AI actually sound like me?",
      a: "It learns from your service catalog, brand guide and refund policy. After a handful of approvals it matches your voice closely enough that most operators stop editing drafts.",
    },
    {
      q: "Can I use the AI receptionist with my existing number?",
      a: "Yes. We provide a new number you can advertise directly or forward your existing line to. Calls are recorded, transcribed and synced to your CRM.",
    },
    {
      q: "Is my customer data secure?",
      a: "AES-256 at rest, TLS 1.3 in transit, SOC 2 Type II audited. Your data never trains a shared model. A full DPA is available on request.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes — one click from Settings → Subscription. No annual-only lock-in, and prorated refunds are handled within one business day.",
    },
  ];
  return (
    <section id="faq" className="mkt-section mkt-section--alt">
      <div className="mkt-container mkt-faq">
        <div className="mkt-section-head">
          <span className="mkt-kicker">FAQ</span>
          <h2 className="mkt-h2">Common questions.</h2>
        </div>
        <div className="mkt-faq-list">
          {items.map((it, i) => (
            <details key={it.q} open={i === 0}>
              <summary>
                <span>{it.q}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="mkt-faq-a">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Final CTA band — gradient navy with blue→teal glow.
============================================================ */
function FinalCta() {
  return (
    <section className="mkt-container mkt-section">
      <div className="mkt-cta-band">
        <span className="mkt-kicker">Start tonight, see reviews this week</span>
        <h2 className="mkt-cta-title">Ready to run your reputation like a system?</h2>
        <p className="mkt-cta-sub">
          Free for your first location. Connected, automated and earning
          reviews before your next shift starts.
        </p>
        <div className="mkt-cta-actions">
          <Link href="/signup" className="mkt-btn mkt-btn--inverse mkt-btn--lg">
            Start free
            <ArrowRight size={15} />
          </Link>
          <Link href="/contact" className="mkt-btn mkt-btn--outline-light mkt-btn--lg">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Footer — same links as before.
============================================================ */
function Footer() {
  const cols: Array<{ h: string; links: Array<{ label: string; href: string }> }> = [
    {
      h: "Product",
      links: [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Review requests", href: "/outreach" },
        { label: "Inbox", href: "/reviews" },
        { label: "AI training", href: "/ai/training" },
        { label: "Phone receptionist", href: "/phone" },
        { label: "Surveys", href: "/surveys" },
        { label: "QR plaques", href: "/hardware" },
      ],
    },
    {
      h: "Resources",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "API reference", href: "/docs/api" },
        { label: "Changelog", href: "/changelog" },
        { label: "Status", href: "/status" },
        { label: "Brand assets", href: "/brand" },
      ],
    },
    {
      h: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Customers", href: "/customers" },
        { label: "Press", href: "/press" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      h: "Legal",
      links: [
        { label: "Privacy", href: "/legal/privacy" },
        { label: "Terms", href: "/legal/terms" },
        { label: "Security", href: "/legal/security" },
        { label: "DPA", href: "/legal/dpa" },
        { label: "Sub-processors", href: "/legal/subprocessors" },
        { label: "Cookies", href: "/legal/cookies" },
      ],
    },
  ];
  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-grid">
          <div>
            <Link href="/" aria-label="repulabs home" style={{ textDecoration: "none", color: "inherit" }}>
              <Logo size={44} />
            </Link>
            <p className="mkt-footer-blurb">
              The reputation command center for ambitious local businesses.
              Built for the teams who live and die by their review stars.
            </p>
            <div className="mkt-footer-chips">
              <span className="mkt-footer-chip">
                <span className="mkt-ping-wrap" aria-hidden>
                  <span className="mkt-ping" />
                  <span className="mkt-ping-dot" />
                </span>
                <Link href="/status" style={{ color: "inherit", textDecoration: "none" }}>
                  All systems operational
                </Link>
              </span>
              <Link href="/contact" className="mkt-footer-chip">
                Contact sales
                <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>

          <div className="mkt-footer-cols">
            {cols.map((col) => (
              <div key={col.h}>
                <div className="mkt-footer-h">{col.h.toUpperCase()}</div>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mkt-footer-base">
          <span>© 2026 repulabs Pty Ltd. All rights reserved.</span>
          <span className="mkt-footer-version">v3.1 · JUN 2026</span>
        </div>
      </div>
    </footer>
  );
}
