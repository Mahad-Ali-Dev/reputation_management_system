# Repulabs — Features V2 Inventory

Generated at the start of the overnight build pass. Tracks every item in the PRD against current state, what gets built in this session, what's blocked, and what's deferred.

**Legend:** ✅ shipped earlier · 🟢 building this session · ⚠️ blocked on external · ❌ deferred (scope/time)

---

## Reviews & Replies
- ✅ Google OAuth + 15-min poll (mock-friendly until GBP API access granted)
- ✅ AI reply with Sonnet/Haiku split + safety classifier
- ✅ One-click approve + publish
- 🟢 **Review dispute flow** — owner can flag a review as fake/inappropriate; queue surfaces it in admin
- 🟢 **Topic extraction** — Haiku batch worker labels reviews with topics (`pricing`, `wait_time`, `staff`, etc.)
- 🟢 **Real sentiment classifier** — replaces rating-based proxy with Haiku-derived `sentiment` decimal
- ⚠️ **Google dispute API call** — needs GBP partner access; flow is built and stores locally
- ❌ Yelp / Trustpilot / Facebook review sources (per-source OAuth + API integration; each is 1–2 days)

## Outreach (SMS + Email)
- ✅ Single-recipient review request (SMS + email) with TCPA + STOP keyword + List-Unsubscribe
- ✅ Scheduled sends (1d / 3d / 7d after trigger)
- 🟢 **Bulk CSV review requests** — upload past customers, preview, dedupe vs unsubscribe list, send
- 🟢 **Email digest** — daily per-org summary of yesterday's reviews + drafts pending approval
- ❌ A/B template testing
- ⚠️ A2P 10DLC sender ID approval (external Twilio dependency)

## Chatbot / AI Knowledge Base
- ✅ RAG widget with Voyage embeddings + pgvector + per-tenant $ cap + origin allowlist
- ✅ Untrusted-doc fencing + markdown-image stripping
- 🟢 **Multi-doc per tenant** — already supported by schema; build UI to manage multiple docs
- 🟢 **URL crawl ingestion** — paste a URL, server fetches + extracts text + chunks + embeds
- 🟢 **Chatbot reranker** — retrieve top-20 by vector similarity, rerank with Haiku to top-5 for context
- ❌ PDF ingestion (needs pdf-parse or similar; defer to give clean test surface)
- ❌ Multi-language detection / translation
- ❌ Chat handoff to human inbox (the rails are there via `handed_off_at`; UI defer)

## Surveys
- ✅ NPS builder + email distribution + smart-route (9-10 → review request, 0-6 → internal alert)
- 🟢 **Coupon engine** — promoters get a unique one-time coupon code; redemption tracked
- ❌ Conditional survey logic (branching by previous answer)
- ❌ CSAT / CES / multi-question survey types (NPS-only for now)
- ❌ Survey-over-SMS

## Hardware (QR / NFC Review Stands)
- ✅ Stand SKU + Stripe checkout
- ✅ Activation flow (10-char slug + 8-char hashed code)
- ✅ Edge redirect with HMAC signature verification
- ✅ Per-device scan counting
- ❌ NFC chip rewrite UI (would need WebNFC; mostly mobile-only)
- ❌ Plaque + Card SKUs (data-model ready, just no product rows seeded)

## Multi-location
- ✅ Establishments CRUD
- ✅ Per-establishment Google connection
- ❌ Per-establishment RBAC (touches every query — too risky for overnight; org-level RBAC stays)
- ❌ Bulk establishment ops

## Inbox (DMs / Q&A / Email)
- ✅ Google Q&A + email channels
- ❌ FB Messages / IG DMs (blocked on Meta App Review — multi-week external)
- ❌ Webchat handoff from chatbot
- ❌ SMS inbound channel (rails for STOP exist; inbound message UI deferred)

## Analytics
- ✅ 4 KPI tiles + 30-day reviews trend + rating distribution + NPS + chatbot count
- 🟢 **Topic-frequency chart** — derived from new topic extraction
- 🟢 **MRR / ARR / churn dashboard** — admin-only, queries Stripe subscriptions table
- ❌ ClickHouse-backed cohort analytics (infra change)
- ❌ Per-establishment funnel: scan → review-request click → review published

