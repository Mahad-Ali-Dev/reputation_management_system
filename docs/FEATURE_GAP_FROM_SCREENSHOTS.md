# Feature Gap Analysis — ReviewBoost Screenshots vs. Repulabs

Auditor: senior-fullstack pass, 2026-05-14
Source: 46 screenshots in `review_boost_all_features_ss/`

Legend: ✅ shipped · ⚠️ partial · ❌ missing · 🚫 out of scope (blocked external)

---

## 1. ReviewBoost full feature inventory (from screenshots)

### Sidebar navigation

```
Dashboard
Establishments
My products
Google Review Request ▾
  ├─ Send One-Off Review Request
  └─ Automated Review Requests
Customer Support Manager  ▾   (Social Reputation Manager)
  ├─ Dashboard           (Comments / DMs / Live Chat)
  ├─ Analytics
  ├─ Keyword Blacklist
  ├─ Settings & Automations
  ├─ Live Chat Inbox
  ├─ Customers           (Live chat visitors)
  └─ Chat Automation
Social Media Post Creator ▾
  ├─ Create Single Post
  └─ Post in Bulk
Customer Surveys ▾
  ├─ Customers
  ├─ Templates
  └─ Automations
Manage Reviews ▾
  ├─ Dispute Reviews
  └─ My Reviews
AI Training & Customization
AI Phone Receptionist ▾   (Coming Soon)
  ├─ Phone Receptionist Dashboard
  └─ Connections & Integrations
Account Settings
Change Password
Subscription
Connections
```

---

## 2. Gap analysis by surface

### Dashboard
| Feature | Status | Notes |
|---|---|---|
| KPI tiles (reviews, rating, scans, response rate) | ✅ | Already on `/analytics` — needs porting to `/dashboard` for parity |
| **Google Reviews Live Feed with inline AI-reply** | ❌ | The screenshot shows live reviews on dashboard with 5★/4★/3★/2★/1★ bars, filters (Relevant/Newest/Highest/Lowest), inline "Generate reply with AI" + "Copy & Go" |
| Establishment cards with images | ⚠️ | Have list, no images |
| Product cards with QR/Edit/Delete inline | ⚠️ | `/hardware` exists, different UX |
| **Notifications bell + dropdown** | ❌ | Header bell with badge count, opens dropdown with comments/replies, Mark all read, Load more |

### Establishments
| Feature | Status | Notes |
|---|---|---|
| CRUD | ✅ | Done |
| **"Search your business on Google" modal** | ❌ | Currently a manual form — they have Google Places autocomplete |
| Connect to App button (auto place_id lookup) | ❌ | We require user to paste place_id |

### My products / Review Stands
| Feature | Status | Notes |
|---|---|---|
| List products per business | ✅ | `/hardware` |
| Per-product QR / Edit / Delete actions | ⚠️ | QR route exists, no inline button |
| Review Counter column | ❌ | Per-product scan/review attribution count |
| **Add product modal: "Use Existing Code" path** | ❌ | Bind a physical product with the 8-char activation code (we have the table but no clean UI flow) |
| **Add product modal: "Add Manually" path** | ❌ | Paste Google Review Link directly without OAuth |
| Per-product image upload | ❌ | Currently SKU-based stock images only |
| Embedded "How to Find Your Review Link" video | ❌ | Helpful onboarding |

### Google Review Request → Send One-Off
| Feature | Status | Notes |
|---|---|---|
| Send single review request (email + SMS) | ✅ | Basic version on `/outreach` |
| Customer name/phone(+country flag)/email form | ⚠️ | Have, no country flag picker |
| Message Content: greeting + body | ⚠️ | Simpler version |
| **"Generate with AI" for review-request body** | ❌ | AI-drafted personalized request copy |
| Sender Details (name, business, logo upload) | ❌ | We use system defaults only |
| **Live Email Preview + SMS Preview** (side panels) | ❌ | Real-time preview as you type |
| Business Location dropdown | ⚠️ | Establishment select exists |
| Send Timing (Now / scheduled hours) | ✅ | We have scheduleHours |
| Review Request Schedule / Imported Customers table | ⚠️ | Have basic list, no table view |

