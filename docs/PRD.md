# Product Requirements Document — RepuBoost (working name)

> A multi-tenant SaaS reputation-management platform that combines AI-powered review automation, social media management, customer surveys, and a physical "Review Stand" hardware line — modeled on review-boost.ai with our own admin layer, billing, and extensions.

| Field | Value |
|-------|-------|
| Document Version | 0.1 (Draft) |
| Status | Approved-for-architecture |
| Author | Senior Architect |
| Date | 2026-05-09 |
| Stakeholders | Founder, Product, Engineering, Ops |

---

## 1. Vision & Strategic Goals

### 1.1 One-line vision
> "Every local business gets a 5-star reputation on autopilot — across Google, social, and the front desk."

### 1.2 Problem statement
Local and multi-location businesses lose ~14% of revenue to poor online reviews. They suffer from:
- Forgetting to ask happy customers for reviews → silent majority, vocal minority
- Slow / inconsistent / unprofessional replies to reviews
- Negative reviews staying live with no dispute attempt
- Disconnected tooling (one tool for reviews, another for social, another for surveys)
- No physical bridge from in-store experience to digital review

### 1.3 Strategic goals (12-month)
1. **Activation rate** ≥ 35% (free → paid conversion within 7-day trial)
2. **MRR target**: $250K within 12 months of launch
3. **Hardware attach rate**: 60% of paid customers have ≥ 1 physical Review Stand
4. **AI cost per business**: < $4/month (heavily cached + Haiku for routine, Sonnet for replies)
5. **Multi-tenant isolation**: zero cross-tenant data leak (verified by audit)

### 1.4 Differentiators vs. ReviewBoost / Birdeye / Podium
| Differentiator | Why it matters |
|---|---|
| Hardware-software bundle (NFC + QR Review Stand) | Drives offline → online review flow, sticky |
| AI Phone Receptionist tier | Captures missed-call revenue, upsell hook |
| Per-establishment subscription model | Aligns price with multi-location reality |
| Open admin observability panel | Internal team can see EVERY tenant action — debug + reduce churn |

---

## 2. Personas & Jobs-to-be-Done

### 2.1 Primary personas
| Persona | Description | JTBD |
|---|---|---|
| **Sarah, Salon Owner** (single location, 1-3 staff) | Non-technical, runs salon, hates marketing | "Get more 5-star Google reviews without thinking about it" |
| **Raj, Dental Group COO** (5-25 locations) | Manages clinic chain, KPI-driven | "See review health across all locations in one dashboard, dispute bad ones, prove ROI" |
| **Mei, Restaurant Marketing Mgr** | Runs social + reviews + email for 3-15 restaurants | "Stop juggling 6 tools — give me one inbox and one calendar" |
| **Carlos, E-commerce Founder** | Shopify/Woo store, 10K+ orders/yr | "Auto-request reviews after delivery, A/B test request timing, drive repeat purchase" |

### 2.2 Internal personas
| Persona | Tools they use |
|---|---|
| **Admin Ops** (us) | Admin panel — tenant search, impersonate, refund, suspend, hardware fulfillment queue |
| **Support Agent** | Admin panel (read-only impersonation), ticket inbox |
| **Finance** | Stripe dashboard + admin reports |

### 2.3 Top 10 user stories (cross-persona)
1. As Sarah, I scan a QR card on my counter → opens my Google review page → leaves a review.
2. As Sarah, I get a Stripe-style 7-day free trial without entering a card.
3. As Raj, I add 12 establishments and assign managers per location.
4. As Raj, I see a dashboard with star avg, review velocity, sentiment trend per location.
5. As Mei, I draft one social post and schedule it across FB / IG / Google Business / LinkedIn / X.
6. As Mei, I see all FB messages, IG DMs, Google reviews, and emails in one inbox.
7. As Carlos, after a Shopify delivery webhook, an SMS+Email asks for a review on day 3.
8. As any user, the AI drafts a reply to a 1-star review; I approve or edit before it posts.
9. As any user, I order a Review Stand from inside the app; it ships with my QR pre-printed.
10. As Admin Ops, I impersonate a tenant in read-only mode to debug their issue.

---

## 3. Feature Inventory (full)

### 3.1 Core review management
| # | Feature | Tier | Notes |
|---|---|---|---|
| F1 | Google Business Profile OAuth + review sync | Free + Pro | Polls every 15min; webhooks where available |
| F2 | Manual + automated SMS / email review requests | Pro | Twilio + SendGrid |
| F3 | Customizable request timing (immediate, 1d, 3d, 7d, 14d post-event) | Pro | Per-establishment override |
| F4 | AI-powered review reply suggestions | Pro | Sonnet 4.6 for sensitive (≤3⭐), Haiku 4.5 for routine |
| F5 | One-click reply approval workflow | Pro | Configurable auto-publish threshold (e.g., ≥4⭐ auto-post) |
| F6 | Negative review dispute / flagging via Google's flagging API | Pro | Track dispute status per review |
| F7 | Sentiment analysis + topic extraction | Pro | Tags: service, price, wait-time, etc. |

