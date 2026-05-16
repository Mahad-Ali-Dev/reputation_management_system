# Delivery Roadmap — RepuBoost

> 9-month build plan. Bias: ship the loop (review request → reply → published) end-to-end first, then layer features.

---

## 1. Sprint Cadence

- 2-week sprints
- 4 person-team to start: 1 platform, 1 fullstack, 1 frontend, 1 product/design (founder splits)
- Hardware ops contractor part-time from week 4

---

## 2. Phase 0 — Foundation + Security Baseline (Weeks 1-2)

**Goal**: Repo, infra, auth, **security foundations** — nothing user-facing yet.

| Task | Owner |
|---|---|
| Monorepo (Turbo + pnpm) | Platform |
| Postgres on Aurora Serverless v2 (0.5–16 ACU) + Prisma + RLS scaffolding | Platform |
| **RLS canonical policy + cross-tenant attack test suite (CI gate)** | Platform |
| **DB role split: `app_tenant_user` / `app_admin_reader` / `app_admin_writer` / `audit_writer` / `audit_reader`** | Platform |
| **Envelope encryption module for OAuth tokens (KMS DEK + EncryptionContext)** | Platform |
| **Webhook idempotency middleware + `webhook_deliveries` table** | Platform |
| **OAuth state JWT + PKCE + `oauth_state_consumed` table** | Fullstack |
| **IAM role catalog + Checkov CI gate** | Platform |
| **Pino redaction config + log routing to Axiom** | Platform |
| **Audit log INSERT-only triggers + hash chain + S3 Object Lock daily archive** | Platform |
| **WebAuthn enforcement on admin auth** | Fullstack |
| Auth.js with Email magic link + Google + Microsoft + breached-password check + lockout | Fullstack |
| Organizations + Memberships tables + invite flow + Turnstile on signup | Fullstack |
| Vercel + Fly.io + Cloudflare DNS setup; private subnets + SG ingress matrix | Platform |
| CI: Biome + Vitest + Playwright + Chromatic + squawk migration check | Platform |
| Sentry + Axiom + Grafana Cloud (Tempo) + initial SLO dashboards | Platform |
| Marketing site shell (homepage, pricing, signup) | Frontend |
| `/.well-known/security.txt` + bug bounty page | Fullstack |

**Exit criteria**:
- Can sign up, create org, invite users, get magic link email
- RLS verified by integration test (cross-tenant attack suite green)
- Admin panel requires WebAuthn
- All inbound webhook stubs verify signatures + dedupe
- Static analysis: Checkov passes (no IAM wildcards), Semgrep passes
- Phase 0 SLO dashboard shows green

---

## 3. Phase 1 — Core Loop MVP (Weeks 3-8)

**Goal**: Tenant can connect Google Business Profile → see reviews → AI generates reply → human approves → reply published.

### Week 3-4
| Task | Owner |
|---|---|
| Establishments CRUD | Fullstack |
| Connections module + Google OAuth flow | Fullstack |
| Initial review fetcher (poller every 15 min) | Platform |
| Reviews table + list UI | Frontend |
| BullMQ + Redis + first worker | Platform |

### Week 5-6
| Task | Owner |
|---|---|
| Anthropic SDK integration + caching wrapper | Platform |
| AI review reply suggestion (Haiku + Sonnet routing) | Platform |
| Reply approval workflow | Fullstack |
| Publish reply to Google API | Fullstack |
| Reviews dashboard with star avg + sentiment | Frontend |

### Week 7-8
| Task | Owner |
|---|---|
| Stripe checkout + subscription | Fullstack |
| Trial flow (7d) + dunning | Fullstack |
| Customer Portal | Fullstack |
| Audit log everywhere | Platform |
| Admin panel v0 (tenant search, impersonation) | Fullstack |
| Internal dogfooding + bug fix | All |

**Exit criteria**:
- New user → trial → connects Google → reviews appear → AI suggests reply → human publishes → audit logged → upgrade with card → subscription active.
- 1 founder uses it daily for 1 week without breaking.

**Demo-ready**: yes, to friendly customers.

---

## 4. Phase 2 — Hardware + Outreach (Weeks 9-14)

**Goal**: Sell physical Review Stand. Tenant can run automated SMS/email review requests.

### Week 9-10
| Task | Owner |
|---|---|
| Hardware catalog + Stripe one-time products | Fullstack |
| Hardware order flow (cart → checkout → confirmation) | Fullstack |
| Devices table + admin fulfillment queue | Platform |
| Edge short-link service (Cloudflare Worker) | Platform |
| QR generation + NFC encoding spec docs | Hardware ops |

### Week 11-12
| Task | Owner |
|---|---|
| Twilio + SendGrid integration | Platform |
| Review request templates + sender flow | Fullstack |
| Bulk CSV upload for review requests | Fullstack |
| Automation rules (Shopify webhook → +3d → request) | Platform |
| Recipient unsubscribe handling (TCPA/CAN-SPAM) | Fullstack |

### Week 13-14
| Task | Owner |
|---|---|
| Per-device analytics (scans → reviews funnel) | Platform |
| Smart-route mode (NPS gate before Google) | Frontend |
| Dispute negative review flow | Fullstack |
| Review topics + sentiment extraction | Platform |
| Polish: empty states, loading, errors | Frontend |

**Exit criteria**:
- Tenant orders 3 stands → arrive → activated → first scan → first review attributed → AI replies.
- 5 paying customers in beta.

---

## 5. Phase 3 — Social + Surveys (Weeks 15-20)

**Goal**: Replace Buffer + SurveyMonkey for our tenants.

### Week 15-16: Social
| Task | Owner |
|---|---|
| Meta + LinkedIn + X OAuth + token management | Platform |
| Post composer UI (text, media, multi-target) | Frontend |
| Scheduler + worker (publish at scheduled_for) | Platform |
| Calendar view | Frontend |
| AI caption generator | Platform |