### Google Review Request → Automated Review Requests
| Feature | Status | Notes |
|---|---|---|
| **SMS Template builder** with preview | ❌ | Customize SMS body per org |
| **Email Template builder** with preview, color picker, logo | ❌ | Customize HTML email per org |
| **Templates list (Google Review Requests - Templates)** | ❌ | Per-org template library |
| **Review Request Schedule with select-template + select-establishment + "Send to All"** | ❌ | Bulk send with templating |
| **Automation Triggers**: "Send request after invoice submitted" | ❌ | Requires CRM/accounting integration |
| Timer Settings dropdown | ❌ | Delay after trigger |
| Setup Automations toggles (SMS / EMAIL / master enable) | ❌ | Org-wide automation |

### Customer Support / Social Reputation Manager
| Feature | Status | Notes |
|---|---|---|
| **Comments inbox** (Facebook/IG/etc public comments) | ❌ | Filter: All / Hidden / Live / Needs Reply / Replied (with count) |
| Per-comment actions: hide, reply, assign, star, delete | ❌ | Moderation toolkit |
| **DM inbox** with folders (Open / Unread / Closed / Starred / All / Spam) | ❌ | Multi-channel DM aggregation |
| **Live Chat Inbox** (Messaging Hub) | ❌ | Real-time visitor chat handoff |
| **Connected Pages list** with per-page enable toggle | ❌ | Per-page AI auto-reply |
| **Analytics** (Social Reputation Manager) | ❌ | Subset of analytics scoped to social |
| **Keyword Blacklist** — auto-hide matching comments | ❌ | Org-defined keywords, count of hidden comments |
| **Customers page** (Live Chat - Customers): | ❌ | Performance Metrics: chats today, avg response, satisfaction (4.5★) |
|  Real-Time Visitor Activity table | ❌ | Visitor Name/ID, Current Activity, Geolocation |
|  Visitors table with Tags | ❌ | Full visitor CRM |
| **Chat Automation rules**: | ❌ | |
|  Set Message Delay Timer | ❌ | Trigger dropdown |
|  Enable/Disable Automations | ❌ | Org-wide kill switch |
|  Greeting Message / Ask Contact / Send Leaving Message | ❌ | Active vs Available pool, with Edit/Reset per |
| **FAQs management** (Add/Edit, Title + Description) | ❌ | Used by chatbot fallback |
| **Train Your AI Assistant** (250-3000 char prompt) | ⚠️ | We have it via doc upload; not a single inline prompt |
| Connect Social Media Pages master enable toggle | ❌ | Same toggle as Connections page mirror |
| Create Knowledge Base CTA | ⚠️ | `/ai` exists |

### Social Media Post Creator → Create Single Post
| Feature | Status | Notes |
|---|---|---|
| Caption textarea | ❌ | |
| **Generate Caption with AI** | ❌ | Haiku call from image context |
| Add Suggested Hashtags (AI) | ❌ | |
| Platform checkboxes: Facebook / Instagram / Twitter / LinkedIn | ❌ | Multi-platform posting |
| File upload (supports reels 9:16) | ❌ | Image + video |
| Schedule Post | ❌ | Future-dated post |
| Post Now | ❌ | Immediate publish |

### Social Media Post Creator → Post in Bulk
| Feature | Status | Notes |
|---|---|---|
| Bulk Upload (up to 100 images / 15 videos) | ❌ | |
| Automation Settings: Post Frequency dropdown | ❌ | |
| Platform checkboxes | ❌ | |
| **Caption Autogeneration** per uploaded file | ❌ | AI per-media caption |
| Submit & Schedule | ❌ | |
| Upcoming Posts table (Status, Next run, Frequency) | ❌ | |

### Customer Surveys → Customers
| Feature | Status | Notes |
|---|---|---|
| Survey Overview tiles (Sent / Scheduled / Completed) | ⚠️ | We have NPS-level stats but not this format |
| Template list per business | ⚠️ | Have campaigns |
| **Available Contacts table** with By Connection filter | ❌ | Cross-channel contact pool |
| Add Contact form | ⚠️ | We have per-campaign tokens, not a contact pool |
| **Customer Responses table** with star rating + sort | ⚠️ | NPS score stored, no nice table |
| Status indicators (Green/Orange/No badge legend) | ❌ | Visual semantics |