## Admin Ops
- ✅ Tenant search + impersonation + fulfillment queue + audit log view
- 🟢 **MRR dashboard** with active subs, churn, expansion revenue
- 🟢 **Refunds UI** — click a hardware order, refund through Stripe API, audit-logged
- 🟢 **Feature flags UI** — per-org flag toggles, percentage rollout
- ❌ Per-feature usage metering (defer until billing-by-usage is a thing)

## Billing
- ✅ Email + Google SSO, 7-day trial no card, Stripe subscription, customer portal
- ❌ Usage-based add-ons (extra SMS, extra establishments)
- ❌ Annual plan toggle UI (price exists, no UI switch)

## Security & Ops
- ✅ RLS canonical + cross-tenant test suite
- ✅ Envelope encryption (AES-256-GCM + EncryptionContext AAD)
- ✅ Webhook idempotency + signature verification
- ✅ OAuth state JWT + PKCE
- ✅ Audit log INSERT-only, UPDATE/DELETE blocked by trigger
- ✅ Pino redaction, CSP headers, security.txt, legal pages
- 🟢 **Audit log hash chain** — `prev_hash + row_hash` populated by trigger; verifiable chain
- 🟢 **Eval golden sets in CI** — reply tone, safety classifier, chatbot factuality
- 🟢 **Per-input + per-endpoint rate limits** documented in security audit
- ❌ WebAuthn admin (TOTP works; WebAuthn needs UI + browser interaction — defer)
- ❌ DB role split for admin (`app_admin_reader/writer`) — pattern works with current role; risky to swap in one session
- ❌ S3 Object Lock archive for audit log (needs AWS provisioning)
- ❌ Sentry + Better-Stack + PagerDuty wiring (third-party signups)

## AI Phone Receptionist
- ❌ Massive scope. Day 30+ in roadmap. Requires Twilio Voice setup, ElevenLabs/PlayHT for TTS, Whisper for STT, custom session state, hold music, etc. Out of scope tonight.

## Social Posting
- ❌ FB Pages / IG Business / LinkedIn / X — every channel needs OAuth app review (multi-week)
- ❌ Multi-channel scheduler
- ❌ Comment moderation / mention monitoring / DM-to-ticket

## White-label / SAML
- ❌ Build only when an enterprise asks. Out of scope.

---

## Build queue for tonight (in execution order)

1. Schema migration: `review_disputes`, `survey_coupons`, `feature_flags`, audit-log hash chain trigger updates
2. Prisma schema + regen
3. Email digest (cron + template + per-tenant scheduling)
4. Bulk CSV review requests (parse + dedupe + queue)
5. Multi-doc + URL crawl chatbot KB (`/api/ai/kb/crawl` + UI list)
6. Topic + sentiment extraction worker (cron, batch over recent reviews)
7. Review dispute flow (mark in DB, surface in admin queue)
8. Chatbot reranker (top-20 retrieve → Haiku rerank → top-5 context)
9. Survey coupon engine (issue on promoter response, single-use redemption endpoint)
10. MRR dashboard (admin page querying subscriptions)
11. Refunds UI (admin page → Stripe `refunds.create`)
12. Feature flags UI + middleware helper
13. Audit log hash chain trigger (verifying script)
14. AI eval golden set tests
15. Integration tests for all new endpoints
16. SECURITY_AUDIT_V2.md
17. Typecheck + build verification
18. OVERNIGHT_LOG.md summary

Estimated raw token / file count: ~30 new files, ~3 schema migrations, ~12 new test files.

**Things you'll need to do on wake-up (none of these can be done in code alone):**
- Run `npm run db:migrate` to apply the new migration if it doesn't auto-apply
- Verify the new env vars (none required — all features use existing keys)
- Decide whether to wire the daily-digest cron to your Vercel cron config or QStash
- Spot-check the new admin pages (MRR / refunds / flags) for sanity