### Week 17-18: Inbox
| Task | Owner |
|---|---|
| Unified inbox schema + ingestion workers (FB msg, IG DM, GBP Q&A, email reply) | Platform |
| Inbox UI (thread list + detail) | Frontend |
| Reply send workers per channel | Platform |
| Realtime updates (SSE) | Platform |
| Internal notes + assignment | Frontend |

### Week 19-20: Surveys
| Task | Owner |
|---|---|
| Survey builder (drag-drop, conditional logic) | Frontend |
| Email + SMS distribution | Platform |
| Public survey response page | Frontend |
| Smart-route to review request or support | Platform |
| Coupon/incentive engine (codes, tracking) | Fullstack |
| Results dashboard | Frontend |

**Exit criteria**:
- Tenant schedules 1 post across 4 platforms.
- Tenant runs an NPS survey, ≥4 ratings auto-route to review request.
- 25 paying customers.

---

## 6. Phase 4 — AI Chatbot + Analytics (Weeks 21-26)

**Goal**: Chatbot widget on tenant websites. Deeper analytics.

### Week 21-22: AI Chatbot
| Task | Owner |
|---|---|
| RAG ingestion (PDF, URL crawl, manual text) → pgvector | Platform |
| Chatbot widget bundle (`<script src=...>`) | Frontend |
| Conversation API (streaming Sonnet) | Platform |
| Lead capture (email/phone in conversation) | Fullstack |
| Per-tenant brand voice + persona config | Frontend |

### Week 23-24: Analytics
| Task | Owner |
|---|---|
| ClickHouse setup + event ingestion | Platform |
| Materialized views: review velocity, scan funnel, social engagement | Platform |
| Reports builder (PDF / CSV) | Fullstack |
| Scheduled reports (weekly/monthly emails) | Platform |
| Competitor tracking (Google Place ID monitoring) | Platform |

### Week 25-26: Polish
| Task | Owner |
|---|---|
| Mobile-responsive sweep | Frontend |
| Accessibility audit (WCAG 2.2 AA) | Frontend |
| Performance pass (LCP, CLS) | Frontend |
| SOC 2 prep with Vanta | Platform |

**Exit criteria**: 100 paying customers. NPS ≥ 40.

---

## 7. Phase 5 — AI Phone Receptionist (Weeks 27-34)

**Goal**: Most differentiating feature. The "moat".

| Task | Owner |
|---|---|
| Twilio Voice setup + number provisioning | Platform |
| Real-time speech (Deepgram) → Sonnet streaming → ElevenLabs TTS | Platform |
| Call routing logic (business hours, escalation) | Platform |
| Call transcription + recording storage | Platform |
| Per-tenant voice persona | Platform |
| Call analytics + AI summary | Platform |
| Handoff to human (warm transfer to mobile) | Platform |

**Exit criteria**: 10 customers using phone receptionist. < 1s p95 first-token latency.

---

## 8. Phase 6 — Scale & Enterprise (Weeks 35+)

| Initiative | Why |
|---|---|
| SAML SSO + SCIM | Enterprise sales |
| White-label mode | Reseller channel |
| Public API + SDK | Power users |
| Mobile app (React Native) | Field staff |
| ISO 27001 certification | EU enterprise |
| Multi-region (eu-west-1) | EU latency + residency |

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google rate-limits us hard | High | Critical | Per-tenant token bucket + early conversation with Google partner team |
| Anthropic cost explodes | Medium | High | Per-tenant caps + Haiku-first strategy + heavy caching |
| Hardware fulfillment is hard | High | Medium | Use 3PL hybrid; don't try to do it all in-house |
| Multi-tenant leak via RLS bug | Low | Catastrophic | RLS check in CI; quarterly pen test; bug bounty |
| Twilio/SendGrid deliverability issues | Medium | High | Multi-provider abstraction; warm IPs slowly |
| Founder bandwidth on sales/support | High | Medium | Hire 1 CSM at month 4 |
| Competitor (Birdeye/Podium) drops price | Medium | Medium | Hardware bundle = our moat; can't be matched easily |
| AI prompt injection in chatbot | Medium | High | System prompt isolation; safety classifier on outputs |

---

## 10. Hiring Plan

| Month | Hire | Why |
|---|---|---|
| 0 | 4-person founding team | Build MVP |
| 3 | Hardware/ops contractor | Fulfillment scale |
| 4 | Customer success manager | First paid customers need hand-holding |
| 6 | Senior platform engineer | Postgres + AI scaling |
| 8 | Marketing / growth lead | Start paid acquisition |
| 9 | Frontend engineer | UI velocity |
| 12 | Sales lead (founder transition) | Move founder out of sales |

---

## 11. Budget (12 months, post-pre-seed)

| Category | Amount |
|---|---|
| Salaries (4 → 8 over 12mo) | $1.2M |
| Infra (avg $4K/mo growing to $15K/mo) | $100K |
| Hardware inventory + fulfillment | $50K |
| Marketing | $80K |
| Legal + compliance (SOC 2, etc) | $40K |
| Tools (GitHub, Vercel, Sentry, etc) | $30K |
| **Total** | **~$1.5M** |

---

## 12. Success Gates (go/no-go)

| Gate | Metric | If miss |
|---|---|---|
| End of Phase 1 | Internal dogfood works for 1 week without bug | Slip Phase 2 |
| End of Phase 2 | 5 paying beta customers with hardware | Re-evaluate hardware strategy |
| End of Phase 4 | 100 paying customers | Reduce burn, reassess GTM |
| Month 12 | $250K MRR | Bridge round vs. pivot conversation |