### Customer Surveys → Templates
| Feature | Status | Notes |
|---|---|---|
| **Customize survey questions** (Q1-Q4 + Add More) | ⚠️ | We support questions table, no UI builder |
| Per-question type dropdown | ⚠️ | Schema supports |
| Logo upload | ❌ | |
| Greeting / Thank You message customization | ❌ | |
| **Rich text email template editor** (TinyMCE-style) | ❌ | File/Edit/View/Insert/Format menus |
| SMS / Email toggle | ❌ | Channel switch in template |
| Revert to Default Template | ❌ | |

### Customer Surveys → Automations
| Feature | Status | Notes |
|---|---|---|
| **Survey Triggers** (After Invoice / Payment / Contact Imported) | ❌ | CRM-integration-dependent |
| Set Timer for Survey Sending | ❌ | |
| Active Automations table | ❌ | |

### Manage Reviews → Dispute Reviews
| Feature | Status | Notes |
|---|---|---|
| Review dispute flow | ✅ | Built — file via `/reviews/[id]` |
| **AI-flagged negative-sentiment / profanity curated queue** | ❌ | Auto-collected reviews matching toxicity/profanity criteria; sentiment + profanity column |
| Bulk dispute / hide actions | ❌ | |
| Reviews In Dispute section (status list) | ⚠️ | Have but not a dedicated page |

### Manage Reviews → My Reviews
| Feature | Status | Notes |
|---|---|---|
| Unified reviews list | ✅ | `/reviews` exists |
| Inline Generate Reply / Edit Reply | ⚠️ | Currently on detail page only |
| Copy & Go button (copy reply + open Google) | ❌ | Quick-action for manual posting |

### AI Training & Customization
| Feature | Status | Notes |
|---|---|---|
| **Control Center info box** (3 bullets) | ❌ | Onboarding context |
| **Train AI with Business Info**: | ❌ | |
|  Business name, Services/Products | ❌ | |
|  Operating Hours (day toggles + time pickers) | ❌ | Per-day open/close inputs |
|  Pricing & Payment Details | ❌ | |
| **Document upload** to train AI | ✅ | Already supported on `/ai` |
| **Customize AI Voice & Behavior**: | ❌ | |
|  AI Personality Style dropdown | ❌ | |
|  Customer Inquiry strategy dropdown | ❌ | |
|  Booking Appointments dropdown | ❌ | |
|  Handling Complaints dropdown | ❌ | |
|  Customer Support dropdown | ❌ | |
| **Test AI Responses chat** (User msg → AI response with edit) | ⚠️ | `/ai/test` exists but is the full widget |
| **How Well is AI Learning?** | ❌ | |
|  Areas AI is Confident About (badge list) | ❌ | |
|  Areas AI is Unsure About (progress bars) | ❌ | |
|  AI Response Satisfaction (4.3★, % positive feedback) | ❌ | |
| Improve AI Knowledge button | ❌ | Triggers retraining |

### AI Phone Receptionist
ALL features marked "Coming Soon" in the source product — 🚫 same here (Twilio Voice + TTS/STT is multi-week external work). Out of overnight scope.

### Account Settings
| Feature | Status | Notes |
|---|---|---|
| Owner name, email, business name | ⚠️ | Partial |
| Logo upload | ❌ | Needed for emails/surveys too |
| **Phone number with country code/flag picker** | ❌ | |
| Country dropdown | ❌ | |
| Website Link | ❌ | |
| Business Description textarea | ❌ | |

### Change Password
| ✅ | We have it via Auth.js (magic link / SSO). The screenshot shows a classic password form. Magic-link works without it. |

### Subscription
| Feature | Status | Notes |
|---|---|---|
| Plan picker (Pro vs Free) | ✅ | Stripe Checkout works |
| **Feature comparison table** (long checklist per plan) | ❌ | Marketing-style page |
| Multi-currency display (PKR, USD, etc.) | ❌ | Stripe handles, but UI doesn't show |