### 3.2 Physical products (hardware)
| # | Feature | Notes |
|---|---|---|
| H1 | Review Stand (countertop) | NFC tap + QR — ~$29 |
| H2 | Review Plaque (wall-mount metal) | QR only — ~$49 |
| H3 | Review Cards (pack of 50) | Business-card-sized QR — ~$19 |
| H4 | In-app ordering with shipping flow | Stripe checkout → fulfillment queue |
| H5 | QR / NFC payload = short-link → routes through our redirect → Google review URL | Lets us track scans/conversions per device |
| H6 | Per-device analytics (scans, reviews driven, ratio) | Linked to establishment |

### 3.3 Social media management
| # | Feature | Tier |
|---|---|---|
| S1 | Multi-account OAuth (FB Pages, IG Business, GBP, LinkedIn Pages, X) | Pro |
| S2 | Cross-platform post composer | Pro |
| S3 | Scheduler with calendar view | Pro |
| S4 | AI caption + hashtag generator | Pro |
| S5 | Comment moderation (spam filter, auto-hide profanity) | Pro |
| S6 | Mention + brand monitoring | Pro |
| S7 | DM → ticket conversion | Pro |

### 3.4 Customer surveys
| # | Feature | Tier |
|---|---|---|
| Q1 | Survey builder (NPS, CSAT, custom) | Pro |
| Q2 | Email + SMS distribution | Pro |
| Q3 | Discount/coupon incentive engine | Pro |
| Q4 | Conditional logic + skip-routing | Pro |
| Q5 | Survey results dashboard | Pro |
| Q6 | Smart-reroute: 4-5⭐ → review request, ≤3⭐ → support ticket | Pro |

### 3.5 AI capabilities
| # | Feature | Tier |
|---|---|---|
| A1 | AI website chatbot (embeddable widget) | Pro |
| A2 | AI Training & Customization (RAG over uploaded docs / FAQ) | Pro |
| A3 | AI Phone Receptionist (Twilio Voice + Sonnet streaming) | Pro+ add-on |
| A4 | AI review reply generator (per-establishment tone) | Pro |
| A5 | AI social caption generator | Pro |
| A6 | AI sentiment & competitive analysis | Pro |

### 3.6 Inbox & communication
| # | Feature | Tier |
|---|---|---|
| I1 | Unified inbox: email, FB msg, IG DM, GBP Q&A, web chat, SMS | Pro |
| I2 | Assign / mention / internal notes | Pro |
| I3 | Canned responses + AI suggestions | Pro |
| I4 | Per-establishment routing | Pro |

### 3.7 Multi-location ("Establishments")
| # | Feature | Tier |
|---|---|---|
| E1 | Add unlimited establishments | Pro (Free = 1 location) |
| E2 | Per-establishment connections (own Google, FB, etc.) | Pro |
| E3 | Per-establishment role-based access (owner, manager, viewer) | Pro |
| E4 | Bulk operations (post to all locations, export CSV) | Pro |

### 3.8 Analytics & reporting
| # | Feature | Tier |
|---|---|---|
| R1 | Review velocity, star distribution, sentiment trend | Free + Pro |
| R2 | Competitor tracking (3 competitors per establishment) | Pro |
| R3 | Revenue prediction model (ML on historical reviews + bookings) | Pro |
| R4 | Scheduled PDF/CSV reports (weekly, monthly) | Pro |
| R5 | Per-channel attribution (which QR stand → which review) | Pro |

### 3.9 Admin panel (internal)
| # | Feature | Notes |
|---|---|---|
| AD1 | Tenant directory (search, filter by plan / health / churn-risk) | |
| AD2 | Read-only impersonation (audit-logged) | |
| AD3 | Hardware fulfillment queue (orders → shipped status) | |
| AD4 | Refund / credit issuing | Stripe integration |
| AD5 | Feature flags per tenant | |
| AD6 | System-wide alerts (integration outage, AI cost spike) | |
| AD7 | Revenue, MRR, churn dashboard | |
| AD8 | Audit log (every admin action recorded) | |