### Connections
| Feature | Status | Notes |
|---|---|---|
| Google Business Profile OAuth | ✅ | Done |
| **Social Media: Facebook / Instagram / Twitter (X) / LinkedIn / Email (Gmail)** | ❌ | 🚫 Meta requires App Review (weeks); X/LinkedIn similar |
| **CRM: Hubspot, Salesforce, Zoho, Pipedrive, Keap, Monday, Fresh Sales, Active Campaign, Zen Desk, Microsoft Dynamics 365** | ❌ | Most have OAuth; 10 integrations |
| **E-commerce: Shopify, Squarespace, WooCommerce, Presta Shop, BigCommerce, Ecwid, Magento, Open Cart, Wix, Shift4Shop** | ❌ | 10 integrations |
| **POS: Square, Touch Bistro, Toast, Upserve, Clover, Lavu, Lightspeed, Epos Now, Revel, Micros** | ❌ | 10 integrations |
| **Live Chat Integration code snippet** (HTML/Any Website dropdown) | ✅ | We have `/widget?key=...` snippet |
| **Accounting: QuickBooks, Sage50, Xero, NetSuite, Fresh Books, MYOB, Zoho Books, Kashoo, Wave, Tally ERP** | ❌ | 10 integrations |
| **Email Marketing: Mailchimp, ConvertKit, Klaviyo, AWeber, Active Campaign, Get Response, Constant Contact, Campaign Monitor, Sendinblue (Brevo), Omnisend** | ❌ | 10 integrations |
| **Manual CSV Import for contacts** | ⚠️ | We have CSV for outreach; not as a "connection" |
| Your Connect Systems table (Disconnect button) | ⚠️ | Per-establishment, we have connections list |

### Global / UX
| Feature | Status | Notes |
|---|---|---|
| Notifications bell with badge | ❌ | |
| Live chat support widget (for tenant to talk to us) | ❌ | "Need help? Simply message us through our live chat widget" — same product, dogfooded |
| "Watch Video" promo card in sidebar | ❌ | Tutorial CTA |
| Empty states with "Add Your First X" prominent CTA | ⚠️ | Some pages have, not all |
| Breadcrumb back navigation (Go Back button on every page) | ❌ | |
| Sidebar collapse toggle (hamburger) | ❌ | |
| User avatar dropdown in header | ⚠️ | We have sign out, no menu |
| Promo banner ("Grow your business on Google with ReviewBoost") in sidebar | ❌ | |

---

## 3. Categorized build queue (by effort & dependency)

### Tier 1 — Self-contained, high value (build first)
1. **Notifications bell + dropdown** — `/api/notifications` + bell component (½ day)
2. **Dashboard: Google Reviews Live Feed** — port reviews list to dashboard with inline AI reply (½ day)
3. **My Reviews unified inline UX** — Generate / Edit / Copy & Go per row (½ day)
4. **Account Settings full page** — logo, phone+country, website, description (½ day)
5. **My Products UX with QR/Edit/Delete + Review Counter** — improve existing `/hardware` (½ day)
6. **Email/SMS Live Preview on Send One-Off** — split-pane real-time preview (½ day)
7. **AI-generate review-request body button** — new server action (1h)
8. **Custom email + SMS template builder per org** — DB table + form + preview (1 day)
9. **AI Training & Customization full page** — business overview + hours + pricing + personality dropdowns (1 day)
10. **FAQs management** — table + CRUD UI + used in chatbot fallback (½ day)
11. **Survey templates rich editor + customization** — TinyMCE-equivalent, logo, greeting (1 day)
12. **Survey customer responses table** with badges (½ day)
13. **Customer contact pool** (cross-survey contact table) (½ day)
14. **Dispute Reviews curated queue** (auto-pull negative+profanity from existing topic worker) (½ day)
15. **Keyword Blacklist for comments** (1 day) — even if no social inbox yet
16. **Sidebar collapse + breadcrumb back button + page transitions** (½ day)

### Tier 2 — Big new surface area (build next)
17. **Comment inbox UI scaffolding** — without live social fetch yet; uses our existing `inbox_threads` table (1-2 days)
18. **DM inbox UI scaffolding** (1 day)
19. **Live Chat Inbox UI** (1 day)
20. **Connected Pages list page** (per-establishment, with toggle) (½ day)
21. **Customers page** (Live Chat visitors) — Performance Metrics + Real-Time Activity (½ day)
22. **Chat Automation rules** — Greeting/Ask Contact/Leaving message active+available (1 day)
23. **Social Media Post Creator: Single Post** — caption + AI generate + platform checkboxes (1 day, posting requires Tier 4)
24. **Social Media Post Creator: Bulk Post + Schedule** (1 day, posting requires Tier 4)
25. **Survey Templates page** rich-text editor with revert (1 day)
26. **Subscription feature-comparison page** — marketing-style plan picker (½ day)

### Tier 3 — Integrations (no external OAuth required)
27. **Manual CSV Import for customer contacts** as a connection type (½ day)
28. **Connections page expanded categories UI** — show all platforms with "Coming Soon" except Google + CSV (½ day)
29. **Connection-driven automation triggers** scaffolding (no real CRM yet, mock data) (1 day)

### Tier 4 — Blocked on external OAuth review
30. **Facebook Pages OAuth + posting + comments fetch** — Meta App Review takes 2-6 weeks 🚫
31. **Instagram Business OAuth + posting + DM fetch** — Same Meta review 🚫
32. **LinkedIn OAuth + posting** — LinkedIn Partner Application 🚫
33. **X (Twitter) OAuth + posting** — Paid API tier required 🚫
34. **Email inbound parsing (Gmail / Resend Inbound)** — Resend Inbound is gated, alternative is IMAP/Mail server 🚫
35. **CRM OAuth integrations × 10** — each requires partner app registration 🚫
36. **E-commerce OAuth × 10** — each requires platform app submission 🚫
37. **POS integrations × 10** — most require partner programs 🚫
38. **Accounting × 10** — QuickBooks/Xero apps require certification 🚫
39. **Email Marketing × 10** — most have OAuth, some have App Store gates 🚫

### Tier 5 — Out of scope this round
40. **AI Phone Receptionist** — Twilio Voice + ElevenLabs/PlayHT + Whisper + session state (multi-week) 🚫
41. **WebAuthn admin auth** — needs frontend lib + ceremony 🚫

---

## 4. Recommended priority queue for this build pass

Given the time available and that **UI polish is explicitly Phase 2** per your message, I propose:

**Build now (Tier 1 + selected Tier 2 + Tier 3, ~15-20 features):**

1. Notifications bell + dropdown
2. Dashboard Google Reviews Live Feed
3. My Reviews inline actions
4. Account Settings full page
5. My Products UX upgrade with Review Counter
6. Send One-Off email/SMS live preview
7. AI-generate review request body
8. Custom email + SMS templates per org
9. AI Training & Customization page
10. FAQs CRUD
11. Survey templates editor
12. Survey responses + customer contact pool
13. Dispute Reviews curated queue
14. Keyword Blacklist
15. Comment inbox UI scaffolding (uses existing `inbox_threads`)
16. DM inbox UI scaffolding
17. Live Chat Inbox UI scaffolding
18. Customers page (Live Chat visitors)
19. Chat Automation rules
20. Subscription feature comparison
21. Connections page expanded categories UI (with "Coming Soon" except live ones)
22. Manual CSV Import as connection
23. Sidebar collapse + breadcrumbs + page chrome
24. Social Media Post Creator stubs (UI ready, posting on hold until App Review)

**Skip for now (Tier 4 + 5):**
- All social OAuth (Meta/X/LinkedIn — blocked on App Review)
- All CRM/POS/E-com/Accounting integrations (40+ items, each needs platform app)
- AI Phone Receptionist

**Estimated effort:** ~12-15 hours of focused build at AI pace. Doable in one autonomous session, but the UI will be functional-rough — not pixel-matched to ReviewBoost. You said UI polish comes later, so that fits.

---

## 5. Open questions before I start

1. **Should I match ReviewBoost's UI design exactly (logos, gradient cards, etc.) or use our existing shadcn/Tailwind look?** — you said "later will focus on the ui" so I'll use clean shadcn for now, but flag if you want closer visual fidelity.

2. **Manual CSV import for contacts vs. our bulk-CSV (already built)** — should I make these unified or separate surfaces?

3. **Comment / DM / Live Chat inboxes** — build the UI shell now even though we can't actually fetch from Facebook/IG yet? (Owner can manually populate via a dev endpoint.) Or wait until Meta App Review?

4. **AI-generated review-request copy** — use Haiku per send, or pre-generate templates the user can pick from?

5. **Connections page expanded categories** — show "Connect" buttons for everything with "Coming Soon" toasts on click? Or hide non-implemented platforms?

I'll wait for your decision on these before starting the build.