### 3.10 Account & billing
| # | Feature | Tier |
|---|---|---|
| B1 | Email/Google/Microsoft SSO | All |
| B2 | 7-day free trial — no card required | All |
| B3 | Stripe subscription (monthly + 20% annual discount) | Pro |
| B4 | Pricing: Pro Rs 13,939/mo (= ~$167) — single plan, value-based | Pro |
| B5 | Usage-based add-ons: extra establishments, AI Phone minutes, hardware | Pro |
| B6 | Connections page (manage all OAuth tokens) | All |
| B7 | Account settings, password reset, 2FA | All |

---

## 4. Functional Requirements (priority-ranked)

### 4.1 P0 — MVP (must ship before public launch)
- F1, F2, F3, F4, F5 — Review automation core
- E1, E2, E3 — Establishments + multi-tenancy
- B1, B2, B3, B6, B7 — Account & billing baseline
- H1, H4, H5 — Hardware: Review Stand + ordering + redirect tracking
- I1 (subset: email + GBP Q&A only) — Basic inbox
- AD1, AD2, AD3, AD8 — Admin panel essentials
- R1 — Basic analytics dashboard

### 4.2 P1 — Months 2-4
- S1–S5 — Social media management
- Q1–Q6 — Customer surveys
- A1, A2 — Chatbot + AI training
- F6, F7 — Dispute + sentiment
- H2, H3 — Plaques + cards
- I1 (full) — Full unified inbox

### 4.3 P2 — Months 5-8
- A3 — AI Phone Receptionist
- R2, R3, R5 — Advanced analytics
- E4 — Bulk operations
- AD4–AD7 — Advanced admin

### 4.4 P3 — Future
- White-label reseller mode
- Marketplace for review-request templates
- API for third-party integrations

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Availability** | 99.9% uptime (= 8h 45m downtime/year) |
| **Latency** | API p95 < 300ms; AI reply generation < 3s p95; chatbot first-token < 1s |
| **Throughput** | 10K concurrent tenants, 100K review-requests/day |
| **Data residency** | Multi-region (US-east default; EU on request for GDPR) |
| **Compliance** | GDPR, SOC 2 Type I (year 1) → Type II (year 2), CCPA, TCPA (SMS opt-in), CAN-SPAM |
| **Security** | OWASP Top-10, row-level tenant isolation, encryption at rest (AES-256) + in transit (TLS 1.3), rotated secrets in vault |
| **Accessibility** | WCAG 2.2 AA on all customer-facing surfaces |
| **Browser support** | Last 2 versions of Chrome, Safari, Firefox, Edge |
| **i18n** | English at launch; framework-ready for ES, FR, DE, HI |
| **Cost ceilings** | Per-tenant infra cost < $8/mo at 1K-tenant scale |

---

## 6. Out of Scope (v1)

- POS integration deeper than webhook (no live POS sync)
- Native mobile apps (responsive web only — react-native in P3)
- Custom on-prem deployment
- HIPAA-grade workflows (medical/dental reviews are non-PHI, so we sidestep)
- White-label / reseller (P3)

---

## 7. Open Questions for Founder

1. **Brand / domain**: What's the product name and domain? (Working: "RepuBoost")
2. **Geographic launch**: US-only first, or India + US (given the ₹ pricing screenshot)?
3. **Hardware fulfillment**: 3PL partner (ShipBob, etc.) or in-house?
4. **AI Phone Receptionist**: Is this MVP or P2? Heaviest tech lift.
5. **Pricing**: Single Pro tier or also a Starter tier between Free and Pro?
6. **Free tier permanence**: Free forever (stand-only) or 7-day trial that hard-converts?

---

## 8. Success Metrics (North Star + supporting)

| Metric | Target Q1 | Target EOY |
|---|---|---|
| **North Star**: Reviews driven per tenant / month | 8 | 25 |
| Trial → paid conversion | 25% | 35% |
| Net revenue retention | 95% | 110% |
| Hardware attach rate | 30% | 60% |
| Review reply latency (median) | < 4 hrs | < 1 hr |
| AI cost / tenant / month | < $7 | < $4 |
| Support ticket / tenant / month | < 0.8 | < 0.3 |

---

## 9. Document Index

| Doc | Purpose |
|---|---|
| [PRD.md](PRD.md) (this) | Product spec |
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | System architecture, services, integration map |
| [DATA_MODEL.md](architecture/DATA_MODEL.md) | ERD, multi-tenant strategy, key tables |
| [TECH_STACK.md](architecture/TECH_STACK.md) | Stack choices with rationale + ADRs |
| [INFRASTRUCTURE.md](architecture/INFRASTRUCTURE.md) | Deployment, security, scaling, observability |
| [API_SURFACE.md](api/API_SURFACE.md) | API endpoints + webhook contracts |
| [ROADMAP.md](ROADMAP.md) | Phased milestones with engineering effort |
